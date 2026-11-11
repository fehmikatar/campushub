"""
Keycloak authentication (config/auth.py) against the CampusHub security contract, fully offline.

Tokens are signed with RSA test keys and checked through the real code path (ApiView.dispatch ->
config.auth), with the public keys served by a local fake JWKS (tests/fake_keycloak.py). The real
Keycloak and the embedding/LLM providers are never contacted. Letters refer to the R2 checklist.

Run only these tests:  python manage.py test tests.test_auth
"""

import dataclasses
import json
import time
from unittest import mock

from django.test import Client, RequestFactory, SimpleTestCase, override_settings

from chat.models import Conversation
from config import auth
from config.api import ApiView, ok
from documents.models import Document

from . import fake_keycloak as kc
from .test_rag import IndexTestCase, pdf_bytes  # temporary index + fake providers (no tests of its own)


class WhoAmIView(ApiView):
    """A protected view that echoes `request.principal` (only used by these tests)."""

    def get(self, request):
        principal = request.principal
        return ok({"sub": principal.sub, "role": principal.role, "roles": list(principal.roles)})


whoami = WhoAmIView.as_view()


class Clock:
    """Replaces the monotonic clock of config.auth so cache expiry can be tested instantly."""

    def __init__(self):
        self.now = 10_000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class AuthTestCase(SimpleTestCase):
    """A fake JWKS per test class, a fresh key cache and a controllable clock per test."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.jwks = kc.FakeJwks()

    @classmethod
    def tearDownClass(cls):
        cls.jwks.stop()
        super().tearDownClass()

    def setUp(self):
        self.jwks.reset()
        auth.reset_signing_keys()
        self.addCleanup(auth.reset_signing_keys)
        self.clock = Clock()
        clock = mock.patch.object(auth, "_now", self.clock)
        clock.start()
        self.addCleanup(clock.stop)
        keycloak = kc.keycloak_settings(self.jwks.url)
        keycloak.enable()
        self.addCleanup(keycloak.disable)

    def call(self, token=None, *, header=None, query=None):
        """GET the protected test view with 'Bearer <token>', or a raw Authorization `header`."""
        headers = {}
        if header is not None:
            headers["Authorization"] = header
        elif token is not None:
            headers["Authorization"] = f"Bearer {token}"
        return whoami(RequestFactory().get("/whoami", query or {}, headers=headers))

    def principal(self, token, **kwargs):
        response = self.call(token, **kwargs)
        self.assertEqual(response.status_code, 200, response.content)
        return json.loads(response.content)

    def assertAuthError(self, response, status, message=None):
        """Status + the service's usual error body: exactly {"error": "<message>"} (U)."""
        self.assertEqual(response.status_code, status, response.content)
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")
        body = json.loads(response.content)
        self.assertEqual(list(body), ["error"])
        self.assertIsInstance(body["error"], str)
        if message is not None:
            self.assertEqual(body["error"], message)
        return body["error"]


class ValidTokenTests(AuthTestCase):
    def test_valid_rs256_token_authenticates(self):  # A
        self.assertEqual(self.principal(kc.make_token()),
                         {"sub": kc.ETUDIANT_ID, "role": "ETUDIANT", "roles": ["ETUDIANT"]})

    def test_sub_is_the_identity(self):  # B
        self.assertEqual(self.principal(kc.make_token(sub=kc.ENSEIGNANT_ID, roles=["ENSEIGNANT"]))["sub"],
                         kc.ENSEIGNANT_ID)
        self.assertEqual(self.principal(kc.make_token(sub=kc.ENSEIGNANT_ID.upper()))["sub"], kc.ENSEIGNANT_ID)

    def test_each_campushub_role_is_recognized(self):  # C
        for sub, role in ((kc.ETUDIANT_ID, "ETUDIANT"), (kc.ENSEIGNANT_ID, "ENSEIGNANT"), (kc.ADMIN_ID, "ADMIN")):
            with self.subTest(role=role):
                self.assertEqual(self.principal(kc.make_token(sub=sub, roles=[role]))["role"], role)

    def test_highest_role_wins(self):  # D
        everything = self.principal(kc.make_token(roles=["ETUDIANT", "ADMIN", "ENSEIGNANT"]))
        self.assertEqual((everything["role"], everything["roles"]), ("ADMIN", ["ADMIN", "ENSEIGNANT", "ETUDIANT"]))
        self.assertEqual(self.principal(kc.make_token(roles=["ETUDIANT", "ENSEIGNANT"]))["role"], "ENSEIGNANT")

    def test_bearer_scheme_is_case_insensitive(self):
        self.assertEqual(self.principal(None, header=f"bearer {kc.make_token()}")["role"], "ETUDIANT")

    def test_audience_is_not_checked(self):
        self.principal(kc.make_token(aud="another-client"))
        self.principal(kc.make_token(omit=("aud",)))

    def test_identity_in_the_query_string_is_ignored(self):
        principal = self.principal(kc.make_token(), query={"sub": kc.ADMIN_ID, "role": "ADMIN"})
        self.assertEqual((principal["sub"], principal["role"]), (kc.ETUDIANT_ID, "ETUDIANT"))

    def test_principal_keeps_no_raw_token(self):
        self.assertEqual([f.name for f in dataclasses.fields(auth.Principal)], ["sub", "role", "roles", "username"])


