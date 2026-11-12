"""Container entry point of the Reclamation Service (PID 1 is tini, which forwards signals here).

1. /data (named volume): creates the folders and, when DJANGO_SECRET_KEY is empty, a random secret key
   in DJANGO_SECRET_KEY_FILE (generated once, kept across restarts and rebuilds, never in the image).
2. Migrations (RECLAMATION_MIGRATE, default true): SQLite, then MongoDB once it answers (waits up to
   MONGODB_WAIT_SECONDS; if it never answers the container exits and `restart: unless-stopped` retries).
3. Optional: RAG_INGEST_ON_START=true imports the regulation dataset (calls the embedding provider;
   files already imported are skipped). Off by default: no provider call at startup.
4. Runs waitress on 0.0.0.0:$PORT (chunked bodies from the Gateway) and `manage.py eureka_register`
   (EUREKA_ENABLED): the agent waits for /api/health, registers, sends heartbeats, retries Eureka.
   Stop (SIGTERM / SIGINT): the agent first (it deregisters), then waitress. If waitress stops, the
   container stops (and restarts); if the agent stops, it is started again after 10 s.
Only standard library: the same file can be read and run without Docker.
"""

import os
import secrets
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

APP = Path(__file__).resolve().parent.parent
PY = sys.executable
AGENT_RESTART_SECONDS = 10
STOP_TIMEOUT_SECONDS = 10


def log(message: str):
    print(f"[entrypoint] {message}", flush=True)


def flag(name: str, default: bool) -> bool:
    value = os.environ.get(name, "").strip().lower()
    return default if not value else value in {"1", "true", "yes", "on"}


def prepare_data():
    for key in ("RAG_CHROMA_DIR", "RAG_PDF_DIR"):
        if os.environ.get(key):
            Path(os.environ[key]).mkdir(parents=True, exist_ok=True)
    if os.environ.get("DJANGO_DB_PATH"):
        Path(os.environ["DJANGO_DB_PATH"]).parent.mkdir(parents=True, exist_ok=True)
    key_file = os.environ.get("DJANGO_SECRET_KEY_FILE", "").strip()
    if not os.environ.get("DJANGO_SECRET_KEY", "").strip() and key_file and not Path(key_file).is_file():
        path = Path(key_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(secrets.token_urlsafe(64))
        log(f"generated a random Django secret key in {path} (kept in the volume)")


def advertise_ip():
    """ipAddr in Eureka: the container's own address (the Gateway calls the hostName)."""
    if not os.environ.get("EUREKA_INSTANCE_IP"):
        try:
            os.environ["EUREKA_INSTANCE_IP"] = socket.gethostbyname(socket.gethostname())
        except OSError:
            pass  # keeps the settings default


def manage(*args) -> int:
    return subprocess.run([PY, "manage.py", *args], cwd=APP).returncode


def mongo_answers(uri: str) -> bool:
    import pymongo  # installed with the requirements
    try:
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000)
        try:
            client.admin.command("ping")
            return True
        finally:
            client.close()
    except Exception:
        return False


def migrate():
    if not flag("RECLAMATION_MIGRATE", True):
        log("RECLAMATION_MIGRATE=false: migrations skipped")
        return
    if manage("migrate", "--noinput") != 0:
        sys.exit("SQLite migrations failed (is /data writable by the container user?).")
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    parts = urlsplit(uri)
    where = f"{parts.hostname}:{parts.port or 27017}"  # never the credentials of the URI
    deadline = time.monotonic() + int(os.environ.get("MONGODB_WAIT_SECONDS", "120"))
    attempt = 0
    while not mongo_answers(uri):
        attempt += 1
        if time.monotonic() > deadline:
            sys.exit(f"MongoDB at {where} did not answer: stopping (the container restart policy retries).")
        log(f"waiting for MongoDB at {where} (attempt {attempt})")
        time.sleep(5)
    if manage("migrate", "--database", "mongodb", "--noinput") != 0:
        sys.exit("MongoDB migrations failed.")


def ingest():
    if flag("RAG_INGEST_ON_START", False):
        log("RAG_INGEST_ON_START=true: importing the regulation dataset (embedding provider)")
        if manage("ingest_regulation") != 0:
            log("regulation import failed: the assistant answers 503 until `manage.py ingest_regulation` succeeds")


class Supervisor:
    def __init__(self):
        self.stop_requested = False
        self.children: dict[str, subprocess.Popen] = {}

    def request_stop(self, signum, _frame):
        log(f"received signal {signum}: stopping")
        self.stop_requested = True

    def start(self, name: str, args: list[str]):
        self.children[name] = subprocess.Popen(args, cwd=APP)
        log(f"started {name} (pid {self.children[name].pid})")

    def stop(self, name: str):
        child = self.children.get(name)
        if child is None or child.poll() is not None:
            return
        if os.name == "nt":  # local Windows run: Ctrl+Break already reached the whole process group,
            try:             # and send_signal(SIGTERM) would kill the agent before it deregisters
                child.wait(STOP_TIMEOUT_SECONDS)
                return
            except subprocess.TimeoutExpired:
                pass
        child.send_signal(signal.SIGTERM)
        try:
            child.wait(STOP_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            log(f"{name} did not stop within {STOP_TIMEOUT_SECONDS} s: killed")
            child.kill()
            child.wait()

    def run(self) -> int:
        port = os.environ.get("PORT", "8087")
        os.environ.setdefault("EUREKA_INSTANCE_PORT", port)
        threads = os.environ.get("WAITRESS_THREADS", "8")
        server = [PY, "-m", "waitress", f"--listen=0.0.0.0:{port}", f"--threads={threads}", "config.wsgi:application"]
        agent = [PY, "manage.py", "eureka_register"]
        eureka = os.environ.get("EUREKA_ENABLED", "true").strip().lower() not in {"false", "0", "no", "off"}
        for name in ("SIGTERM", "SIGINT", "SIGBREAK"):  # SIGBREAK: Windows console only (local runs)
            if hasattr(signal, name):
                signal.signal(getattr(signal, name), self.request_stop)

        self.start("waitress", server)
        if eureka:
            self.start("eureka-agent", agent)
        agent_died_at = None
        code = 0
        while True:
            time.sleep(1)
            if self.stop_requested:  # first: a stop signal may also have ended a child already
                break
            if self.children["waitress"].poll() is not None:
                code = self.children["waitress"].returncode or 1
                log(f"waitress exited ({code}): stopping the container")
                break
            if eureka and self.children["eureka-agent"].poll() is not None:
                if agent_died_at is None:
                    agent_died_at = time.monotonic()
                    log(f"Eureka agent exited ({self.children['eureka-agent'].returncode}); "
                        f"restarting it in {AGENT_RESTART_SECONDS} s")
                elif time.monotonic() - agent_died_at >= AGENT_RESTART_SECONDS:
                    agent_died_at = None
                    self.start("eureka-agent", agent)
        self.stop("eureka-agent")  # first: it deregisters, so the Gateway stops routing here
        self.stop("waitress")
        log("stopped")
        return code


def main():
    os.chdir(APP)
    prepare_data()
    advertise_ip()
    migrate()
    ingest()
    sys.exit(Supervisor().run())


if __name__ == "__main__":
    main()
