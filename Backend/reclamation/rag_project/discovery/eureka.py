"""Eureka registration of the Reclamation Service.

Same REST protocol and instance payload as the team's clients (Forum: eureka-js-client,
Notification: EurekaClient.php):
  POST   /eureka/apps/RECLAMATION-SERVICE                  register   (204)
  PUT    /eureka/apps/RECLAMATION-SERVICE/<instanceId>     heartbeat  (200; 404 = unknown -> register again)
  DELETE /eureka/apps/RECLAMATION-SERVICE/<instanceId>     deregister (200)

RegistrationAgent is run by `python manage.py eureka_register`, in its own process next to the web
server, never from Django startup. It only advertises the instance while the local
GET /api/health answers UP, so Eureka (and the Gateway) never list a service that is not running:
  - service up, not registered   -> register (retry 5, 10, 20, 30 s while Eureka is unreachable)
  - registered                   -> heartbeat every 30 s; 404 -> register again (Eureka restarted)
  - service stops answering      -> deregister, then wait for it to come back
  - stop (Ctrl+C / SIGTERM)      -> deregister, exit
Every call has a 3 s timeout and errors are logged, never raised: Eureka being down never stops
or slows the Django service, which does not depend on this process at all.
"""

import http.client
import json
import logging
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import quote

from django.conf import settings

log = logging.getLogger("discovery")

HEALTH_PATH = "/api/health"
HEARTBEAT_SECONDS = 30   # Eureka's default renewal interval
LEASE_SECONDS = 90       # Eureka's default: an instance without heartbeat is evicted after this
RETRY_SECONDS = (5, 10, 20, 30)
TIMEOUT_SECONDS = 3      # team rule: at most 3 s per synchronous call
MAX_HEALTH_BYTES = 64 * 1024
DATA_CENTER = {"@class": "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo", "name": "MyOwn"}

# Eureka is always an internal address: never through a system proxy (same choice as config.auth)
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


@dataclass(frozen=True)
class EurekaConfig:
    enabled: bool
    host: str
    port: int
    app_name: str        # lower case, e.g. reclamation-service
    instance_host: str
    instance_port: int
    instance_ip: str
    timeout: float = TIMEOUT_SECONDS

    @classmethod
    def from_settings(cls) -> "EurekaConfig":
        e = settings.EUREKA
        return cls(enabled=e["ENABLED"], host=e["HOST"], port=e["PORT"], app_name=e["APP_NAME"].lower(),
                   instance_host=e["INSTANCE_HOST"], instance_port=e["INSTANCE_PORT"],
                   instance_ip=e["INSTANCE_IP"])

    @property
    def app_id(self) -> str:
        return self.app_name.upper()

    @property
    def instance_id(self) -> str:
        return f"{self.app_name}:{self.instance_host}:{self.instance_port}"  # the team's format

    @property
    def eureka_url(self) -> str:
        return f"http://{self.host}:{self.port}/eureka"

    @property
    def app_url(self) -> str:
        return f"{self.eureka_url}/apps/{self.app_id}"

    @property
    def instance_url(self) -> str:
        return f"{self.app_url}/{quote(self.instance_id, safe=':')}"

    @property
    def base_url(self) -> str:
        return f"http://{self.instance_host}:{self.instance_port}"

    @property
    def local_health_url(self) -> str:
        """Where the agent checks that Django is really running (same machine / container)."""
        return f"http://127.0.0.1:{self.instance_port}{HEALTH_PATH}"


def instance_payload(config: EurekaConfig) -> dict:
    return {"instance": {
        "instanceId": config.instance_id,
        "hostName": config.instance_host,
        "app": config.app_id,
        "ipAddr": config.instance_ip,
        "vipAddress": config.app_name,
        "secureVipAddress": config.app_name,
        "status": "UP",
        "port": {"$": config.instance_port, "@enabled": "true"},
        "securePort": {"$": 443, "@enabled": "false"},
        "homePageUrl": f"{config.base_url}/",
        "statusPageUrl": f"{config.base_url}{HEALTH_PATH}",
        "healthCheckUrl": f"{config.base_url}{HEALTH_PATH}",
        "dataCenterInfo": DATA_CENTER,
        "leaseInfo": {"renewalIntervalInSecs": HEARTBEAT_SECONDS, "durationInSecs": LEASE_SECONDS},
    }}