class RejectedTokenTests(AuthTestCase):
    def test_wrong_signature(self):  # E
        self.assertAuthError(self.call(kc.make_token(key=kc.IMPOSTOR_KEY)), 401, auth.INVALID)

    def test_expired_token(self):  # F
        response = self.call(kc.make_token(expires_in=-60))
        self.assertAuthError(response, 401, auth.EXPIRED)
        self.assertIn('error="invalid_token"', response["WWW-Authenticate"])

    def test_wrong_issuer(self):  # G
        for issuer in ("http://keycloak:8080/realms/campushub", kc.ISSUER + "/",
                       "http://localhost:8180/realms/other", "https://localhost:8180/realms/campushub"):
            with self.subTest(issuer=issuer):
                self.assertAuthError(self.call(kc.make_token(issuer=issuer)), 401, auth.INVALID)

    def test_hs256_and_unsigned_tokens_are_refused_before_any_key_lookup(self):  # H, I
        for token in (kc.hs256_token(), kc.unsigned_token(), kc.hs256_token(roles=["ADMIN"])):
            with self.subTest(token=token[:20]):
                self.assertAuthError(self.call(token), 401, auth.INVALID)
        self.assertEqual(self.jwks.requests, 0)

    def test_missing_token(self):  # J
        for header in (None, "", "   "):
            with self.subTest(header=header):
                response = self.call(header=header) if header is not None else self.call()
                self.assertAuthError(response, 401, auth.MISSING)
                self.assertEqual(response["WWW-Authenticate"], 'Bearer realm="campushub"')

    def test_malformed_authorization_header(self):  # K
        token = kc.make_token()
        for header in ("Basic dXNlcjpwYXNz", "Bearer", f"Token {token}", f"Bearer {token} extra",
                       f"Bearer {'a' * (auth.MAX_TOKEN_LENGTH + 1)}"):
            with self.subTest(header=header[:30]):
                self.assertAuthError(self.call(header=header), 401, auth.MALFORMED)
        for garbage in ("not-a-jwt", "a.b.c", "eyJhbGciOiJSUzI1NiJ9.e30.", "Ã©Ã©.Ã©.Ã©"):
            with self.subTest(token=garbage):
                self.assertAuthError(self.call(garbage), 401, auth.INVALID)

    def test_missing_or_malformed_sub(self):  # L
        bad = [kc.make_token(omit=("sub",))] + [kc.make_token(sub=s) for s in (
            "", "123", "etudiant1", "not-a-uuid-at-all-but-36-characters", 42, "{" + kc.ETUDIANT_ID + "}")]
        for token in bad:
            with self.subTest(token=token[-20:]):
                self.assertAuthError(self.call(token), 401, auth.INVALID)

    def test_required_claims(self):
        for claim in ("exp", "iat", "iss"):
            with self.subTest(missing=claim):
                self.assertAuthError(self.call(kc.make_token(omit=(claim,))), 401, auth.INVALID)

    def test_token_not_yet_valid(self):
        self.assertAuthError(self.call(kc.make_token(nbf=int(time.time()) + 600)), 401, auth.INVALID)

    def test_token_without_key_id(self):
        token = kc.make_token(header={"kid": None})
        self.assertAuthError(self.call(token), 401, auth.INVALID)

    def test_encryption_key_is_never_used_to_verify_signatures(self):
        self.assertAuthError(self.call(kc.make_token(key=kc.ENCRYPTION_KEY)), 401, auth.INVALID)


