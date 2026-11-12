"""Reclamation -> Course synchronous check (reclamations/course_client.py).

Team rules "communication synchrone", section 8: a) 200 -> continue, b) 404 -> our 404,
c) timeout / unreachable -> 503 and never 500, d) the Authorization header is forwarded. Course and
Eureka are local fake HTTP servers; no real Course, Eureka or Keycloak is contacted.
"""

import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from bson import ObjectId
from django.conf import settings
from django.db import connections
from django.test import SimpleTestCase, override_settings

from reclamations import course_client, services
from reclamations.course_client import NOT_FOUND, UNAVAILABLE, CourseCheckError, check_course
from reclamations.models import Reclamation

from . import fake_keycloak as kc
from .reclamation_support import URL, ApiTestCase, MongoTestCase, api, detail, payload

TOKEN = "Bearer header.payload.signature"  # opaque for the client: Course checks it itself
COURSE = {"id": 7, "titre": "Mathématiques", "statut": "PUBLIE"}
ROUTES = {
    "/courses/7": (200, COURSE),
    "/courses/8": (404, {"message": "Cours 8 introuvable"}),        # draft (for a student) or missing
    "/courses/9": (401, {"message": "Token invalide"}),
    "/courses/10": (403, {"message": "Acces interdit"}),
    "/courses/11": (500, {"message": "Internal server error"}),
    "/courses/12": (302, None, {"Location": "/courses/7"}),
}