def _send(method: str, url: str, timeout: float, body: dict | None = None):
    """(status, body bytes), or (None, b"") when nothing usable answered (refused, timeout,
    not HTTP). Never raises."""
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with _opener.open(request, timeout=timeout) as response:
            return response.status, response.read(MAX_HEALTH_BYTES)
    except urllib.error.HTTPError as exc:
        return exc.code, b""
    except (OSError, http.client.HTTPException, ValueError) as exc:
        log.debug("%s %s failed: %s", method, url, exc)
        return None, b""


class EurekaClient:
    def __init__(self, config: EurekaConfig):
        self.config = config

    def register(self) -> bool:
        status, _ = _send("POST", self.config.app_url, self.config.timeout, instance_payload(self.config))
        return status in (200, 204)

    def heartbeat(self) -> int | None:
        """HTTP status: 200 renewed, 404 Eureka does not know this instance, None no answer."""
        return _send("PUT", self.config.instance_url, self.config.timeout)[0]

    def deregister(self) -> bool:
        return _send("DELETE", self.config.instance_url, self.config.timeout)[0] in (200, 204)


def service_is_up(config: EurekaConfig) -> bool:
    """True when the local GET /api/health answers 200 {"status": "UP"}."""
    status, body = _send("GET", config.local_health_url, config.timeout)
    if status != 200:
        return False
    try:
        return json.loads(body).get("status") == "UP"
    except (ValueError, AttributeError):
        return False


class RegistrationAgent:
    """Keeps this instance registered while the service is up. One loop, no thread of its own."""

    def __init__(self, config: EurekaConfig, client: EurekaClient | None = None, health=service_is_up,
                 heartbeat_seconds: float = HEARTBEAT_SECONDS, retry_seconds=RETRY_SECONDS, tick: float = 0.5):
        self.config, self.client, self.health = config, client or EurekaClient(config), health
        self.heartbeat_seconds, self.retry_seconds, self.tick = heartbeat_seconds, tuple(retry_seconds), tick
        self.registered = False
        self._failures = 0
        self._service_was_up = None

    def run(self, stop: threading.Event):
        log.info("Eureka agent: %s at %s (Eureka %s)", self.config.instance_id, self.config.base_url,
                 self.config.eureka_url)
        try:
            while not stop.is_set():
                self._wait(stop, self.step())
        finally:
            self.shutdown()

    def step(self) -> float:
        """One cycle; returns the delay before the next one."""
        up = self.health(self.config)
        if up != self._service_was_up:
            if not up:
                log.warning("The service does not answer UP at %s: not advertised in Eureka.",
                            self.config.local_health_url)
            self._service_was_up = up
        if not up:
            if self.registered:
                self.client.deregister()
                self.registered = False
                log.warning("Deregistered %s until the service answers again.", self.config.instance_id)
            return self.retry_seconds[0]
        if not self.registered:
            return self._register()
        status = self.client.heartbeat()
        if status == 200:
            return self.heartbeat_seconds
        if status == 404:  # Eureka restarted or evicted us
            log.warning("Eureka no longer knows %s: registering again.", self.config.instance_id)
            self.registered = False
            return self._register()
        log.warning("Eureka heartbeat failed (%s); retrying in %ss.", status or "no answer", self.heartbeat_seconds)
        return self.heartbeat_seconds

    def _register(self) -> float:
        if self.client.register():
            self.registered, self._failures = True, 0
            log.info("Registered %s in Eureka as %s.", self.config.instance_id, self.config.app_id)
            return self.heartbeat_seconds
        self._failures += 1
        delay = self.retry_seconds[min(self._failures, len(self.retry_seconds)) - 1]
        log.warning("Eureka unreachable at %s (attempt %s); retrying in %ss.", self.config.eureka_url,
                    self._failures, delay)
        return delay

    def shutdown(self):
        if self.registered:
            ok = self.client.deregister()
            self.registered = False
            log.info("Deregistered %s from Eureka%s.", self.config.instance_id,
                     "" if ok else " (no confirmation: Eureka drops it after the lease expires)")

    def _wait(self, stop: threading.Event, seconds: float):
        # Small slices: Ctrl+C / SIGTERM handlers run between them, also on Windows.
        deadline = time.monotonic() + seconds
        while not stop.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            stop.wait(min(self.tick, remaining))
