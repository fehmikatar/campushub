"""Reclamations tests that need NO MongoDB server (they always run).

Routing, workflow rules, roles, access control, input validation, invalid ids, error mapping,
`setup_roles`, and the guarantee that local Django credentials never open the RAG endpoints.
The API tests here are SQLite-only: any MongoDB access would make them fail (see
reclamation_support.ApiTestCase), which proves that the refusals happen before MongoDB is used.
"""

import json
from io import StringIO
from types import SimpleNamespace
from unittest import mock

from django.apps import apps
from django.conf import settings
from django.contrib.auth.models import AnonymousUser, Group, User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management import CommandError, call_command
from django.db import DatabaseError, router
from django.test import Client, SimpleTestCase, TestCase, override_settings
from pymongo.errors import ServerSelectionTimeoutError
from rest_framework.exceptions import NotFound

from config import auth
from config.db_router import DatabaseRouter
from reclamations import exceptions, services
from reclamations.management.commands.setup_roles import DEMO_PASSWORD, DEMO_USERS, ROLES_BY_PRIORITY as LEGACY_ROLES
from reclamations.models import HistoryEntry, Priority, Reclamation, Status, validate_academic_year
from reclamations.permissions import ADMIN, ETUDIANT, ENSEIGNANT, NOT_FOUND, IsEtudiant, user_role

from .fake_keycloak import ADMIN_ID, auth_headers, keycloak_settings, make_token, shared_jwks
from .reclamation_support import URL, ApiTestCase, api, basic, detail, make_user, make_principal, payload

SOME_ID = "6553f1a2b3c4d5e6f7a8b9c0"  # a well-formed ObjectId

# Every operation of the API: (method, path, body)
OPERATIONS = [
    ("get", URL, None),
    ("post", URL, payload()),
    ("get", detail(SOME_ID), None),
    ("put", detail(SOME_ID), payload()),
    ("patch", detail(SOME_ID), {"subject": "Nouveau sujet"}),
    ("delete", detail(SOME_ID), None),
    ("post", f"{detail(SOME_ID)}change-status/", {"status": "in_progress"}),
    ("get", f"{URL}stats/", None),
    ("options", URL, None),
]


def call(client, method, path, body=None, **extra):
    if body is None:
        return getattr(client, method)(path, **extra)
    return getattr(client, method)(path, body, format="json", **extra)


# ---------------------------------------------------------------- 29. database routing

class RoutingTests(SimpleTestCase):
    def test_reclamations_models_use_mongodb_and_everything_else_sqlite(self):
        for model in apps.get_models():
            expected = "mongodb" if model._meta.app_label == "reclamations" else "default"
            with self.subTest(model=model._meta.label):
                self.assertEqual(router.db_for_read(model), expected)
                self.assertEqual(router.db_for_write(model), expected)
        for label in ("auth.User", "auth.Group", "sessions.Session", "contenttypes.ContentType",
                      "chat.Conversation", "documents.Document", "regulation.AcademicRule"):
            self.assertEqual(router.db_for_write(apps.get_model(label)), "default")

    def test_each_app_is_migrated_on_its_own_database_only(self):
        for model in apps.get_models():
            mongodb = model._meta.app_label == "reclamations"
            with self.subTest(model=model._meta.label):
                self.assertEqual(router.allow_migrate_model("default", model), not mongodb)
                if model is not HistoryEntry:
                    self.assertEqual(router.allow_migrate_model("mongodb", model), mongodb)

    def test_embedded_history_entries_get_no_collection(self):
        self.assertFalse(router.allow_migrate_model("mongodb", HistoryEntry))
        self.assertFalse(router.allow_migrate_model("default", HistoryEntry))

    def test_no_relation_across_the_two_databases(self):
        reclamation, other = Reclamation(), Reclamation()
        user, group = User(), Group()
        self.assertFalse(router.allow_relation(reclamation, user))
        self.assertFalse(router.allow_relation(group, reclamation))
        self.assertTrue(router.allow_relation(reclamation, other))
        self.assertTrue(router.allow_relation(user, group))

    def test_database_settings(self):
        self.assertEqual(settings.DATABASES["default"]["ENGINE"], "django.db.backends.sqlite3")
        mongodb = settings.DATABASES["mongodb"]
        self.assertEqual(mongodb["ENGINE"], "django_mongodb_backend")
        # tests can never run on (and drop) the development database
        self.assertEqual(mongodb["TEST"]["NAME"], f"test_{settings.MONGODB_NAME}")
        self.assertNotEqual(mongodb["TEST"]["NAME"], settings.MONGODB_NAME)
        self.assertEqual(settings.DATABASE_ROUTERS[0], "django_mongodb_backend.routers.MongoRouter")
        self.assertIsInstance(router.routers[1], DatabaseRouter)


