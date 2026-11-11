"""Reclamations API against a REAL MongoDB server (skipped when none answers at MONGODB_URI).

Django's test runner creates the test database test_<MONGODB_NAME> and drops it at the end; the
development database is never used (reclamation_support.MongoTestCase refuses to run otherwise).
Numbers in the test names refer to the R2 checklist.
"""

import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from bson import ObjectId
from django.conf import settings
from django.db import IntegrityError, connections
from django.utils import timezone
from rest_framework.test import APIClient

from reclamations import services
from reclamations.models import HistoryEntry, Reclamation, Status
from reclamations.permissions import NOT_FOUND

from .reclamation_support import URL, MongoTestCase, api, basic, detail, make_user, payload

YEAR = timezone.localdate().year
ID_PATTERN = re.compile(r"[0-9a-f]{24}")


def raw_collection(name="reclamations"):
    return connections["mongodb"].get_collection(name)


def change_status(client, reclamation_id, **body):
    return client.post(f"{detail(reclamation_id)}change-status/", body, format="json")


# ---------------------------------------------------------------- 1-5. student CRUD

class StudentCrudTests(MongoTestCase):
    def test_01_student_creates_a_reclamation(self):
        response = api(self.student).post(URL, payload(), format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")
        data = response.json()
        self.assertRegex(data["id"], ID_PATTERN)
        self.assertEqual(data["reference"], f"REC-{YEAR}-00001")
        self.assertEqual((data["author_sub"], data["author_username"]), (self.student.sub, "etudiant1"))
        self.assertEqual((data["status"], data["priority"], data["admin_response"]), ("new", "normal", ""))
        self.assertEqual(data["academic_year"], settings.RAG["ACADEMIC_YEAR"])
        self.assertEqual((data["subject"], data["module"]), ("Note de l'examen final", "Mathématiques"))
        self.assertEqual(data["description"], payload()["description"])  # accents round-trip
        self.assertIsNone(data["closed_at"])
        self.assertEqual(data["created_at"], data["updated_at"])
        self.assertEqual(data["history"], [{"from_status": None, "to_status": "new", "by_user_id": None, "by_sub": self.student.sub,
                                            "by_username": "etudiant1", "comment": "", "at": data["created_at"]}])
        # stored in MongoDB, and read back identically
        stored = Reclamation.objects.get(pk=ObjectId(data["id"]))
        self.assertEqual(stored._state.db, "mongodb")
        self.assertEqual(api(self.student).get(detail(data["id"])).json(), data)

    def test_optional_fields_and_trimming(self):
        body = payload(subject="   Absence justifiée   ", academic_year="2025-2026")
        del body["module"]
        data = api(self.student).post(URL, body, format="json").json()
        self.assertEqual((data["subject"], data["module"], data["academic_year"]),
                         ("Absence justifiée", "", "2025-2026"))

    def test_02_student_lists_only_their_own_reclamations(self):
        first, second = self.create(subject="Première réclamation"), self.create(subject="Deuxième réclamation")
        self.create(self.other_student)
        data = api(self.student).get(URL).json()
        self.assertEqual(data["count"], 2)
        self.assertEqual([r["id"] for r in data["results"]], [str(second.pk), str(first.pk)])  # newest first
        self.assertEqual({r["author_sub"] for r in data["results"]}, {self.student.sub})

    def test_03_student_retrieves_their_own_reclamation(self):
        reclamation = self.create()
        response = api(self.student).get(detail(reclamation.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reference"], reclamation.reference)
        self.assertEqual(api(self.student).get(f"{URL}{reclamation.pk}").status_code, 200)  # slash optional

    def test_04_student_edits_while_new(self):
        reclamation = self.create()
        client = api(self.student)
        response = client.patch(detail(reclamation.pk), {"subject": "Sujet corrigé"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["subject"], "Sujet corrigé")
        self.assertGreaterEqual(response.json()["updated_at"], response.json()["created_at"])
        full = {"category": "exam", "subject": "Examen de rattrapage", "module": "Physique",
                "description": "La date de l'examen de rattrapage n'a pas été communiquée."}
        data = client.put(detail(reclamation.pk), full, format="json").json()
        self.assertEqual({k: data[k] for k in full}, full)
        stored = Reclamation.objects.get(pk=reclamation.pk)
        self.assertEqual((stored.category, stored.subject, stored.status), ("exam", "Examen de rattrapage", "new"))
        self.assertEqual(len(stored.history), 1)  # an edit is not a status change
        self.assertEqual(client.put(detail(reclamation.pk), {"subject": "Sans le reste"}, format="json").status_code, 400)

    def test_05_student_deletes_while_new(self):
        reclamation = self.create()
        self.assertEqual(api(self.student).delete(detail(reclamation.pk)).status_code, 204)
        self.assertFalse(Reclamation.objects.filter(pk=reclamation.pk).exists())
        self.assertEqual(api(self.student).get(detail(reclamation.pk)).status_code, 404)

    def test_24_invalid_updates_are_400(self):
        reclamation = self.create()
        for body, field in [({"subject": "abc"}, "subject"), ({"description": "trop court"}, "description"),
                            ({"category": "note"}, "category"), ({"module": "x" * 101}, "module"),
                            ({"academic_year": "2025-2026"}, "academic_year")]:
            with self.subTest(body=body):
                response = api(self.student).patch(detail(reclamation.pk), body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(list(response.json()), [field])
        self.assertEqual(Reclamation.objects.get(pk=reclamation.pk).subject, reclamation.subject)

    def test_23_unknown_but_well_formed_id_is_404(self):
        response = api(self.student).get(detail(ObjectId()))
        self.assertEqual((response.status_code, response.json()), (404, {"detail": NOT_FOUND}))
        self.assertEqual(api(self.admin).get(detail(str(ObjectId()).upper())).status_code, 404)


# ---------------------------------------------------------------- 8-11. ownership and protected fields

class OwnershipTests(MongoTestCase):
    def setUp(self):
        super().setUp()
        self.reclamation = self.create()

    def test_08_students_cannot_see_each_others_reclamations(self):
        other = api(self.other_student)
        response = other.get(detail(self.reclamation.pk))
        self.assertEqual((response.status_code, response.json()), (404, {"detail": NOT_FOUND}))
        self.assertEqual(other.get(URL).json()["count"], 0)

    def test_09_students_cannot_edit_or_delete_each_others_reclamations(self):
        other = api(self.other_student)
        for response in (other.patch(detail(self.reclamation.pk), {"subject": "Piratage du sujet"}, format="json"),
                         other.put(detail(self.reclamation.pk), payload(subject="Piratage du sujet"), format="json"),
                         other.delete(detail(self.reclamation.pk))):
            self.assertEqual((response.status_code, response.json()), (404, {"detail": NOT_FOUND}))
        stored = Reclamation.objects.get(pk=self.reclamation.pk)
        self.assertEqual(stored.subject, self.reclamation.subject)

    def test_10_students_cannot_edit_or_delete_once_processing_started(self):
        for path in ((Status.IN_PROGRESS,), (Status.REJECTED,), (Status.IN_PROGRESS, Status.RESOLVED)):
            reclamation = self.advance(self.create(), *path)
            client = api(self.student)
            with self.subTest(status=reclamation.status):
                for response in (client.patch(detail(reclamation.pk), {"subject": "Sujet modifié"}, format="json"),
                                 client.put(detail(reclamation.pk), payload(subject="Sujet modifié"), format="json"),
                                 client.delete(detail(reclamation.pk))):
                    self.assertEqual(response.status_code, 400)
                    self.assertIn("processing has started", response.json()["detail"])
                stored = Reclamation.objects.get(pk=reclamation.pk)
                self.assertEqual((stored.subject, stored.status), (reclamation.subject, reclamation.status))

    def test_11_students_cannot_set_reference_author_status_or_priority(self):
        client = api(self.student)
        for name, value in [("reference", "REC-2000-00001"), ("author_id", 999),
                            ("author_username", "admin1"), ("status", "resolved"), ("priority", "high"),
                            ("admin_response", "Accepté"), ("closed_at", "2026-01-01T00:00:00Z")]:
            with self.subTest(field=name):
                for response in (client.patch(detail(self.reclamation.pk), {name: value}, format="json"),
                                 client.put(detail(self.reclamation.pk), payload(**{name: value}), format="json")):
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(list(response.json()), [name])
        stored = Reclamation.objects.get(pk=self.reclamation.pk)
        self.assertEqual((stored.reference, stored.author_sub, stored.status, stored.priority, stored.admin_response),
                         (self.reclamation.reference, self.student.sub, "new", "normal", ""))


# ---------------------------------------------------------------- 12-17. administration

class AdministrationTests(MongoTestCase):
    def test_12_admin_lists_and_reads_everything(self):
        mine, theirs = self.create(), self.create(self.other_student)
        data = api(self.admin).get(URL).json()
        self.assertEqual(data["count"], 2)
        self.assertEqual({r["id"] for r in data["results"]}, {str(mine.pk), str(theirs.pk)})
        self.assertEqual(api(self.admin).get(detail(theirs.pk)).status_code, 200)

    def test_13_admin_changes_the_status(self):
        reclamation = self.create()
        response = change_status(api(self.admin), reclamation.pk, status="in_progress", comment="  Pris en charge  ")
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertEqual((data["status"], data["priority"], data["closed_at"]), ("in_progress", "normal", None))
        self.assertEqual(data["history"][-1] | {"at": None},
                         {"from_status": "new", "to_status": "in_progress", "by_user_id": None, "by_sub": self.admin.sub,
                          "by_username": "admin1", "comment": "Pris en charge", "at": None})
        self.assertEqual(data["updated_at"], data["history"][-1]["at"])
        self.assertEqual(Reclamation.objects.get(pk=reclamation.pk).status, "in_progress")

    def test_14_admin_changes_the_priority_through_change_status(self):
        reclamation = self.create()
        data = change_status(api(self.admin), reclamation.pk, status="in_progress", priority="high").json()
        self.assertEqual(data["priority"], "high")
        self.assertEqual(Reclamation.objects.get(pk=reclamation.pk).priority, "high")
        data = change_status(api(self.admin), reclamation.pk, status="resolved", priority="low",
                             admin_response="Note corrigée.").json()
        self.assertEqual((data["status"], data["priority"]), ("resolved", "low"))
        self.assertEqual(change_status(api(self.admin), reclamation.pk, status="in_progress",
                                       priority="urgent").status_code, 400)

    def test_15_invalid_transitions_are_400(self):
        new, in_progress = self.create(), self.advance(self.create(), "in_progress")
        resolved, rejected = self.advance(self.create(), "in_progress", "resolved"), self.advance(self.create(), "rejected")
        cases = [(new, "resolved"), (new, "new"), (in_progress, "new"), (in_progress, "in_progress"),
                 (resolved, "in_progress"), (resolved, "rejected"), (rejected, "in_progress"), (rejected, "resolved")]
        for reclamation, target in cases:
            with self.subTest(transition=f"{reclamation.status} -> {target}"):
                response = change_status(api(self.admin), reclamation.pk, status=target, admin_response="Réponse.")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(list(response.json()), ["status"])
                self.assertEqual(Reclamation.objects.get(pk=reclamation.pk).status, reclamation.status)
        for body in ({"status": "closed"}, {}, {"status": "in_progress", "unexpected": 1},
                     {"status": "in_progress", "comment": "x" * 1001}):
            with self.subTest(body=body):
                self.assertEqual(change_status(api(self.admin), new.pk, **body).status_code, 400)
        self.assertEqual(change_status(api(self.admin), ObjectId(), status="in_progress").status_code, 404)

    def test_16_closing_requires_an_admin_response(self):
        reclamation = self.advance(self.create(), "in_progress", admin_response="")
        for target in ("resolved", "rejected"):
            for response in ("", "   ", None):
                body = {"status": target} if response is None else {"status": target, "admin_response": response}
                with self.subTest(target=target, response=response):
                    result = change_status(api(self.admin), reclamation.pk, **body)
                    self.assertEqual(result.status_code, 400)
                    self.assertEqual(list(result.json()), ["admin_response"])
        self.assertEqual(Reclamation.objects.get(pk=reclamation.pk).status, "in_progress")
        # a response written earlier counts
        other = self.advance(self.create(), "in_progress", admin_response="Dossier transmis au département.")
        data = change_status(api(self.admin), other.pk, status="resolved").json()
        self.assertEqual((data["status"], data["admin_response"]), ("resolved", "Dossier transmis au département."))

    def test_17_history_records_every_change(self):
        reclamation = self.create()
        client = api(self.admin)
        change_status(client, reclamation.pk, status="in_progress", comment="Vérification en cours")
        data = change_status(api(self.second_admin), reclamation.pk, status="resolved",
                             admin_response="La note a été corrigée.", comment="Clôturé").json()
        steps = [(h["from_status"], h["to_status"], h["by_username"], h["comment"]) for h in data["history"]]
        self.assertEqual(steps, [(None, "new", "etudiant1", ""), ("new", "in_progress", "admin1", "Vérification en cours"),
                                 ("in_progress", "resolved", "admin2", "Clôturé")])
        times = [h["at"] for h in data["history"]]
        self.assertEqual(times, sorted(times))
        self.assertEqual(data["closed_at"], times[-1])
        # the student sees the outcome
        seen = api(self.student).get(detail(reclamation.pk)).json()
        self.assertEqual((seen["status"], seen["admin_response"], len(seen["history"])),
                         ("resolved", "La note a été corrigée.", 3))
        # stored as embedded sub-documents
        document = raw_collection().find_one({"_id": reclamation.pk})
        self.assertEqual([entry["to_status"] for entry in document["history"]], ["new", "in_progress", "resolved"])

    def test_rejecting_a_new_reclamation_closes_it(self):
        data = change_status(api(self.admin), self.create().pk, status="rejected",
                             admin_response="Hors délai.").json()
        self.assertEqual((data["status"], data["closed_at"]), ("rejected", data["history"][-1]["at"]))


# ---------------------------------------------------------------- 6-7. references

class ReferenceTests(MongoTestCase):
    def test_06_references_are_sequential_per_year(self):
        references = [self.create().reference for _ in range(3)]
        self.assertEqual(references, [f"REC-{YEAR}-0000{n}" for n in (1, 2, 3)])
        self.assertEqual(raw_collection("counters").find_one({"_id": f"reclamation-{YEAR}"})["seq"], 3)
        self.assertEqual(services.next_reference(YEAR + 1), f"REC-{YEAR + 1}-00001")  # new yearly counter
        self.assertEqual(self.create().reference, f"REC-{YEAR}-00004")

    def test_06_numbers_are_never_reused(self):
        first, second = self.create(), self.create()
        api(self.student).delete(detail(second.pk))
        self.assertEqual(self.create().reference, f"REC-{YEAR}-00003")
        self.assertEqual(first.reference, f"REC-{YEAR}-00001")

    def test_06_concurrent_creations_get_distinct_consecutive_references(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            created = list(pool.map(lambda _: self.create(), range(40)))
        references = sorted(r.reference for r in created)
        self.assertEqual(references, [services.format_reference(YEAR, n) for n in range(1, 41)])
        self.assertEqual(Reclamation.objects.count(), 40)

    def test_07_the_unique_index_protects_references(self):
        existing = self.create()
        self.assertTrue(any(index.get("unique") and index["key"] == [("reference", 1)]
                            for index in raw_collection().index_information().values()))
        duplicate = Reclamation(reference=existing.reference, author_id=1, author_username="x", category="grade",
                                subject="Doublon", description="x" * 20, created_at=services.now(),
                                updated_at=services.now())
        with self.assertRaises(IntegrityError):
            duplicate.save(force_insert=True)

    def test_07_a_lost_counter_is_resynchronised(self):
        self.create(), self.create()
        raw_collection("counters").delete_many({})  # e.g. dropped by mistake
        with self.assertLogs("reclamations", "WARNING") as logs:
            reclamation = self.create()
        self.assertEqual(reclamation.reference, f"REC-{YEAR}-00003")
        self.assertIn(f"REC-{YEAR}-00001", logs.output[0])


# ---------------------------------------------------------------- concurrency (compare-and-set)

class ConcurrencyTests(MongoTestCase):
    def test_a_stale_status_change_is_refused_with_409(self):
        reclamation = self.create()
        stale = Reclamation.objects.get(pk=reclamation.pk)
        self.advance(Reclamation.objects.get(pk=reclamation.pk), "in_progress")
        with self.assertRaises(services.ConcurrentUpdate):
            services.change_status(stale, self.second_admin, status="rejected", admin_response="Non.")
        stored = Reclamation.objects.get(pk=reclamation.pk)
        self.assertEqual((stored.status, len(stored.history)), ("in_progress", 2))

    def test_simultaneous_status_changes_only_one_wins(self):
        reclamation = self.create()
        start = threading.Barrier(6)

        def attempt(target):
            loaded = Reclamation.objects.get(pk=reclamation.pk)
            start.wait()
            try:
                services.change_status(loaded, self.admin, status=target, admin_response="Réponse.")
                return "ok"
            except services.ConcurrentUpdate:
                return "conflict"

        with ThreadPoolExecutor(max_workers=6) as pool:
            outcomes = list(pool.map(attempt, ["in_progress", "rejected"] * 3))
        self.assertEqual(sorted(outcomes), ["conflict"] * 5 + ["ok"])
        self.assertEqual(len(Reclamation.objects.get(pk=reclamation.pk).history), 2)

    def test_a_student_edit_racing_with_processing_is_refused(self):
        reclamation = self.create()
        stale = Reclamation.objects.get(pk=reclamation.pk)
        self.advance(Reclamation.objects.get(pk=reclamation.pk), "in_progress")
        with self.assertRaises(services.WorkflowError):
            services.update_reclamation(stale, self.student, {"subject": "Modification tardive"})
        with self.assertRaises(services.WorkflowError):
            services.delete_reclamation(stale, self.student)
        stored = Reclamation.objects.get(pk=reclamation.pk)
        self.assertEqual((stored.subject, stored.status), (reclamation.subject, "in_progress"))

    def test_an_edit_on_a_deleted_reclamation_is_404(self):
        reclamation = self.create()
        stale = Reclamation.objects.get(pk=reclamation.pk)
        Reclamation.objects.filter(pk=reclamation.pk).delete()
        with self.assertRaises(services.ReclamationGone):
            services.update_reclamation(stale, self.student, {"subject": "Trop tard pour ça"})


# ---------------------------------------------------------------- 25-27. filters, search, pagination

class ListingTests(MongoTestCase):
    def ids(self, user, **params):
        response = api(user).get(URL, params)
        self.assertEqual(response.status_code, 200, response.content)
        return [r["reference"] for r in response.json()["results"]]

    def test_25_filters(self):
        grade = self.create(category="grade")
        exam = self.advance(self.create(category="exam", academic_year="2025-2026"), "in_progress")
        services.change_status(self.create(category="absence"), self.admin, status="in_progress", priority="high")
        self.create(self.other_student, category="exam")
        refs = lambda *rs: sorted(r.reference for r in rs)
        self.assertEqual(sorted(self.ids(self.student, status="new")), refs(grade))
        self.assertEqual(sorted(self.ids(self.student, category="exam")), refs(exam))  # not the other student's
        self.assertEqual(self.ids(self.student, academic_year="2025-2026"), [exam.reference])
        self.assertEqual(len(self.ids(self.student, priority="high")), 1)
        self.assertEqual(self.ids(self.student, status="in_progress", category="exam"), [exam.reference])
        self.assertEqual(len(self.ids(self.admin, category="exam")), 2)
        self.assertEqual(len(self.ids(self.student, status="", category="")), 3)  # empty = no filter
        self.assertEqual(self.ids(self.student, status="resolved"), [])

    def test_26_search(self):
        a = self.create(subject="Problème d'inscription", description="Mon inscription au module n'apparaît pas.")
        b = self.create(subject="Stage d'été", description="La convention de stage (PFE) est bloquée [urgent].")
        self.assertEqual(self.ids(self.student, search="INSCRIPTION"), [a.reference])   # case-insensitive
        self.assertEqual(self.ids(self.student, search="convention de"), [b.reference])  # description
        self.assertEqual(self.ids(self.student, search=a.reference[-5:]), [a.reference])  # reference
        self.assertEqual(self.ids(self.student, search="(PFE)"), [b.reference])          # literal, not a regex
        self.assertEqual(self.ids(self.student, search="[urgent]"), [b.reference])
        self.assertEqual(self.ids(self.student, search=".*"), [])
        self.assertEqual(self.ids(self.other_student, search="inscription"), [])

    def test_27_pagination(self):
        for n in range(25):
            self.create(subject=f"Réclamation numéro {n}")
        first = api(self.student).get(URL).json()
        self.assertEqual((first["count"], len(first["results"]), first["previous"]), (25, 20, None))
        self.assertIn("page=2", first["next"])
        second = api(self.student).get(URL, {"page": 2}).json()
        self.assertEqual((len(second["results"]), second["next"]), (5, None))
        everything = [r["id"] for r in first["results"] + second["results"]]
        self.assertEqual(len(set(everything)), 25)
        self.assertEqual(api(self.student).get(URL, {"page": 3}).status_code, 404)

    def test_ordering(self):
        old, middle, recent = self.create(), self.create(), self.create()
        self.assertEqual(self.ids(self.student), [recent.reference, middle.reference, old.reference])
        self.assertEqual(self.ids(self.student, ordering="created_at"), [old.reference, middle.reference, recent.reference])
        time.sleep(0.005)  # MongoDB timestamps have millisecond precision: no tie with the creations
        api(self.student).patch(detail(old.pk), {"subject": "Modifiée en dernier"}, format="json")
        self.assertEqual(self.ids(self.student, ordering="-updated_at")[0], old.reference)
        services.change_status(old, self.admin, status="in_progress", priority="high")
        services.change_status(recent, self.admin, status="in_progress", priority="low")
        self.assertEqual(self.ids(self.admin, ordering="-priority"), [old.reference, middle.reference, recent.reference])
        self.assertEqual(self.ids(self.admin, ordering="priority"), [recent.reference, middle.reference, old.reference])


# ---------------------------------------------------------------- 28. statistics

class StatisticsTests(MongoTestCase):
    def test_28_counts_by_status_category_and_priority(self):
        empty = api(self.admin).get(f"{URL}stats/").json()
        self.assertEqual(empty["total"], 0)
        self.assertEqual(set(empty["by_status"].values()), {0})
        self.create(category="grade")
        self.create(category="grade", academic_year="2025-2026")
        self.advance(self.create(self.other_student, category="exam"), "in_progress", "resolved")
        services.change_status(self.create(category="absence"), self.admin, status="rejected",
                               admin_response="Hors délai.", priority="high")
        data = api(self.admin).get(f"{URL}stats/").json()
        self.assertEqual(data["total"], 4)
        self.assertEqual(data["by_status"], {"new": 2, "in_progress": 0, "resolved": 1, "rejected": 1})
        self.assertEqual({k: v for k, v in data["by_category"].items() if v},
                         {"grade": 2, "exam": 1, "absence": 1})
        self.assertEqual(len(data["by_category"]), 7)
        self.assertEqual(data["by_priority"], {"low": 0, "normal": 3, "high": 1})
        year = api(self.admin).get(f"{URL}stats/", {"academic_year": "2025-2026"}).json()
        self.assertEqual((year["academic_year"], year["total"], year["by_category"]["grade"]), ("2025-2026", 1, 1))


# ---------------------------------------------------------------- 29. storage and routing

class StorageTests(MongoTestCase):
    def test_29_reclamations_are_in_mongodb_and_users_in_sqlite(self):
        reclamation = self.create()
        mongodb = connections["mongodb"]
        self.assertEqual(mongodb.settings_dict["NAME"], f"test_{settings.MONGODB_NAME}")
        collections = set(mongodb.database.list_collection_names())
        self.assertIn("reclamations", collections)
        self.assertFalse(collections & {"auth_user", "auth_group", "django_session", "chat_conversation",
                                        "documents_document", "regulation_academicrule", "historyentry",
                                        "reclamations_historyentry"})
        indexes = {name: index["key"] for name, index in raw_collection().index_information().items()}
        self.assertEqual(indexes["reclamation_author_recent"], [("author_id", 1), ("created_at", -1)])
        self.assertEqual(indexes["reclamation_status"], [("status", 1)])
        self.assertEqual(indexes["reclamation_category"], [("category", 1)])
        sqlite_tables = set(connections["default"].introspection.table_names())
        self.assertTrue({"auth_user", "auth_group", "django_session"} <= sqlite_tables)
        self.assertFalse({t for t in sqlite_tables if "reclamation" in t})
        self.assertEqual(reclamation._state.db, "mongodb")
        self.assertEqual(make_user("legacy")._state.db, "default")
        document = raw_collection().find_one({"_id": reclamation.pk})
        self.assertIsInstance(document["_id"], ObjectId)
        self.assertEqual(document["author_sub"], self.student.sub)
        self.assertIsNone(document["author_id"])
        self.assertEqual(set(document["history"][0]),
                         {"from_status", "to_status", "by_user_id", "by_sub", "by_username", "comment", "at"})
        self.assertIsInstance(Reclamation.objects.get(pk=reclamation.pk).history[0], HistoryEntry)


# ---------------------------------------------------------------- real authentication

class AuthenticationTests(MongoTestCase):
    def test_bearer_authentication(self):
        response = api(self.student).post(URL, payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(api(self.student).get(URL).json()["count"], 1)
        self.assertEqual(api(self.admin).get(URL).json()["count"], 1)

    def test_session_and_basic_authentication_are_refused(self):
        local = make_user("etudiant1", "Etudiant")
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(local)
        self.assertEqual(client.get(URL).status_code, 401)
        self.assertEqual(client.post(URL, payload(), format="json").status_code, 401)
        self.assertEqual(APIClient().get(URL, **basic("etudiant1")).status_code, 401)
        self.assertEqual(Reclamation.objects.count(), 0)
