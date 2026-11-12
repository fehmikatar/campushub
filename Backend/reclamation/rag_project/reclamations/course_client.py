"""Synchronous check Reclamation -> Course before a reclamation about a course is saved.

Team rules (regles-communes-synchrone.txt):
  - GET <course>/courses/{id} with the caller's own Authorization header, unchanged: Course
    checks the token itself (Keycloak RS256) and answers 404 for a draft course to a student.
  - <course> = COURSE_SERVICE_URL when set (Docker), else the Eureka instance of COURSE-SERVICE;
    never the Gateway.
  - At most 3 s (here for the Eureka lookup AND the call together), exactly one attempt, no retry,
    no redirect followed.
  - 200 -> continue | 404 -> 404 "Course not found." | 401 / 403 -> the same status |
    timeout, connection refused, not in Eureka, 5xx or anything unexpected -> 503
    "Course service unavailable, please retry later." Never a 500, never an internal address.
"""

import http.client
import json
import logging
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings

log = logging.getLogger("reclamations")

APP_ID = "COURSE-SERVICE"
TIMEOUT_SECONDS = 3.0        # team rule: 3 s per synchronous call (here: lookup + call)
EUREKA_CACHE_SECONDS = 30    # like the Eureka clients' registry refresh
MAX_EUREKA_BYTES = 256 * 1024

NOT_FOUND = "Course not found."
UNAVAILABLE = "Course service unavailable, please retry later."
REFUSED = {401: "The Course Service did not accept the token.",
           403: "The Course Service refused access to this course."}


class CourseCheckError(Exception):
    """Mapped to an HTTP answer by reclamations.exceptions (status + {"detail": message})."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # a 3xx is an unexpected answer (503), never a second request


class _BudgetConnection(http.client.HTTPConnection):
    """One TCP connection that stays inside the call's budget (`timeout` = the time left in total).

    Eureka advertises hostName "localhost", which resolves to ::1 first. On Windows a refused ::1
    (service listening on 127.0.0.1 only) is reported after ~2 s, and the standard connection then
    restarts the full timeout on 127.0.0.1: a slow Course took 5 s instead of 3. Here IPv4 addresses
    are tried first (like the JVM services) and connecting + reading share one deadline.
    """

    def connect(self):
        deadline = time.monotonic() + self.timeout
        addresses = socket.getaddrinfo(self.host, self.port, type=socket.SOCK_STREAM)
        addresses.sort(key=lambda address: address[0] != socket.AF_INET)  # stable: IPv4 first, then the rest
        error = None
        for family, kind, proto, _, address in addresses:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            sock = socket.socket(family, kind, proto)
            sock.settimeout(remaining)
            try:
                sock.connect(address)
            except OSError as exc:
                sock.close()
                error = exc
                continue
            sock.settimeout(max(deadline - time.monotonic(), 0.001))  # the answer must come before the deadline
            self.sock = sock
            return
        raise error or TimeoutError("no address answered within the budget")


class _BudgetHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_BudgetConnection, req)


# Internal addresses only: never through a system proxy (same choice as config.auth / discovery)
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect, _BudgetHandler)


@dataclass
class _Cached:
    base_url: str
    expires: float


_eureka_cache: _Cached | None = None


def reset_cache():
    global _eureka_cache
    _eureka_cache = None


def _get(url: str, headers: dict, timeout: float):
    """(status, body). Raises OSError / HTTPException on a network failure or timeout."""
    request = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with _opener.open(request, timeout=timeout) as response:
            return response.status, response.read(MAX_EUREKA_BYTES)
    except urllib.error.HTTPError as exc:  # 4xx / 5xx / unfollowed 3xx: an answer, not a failure
        return exc.code, b""


def _eureka_base_url(deadline: float) -> str | None:
    """http://host:port of an UP COURSE-SERVICE instance, or None (Eureka off / down / not listed)."""
    global _eureka_cache
    now = time.monotonic()
    if _eureka_cache and _eureka_cache.expires > now:
        return _eureka_cache.base_url
    eureka = settings.EUREKA
    if not eureka["ENABLED"]:
        return None
    url = f"http://{eureka['HOST']}:{eureka['PORT']}/eureka/apps/{APP_ID}"
    try:
        status, body = _get(url, {"Accept": "application/json"}, max(deadline - now, 0.01))
        if status != 200:
            return None
        instances = json.loads(body)["application"]["instance"]
        for instance in instances if isinstance(instances, list) else [instances]:
            if instance.get("status") == "UP":
                port = instance["port"]["$"]
                base_url = f"http://{instance.get('hostName') or instance['ipAddr']}:{int(port)}"
                _eureka_cache = _Cached(base_url, now + EUREKA_CACHE_SECONDS)
                return base_url
    except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError, AttributeError) as exc:
        log.warning("Eureka lookup of %s failed (%s).", APP_ID, type(exc).__name__)
    return None


def check_course(course_id: int, authorization: str) -> None:
    """Returns when Course answers 200 for this caller; raises CourseCheckError otherwise."""
    global _eureka_cache
    deadline = time.monotonic() + TIMEOUT_SECONDS
    base_url = settings.COURSE_SERVICE_URL or _eureka_base_url(deadline)
    if not base_url:
        log.warning("Course check of course %s: no Course Service instance (COURSE_SERVICE_URL empty, "
                    "nothing UP in Eureka).", course_id)
        raise CourseCheckError(503, UNAVAILABLE)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise CourseCheckError(503, UNAVAILABLE)
    try:
        status, _ = _get(f"{base_url}/courses/{int(course_id)}",
                         {"Authorization": authorization, "Accept": "application/json"}, remaining)
    except (OSError, http.client.HTTPException) as exc:  # refused, reset, timeout, not HTTP
        if not settings.COURSE_SERVICE_URL:
            _eureka_cache = None  # the listed instance is gone: look it up again next time
        log.warning("Course check of course %s: Course Service unreachable (%s).", course_id, type(exc).__name__)
        raise CourseCheckError(503, UNAVAILABLE) from None
    if status == 200:
        return
    if status == 404:
        raise CourseCheckError(404, NOT_FOUND)
    if status in REFUSED:
        raise CourseCheckError(status, REFUSED[status])
    log.warning("Course check of course %s: unexpected answer %s from the Course Service.", course_id, status)
    raise CourseCheckError(503, UNAVAILABLE)