class RoleTests(AuthTestCase):
    def test_valid_token_without_campushub_role_is_forbidden(self):  # M
        for token in (kc.make_token(roles=[]), kc.make_token(omit=("realm_access",)),
                      kc.make_token(realm_access={"roles": "ADMIN"}), kc.make_token(realm_access="ADMIN")):
            with self.subTest(token=token[-20:]):
                response = self.call(token)
                self.assertAuthError(response, 403, auth.NO_ROLE)
                self.assertFalse(response.has_header("WWW-Authenticate"))

    def test_unrelated_keycloak_roles_and_legacy_claims_are_ignored(self):  # N
        self.assertAuthError(self.call(kc.make_token(roles=["admin", "Etudiant", "ROLE_ADMIN"])), 403)
        self.assertAuthError(self.call(kc.make_token(roles=[], role="ADMIN")), 403)  # old HS256-era claim
        client_roles = {"campushub-frontend": {"roles": ["ADMIN"]}}
        principal = self.principal(kc.make_token(roles=["ETUDIANT"], resource_access=client_roles, role="ADMIN"))
        self.assertEqual((principal["role"], principal["roles"]), ("ETUDIANT", ["ETUDIANT"]))


class SigningKeyTests(AuthTestCase):
    def test_keys_are_cached_for_10_minutes(self):  # Q
        for _ in range(5):
            self.principal(kc.make_token())
        self.assertEqual(self.jwks.requests, 1)
        self.clock.advance(auth.KEYS_MAX_AGE - 1)
        self.principal(kc.make_token())
        self.assertEqual(self.jwks.requests, 1)
        self.clock.advance(2)
        self.principal(kc.make_token())
        self.assertEqual(self.jwks.requests, 2)

    def test_key_rotation_is_picked_up(self):
        self.principal(kc.make_token())
        self.jwks.keys = [kc.KEY, kc.ROTATED_KEY]
        self.clock.advance(auth.MIN_FETCH_INTERVAL + 1)
        self.principal(kc.make_token(key=kc.ROTATED_KEY))
        self.principal(kc.make_token())  # the previous key still works while it is published
        self.assertEqual(self.jwks.requests, 2)

    def test_unknown_key_id_is_401_and_refetches_at_most_every_10_s(self):
        self.principal(kc.make_token())
        unknown = kc.make_token(key=kc.ROTATED_KEY)  # not published
        self.assertAuthError(self.call(unknown), 401, auth.INVALID)  # 0 s since the last fetch: no new fetch
        self.assertEqual(self.jwks.requests, 1)
        self.clock.advance(auth.MIN_FETCH_INTERVAL)
        self.assertAuthError(self.call(unknown), 401, auth.INVALID)
        self.assertEqual(self.jwks.requests, 2)
        for _ in range(5):
            self.assertAuthError(self.call(unknown), 401, auth.INVALID)
        self.assertEqual(self.jwks.requests, 2)

    def test_keycloak_down_and_key_not_cached_is_503(self):  # O
        self.jwks.status = 503
        with self.assertLogs("rag.auth", "WARNING") as logs:
            self.assertAuthError(self.call(kc.make_token()), 503, auth.UNAVAILABLE)
        self.assertIn("HTTP 503", logs.output[0])
        self.assertAuthError(self.call(kc.make_token()), 503)  # within 10 s: no new attempt
        self.assertEqual(self.jwks.requests, 1)

    def test_unreachable_keycloak_is_503(self):  # O
        with override_settings(KEYCLOAK_JWKS_URI=kc.closed_port_url()), self.assertLogs("rag.auth", "WARNING"):
            self.assertAuthError(self.call(kc.make_token()), 503, auth.UNAVAILABLE)

    def test_slow_keycloak_times_out(self):
        self.jwks.delay = 1.0
        started = time.perf_counter()
        with mock.patch.object(auth, "FETCH_TIMEOUT", 0.2), self.assertLogs("rag.auth", "WARNING"):
            self.assertAuthError(self.call(kc.make_token()), 503, auth.UNAVAILABLE)
        self.assertLess(time.perf_counter() - started, 0.9)

    def test_jwks_without_signing_key_is_503(self):
        self.jwks.keys = []  # only the encryption key is left
        with self.assertLogs("rag.auth", "WARNING"):
            self.assertAuthError(self.call(kc.make_token()), 503, auth.UNAVAILABLE)

    def test_cached_key_keeps_working_during_a_keycloak_outage(self):  # P
        self.principal(kc.make_token())                         # keys downloaded at t0
        self.jwks.status = 503
        with self.assertLogs("rag.auth", "WARNING"):
            self.clock.advance(11 * 60)                         # stale: refresh fails, cached key used
            self.principal(kc.make_token())
            self.clock.advance(30 * 60)
            self.principal(kc.make_token())
            # a key that was never downloaded cannot be checked during the outage
            self.assertAuthError(self.call(kc.make_token(key=kc.ROTATED_KEY)), 503, auth.UNAVAILABLE)
            self.clock.advance(20 * 60)                         # older than KEYS_STALE_MAX_AGE
            self.assertAuthError(self.call(kc.make_token()), 503, auth.UNAVAILABLE)
        self.jwks.status = 200                                  # Keycloak is back
        self.clock.advance(auth.MIN_FETCH_INTERVAL)
        self.principal(kc.make_token())

    def test_invalid_token_is_401_even_during_an_outage(self):
        self.principal(kc.make_token())
        self.jwks.status = 503
        self.assertAuthError(self.call(kc.make_token(key=kc.IMPOSTOR_KEY)), 401, auth.INVALID)
        self.assertAuthError(self.call(kc.make_token(expires_in=-60)), 401, auth.EXPIRED)
        self.assertEqual(self.jwks.requests, 1)


