"""Eureka registration, against a local FAKE Eureka (and a fake /api/health): no real Eureka,
no Docker, no network beyond 127.0.0.1. Nothing here touches SQLite, MongoDB or Keycloak.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
from unittest import mock

from django.conf import settings
from django.core.management import CommandError, call_command
from django.test import Client, SimpleTestCase, override_settings

from discovery import eureka
from discovery.eureka import EurekaClient, EurekaConfig, RegistrationAgent, instance_payload, service_is_up

APP_URL = "/eureka/apps/RECLAMATION-SERVICE"
INSTANCE_PATH = f"{APP_URL}/reclamation-service:localhost:8087"


class _Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # a client that gave up (timeout tests)


class FakeHttp:
    """A tiny HTTP server: records every request; `status[method]`, `delay`, `garbage` and
    `body` are set by the tests."""

    def __init__(self):
        self.requests, self.status, self.delay, self.garbage = [], {}, 0.0, False
        self.body = b""
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def handle_one(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                fake.requests.append((self.command, self.path, self.headers.get("Content-Type"),
                                      json.loads(body) if body else None))
                if fake.delay:
                    time.sleep(fake.delay)
                if fake.garbage:
                    self.wfile.write(b"this is not HTTP\r\n\r\n")
                    return
                self.send_response(fake.status.get(self.command, 200))
                self.send_header("Content-Length", str(len(fake.body)))
                self.end_headers()
                self.wfile.write(fake.body)

            do_GET = do_POST = do_PUT = do_DELETE = handle_one

            def log_message(self, *args):
                pass

        self.server = _Server(("127.0.0.1", 0), Handler)
        self.port = self.server.server_port
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def methods(self):
        return [(method, path) for method, path, *_ in self.requests]

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


def closed_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def config(eureka_port=8761, instance_port=8087, **overrides) -> EurekaConfig:
    values = dict(enabled=True, host="127.0.0.1", port=eureka_port, app_name="reclamation-service",
                  instance_host="localhost", instance_port=instance_port, instance_ip="127.0.0.1")
    return EurekaConfig(**{**values, **overrides})


class EurekaTestCase(SimpleTestCase):
    def setUp(self):
        self.eureka = FakeHttp()
        self.eureka.status = {"POST": 204, "PUT": 200, "DELETE": 200}
        self.addCleanup(self.eureka.stop)
        self.config = config(self.eureka.port)
        self.client = EurekaClient(self.config)


# ---------------------------------------------------------------- 1-6. identity and payload

class InstanceTests(SimpleTestCase):
    def test_default_identity_matches_the_team_conventions(self):
        # Empty values = defaults, whatever the local .env contains
        empty = {f"EUREKA_{name}": "" for name in ("ENABLED", "HOST", "PORT", "APP_NAME", "INSTANCE_HOST",
                                                   "INSTANCE_PORT", "INSTANCE_IP")}
        result = subprocess.run([sys.executable, "-c", "import json, config.settings as s; print(json.dumps(s.EUREKA))"],
                                cwd=settings.BASE_DIR, env={**os.environ, "DJANGO_DEBUG": "True", **empty},
                                capture_output=True, text=True, timeout=120)
        defaults = json.loads(result.stdout)
        self.assertEqual(defaults, {"ENABLED": True, "HOST": "localhost", "PORT": 8761,
                                    "APP_NAME": "reclamation-service", "INSTANCE_HOST": "localhost",
                                    "INSTANCE_PORT": 8087, "INSTANCE_IP": "127.0.0.1"})
        with override_settings(EUREKA=defaults):
            c = EurekaConfig.from_settings()
        self.assertEqual((c.app_id, c.instance_id), ("RECLAMATION-SERVICE", "reclamation-service:localhost:8087"))
        self.assertEqual(c.app_url, "http://localhost:8761/eureka/apps/RECLAMATION-SERVICE")
        self.assertEqual(c.local_health_url, "http://127.0.0.1:8087/api/health")

    def test_registration_payload(self):
        instance = instance_payload(config(instance_host="reclamation-service", instance_port=8087))["instance"]
        self.assertEqual(instance["instanceId"], "reclamation-service:reclamation-service:8087")
        self.assertEqual((instance["app"], instance["vipAddress"], instance["hostName"], instance["ipAddr"]),
                         ("RECLAMATION-SERVICE", "reclamation-service", "reclamation-service", "127.0.0.1"))
        self.assertEqual(instance["port"], {"$": 8087, "@enabled": "true"})
        self.assertEqual(instance["status"], "UP")
        self.assertEqual(instance["healthCheckUrl"], "http://reclamation-service:8087/api/health")
        self.assertEqual(instance["statusPageUrl"], "http://reclamation-service:8087/api/health")
        self.assertEqual(instance["dataCenterInfo"]["name"], "MyOwn")
        self.assertEqual(instance["leaseInfo"], {"renewalIntervalInSecs": 30, "durationInSecs": 90})

    def test_settings_come_from_the_environment(self):
        script = "import json, config.settings as s; print(json.dumps(s.EUREKA))"
        env = {**os.environ, "DJANGO_DEBUG": "True", "EUREKA_ENABLED": "false", "EUREKA_HOST": "eureka-server",
               "EUREKA_PORT": "8762", "EUREKA_INSTANCE_HOST": "reclamation-service", "EUREKA_INSTANCE_PORT": "9000",
               "EUREKA_APP_NAME": "reclamation-service"}
        result = subprocess.run([sys.executable, "-c", script], cwd=settings.BASE_DIR, env=env,
                                capture_output=True, text=True, timeout=120)
        loaded = json.loads(result.stdout)
        self.assertEqual((loaded["ENABLED"], loaded["HOST"], loaded["PORT"], loaded["INSTANCE_HOST"],
                          loaded["INSTANCE_PORT"]), (False, "eureka-server", 8762, "reclamation-service", 9000))
        bad = subprocess.run([sys.executable, "-c", script], cwd=settings.BASE_DIR,
                             env={**env, "EUREKA_PORT": "port"}, capture_output=True, text=True, timeout=120)
        self.assertIn("EUREKA_PORT must be a TCP port number", bad.stderr)


# ---------------------------------------------------------------- 5, 7, 8, 11, 12. the REST calls

class ClientTests(EurekaTestCase):
    def test_register_heartbeat_and_deregister(self):
        self.assertTrue(self.client.register())
        self.assertEqual(self.client.heartbeat(), 200)
        self.assertTrue(self.client.deregister())
        self.assertEqual(self.eureka.methods(), [("POST", APP_URL), ("PUT", INSTANCE_PATH), ("DELETE", INSTANCE_PATH)])
        method, path, content_type, body = self.eureka.requests[0]
        self.assertEqual(content_type, "application/json")
        self.assertEqual(body, instance_payload(self.config))

    def test_unknown_instance_heartbeat_is_404(self):
        self.eureka.status["PUT"] = 404
        self.assertEqual(self.client.heartbeat(), 404)

    def test_eureka_down_never_raises(self):
        client = EurekaClient(config(closed_port()))
        self.assertFalse(client.register())
        self.assertIsNone(client.heartbeat())
        self.assertFalse(client.deregister())

    def test_timeout(self):
        self.eureka.delay = 1.0
        client = EurekaClient(config(self.eureka.port, timeout=0.2))
        started = time.monotonic()
        self.assertFalse(client.register())
        self.assertLess(time.monotonic() - started, 0.9)

    def test_malformed_or_error_answers_are_failures(self):
        self.eureka.status["POST"] = 500
        self.assertFalse(self.client.register())
        self.eureka.garbage = True
        self.assertFalse(self.client.register())
        self.assertIsNone(self.client.heartbeat())

    def test_local_health_check(self):
        health = FakeHttp()
        self.addCleanup(health.stop)
        c = config(self.eureka.port, instance_port=health.port)
        health.body = b'{"status": "UP", "service": "campushub-academic-assistant"}'
        self.assertTrue(service_is_up(c))
        self.assertEqual(health.methods(), [("GET", "/api/health")])
        for body, status in ((b'{"status": "DOWN"}', 200), (b"<html>not json</html>", 200), (b"[1]", 200),
                             (b'{"status": "UP"}', 500)):
            with self.subTest(body=body, status=status):
                health.body, health.status = body, {"GET": status}
                self.assertFalse(service_is_up(c))
        self.assertFalse(service_is_up(config(instance_port=closed_port())))


# ---------------------------------------------------------------- 7-10. the agent's life cycle

class AgentTests(EurekaTestCase):
    def agent(self, health=lambda c: True, **kwargs):
        return RegistrationAgent(self.config, health=health, heartbeat_seconds=0.05, retry_seconds=(0.05, 0.1),
                                 tick=0.01, **kwargs)

    def run_until(self, agent, condition, timeout=5.0):
        stop = threading.Event()
        worker = threading.Thread(target=agent.run, args=(stop,))
        worker.start()
        deadline = time.monotonic() + timeout
        while not condition() and time.monotonic() < deadline:
            time.sleep(0.01)
        stop.set()
        worker.join(timeout)
        self.assertFalse(worker.is_alive())
        self.assertTrue(condition(), self.eureka.methods())

    def test_registers_sends_heartbeats_and_deregisters_on_stop(self):
        agent = self.agent()
        with self.assertLogs("discovery", "INFO"):
            self.run_until(agent, lambda: self.eureka.methods().count(("PUT", INSTANCE_PATH)) >= 3)
        methods = self.eureka.methods()
        self.assertEqual(methods[0], ("POST", APP_URL))
        self.assertEqual(methods[-1], ("DELETE", INSTANCE_PATH))
        self.assertEqual(methods.count(("POST", APP_URL)), 1)  # one registration, then heartbeats
        self.assertFalse(agent.registered)

    def test_retries_during_an_outage_and_recovers(self):
        self.eureka.status["POST"] = 503  # Eureka starting / unavailable
        agent = self.agent()
        with self.assertLogs("discovery", "WARNING"):
            deadline = time.monotonic() + 0.3
            delays = []
            while time.monotonic() < deadline and len(delays) < 3:
                delays.append(agent.step())
        self.assertEqual(delays, [0.05, 0.1, 0.1])  # backoff, capped
        self.assertFalse(agent.registered)
        self.eureka.status["POST"] = 204  # Eureka is back
        with self.assertLogs("discovery", "INFO"):
            self.assertEqual(agent.step(), 0.05)
        self.assertTrue(agent.registered)

    def test_registers_again_when_eureka_forgot_the_instance(self):
        agent = self.agent()
        with self.assertLogs("discovery", "INFO"):
            agent.step()
            self.eureka.status["PUT"] = 404  # Eureka restarted
            agent.step()
        self.assertEqual(self.eureka.methods(), [("POST", APP_URL), ("PUT", INSTANCE_PATH), ("POST", APP_URL)])
        self.assertTrue(agent.registered)

    def test_a_lost_heartbeat_keeps_the_registration(self):
        agent = self.agent()
        with self.assertLogs("discovery", "INFO"):
            agent.step()
        self.eureka.garbage = True
        with self.assertLogs("discovery", "WARNING"):
            self.assertEqual(agent.step(), 0.05)
        self.assertTrue(agent.registered)  # the lease is still valid; the next heartbeat will tell

    def test_only_advertised_while_the_service_answers(self):
        up = {"value": False}
        agent = self.agent(health=lambda c: up["value"])
        with self.assertLogs("discovery", "WARNING"):
            agent.step()
        self.assertEqual(self.eureka.requests, [])  # Django not running: nothing registered
        up["value"] = True
        with self.assertLogs("discovery", "INFO"):
            agent.step()
        up["value"] = False  # Django stopped
        with self.assertLogs("discovery", "WARNING"):
            agent.step()
        self.assertEqual(self.eureka.methods(), [("POST", APP_URL), ("DELETE", INSTANCE_PATH)])
        self.assertFalse(agent.registered)

    def test_stop_is_prompt_even_during_a_long_wait(self):
        agent = RegistrationAgent(self.config, health=lambda c: True, heartbeat_seconds=60, tick=0.01)
        stop = threading.Event()
        worker = threading.Thread(target=agent.run, args=(stop,))
        with self.assertLogs("discovery", "INFO"):
            worker.start()
            while not agent.registered:
                time.sleep(0.01)
            started = time.monotonic()
            stop.set()
            worker.join(5)
        self.assertLess(time.monotonic() - started, 1)
        self.assertEqual(self.eureka.methods()[-1], ("DELETE", INSTANCE_PATH))


# ---------------------------------------------------------------- 13-16. command and Django start-up

class CommandTests(EurekaTestCase):
    def eureka_settings(self, instance_port=8087, **overrides):
        return override_settings(EUREKA={**settings.EUREKA, "HOST": "127.0.0.1", "PORT": self.eureka.port,
                                         "INSTANCE_PORT": instance_port, **overrides})

    def test_disabled_means_no_call_at_all(self):
        out = StringIO()
        with self.eureka_settings(ENABLED=False):
            call_command("eureka_register", stdout=out)
            call_command("eureka_register", "--once", stdout=out)
        self.assertIn("EUREKA_ENABLED is off", out.getvalue())
        self.assertEqual(self.eureka.requests, [])

    def test_once_registers_when_the_service_is_up(self):
        health = FakeHttp()
        self.addCleanup(health.stop)
        health.body = b'{"status": "UP"}'
        out = StringIO()
        with self.eureka_settings(instance_port=health.port):
            call_command("eureka_register", "--once", stdout=out)
        self.assertEqual(self.eureka.methods(), [("POST", APP_URL)])
        self.assertIn("Registered reclamation-service:localhost:", out.getvalue())

    def test_once_reports_clear_errors_without_traceback(self):
        with self.eureka_settings(instance_port=closed_port()), self.assertRaisesMessage(CommandError, "start it first"):
            call_command("eureka_register", "--once")
        health = FakeHttp()
        self.addCleanup(health.stop)
        health.body = b'{"status": "UP"}'
        with self.eureka_settings(instance_port=health.port, PORT=closed_port()), \
                self.assertRaisesMessage(CommandError, "Eureka did not accept the registration"):
            call_command("eureka_register", "--once")

    def test_ordinary_django_use_never_contacts_eureka_or_starts_workers(self):
        threads = threading.active_count()
        with self.eureka_settings(), mock.patch.object(eureka, "_send", wraps=eureka._send) as sent:
            Client().get("/api/conversations")       # 401 (Keycloak), through every middleware
            Client().get("/api/reclamations/")
        sent.assert_not_called()
        self.assertEqual(self.eureka.requests, [])
        self.assertEqual(threading.active_count(), threads)

    def test_the_app_starts_nothing_when_django_loads(self):
        from discovery.apps import DiscoveryConfig
        self.assertNotIn("ready", DiscoveryConfig.__dict__)

    def test_django_starts_without_eureka(self):
        env = {**os.environ, "DJANGO_DEBUG": "True", "EUREKA_HOST": "127.0.0.1", "EUREKA_PORT": str(closed_port())}
        result = subprocess.run([sys.executable, "manage.py", "check"], cwd=settings.BASE_DIR, env=env,
                                capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stderr)