class _Quiet(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # a client that gave up (timeout test) before the answer was written


class FakeHttp:
    """A local HTTP server: routes {path: (status, json body[, headers])}; records every request."""

    def __init__(self, routes, delay=0.0):
        self.routes, self.delay, self.requests = dict(routes), delay, []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                fake.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}})
                if fake.delay:
                    time.sleep(fake.delay)
                status, body, *extra = fake.routes.get(self.path, (404, {"message": "Not Found"}))
                data = b"" if body is None else json.dumps(body).encode()
                self.send_response(status)
                for name, value in (extra[0] if extra else {}).items():
                    self.send_header(name, value)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = _Quiet(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.port = self.server.server_port
        self.url = f"http://127.0.0.1:{self.port}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


def closed_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def eureka_app(*instances):
    return {"application": {"name": "COURSE-SERVICE", "instance": list(instances)}}


def instance(port, status="UP", host="127.0.0.1"):  # the fakes listen on IPv4 only
    return {"instanceId": f"course-service:{host}:{port}", "hostName": host, "app": "COURSE-SERVICE",
            "ipAddr": "127.0.0.1", "status": status, "port": {"$": port, "@enabled": "true"},
            "vipAddress": "course-service"}


def eureka_settings(port, enabled=True):
    return override_settings(COURSE_SERVICE_URL="",
                             EUREKA={**settings.EUREKA, "ENABLED": enabled, "HOST": "127.0.0.1", "PORT": port})


class CourseTestMixin:
    def start_course(self, routes=ROUTES, **kwargs):
        course = FakeHttp(routes, **kwargs)
        self.addCleanup(course.stop)
        course_client.reset_cache()
        self.addCleanup(course_client.reset_cache)
        return course

    def use(self, config):
        config.enable()
        self.addCleanup(config.disable)


class CourseClientTests(CourseTestMixin, SimpleTestCase):
    def setUp(self):
        self.course = self.start_course()
        self.use(override_settings(COURSE_SERVICE_URL=self.course.url))

    def failure(self, course_id) -> CourseCheckError:
        with self.assertRaises(CourseCheckError) as caught:
            check_course(course_id, TOKEN)
        return caught.exception

    def test_a_published_course_continues_and_d_the_token_is_forwarded_once(self):
        check_course(7, TOKEN)
        self.assertEqual(len(self.course.requests), 1)
        sent = self.course.requests[0]
        self.assertEqual(sent["path"], "/courses/7")
        self.assertEqual(sent["headers"]["authorization"], TOKEN)      # unchanged, no technical token
        self.assertEqual(sent["headers"]["accept"], "application/json")

    def test_b_draft_or_missing_course_is_404(self):
        error = self.failure(8)
        self.assertEqual((error.status, error.message), (404, NOT_FOUND))

    def test_401_and_403_are_kept(self):
        self.assertEqual(self.failure(9).status, 401)
        self.assertEqual(self.failure(10).status, 403)

    def test_5xx_and_redirects_are_503_after_one_attempt(self):
        self.assertEqual((self.failure(11).status, self.failure(12).status), (503, 503))
        self.assertEqual([r["path"] for r in self.course.requests], ["/courses/11", "/courses/12"])  # no retry,
        self.assertEqual(self.failure(11).message, UNAVAILABLE)                                       # no redirect

    def test_c_timeout_is_503_within_the_budget_one_attempt(self):
        self.assertEqual(course_client.TIMEOUT_SECONDS, 3.0)  # team rule: 3 s at most
        self.course.delay = 2
        with mock.patch.object(course_client, "TIMEOUT_SECONDS", 0.5):
            start = time.monotonic()
            error = self.failure(7)
            elapsed = time.monotonic() - start
        self.assertEqual((error.status, len(self.course.requests)), (503, 1))
        self.assertLess(elapsed, 1.5)

    def test_c_localhost_budget_is_total_when_ipv6_is_refused_first(self):
        # Eureka advertises hostName "localhost" (::1 first); the fake listens on 127.0.0.1 only, like
        # waitress / php -S here. Before the fix: refused ::1 (~2 s on Windows) + a fresh full timeout.
        self.course.delay = 4
        with override_settings(COURSE_SERVICE_URL=f"http://localhost:{self.course.port}"), \
                mock.patch.object(course_client, "TIMEOUT_SECONDS", 2.5):
            start = time.monotonic()
            error = self.failure(7)
            elapsed = time.monotonic() - start
        self.assertEqual((error.status, len(self.course.requests)), (503, 1))
        self.assertLess(elapsed, 3.2)

    def test_localhost_reaches_an_ipv4_only_course_without_delay(self):
        with override_settings(COURSE_SERVICE_URL=f"http://localhost:{self.course.port}"):
            start = time.monotonic()
            check_course(7, TOKEN)
            elapsed = time.monotonic() - start
        self.assertEqual(len(self.course.requests), 1)
        self.assertLess(elapsed, 1.0)

    def test_c_connection_refused_is_503(self):
        with override_settings(COURSE_SERVICE_URL=f"http://127.0.0.1:{closed_port()}"):
            self.assertEqual(self.failure(7).status, 503)

    def test_messages_never_show_an_internal_address(self):
        for course_id in (8, 9, 10, 11, 12):
            message = self.failure(course_id).message
            self.assertNotIn("127.0.0.1", message)
            self.assertNotIn(str(self.course.port), message)


class CourseDiscoveryTests(CourseTestMixin, SimpleTestCase):
    def setUp(self):
        self.course = self.start_course()
        self.eureka = FakeHttp({"/eureka/apps/COURSE-SERVICE": (200, eureka_app(instance(self.course.port)))})
        self.addCleanup(self.eureka.stop)
        self.use(eureka_settings(self.eureka.port))

    def test_course_service_is_found_in_eureka(self):
        check_course(7, TOKEN)
        self.assertEqual([r["path"] for r in self.eureka.requests], ["/eureka/apps/COURSE-SERVICE"])
        self.assertEqual(self.eureka.requests[0]["headers"]["accept"], "application/json")
        self.assertNotIn("authorization", self.eureka.requests[0]["headers"])  # the token goes to Course only
        self.assertEqual(self.course.requests[0]["headers"]["authorization"], TOKEN)

    def test_course_service_url_replaces_eureka(self):
        with override_settings(COURSE_SERVICE_URL=self.course.url):
            check_course(7, TOKEN)
        self.assertEqual((len(self.eureka.requests), len(self.course.requests)), (0, 1))

    def test_not_registered_down_disabled_or_unreachable_eureka_is_503(self):
        cases = {
            "not registered": ({"/eureka/apps/COURSE-SERVICE": (404, None)}, {}),
            "only DOWN instances": ({"/eureka/apps/COURSE-SERVICE": (200, eureka_app(instance(self.course.port,
                                                                                          "DOWN")))}, {}),
            "not JSON": ({"/eureka/apps/COURSE-SERVICE": (200, "<applications/>")}, {}),
        }
        for label, (routes, _) in cases.items():
            course_client.reset_cache()
            self.eureka.routes = routes
            with self.subTest(label), self.assertRaises(CourseCheckError) as caught:
                check_course(7, TOKEN)
            self.assertEqual(caught.exception.status, 503)
        for label, config in {"unreachable": eureka_settings(closed_port()),
                              "disabled": eureka_settings(self.eureka.port, enabled=False)}.items():
            course_client.reset_cache()
            with self.subTest(label), config, self.assertRaises(CourseCheckError) as caught:
                check_course(7, TOKEN)
            self.assertEqual(caught.exception.status, 503)
        self.assertEqual(self.course.requests, [])  # Course itself was never called

    def test_single_instance_object_and_cached_lookup_refreshed_after_a_failure(self):
        self.eureka.routes = {"/eureka/apps/COURSE-SERVICE": (200, {"application": {"instance": instance(
            self.course.port)}})}
        check_course(7, TOKEN)
        check_course(7, TOKEN)
        self.assertEqual((len(self.eureka.requests), len(self.course.requests)), (1, 2))  # cached 30 s
        self.course.stop()                                                                 # Course goes away
        with self.assertRaises(CourseCheckError) as caught:
            check_course(7, TOKEN)
        self.assertEqual(caught.exception.status, 503)
        with self.assertRaises(CourseCheckError):
            check_course(7, TOKEN)
        self.assertEqual(len(self.eureka.requests), 2)  # looked up again after the failure
        self.course.stop = lambda: None                 # already stopped (cleanup)


class CourseOnCreationTests(CourseTestMixin, ApiTestCase):
    """SQLite-only test case: any MongoDB access fails the test, so each refusal below proves that
    nothing was written (no reclamation, no reference number consumed)."""

    def setUp(self):
        super().setUp()
        self.course = self.start_course()
        self.use(override_settings(COURSE_SERVICE_URL=self.course.url))

    def post(self, client=None, **fields):
        return (client or api(self.student)).post(URL, payload(**fields), format="json")

    def test_refused_or_unavailable_course_saves_nothing(self):
        for course_id, status, message in ((8, 404, NOT_FOUND), (9, 401, None), (10, 403, None),
                                           (11, 503, UNAVAILABLE)):
            response = self.post(course_id=course_id)
            with self.subTest(course_id=course_id):
                self.assertEqual(response.status_code, status)
                if message:
                    self.assertEqual(response.json(), {"detail": message})
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")
        self.assertIn("Bearer", self.post(course_id=9)["WWW-Authenticate"])

    def test_course_service_down_is_503_never_500(self):
        with override_settings(COURSE_SERVICE_URL=f"http://127.0.0.1:{closed_port()}"):
            response = self.post(course_id=7)
        self.assertEqual((response.status_code, response.json()), (503, {"detail": UNAVAILABLE}))

    def test_invalid_course_ids_are_400_and_course_is_not_called(self):
        for bad in (0, -1, "7", 7.5, True, 2**31, [7], {"id": 7}):
            response = self.post(course_id=bad)
            with self.subTest(course_id=bad):
                self.assertEqual(response.status_code, 400)
                self.assertIn("course_id", response.json())
        self.assertEqual(self.course.requests, [])

    def test_identity_and_role_are_checked_before_course(self):
        self.assertEqual(self.post(api(), course_id=7).status_code, 401)            # no token
        self.assertEqual(self.post(api(self.teacher), course_id=7).status_code, 403)
        self.assertEqual(self.post(api(self.admin), course_id=7).status_code, 403)
        self.assertEqual(self.course.requests, [])


class CourseOnCreationMongoTests(CourseTestMixin, MongoTestCase):
    def setUp(self):
        super().setUp()
        self.course = self.start_course()
        self.use(override_settings(COURSE_SERVICE_URL=self.course.url))

    def test_checked_course_is_saved_with_the_reclamation(self):
        token = kc.make_token(sub=self.student.sub, roles=self.student.roles,
                              preferred_username=self.student.username)
        response = api(token=token).post(URL, payload(course_id=7), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["course_id"], 7)
        self.assertEqual(Reclamation.objects.get(pk=ObjectId(response.json()["id"])).course_id, 7)
        self.assertEqual([r["headers"]["authorization"] for r in self.course.requests], [f"Bearer {token}"])

    def test_without_course_id_nothing_changes(self):
        for body in (payload(), payload(course_id=None)):
            response = api(self.student).post(URL, body, format="json")
            self.assertEqual((response.status_code, response.json()["course_id"]), (201, None))
        self.assertEqual(self.course.requests, [])

    def test_a_refused_course_writes_nothing(self):
        self.assertEqual(api(self.student).post(URL, payload(course_id=8), format="json").status_code, 404)
        self.assertEqual(Reclamation.objects.count(), 0)
        self.assertEqual(connections["mongodb"].get_collection(services.COUNTERS_COLLECTION).count_documents({}), 0)

    def test_course_is_set_at_creation_only_and_never_rechecked(self):
        created = api(self.student).post(URL, payload(course_id=7), format="json").json()
        for method in ("patch", "put"):
            response = getattr(api(self.student), method)(detail(created["id"]), payload(course_id=8), format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("only be given when the reclamation is created", response.json()["course_id"][0])
        api(self.student).patch(detail(created["id"]), {"subject": "Note de l'examen (corrigée)"}, format="json")
        self.assertEqual(Reclamation.objects.get(pk=ObjectId(created["id"])).course_id, 7)
        self.assertEqual(len(self.course.requests), 1)  # updates never call Course

    def test_existing_documents_without_course_id_still_work(self):
        reclamation = self.create()
        connections["mongodb"].get_collection("reclamations").update_one({"_id": reclamation.pk},
                                                                          {"$unset": {"course_id": ""}})
        response = api(self.student).get(detail(reclamation.pk))
        self.assertEqual((response.status_code, response.json()["course_id"]), (200, None))
        listed = api(self.student).get(URL).json()["results"]
        self.assertEqual([r["course_id"] for r in listed], [None])