class ErrorSafetyTests(AuthTestCase):
    def test_errors_never_expose_tokens_keys_hosts_or_internals(self):  # U, V
        token = kc.make_token(key=kc.IMPOSTOR_KEY)
        responses = [self.call(), self.call(header="Basic abc"), self.call("garbage"), self.call(token),
                     self.call(kc.make_token(expires_in=-1)), self.call(kc.make_token(roles=[])),
                     self.call(kc.hs256_token())]
        with override_settings(KEYCLOAK_JWKS_URI=kc.closed_port_url()), self.assertLogs("rag.auth", "WARNING"):
            auth.reset_signing_keys()
            responses.append(self.call(kc.make_token()))
        with override_settings(KEYCLOAK_ISSUER_URI=""), mock.patch.object(auth, "_reported_unconfigured", True):
            responses.append(self.call(token))
        port = self.jwks.base_url.rsplit(":", 1)[1]
        for response in responses:
            with self.subTest(status=response.status_code):
                message = self.assertAuthError(response, response.status_code)
                for secret in (token, token.split(".")[2], port, "127.0.0.1", "localhost", "keycloak", "http",
                               "Traceback", "BEGIN", "PyJWT", "Exception", "Error:", kc.KEY.kid):
                    self.assertNotIn(secret, message)

    def test_unexpected_failure_is_a_401_never_a_500(self):
        with mock.patch.object(auth, "principal_from", side_effect=RuntimeError("bug")), \
                self.assertLogs("rag.auth", "ERROR"):
            self.assertAuthError(self.call(kc.make_token()), 401, auth.INVALID)


class ServiceConfigurationTests(IndexTestCase):
    """Through the real URLs (temporary index, so the project's own Chroma data is never opened)."""

    def test_health_is_public(self):  # R
        anonymous = Client()
        for client in (anonymous, Client(headers={"Authorization": "Bearer garbage"})):
            r = client.get("/api/health")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(set(r.json()), {"status", "service", "academic_year", "indexed", "index",
                                             "documents", "embed_model", "llm_model"})
        with override_settings(KEYCLOAK_ISSUER_URI=""):
            self.assertEqual(anonymous.get("/api/health").json()["status"], "UP")

    def test_debug_mode_does_not_bypass_authentication(self):  # S
        with override_settings(DEBUG=True), self.assertLogs("django.request", "WARNING"):
            self.assertEqual(Client().get("/api/conversations").status_code, 401)
            self.assertEqual(Client().post("/api/conversations").status_code, 401)

    def test_unconfigured_keycloak_fails_closed(self):  # T
        for issuer in ("", "   "):
            with self.subTest(issuer=issuer), override_settings(KEYCLOAK_ISSUER_URI=issuer), \
                    mock.patch.object(auth, "_reported_unconfigured", False), \
                    self.assertLogs("rag.auth", "ERROR") as logs:
                for client in (Client(), self.client):  # anonymous, and even with a valid token
                    r = client.get("/api/conversations")
                    self.assertEqual((r.status_code, r.json()), (503, {"error": auth.NOT_CONFIGURED}))
                    self.assertEqual(client.post("/api/conversations").status_code, 503)
                self.assertEqual(len(logs.output), 1)  # reported once, not on every request
        with override_settings(KEYCLOAK_JWKS_URI="file:///etc/passwd"), \
                mock.patch.object(auth, "_reported_unconfigured", True):
            self.assertEqual(self.client.get("/api/conversations").status_code, 503)
        self.assertEqual(Conversation.objects.count(), 0)

    def test_jwks_address_defaults_to_the_issuer(self):
        issuer = kc.shared_jwks().base_url + "/realms/campushub"
        auth.reset_signing_keys()
        with override_settings(KEYCLOAK_ISSUER_URI=issuer, KEYCLOAK_JWKS_URI=""):
            self.assertEqual(auth.keycloak_config(), (issuer, kc.shared_jwks().url))
            ok_client = Client(headers=kc.auth_headers(kc.make_token(issuer=issuer)))
            self.assertEqual(ok_client.get("/api/conversations").status_code, 200)


