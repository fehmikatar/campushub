"""Security regressions through the real DRF adapter, signed RSA JWTs and fake JWKS only."""
from unittest import mock

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APIRequestFactory

from config import auth
from reclamations import services
from reclamations.authentication import KeycloakAuthentication
from reclamations.models import Reclamation
from rest_framework.exceptions import PermissionDenied

from . import fake_keycloak as kc
from .reclamation_support import URL, ApiTestCase, api, basic, make_user, payload
from .test_auth import AuthTestCase, whoami


class DrfTokenTests(AuthTestCase):
    def call(self, token=None):
        # Valid students reach input validation without requiring MongoDB.
        return api(token=token).post(URL, {}, format="json")

    def assert_error(self, token, status, message=None):
        response = self.call(token)
        self.assertEqual(response.status_code, status, response.content)
        self.assertEqual(set(response.json()), {"detail"})
        if message:
            self.assertEqual(response.json()["detail"], message)
        self.assertEqual(response.has_header("WWW-Authenticate"), status == 401)
        return response

    def test_valid_student_reaches_validation(self):
        self.assertEqual(self.call(kc.make_token()).status_code, 400)

    def test_valid_admin_reaches_stats_validation(self):
        response = api(token=kc.make_token(roles=["ADMIN"])).get(URL + "stats/", {"academic_year": "bad"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {"academic_year"})

    def test_missing_token(self):
        self.assert_error(None, 401, auth.MISSING)

    def test_expired(self):
        self.assert_error(kc.make_token(expires_in=-60), 401, auth.EXPIRED)

    def test_wrong_signature(self):
        self.assert_error(kc.make_token(key=kc.IMPOSTOR_KEY), 401, auth.INVALID)

    def test_wrong_issuer(self):
        self.assert_error(kc.make_token(issuer="http://keycloak:8080/realms/campushub"), 401, auth.INVALID)

    def test_hs256(self):
        self.assert_error(kc.hs256_token(), 401)
        self.assertEqual(self.jwks.requests, 0)

    def test_unsigned(self):
        self.assert_error(kc.unsigned_token(), 401)
        self.assertEqual(self.jwks.requests, 0)

    def test_missing_required_claims(self):
        for claim in auth.REQUIRED_CLAIMS:
            with self.subTest(claim=claim):
                self.assert_error(kc.make_token(omit=(claim,)), 401)

    def test_invalid_sub_including_local_integer(self):
        for sub in (1, "1", "", "not-a-uuid", None):
            with self.subTest(sub=sub):
                self.assert_error(kc.make_token(sub=sub), 401)

    def test_unrecognized_and_legacy_roles(self):
        for claims in ({"roles": []}, {"roles": [], "role": "ADMIN"},
                       {"roles": ["Etudiant", "ROLE_ADMIN"]}, {"realm_access": {"roles": "ADMIN"}}):
            with self.subTest(claims=claims):
                self.assert_error(kc.make_token(**claims), 403, auth.NO_ROLE)

    def test_highest_role_does_not_combine_student_privileges(self):
        for roles in (["ETUDIANT", "ENSEIGNANT"], ["ETUDIANT", "ADMIN"], ["ADMIN", "ENSEIGNANT", "ETUDIANT"]):
            with self.subTest(roles=roles):
                self.assert_error(kc.make_token(roles=roles), 403)

    def test_audience_and_unrelated_roles_do_not_change_access(self):
        token = kc.make_token(aud="different-client", roles=["offline_access", "ETUDIANT"], role="ADMIN")
        self.assertEqual(self.call(token).status_code, 400)

    def test_outage_unknown_key_is_503(self):
        self.jwks.status = 503
        with self.assertLogs("rag.auth", "WARNING"):
            self.assert_error(kc.make_token(key=kc.ROTATED_KEY), 503, auth.UNAVAILABLE)

    def test_cache_is_shared_with_rag_and_expires_during_outage(self):
        token = kc.make_token()
        request = APIRequestFactory().get("/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(whoami(request).status_code, 200)
        self.assertEqual(self.call(token).status_code, 400)
        self.assertEqual(self.jwks.requests, 1)  # the two adapters use one cache
        self.jwks.status = 503
        self.clock.advance(auth.KEYS_MAX_AGE + 1)
        with self.assertLogs("rag.auth", "WARNING"):
            self.assertEqual(self.call(token).status_code, 400)
        self.assert_error(kc.make_token(key=kc.ROTATED_KEY), 503)
        self.clock.advance(auth.KEYS_STALE_MAX_AGE)
        with self.assertLogs("rag.auth", "WARNING"):
            self.assert_error(token, 503)

    def test_key_rotation(self):
        self.assertEqual(self.call(kc.make_token()).status_code, 400)
        self.jwks.keys = [kc.KEY, kc.ROTATED_KEY]
        self.clock.advance(auth.MIN_FETCH_INTERVAL + 1)
        self.assertEqual(self.call(kc.make_token(key=kc.ROTATED_KEY)).status_code, 400)

    def test_missing_configuration_fails_closed_even_in_debug(self):
        for issuer in ("", "   ", None):
            with self.subTest(issuer=issuer), override_settings(KEYCLOAK_ISSUER_URI=issuer, DEBUG=True), \
                    mock.patch.object(auth, "_reported_unconfigured", True):
                self.assert_error(None, 503, auth.NOT_CONFIGURED)
                self.assert_error(kc.make_token(), 503, auth.NOT_CONFIGURED)

    def test_principal_interfaces_and_verified_snapshot(self):
        token = kc.make_token(preferred_username="  etudiant1  ")
        request = APIRequestFactory().get("/", HTTP_AUTHORIZATION=f"Bearer {token}")
        principal, context = KeycloakAuthentication().authenticate(request)
        self.assertIs(principal, request.principal)
        self.assertTrue(principal.is_authenticated)
        self.assertFalse(principal.is_anonymous)
        self.assertEqual((principal.sub, principal.username), (kc.ETUDIANT_ID, "etudiant1"))
        self.assertIsNone(context)
        self.assertNotIn(token, repr(principal))

    def test_missing_or_invalid_username_falls_back_to_sub(self):
        for username in (None, "", "   ", 12, [], "x" * 151):
            token = kc.make_token(preferred_username=username)
            request = APIRequestFactory().get("/", HTTP_AUTHORIZATION=f"Bearer {token}")
            principal, _ = KeycloakAuthentication().authenticate(request)
            self.assertEqual(principal.username, kc.ETUDIANT_ID)

    def test_authentication_precedes_json_parsing(self):
        response = api().post(URL, "{invalid", content_type="application/json")
        self.assertEqual(response.status_code, 401)

    def test_errors_do_not_expose_credentials(self):
        token = kc.make_token(key=kc.IMPOSTOR_KEY)
        response = self.assert_error(token, 401)
        for value in (token, kc.KEY.kid, "localhost", "Traceback", "BEGIN", "http:"):
            self.assertNotIn(value, response.content.decode())


class DrfLocalIdentityTests(ApiTestCase):
    def test_local_superuser_session_and_basic_never_authorize_crud(self):
        local = make_user("root", "Administrateur", is_superuser=True)
        client = api()
        client.force_login(local)
        self.assertEqual(client.get(URL).status_code, 401)
        self.assertEqual(client.get(URL, **basic("root")).status_code, 401)
        # A valid student JWT wins over a privileged local session.
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {kc.make_token()}")
        self.assertEqual(client.get(URL + "stats/").status_code, 403)

    def test_authentication_neither_creates_users_nor_queries_groups(self):
        before = User.objects.count()
        with self.assertNumQueries(0):
            self.assertEqual(api(self.student).post(URL, {}, format="json").status_code, 400)
            self.assertEqual(api(self.admin).post(URL, payload(), format="json").status_code, 403)
        self.assertEqual(User.objects.count(), before)

    def test_spoofed_identity_and_roles_are_rejected(self):
        for field, value in {"author_sub": kc.ADMIN_ID, "by_sub": kc.ADMIN_ID, "role": "ADMIN",
                             "roles": ["ADMIN"], "author_id": 1, "reference": "REC-2026-99999",
                             "status": "resolved", "priority": "high", "history": []}.items():
            with self.subTest(field=field):
                response = api(self.student).post(URL, payload(**{field: value}), format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(set(response.json()), {field})

    def test_service_layer_refuses_wrong_roles_and_owners(self):
        owned = Reclamation(author_sub=self.student.sub)
        for actor in (self.admin, self.teacher, make_user("local", "Etudiant")):
            with self.subTest(actor=repr(actor)), self.assertRaises(PermissionDenied):
                services.create_reclamation(actor, payload())
        with self.assertRaises(PermissionDenied):
            services.change_status(owned, self.student, status="in_progress")
        with self.assertRaises(PermissionDenied):
            services.update_reclamation(owned, self.admin, {"subject": "Changed"})
        with self.assertRaises(PermissionDenied):
            services.delete_reclamation(owned, self.admin)
        for reclamation in (owned, Reclamation(author_id=1)):
            with self.assertRaises(services.ReclamationGone):
                services.update_reclamation(reclamation, self.other_student, {"subject": "Changed"})
            with self.assertRaises(services.ReclamationGone):
                services.delete_reclamation(reclamation, self.other_student)
        with self.assertRaises(services.WorkflowError):
            services.create_reclamation(self.student, payload(author_sub=kc.ADMIN_ID))
