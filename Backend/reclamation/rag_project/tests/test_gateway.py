"""API Gateway integration: route /api/v1/reclamation/** -> lb://reclamation-service, /api/**.

Measured on a scratch copy of the team Gateway (README, "API Gateway"): it forwards request bodies
chunked without Content-Length, sends the service's own Host and no X-Forwarded-* headers. These
tests cover the service side of that contract offline (no Gateway, Eureka or Keycloak needed),
plus the pagination links against the real MongoDB (skipped without one).
"""

import http.client
import json
import os
import subprocess
import sys
import threading

from django.conf import settings
from django.test import SimpleTestCase, override_settings
from waitress.server import create_server

from config.middleware import UNREADABLE_BODY
from reclamations.views import public_link

from .fake_keycloak import keycloak_settings, shared_jwks
from .reclamation_support import URL, MongoTestCase, api

GATEWAY = "http://localhost:8080/api/v1/reclamation"


class PublicLinkTests(SimpleTestCase):
    def test_unset_keeps_the_link(self):
        with override_settings(PUBLIC_API_URL=""):
            link = "http://localhost:8087/api/reclamations/?page=2"
            self.assertEqual(public_link(link), link)
            self.assertIsNone(public_link(None))

    def test_gateway_address_replaces_the_service_address(self):
        with override_settings(PUBLIC_API_URL=GATEWAY):
            self.assertEqual(public_link("http://localhost:8087/api/reclamations/?category=grade&page=2"),
                             GATEWAY + "/reclamations/?category=grade&page=2")
            self.assertEqual(public_link("http://reclamation-service:8087/api/reclamations/?search=r%C3%A9"),
                             GATEWAY + "/reclamations/?search=r%C3%A9")       # Docker host name, encoded query
            self.assertEqual(public_link("http://localhost:8087/api/reclamations/"), GATEWAY + "/reclamations/")
            self.assertIsNone(public_link(None))                              # no next / previous page

    def test_setting_is_validated(self):
        def load(value):
            env = {**os.environ, "DJANGO_DEBUG": "True", "PUBLIC_API_URL": value}
            return subprocess.run([sys.executable, "-c", "import config.settings as s; print(s.PUBLIC_API_URL)"],
                                  cwd=settings.BASE_DIR, env=env, capture_output=True, text=True, timeout=120)

        self.assertEqual(load(GATEWAY + "/").stdout.strip(), GATEWAY)   # final slash removed
        self.assertEqual(load("").stdout.strip(), "")
        for bad in ("localhost:8080/api/v1/reclamation", "ftp://gateway/api", "http://gateway/api?x=1"):
            self.assertIn("PUBLIC_API_URL must be an http(s) URL", load(bad).stderr, bad)


class UnreadableBodyTests(SimpleTestCase):
    """What `manage.py runserver` receives from the Gateway: a chunked body, no Content-Length."""

    BODY = b'{"subject": "Note de l\'examen final"}'

    def post(self, **meta):
        return self.client.generic("POST", URL, self.BODY, content_type="application/json", **meta)

    def test_chunked_body_without_length_gets_411_not_an_empty_body(self):
        response = self.post(HTTP_TRANSFER_ENCODING="chunked", CONTENT_LENGTH="")
        self.assertEqual(response.status_code, 411)
        self.assertEqual(response.json(), {"error": UNREADABLE_BODY})
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")

    def test_bodies_with_a_length_go_through(self):
        # what waitress (or any normal client) sends: the request reaches authentication (no token)
        with keycloak_settings(shared_jwks().url):
            for meta in ({}, {"HTTP_TRANSFER_ENCODING": "chunked"}):
                self.assertEqual(self.post(**meta).status_code, 401, meta)
            self.assertEqual(self.client.get(URL).status_code, 401)  # no body at all

    def test_runs_before_any_other_middleware(self):
        self.assertEqual(settings.MIDDLEWARE[0], "config.middleware.RejectUnreadableBody")


class WaitressTests(SimpleTestCase):
    """The server to run behind the Gateway turns a chunked body into a normal one (CONTENT_LENGTH
    set, no Transfer-Encoding), which Django reads entirely and the guard lets through."""

    def test_chunked_body_becomes_a_normal_body(self):
        seen = {}

        def app(environ, start_response):  # a bare WSGI app: no Django, no database
            seen.update(length=environ.get("CONTENT_LENGTH"), te=environ.get("HTTP_TRANSFER_ENCODING"),
                        body=environ["wsgi.input"].read(int(environ.get("CONTENT_LENGTH") or 0)))
            start_response("200 OK", [("Content-Type", "text/plain")])
            return [b"ok"]

        server = create_server(app, host="127.0.0.1", port=0, threads=1)
        threading.Thread(target=server.run, daemon=True).start()
        body = json.dumps({"description": "Mathématiques " * 2000}, ensure_ascii=False).encode()
        try:
            conn = http.client.HTTPConnection("127.0.0.1", server.effective_port, timeout=10)
            conn.request("POST", URL, body=(body[i:i + 1000] for i in range(0, len(body), 1000)),
                         headers={"Content-Type": "application/json", "Transfer-Encoding": "chunked"},
                         encode_chunked=True)
            self.assertEqual(conn.getresponse().status, 200)
            conn.close()
        finally:
            server.close()
            server.task_dispatcher.shutdown()
        self.assertEqual((seen["length"], seen["te"], seen["body"]), (str(len(body)), None, body))


class GatewayPaginationTests(MongoTestCase):
    @override_settings(PUBLIC_API_URL=GATEWAY)
    def test_page_links_use_the_gateway_address(self):
        for n in range(21):
            self.create(subject=f"Réclamation numéro {n}")
        first = api(self.student).get(URL, {"category": "grade"}).json()
        self.assertEqual((first["count"], first["previous"]), (21, None))
        self.assertEqual(first["next"], GATEWAY + "/reclamations/?category=grade&page=2")
        second = api(self.student).get(URL, {"category": "grade", "page": 2}).json()
        self.assertEqual((len(second["results"]), second["next"]), (1, None))
        self.assertEqual(second["previous"], GATEWAY + "/reclamations/?category=grade")
