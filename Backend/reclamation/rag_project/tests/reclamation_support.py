"""Shared helpers of the reclamations tests.

- ApiTestCase: SQLite only. The MongoDB backend forbids every MongoDB operation in such a test
  (Django raises DatabaseOperationForbidden), so these tests also prove that the request never
  reached MongoDB (anonymous, wrong role, invalid input, invalid id...).
- MongoTestCase: a real MongoDB server. Django's test runner creates the test database
  test_<MONGODB_NAME> (never the development one) and drops it at the end. MongoDB cannot roll
  back here (standalone server), so it is a TransactionTestCase: both databases are flushed
  after each test. Skipped, with the reason, when no MongoDB server answers at MONGODB_URI.
"""

import base64
from unittest import skipIf
from uuid import uuid4

from django.conf import settings
from django.contrib.auth.models import Group, User
from django.db import connections
from django.test import TestCase, TransactionTestCase, override_settings
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from rest_framework.test import APIClient

from reclamations import services
from reclamations.permissions import ADMIN, ETUDIANT, ENSEIGNANT
from config import auth
from . import fake_keycloak as kc

PASSWORD = "local-test-password"
URL = "/api/reclamations/"
FAST_PASSWORDS = override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])


def mongodb_unavailable() -> str | None:
    """None when the configured MongoDB server answers, otherwise the reason to skip."""
    client = MongoClient(settings.DATABASES["mongodb"]["HOST"], serverSelectionTimeoutMS=2000,
                         connectTimeoutMS=2000)
    try:
        client.admin.command("ping")
        return None
    except PyMongoError as exc:
        return (f"MongoDB integration tests SKIPPED: no MongoDB server answers at MONGODB_URI "
                f"({type(exc).__name__}). Start one (README, 'Local MongoDB') to run them.")
    finally:
        client.close()


MONGODB_UNAVAILABLE = mongodb_unavailable()  # checked once, when the tests are loaded


def detail(pk) -> str:
    return f"{URL}{pk}/"


def make_user(username: str, role: str | None = None, **fields) -> User:
    user = User.objects.create_user(username=username, password=PASSWORD, **fields)
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


def make_principal(username, role=ETUDIANT, *, sub=None):
    # Service fixtures only; HTTP tests always sign tokens and run the real authentication adapter.
    return auth.Principal(sub=sub or str(uuid4()), role=role, roles=(role,) if role else (), username=username)


def api(user=None, *, token=None) -> APIClient:
    client = APIClient()
    if user is not None:
        token = kc.make_token(sub=user.sub, roles=user.roles, preferred_username=user.username)
    if token is not None:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def setup_keycloak(test):
    jwks = kc.shared_jwks()
    jwks.reset()
    config = kc.keycloak_settings(jwks.url)
    config.enable()
    test.addCleanup(config.disable)
    auth.reset_signing_keys()
    test.addCleanup(auth.reset_signing_keys)


def basic(username: str, password: str = PASSWORD) -> dict:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"HTTP_AUTHORIZATION": f"Basic {token}"}


def payload(**overrides) -> dict:
    return {"category": "grade", "subject": "Note de l'examen final",
            "description": "Ma note de mathématiques de l'examen du 12 juin semble erronée.",
            "module": "Mathématiques", **overrides}


@FAST_PASSWORDS
class ApiTestCase(TestCase):
    databases = {"default"}

    def setUp(self):
        setup_keycloak(self)
        self.student = make_principal("etudiant1", ETUDIANT)
        self.other_student = make_principal("etudiant2", ETUDIANT)
        self.teacher = make_principal("formateur1", ENSEIGNANT)
        self.admin = make_principal("admin1", ADMIN)
        self.no_role = make_principal("sansrole", None)


@skipIf(MONGODB_UNAVAILABLE, MONGODB_UNAVAILABLE or "")
@FAST_PASSWORDS
class MongoTestCase(TransactionTestCase):
    databases = {"default"} if MONGODB_UNAVAILABLE else {"default", "mongodb"}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        name = connections["mongodb"].settings_dict["NAME"]
        if name != f"test_{settings.MONGODB_NAME}" or name == settings.MONGODB_NAME:
            raise RuntimeError(f"Refusing to run: MongoDB tests must use the test database, not {name!r}.")

    def setUp(self):
        connections["mongodb"].get_collection(services.COUNTERS_COLLECTION).delete_many({})
        setup_keycloak(self)
        self.student = make_principal("etudiant1", ETUDIANT)
        self.other_student = make_principal("etudiant2", ETUDIANT)
        self.admin = make_principal("admin1", ADMIN)
        self.second_admin = make_principal("admin2", ADMIN)

    def create(self, user=None, **overrides):
        """A reclamation created through the service (fast set-up of the tests' data)."""
        return services.create_reclamation(user or self.student, payload(**overrides))

    def advance(self, reclamation, *statuses, admin_response="Traitée par l'administration."):
        """Move it along the workflow as self.admin."""
        for status in statuses:
            reclamation = services.change_status(reclamation, self.admin, status=status,
                                                 admin_response=admin_response)
        return reclamation