# ---------------------------------------------------------------- workflow rules (no database)

class WorkflowRuleTests(SimpleTestCase):
    def reclamation(self, status, admin_response=""):
        return Reclamation(author_sub=ADMIN_ID, status=status, admin_response=admin_response, history=[])

    def test_allowed_transitions(self):
        self.assertEqual(services.TRANSITIONS, {
            Status.NEW: (Status.IN_PROGRESS, Status.REJECTED),
            Status.IN_PROGRESS: (Status.RESOLVED, Status.REJECTED),
            Status.RESOLVED: (),
            Status.REJECTED: (),
        })

    def test_every_other_transition_is_refused_before_any_write(self):
        admin = make_principal("admin1", ADMIN)
        for current in Status.values:
            for target in Status.values:
                if target in services.TRANSITIONS[current]:
                    continue
                with self.subTest(transition=f"{current} -> {target}"):
                    with self.assertRaises(services.WorkflowError) as caught:
                        services.change_status(self.reclamation(current), admin, status=target,
                                               admin_response="Une réponse.")
                    self.assertEqual(caught.exception.field, "status")

    def test_final_statuses_require_an_admin_response(self):
        admin = make_principal("admin1", ADMIN)
        for current, target in [(Status.NEW, Status.REJECTED), (Status.IN_PROGRESS, Status.RESOLVED),
                                (Status.IN_PROGRESS, Status.REJECTED)]:
            for response in (None, "", "   "):
                with self.subTest(transition=f"{current} -> {target}", response=response):
                    with self.assertRaises(services.WorkflowError) as caught:
                        services.change_status(self.reclamation(current), admin, status=target,
                                               admin_response=response)
                    self.assertEqual(caught.exception.field, "admin_response")

    def test_students_cannot_edit_or_delete_after_processing_started(self):
        for status in (Status.IN_PROGRESS, Status.RESOLVED, Status.REJECTED):
            with self.subTest(status=status):
                with self.assertRaises(services.WorkflowError):
                    services.update_reclamation(self.reclamation(status), make_principal("s", sub=ADMIN_ID), {"subject": "Nouveau sujet"})
                with self.assertRaises(services.WorkflowError):
                    services.delete_reclamation(self.reclamation(status), make_principal("s", sub=ADMIN_ID))

    def test_reference_format(self):
        self.assertEqual(services.format_reference(2026, 1), "REC-2026-00001")
        self.assertEqual(services.format_reference(2027, 42), "REC-2027-00042")
        self.assertEqual(services.format_reference(2026, 123456), "REC-2026-123456")

    def test_academic_year_validation(self):
        validate_academic_year("2026-2027")
        for bad in ("2026-2028", "2027-2026", "2026/2027", "26-27", "", "2026-2027 ", "x2026-2027"):
            with self.subTest(value=bad), self.assertRaises(DjangoValidationError):
                validate_academic_year(bad)

    def test_timestamps_have_mongodb_precision(self):
        self.assertEqual(services.now().microsecond % 1000, 0)

    def test_orderings(self):
        self.assertEqual(set(services.ORDERINGS), {"created_at", "-created_at", "updated_at", "-updated_at",
                                                   "priority", "-priority"})
        self.assertEqual(Priority.values, ["low", "normal", "high"])  # the rank order of PRIORITY_RANK


# ---------------------------------------------------------------- roles