class ProtectedEndpointTests(IndexTestCase):
    """W: a valid token reaches the real endpoints; without one, no business logic runs."""

    ENDPOINTS = [("get", "/api/academic-rules"), ("get", "/api/academic-rules/PFE002"),
                 ("get", "/api/ambiguities"), ("get", "/api/ambiguities/C01"),
                 ("get", "/api/conversations"), ("post", "/api/conversations"),
                 ("get", "/api/conversations/1"), ("put", "/api/conversations/1"),
                 ("patch", "/api/conversations/1"), ("delete", "/api/conversations/1"),
                 ("post", "/api/academic-assistant/ask"), ("get", "/api/documents"),
                 ("post", "/api/documents"), ("get", "/api/documents/1"), ("put", "/api/documents/1"),
                 ("delete", "/api/documents/1"), ("options", "/api/conversations")]

    def setUp(self):
        super().setUp()
        self.run_command("ingest_regulation")

    def test_every_endpoint_rejects_anonymous_requests(self):
        anonymous = Client()
        for method, path in self.ENDPOINTS:
            with self.subTest(method=method, path=path):
                r = getattr(anonymous, method)(path)
                self.assertEqual((r.status_code, r.json()), (401, {"error": auth.MISSING}))
        self.assertEqual(Conversation.objects.count(), 0)
        self.assertEqual(self.fake_llm.calls, [])
        self.assertEqual(Document.objects.count(), 1)  # only the regulation imported in setUp

    def test_authentication_comes_before_body_parsing(self):
        r = Client().post("/api/academic-assistant/ask", "{oops", content_type="application/json")
        self.assertEqual(r.status_code, 401)  # not 400: nothing is parsed for anonymous callers
        forged = json.dumps({"question": "PFE ?", "sub": kc.ADMIN_ID, "role": "ADMIN"})
        r = Client().post("/api/academic-assistant/ask", forged, content_type="application/json")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.fake_llm.calls, [])

    def test_valid_token_reaches_the_endpoints(self):
        for role, sub in (("ETUDIANT", kc.ETUDIANT_ID), ("ENSEIGNANT", kc.ENSEIGNANT_ID), ("ADMIN", kc.ADMIN_ID)):
            with self.subTest(role=role):
                client = Client(headers=kc.auth_headers(kc.make_token(sub=sub, roles=[role])))
                self.assertEqual(client.get("/api/academic-rules/PFE002").json()["id"], "PFE002")
                self.assertEqual(client.get("/api/ambiguities").json()["count"], 11)
                self.assertEqual(client.get("/api/documents").json()["count"], 1)

        answer = self.post({"question": "Mon PFE doit durer 26 ou 28 semaines ?"})
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(len(self.fake_llm.calls), 1)
        conversation = f"/api/conversations/{answer.json()['conversation_id']}"
        self.assertEqual(self.client.get(conversation).json()["message_count"], 2)
        renamed = self.client.put(conversation, json.dumps({"title": "PFE"}), content_type="application/json")
        self.assertEqual(renamed.json()["title"], "PFE")
        self.assertEqual(self.client.get("/api/conversations").json()["count"], 1)

        upload = self.client.post("/api/documents", {"file": _pdf("guide.pdf")})
        self.assertEqual(upload.status_code, 201, upload.content)
        self.assertEqual(self.client.delete(f"/api/documents/{upload.json()['id']}").status_code, 204)
        self.assertEqual(self.client.delete(conversation).status_code, 204)


def _pdf(name):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile(name, pdf_bytes(["Guide des stages."]), content_type="application/pdf")
