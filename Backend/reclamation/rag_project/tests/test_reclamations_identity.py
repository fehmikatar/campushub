"""Keycloak ownership and additive migration regressions on isolated real MongoDB."""
from dataclasses import replace
from unittest import mock

from bson import ObjectId
from django.contrib.auth.models import User
from django.db import connections
from django.db.migrations.executor import MigrationExecutor

from reclamations import services
from reclamations.models import Reclamation
from reclamations.views import ReclamationViewSet

from . import fake_keycloak as kc
from .reclamation_support import URL, MongoTestCase, api, detail, make_user, payload
from .test_reclamations import raw_collection, change_status


class KeycloakIdentityTests(MongoTestCase):
    def legacy(self):
        """A pre-Keycloak document with a local integer ID and no UUID fields at all."""
        local = make_user(self.student.username, "Etudiant")
        stamp = services.now()
        document = {"_id": ObjectId(), "reference": "REC-2020-00001", "author_id": local.pk,
                    "author_username": self.student.username, **payload(), "academic_year": "2026-2027",
                    "status": "new", "priority": "normal", "admin_response": "", "closed_at": None,
                    "created_at": stamp, "updated_at": stamp,
                    "history": [{"from_status": None, "to_status": "new", "by_user_id": local.pk,
                                 "by_username": local.username, "comment": "Legacy creation", "at": stamp}]}
        raw_collection().insert_one(document)
        return raw_collection().find_one({"_id": document["_id"]})

    def test_identical_usernames_do_not_share_ownership(self):
        other = replace(self.other_student, username=self.student.username)
        a, b = self.create(), self.create(other)
        for actor, own, foreign in ((self.student, a, b), (other, b, a)):
            client = api(actor)
            self.assertEqual([r["id"] for r in client.get(URL).json()["results"]], [str(own.pk)])
            self.assertEqual(client.get(detail(foreign.pk)).status_code, 404)
            self.assertEqual(client.patch(detail(foreign.pk), {"subject": "Changed title"}).status_code, 404)
            self.assertEqual(client.delete(detail(foreign.pk)).status_code, 404)

    def test_legacy_documents_are_hidden_from_students_even_with_matching_local_session(self):
        legacy = self.legacy()
        own = self.create()
        client = api(self.student)
        client.force_login(User.objects.get(pk=legacy["author_id"]))
        for suffix in ("/", ""):
            path = URL + str(legacy["_id"]) + suffix
            self.assertEqual(client.get(path).status_code, 404)
            self.assertEqual(client.patch(path, {"subject": "Changed title"}).status_code, 404)
            self.assertEqual(client.put(path, payload()).status_code, 404)
            self.assertEqual(client.delete(path).status_code, 404)
        result = client.get(URL, {"author_id": legacy["author_id"], "author_sub": self.admin.sub}).json()
        self.assertEqual([r["id"] for r in result["results"]], [str(own.pk)])
        self.assertEqual(raw_collection().find_one({"_id": legacy["_id"]}), legacy)

    def test_admin_can_inspect_and_process_legacy_documents_without_inventing_identity(self):
        legacy = self.legacy()
        client = api(self.admin)
        self.assertEqual(client.get(URL).json()["count"], 1)
        data = client.get(detail(legacy["_id"])).json()
        self.assertIsNone(data["author_sub"])
        self.assertEqual(data["author_id"], legacy["author_id"])
        self.assertIsNone(data["history"][0]["by_sub"])
        response = change_status(client, legacy["_id"], status="in_progress")
        self.assertEqual(response.status_code, 200, response.content)
        stored = raw_collection().find_one({"_id": legacy["_id"]})
        self.assertNotIn("author_sub", stored)
        self.assertEqual(stored["history"][0], legacy["history"][0] | {"by_sub": None})
        self.assertEqual(stored["history"][1]["by_sub"], self.admin.sub)
        self.assertIsNone(stored["history"][1]["by_user_id"])
        self.assertEqual(api(self.student).get(detail(legacy["_id"])).status_code, 404)

    def test_new_identity_and_history_use_only_verified_claims(self):
        token = kc.make_token(sub=self.student.sub.upper(), preferred_username="Signed Name")
        client = api(token=token)
        response = client.post(URL, payload())
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(data["author_sub"], self.student.sub)
        self.assertEqual(data["author_username"], "Signed Name")
        self.assertIsNone(data["author_id"])
        self.assertEqual(data["history"][0]["by_sub"], self.student.sub)
        self.assertEqual(data["history"][0]["by_username"], "Signed Name")
        admin = api(token=kc.make_token(sub=self.admin.sub, roles=["ADMIN"]))
        changed = change_status(admin, data["id"], status="in_progress").json()
        self.assertEqual(changed["history"][-1]["by_sub"], self.admin.sub)
        self.assertEqual(changed["history"][-1]["by_username"], self.admin.sub)
        self.assertEqual(User.objects.count(), 0)

    def test_missing_username_uses_sub_for_creation(self):
        data = api(token=kc.make_token(sub=self.student.sub)).post(URL, payload()).json()
        self.assertEqual(data["author_username"], self.student.sub)
        self.assertEqual(data["history"][0]["by_username"], self.student.sub)

    def test_forged_fields_on_updates_and_admin_action_are_refused(self):
        reclamation = self.create()
        for field, value in {"author_sub": self.other_student.sub, "by_sub": self.admin.sub,
                             "role": "ADMIN", "history": []}.items():
            with self.subTest(field=field):
                response = api(self.student).patch(detail(reclamation.pk), {field: value})
                self.assertEqual(response.status_code, 400)
                response = change_status(api(self.admin), reclamation.pk, status="in_progress", **{field: value})
                self.assertEqual(response.status_code, 400)
        self.assertEqual(raw_collection().find_one({"_id": reclamation.pk})["status"], "new")

    def test_ownership_is_in_the_conditional_update_and_delete(self):
        for action in ("update", "delete"):
            reclamation = self.create()
            stale = Reclamation.objects.get(pk=reclamation.pk)
            # Simulate a separately verified maintenance mapping changing after the read.
            raw_collection().update_one({"_id": reclamation.pk}, {"$set": {"author_sub": self.other_student.sub}})
            with self.subTest(action=action), self.assertRaises(services.ReclamationGone):
                if action == "update":
                    services.update_reclamation(stale, self.student, {"subject": "Stale edit"})
                else:
                    services.delete_reclamation(stale, self.student)
            stored = Reclamation.objects.get(pk=reclamation.pk)
            self.assertEqual((stored.author_sub, stored.subject), (self.other_student.sub, reclamation.subject))

    def test_concurrent_status_conflict_is_409_through_drf(self):
        reclamation = self.create()
        stale = Reclamation.objects.get(pk=reclamation.pk)
        self.advance(reclamation, "in_progress")
        with mock.patch.object(ReclamationViewSet, "get_object", return_value=stale):
            response = change_status(api(self.second_admin), stale.pk, status="rejected", admin_response="No.")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(Reclamation.objects.get(pk=stale.pk).history), 2)

    def test_identity_migration_preserves_existing_documents_history_and_counters(self):
        connection = connections["mongodb"]  # guarded test database by MongoTestCase
        previous = [("reclamations", "0001_initial")]
        target = [("reclamations", "0002_keycloak_identity")]
        MigrationExecutor(connection).migrate(previous)
        try:
            legacy = self.legacy()
            # Pre-existing independently mapped document must not be overwritten either.
            mapped = self.create()
            mapped_before = raw_collection().find_one({"_id": mapped.pk})
            counter_before = list(raw_collection("counters").find())
            sqlite_tables = connections["default"].introspection.table_names()
            MigrationExecutor(connection).migrate(target)
            self.assertEqual(raw_collection().find_one({"_id": legacy["_id"]}), legacy)
            self.assertEqual(raw_collection().find_one({"_id": mapped.pk}), mapped_before)
            self.assertEqual(list(raw_collection("counters").find()), counter_before)
            self.assertEqual(connections["default"].introspection.table_names(), sqlite_tables)
            indexes = raw_collection().index_information()
            self.assertEqual(indexes["reclamation_sub_recent"]["key"], [("author_sub", 1), ("created_at", -1)])
            self.assertIn("reclamation_author_recent", indexes)
            self.assertTrue(any(i.get("unique") and i["key"] == [("reference", 1)] for i in indexes.values()))
            historical = MigrationExecutor(connection).loader.project_state(target).apps
            history = historical.get_model("reclamations", "HistoryEntry")
            self.assertTrue(history._meta.get_field("by_sub").null)
            self.assertTrue(history._meta.get_field("by_user_id").null)
            self.assertEqual(api(self.student).get(URL).json()["count"], 1)
            self.assertEqual(api(self.admin).get(URL).json()["count"], 2)
            self.assertIsNone(Reclamation.objects.get(pk=legacy["_id"]).history[0].by_sub)
        finally:
            MigrationExecutor(connection).migrate(target)