class RoleTests(TestCase):
    def test_role_comes_from_verified_principal(self):
        for role in (ETUDIANT, ENSEIGNANT, ADMIN):
            self.assertEqual(user_role(auth.principal_from({"sub": ADMIN_ID, "realm_access": {"roles": [role]}})), role)

    def test_superuser_has_no_api_role(self):
        self.assertIsNone(user_role(make_user("root", is_superuser=True)))

    def test_highest_role_wins(self):
        for roles, expected in (([ETUDIANT, ENSEIGNANT], ENSEIGNANT), ([ETUDIANT, ENSEIGNANT, ADMIN], ADMIN)):
            principal = auth.principal_from({"sub": ADMIN_ID, "realm_access": {"roles": roles}})
            self.assertEqual(user_role(principal), expected)

    def test_no_role_for_local_users_or_anonymous(self):
        for user in (AnonymousUser(), None, make_user("student", "Etudiant"),
                     make_user("teacher", "Formateur"), make_user("admin", "Administrateur")):
            self.assertIsNone(user_role(user))


class ObjectPermissionTests(SimpleTestCase):
    """Second line of defence behind the filtered queryset (which already turns another
    student's reclamation into a 404, so this check is not reachable through the API)."""

    def test_another_students_reclamation_is_reported_as_not_found(self):
        request = SimpleNamespace(user=make_principal("etudiant1", sub=ADMIN_ID))
        self.assertTrue(IsEtudiant().has_object_permission(request, None, Reclamation(author_sub=ADMIN_ID)))
        with self.assertRaises(NotFound):
            IsEtudiant().has_object_permission(request, None, Reclamation(author_sub=None, author_id=1))


# ---------------------------------------------------------------- 18-22. access control

class AccessControlTests(ApiTestCase):
    def assertRefusedEverywhere(self, client, status, operations=OPERATIONS, **extra):
        for method, path, body in operations:
            with self.subTest(method=method, path=path):
                response = call(client, method, path, body, **extra)
                self.assertEqual(response.status_code, status, response.content)
                self.assertIn("detail", response.json())

    def test_21_anonymous_requests_get_401_with_a_challenge(self):
        self.assertRefusedEverywhere(api(), 401)
        response = api().get(URL)
        self.assertEqual(response["WWW-Authenticate"], 'Bearer realm="campushub"')

    def test_wrong_password_and_inactive_users_get_401(self):
        self.assertEqual(api().get(URL, **basic("etudiant1", "wrong")).status_code, 401)
        make_user("ancien", ETUDIANT, is_active=False)
        self.assertEqual(api().get(URL, **basic("ancien")).status_code, 401)

    def test_18_formateur_gets_403_on_every_endpoint(self):
        self.assertRefusedEverywhere(api(self.teacher), 403)
        self.assertRefusedEverywhere(api(), 401, **basic("formateur1"))  # no local auth fallback

    def test_20_users_without_role_get_403(self):
        self.assertRefusedEverywhere(api(self.no_role), 403)

    def test_19_admin_cannot_create_edit_or_delete(self):
        refused = [op for op in OPERATIONS if op[0] in ("post", "put", "patch", "delete") and "change-status" not in op[1]]
        self.assertEqual(len(refused), 4)
        self.assertRefusedEverywhere(api(self.admin), 403, refused)

    def test_22_students_cannot_change_status_or_read_statistics(self):
        refused = [op for op in OPERATIONS if "change-status" in op[1] or "stats" in op[1]]
        self.assertRefusedEverywhere(api(self.student), 403, refused)

    def test_roles_in_the_request_are_ignored(self):
        client = api(self.no_role)
        for response in (client.get(URL, HTTP_X_ROLE=ADMIN),
                         client.get(URL, {"role": ADMIN}),
                         client.post(URL, payload(role=ETUDIANT, groups=[ETUDIANT]), format="json")):
            self.assertEqual(response.status_code, 403)

    def test_keycloak_token_reaches_validation(self):
        response = api(token=make_token()).post(URL, {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {"category", "subject", "description"})


# ---------------------------------------------------------------- 23. invalid ids

class InvalidIdTests(ApiTestCase):
    def test_23_invalid_object_ids_are_404(self):
        for bad in ("xyz", "123", "6553f1a2b3c4d5e6f7a8b9c", "6553f1a2b3c4d5e6f7a8b9c0a", "z" * 24, "not-an-id"):
            for method, suffix in (("get", ""), ("put", ""), ("patch", ""), ("delete", ""),
                                   ("post", "change-status/")):
                with self.subTest(id=bad, method=method):
                    response = call(api(self.student), method, f"{URL}{bad}/{suffix}", {})
                    self.assertEqual(response.status_code, 404)
                    self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")


# ---------------------------------------------------------------- 24. validation (before MongoDB)

class CreateValidationTests(ApiTestCase):
    def assertInvalid(self, body, *fields):
        response = api(self.student).post(URL, body, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(set(response.json()), set(fields))
        return response.json()

    def test_required_fields(self):
        self.assertInvalid({}, "category", "subject", "description")

    def test_lengths(self):
        self.assertInvalid(payload(subject="abcd"), "subject")
        self.assertInvalid(payload(subject="   abcd   "), "subject")  # trimmed first
        self.assertInvalid(payload(subject="     "), "subject")
        self.assertInvalid(payload(subject="x" * 151), "subject")
        self.assertInvalid(payload(description="x" * 19), "description")
        self.assertInvalid(payload(description="x" * 5001), "description")
        self.assertInvalid(payload(module="x" * 101), "module")

    def test_choices_and_formats(self):
        self.assertInvalid(payload(category="note"), "category")
        for year in ("2026", "2026-2028", "2026/2027"):
            self.assertInvalid(payload(academic_year=year), "academic_year")
        self.assertInvalid(payload(subject=None), "subject")

    def test_11_students_cannot_set_managed_fields(self):
        for name, value in [("reference", "REC-2026-99999"), ("author_id", 999), ("author_username", "x"),
                            ("status", "resolved"), ("priority", "high"), ("admin_response", "OK"),
                            ("history", []), ("created_at", "2020-01-01T00:00:00Z"), ("closed_at", None),
                            ("id", SOME_ID)]:
            with self.subTest(field=name):
                errors = self.assertInvalid(payload(**{name: value}), name)
                if name in ("status", "priority", "admin_response"):
                    self.assertIn("change-status", errors[name][0])

    def test_unknown_fields_are_refused(self):
        self.assertEqual(self.assertInvalid(payload(subjet="typo"), "subjet"), {"subjet": ["Unknown field."]})

    def test_body_must_be_a_json_object(self):
        client = api(self.student)
        self.assertEqual(client.post(URL, [payload()], format="json").status_code, 400)
        self.assertEqual(client.post(URL, "{not json", content_type="application/json").status_code, 400)
        self.assertEqual(client.post(URL, "subject=x", content_type="application/x-www-form-urlencoded").status_code, 415)


class QueryValidationTests(ApiTestCase):
    def test_invalid_list_parameters_are_400(self):
        for params in ({"status": "closed"}, {"category": "note"}, {"priority": "urgent"},
                       {"academic_year": "2026"}, {"ordering": "subject"}, {"ordering": "-reference"},
                       {"search": "x" * 101}):
            for user in (self.student, self.admin):
                with self.subTest(params=params, user=user.username):
                    response = api(user).get(URL, params)
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(set(response.json()), set(params))

    def test_invalid_stats_parameter_is_400(self):
        self.assertEqual(api(self.admin).get(f"{URL}stats/", {"academic_year": "26-27"}).status_code, 400)


# ---------------------------------------------------------------- error mapping

class ErrorMappingTests(ApiTestCase):
    def test_service_errors(self):
        cases = [
            (services.WorkflowError("Nope.", field="status"), 400, {"status": ["Nope."]}),
            (services.WorkflowError("Nope."), 400, {"detail": "Nope."}),
            (services.ConcurrentUpdate(), 409, {"detail": services.ConcurrentUpdate().message}),
            (services.ReclamationGone(), 404, {"detail": NOT_FOUND}),
            (DjangoValidationError({"subject": ["Too short."]}), 400, {"subject": ["Too short."]}),
        ]
        for exc, status, body in cases:
            with self.subTest(exc=type(exc).__name__):
                response = exceptions.exception_handler(exc, {})
                self.assertEqual((response.status_code, response.data), (status, body))

    def test_mongodb_down_is_503_without_details(self):
        failure = ServerSelectionTimeoutError("mongo-host.internal:27017: [Errno 111] Connection refused")
        wrapped = DatabaseError("connection failed")
        wrapped.__cause__ = failure
        for exc in (failure, wrapped):
            with self.subTest(exc=type(exc).__name__), \
                    mock.patch("reclamations.views.services.create_reclamation", side_effect=exc), \
                    self.assertLogs("reclamations", "ERROR") as logs:
                response = api(self.student).post(URL, payload(), format="json")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {"detail": exceptions.DATABASE_UNAVAILABLE})
            self.assertNotIn("mongo-host", response.content.decode() + "".join(logs.output))


# ---------------------------------------------------------------- setup_roles

class SetupRolesTests(TestCase):
    def run_command(self, *args):
        out, err = StringIO(), StringIO()
        call_command("setup_roles", *args, stdout=out, stderr=err)
        return out.getvalue(), err.getvalue()

    def test_creates_the_three_groups_idempotently(self):
        self.run_command()
        self.run_command()
        self.assertEqual(sorted(Group.objects.values_list("name", flat=True)),
                         sorted(LEGACY_ROLES))
        self.assertFalse(User.objects.exists())

    @override_settings(DEBUG=True)
    def test_demo_users_have_exactly_one_role(self):
        self.run_command("--demo")
        self.run_command("--demo")
        self.assertEqual(User.objects.count(), 4)
        for username, role in DEMO_USERS:
            user = User.objects.get(username=username)
            with self.subTest(user=username):
                self.assertEqual(list(user.groups.values_list("name", flat=True)), [role])
                self.assertIsNone(user_role(user))
                self.assertTrue(user.check_password(DEMO_PASSWORD))
                self.assertFalse(user.is_staff or user.is_superuser)

    @override_settings(DEBUG=True)
    def test_existing_credentials_and_roles_are_never_overwritten(self):
        real = make_user("etudiant1")
        real.set_password("a-real-password")
        real.save()
        teacher = make_user("admin1", "Formateur")  # a real account that happens to use a demo name
        out, err = self.run_command("--demo")
        real.refresh_from_db()
        self.assertTrue(real.check_password("a-real-password"))
        self.assertEqual(list(real.groups.values_list("name", flat=True)), ["Etudiant"])
        self.assertEqual(list(teacher.groups.values_list("name", flat=True)), ["Formateur"])
        self.assertFalse(User.objects.get(pk=teacher.pk).check_password(DEMO_PASSWORD))
        self.assertIn("admin1", err)

    @override_settings(DEBUG=False)
    def test_demo_users_are_refused_without_debug(self):
        with self.assertRaises(CommandError):
            self.run_command("--demo")
        self.assertFalse(Group.objects.exists())
        self.assertFalse(User.objects.exists())


# ---------------------------------------------------------------- 30. the RAG API is unaffected

class RagApiUnaffectedTests(TestCase):
    """Local Django credentials (reclamations API) never open the RAG endpoints, which keep
    requiring a Keycloak token (config/auth.py)."""

    def setUp(self):
        self.keycloak = keycloak_settings(shared_jwks().url)
        self.keycloak.enable()
        auth.reset_signing_keys()
        self.user = make_user("etudiant1", ETUDIANT)

    def tearDown(self):
        auth.reset_signing_keys()
        self.keycloak.disable()

    def test_basic_credentials_and_sessions_do_not_open_rag_endpoints(self):
        with override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"]):
            self.user.set_password("pw")
            self.user.save()
            response = Client().get("/api/conversations", **basic("etudiant1", "pw"))
        self.assertEqual((response.status_code, response.json()), (401, {"error": auth.MALFORMED}))
        session = Client()
        session.force_login(self.user)
        response = session.get("/api/conversations")
        self.assertEqual((response.status_code, response.json()), (401, {"error": auth.MISSING}))

    def test_rag_endpoints_still_accept_keycloak_tokens(self):
        response = Client(headers=auth_headers()).get("/api/conversations")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)["count"], 0)
