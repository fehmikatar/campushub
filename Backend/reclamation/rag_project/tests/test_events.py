"""Reclamation -> Notification events (reclamations/events.py), best-effort RabbitMQ producer.

A fake pika connection records what would be sent (and fails the test if a queue or an exchange is
declared); one test uses the real pika client against a closed port. No broker is needed.
"""

import json
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from unittest import mock

import pika
from bson import ObjectId
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from reclamations import events, services
from reclamations.models import HistoryEntry, Reclamation
from reclamations.permissions import ENSEIGNANT

from .reclamation_support import URL, MongoTestCase, api, detail, make_principal, payload
from .test_course_client import CourseTestMixin, closed_port

PASSWORD = "s3cr3t-broker-pass"
BROKER_URL = f"amqp://campushub:{PASSWORD}@127.0.0.1:5672/"
ENABLED = override_settings(RABBITMQ_URL=BROKER_URL,
                            RECLAMATION_EVENTS={"ENABLED": True, "QUEUE": "reclamation.events"})
UTC_SECONDS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
STUDENT_SUB = "11111111-1111-4111-8111-111111111111"
ADMIN_SUB = "99999999-9999-4999-8999-999999999999"


class FakeBroker:
    """Stands for pika.BlockingConnection. fail: None | "connect" | "unroutable" | "hang"."""

    def __init__(self, fail=None, on_publish=None):
        self.fail, self.on_publish = fail, on_publish
        self.published, self.declared, self.closed, self.confirmed = [], [], 0, False

    def __call__(self, params):
        self.params = params
        if self.fail == "connect":
            raise pika.exceptions.AMQPConnectionError("connection refused")
        if self.fail == "hang":
            time.sleep(2)
        broker = self

        class Channel:
            def confirm_delivery(self):
                broker.confirmed = True

            def queue_declare(self, *args, **kwargs):
                broker.declared.append(("queue", args, kwargs))

            def exchange_declare(self, *args, **kwargs):
                broker.declared.append(("exchange", args, kwargs))

            def basic_publish(self, exchange, routing_key, body, properties=None, mandatory=False):
                if broker.fail == "unroutable":
                    raise pika.exceptions.UnroutableError([])
                message = json.loads(body)
                broker.published.append({"exchange": exchange, "routing_key": routing_key, "raw": body,
                                         "message": message, "properties": properties, "mandatory": mandatory,
                                         "thread": threading.current_thread().name,
                                         "saved": broker.on_publish(message) if broker.on_publish else None})

        class Connection:
            def channel(self):
                return Channel()

            def close(self):
                broker.closed += 1

        return Connection()

    def messages(self):
        return [p["message"] for p in self.published]


def reclamation(**fields):
    created = datetime(2026, 11, 11, 19, 0, 0, 123000, tzinfo=timezone(timedelta(hours=1)))
    values = {"pk": ObjectId("507f1f77bcf86cd799439011"), "reference": "REC-2026-00001", "author_sub": STUDENT_SUB,
              "author_username": "etudiant1", "category": "grade", "subject": "Note secrète de l'examen",
              "description": "Texte libre de l'étudiant", "status": "new", "created_at": created,
              "history": [HistoryEntry(from_status=None, to_status="new", by_sub=STUDENT_SUB, by_username="e",
                                       at=created)]}
    values.update(fields)
    return Reclamation(**values)


class Actor:
    def __init__(self, sub):
        self.sub = sub


class EnvelopeTests(SimpleTestCase):
    def test_created_event(self):
        message = events.created_event(reclamation(), Actor(STUDENT_SUB))
        self.assertEqual(set(message), {"event", "occurredAt", "actorId", "data"})
        self.assertEqual(message["event"], "reclamation.created")
        self.assertEqual(message["occurredAt"], "2026-11-11T18:00:00Z")      # UTC, seconds, Z (like Course)
        self.assertEqual(message["actorId"], STUDENT_SUB)
        self.assertEqual(message["data"], {"reclamationId": "507f1f77bcf86cd799439011",
                                           "reference": "REC-2026-00001", "studentSub": STUDENT_SUB,
                                           "category": "grade"})

    def test_status_changed_event_uses_the_saved_history_entry(self):
        at = datetime(2026, 11, 11, 18, 5, 7, tzinfo=timezone.utc)
        changed = reclamation(status="resolved", history=[
            HistoryEntry(from_status=None, to_status="new", by_sub=STUDENT_SUB, by_username="e", at=at),
            HistoryEntry(from_status="in_progress", to_status="resolved", by_sub=ADMIN_SUB, by_username="a", at=at)])
        message = events.status_changed_event(changed, Actor(ADMIN_SUB))
        self.assertEqual((message["event"], message["occurredAt"], message["actorId"]),
                         ("reclamation.status_changed", "2026-11-11T18:05:07Z", ADMIN_SUB))
        self.assertEqual(message["data"], {"reclamationId": "507f1f77bcf86cd799439011",
                                           "reference": "REC-2026-00001", "studentSub": STUDENT_SUB,
                                           "oldStatus": "in_progress", "newStatus": "resolved"})

    def test_no_free_text_token_or_secret(self):
        text = json.dumps([events.created_event(reclamation(), Actor(STUDENT_SUB)),
                           events.status_changed_event(reclamation(), Actor(ADMIN_SUB))], ensure_ascii=False)
        for forbidden in ("Bearer", "eyJ", PASSWORD, "secrète", "Texte libre", "etudiant1"):
            self.assertNotIn(forbidden, text)


class PublisherTests(SimpleTestCase):
    MESSAGE = {"event": "reclamation.created", "occurredAt": "2026-11-11T18:00:00Z", "actorId": STUDENT_SUB,
               "data": {"reference": "REC-2026-00001", "studentSub": STUDENT_SUB}}

    def publish(self, broker, config=ENABLED):
        with config, mock.patch("reclamations.events.pika.BlockingConnection", broker):
            return events.publish(self.MESSAGE)

    def test_published_once_persistent_json_default_exchange_no_declaration(self):
        broker = FakeBroker()
        self.assertTrue(self.publish(broker))
        (sent,) = broker.published
        self.assertEqual((sent["exchange"], sent["routing_key"], sent["mandatory"]), ("", "reclamation.events", True))
        self.assertEqual((sent["properties"].delivery_mode, sent["properties"].content_type), (2, "application/json"))
        self.assertEqual(sent["message"], self.MESSAGE)
        self.assertEqual((broker.declared, broker.confirmed, broker.closed), ([], True, 1))
        self.assertEqual((broker.params.connection_attempts, broker.params.socket_timeout), (1, 2))
        self.assertEqual(broker.params.stack_timeout, 3)

    def test_off_by_default_and_without_url_no_network_call(self):
        never = mock.Mock(side_effect=AssertionError("RabbitMQ must not be contacted"))
        flag_off = override_settings(RABBITMQ_URL=BROKER_URL, RECLAMATION_EVENTS={"ENABLED": False,
                                                                                  "QUEUE": "reclamation.events"})
        no_url = override_settings(RABBITMQ_URL="", RECLAMATION_EVENTS={"ENABLED": True,
                                                                        "QUEUE": "reclamation.events"})
        threads = threading.active_count()
        for config in (flag_off, no_url):
            self.assertFalse(self.publish(never, config))
        self.assertEqual(threading.active_count(), threads)  # not even a thread

    def test_settings_default_off(self):
        script = "import json, config.settings as s; print(json.dumps([s.RECLAMATION_EVENTS, s.RABBITMQ_URL]))"
        env = {k: v for k, v in os.environ.items() if k not in ("RECLAMATION_EVENTS_ENABLED", "RECLAMATION_EVENTS_QUEUE")}
        run = lambda **extra: json.loads(subprocess.run(  # noqa: E731
            [sys.executable, "-c", script], cwd=settings.BASE_DIR, env={**env, "DJANGO_DEBUG": "True", **extra},
            capture_output=True, text=True, timeout=120).stdout)
        self.assertEqual(run(RECLAMATION_EVENTS_ENABLED="")[0], {"ENABLED": False, "QUEUE": "reclamation.events"})
        self.assertEqual(run(RECLAMATION_EVENTS_ENABLED="true", RABBITMQ_URL="")[0]["ENABLED"], True)

    def test_broker_failures_never_raise_and_never_log_the_url(self):
        for broker in (FakeBroker(fail="connect"), FakeBroker(fail="unroutable")):
            with self.assertLogs("reclamations", "WARNING") as logs:
                self.assertFalse(self.publish(broker))
            self.assertNotIn(PASSWORD, "\n".join(logs.output))
            self.assertNotIn("amqp://", "\n".join(logs.output))
        self.assertIn("does not exist (Notification declares it)", logs.output[0])

    def test_real_client_against_a_closed_port_fails_fast(self):
        config = override_settings(RABBITMQ_URL=f"amqp://guest:{PASSWORD}@127.0.0.1:{closed_port()}/",
                                   RECLAMATION_EVENTS={"ENABLED": True, "QUEUE": "reclamation.events"})
        start = time.monotonic()
        with config, self.assertLogs("reclamations", "WARNING") as logs:
            self.assertFalse(events.publish(self.MESSAGE))
        self.assertLess(time.monotonic() - start, events.PUBLISH_TIMEOUT_SECONDS + 0.5)
        self.assertNotIn(PASSWORD, "\n".join(logs.output))

    def test_a_hanging_broker_does_not_hold_the_request(self):
        with mock.patch.object(events, "PUBLISH_TIMEOUT_SECONDS", 0.3), self.assertLogs("reclamations", "WARNING"):
            start = time.monotonic()
            self.assertFalse(self.publish(FakeBroker(fail="hang")))
        self.assertLess(time.monotonic() - start, 1.5)

    def test_emit_never_raises(self):
        with ENABLED, mock.patch("reclamations.events.pika.BlockingConnection", FakeBroker()) as broker:
            self.assertFalse(events.emit(mock.Mock(side_effect=RuntimeError), reclamation(), Actor(ADMIN_SUB)))
            self.assertFalse(events.emit(events.created_event, reclamation(author_sub=None), Actor(ADMIN_SUB)))
        self.assertEqual(broker.published, [])  # no recipient: nothing sent


class EventFlowTests(CourseTestMixin, MongoTestCase):
    """The real API and services on MongoDB; only the broker is fake."""

    def setUp(self):
        super().setUp()
        self.broker = FakeBroker(on_publish=lambda m: Reclamation.objects.filter(
            pk=ObjectId(m["data"]["reclamationId"]), status=m["data"].get("newStatus", "new")).exists())
        self.use(ENABLED)
        patcher = mock.patch("reclamations.events.pika.BlockingConnection", self.broker)
        patcher.start()
        self.addCleanup(patcher.stop)

    def change(self, pk, body, user=None):
        return api(user or self.admin).post(f"{detail(pk)}change-status/", body, format="json")

    def test_creation_publishes_one_event_after_the_insert(self):
        response = api(self.student).post(URL, payload(), format="json")
        self.assertEqual(response.status_code, 201)
        (sent,) = self.broker.published
        self.assertTrue(sent["saved"])                      # the document existed when it was published
        self.assertEqual(sent["thread"], "reclamation-event")
        message = sent["message"]
        self.assertEqual((message["event"], message["actorId"]), ("reclamation.created", self.student.sub))
        self.assertEqual(message["data"], {"reclamationId": response.json()["id"],
                                           "reference": response.json()["reference"],
                                           "studentSub": self.student.sub, "category": "grade"})
        self.assertRegex(message["occurredAt"], UTC_SECONDS)
        self.assertNotIn(b"Bearer", sent["raw"])

    def test_failed_creations_publish_nothing(self):
        course = self.start_course()
        with override_settings(COURSE_SERVICE_URL=course.url):
            self.assertEqual(api(self.student).post(URL, payload(course_id=8), format="json").status_code, 404)
        self.assertEqual(api(self.student).post(URL, {"category": "grade"}, format="json").status_code, 400)
        teacher = make_principal("formateur1", ENSEIGNANT)
        self.assertEqual(api(teacher).post(URL, payload(), format="json").status_code, 403)
        self.assertEqual(self.broker.published, [])

    def test_status_change_notifies_the_owner_once(self):
        pk = self.create().pk
        self.broker.published.clear()
        self.assertEqual(self.change(pk, {"status": "in_progress"}).status_code, 200)
        self.assertEqual(self.change(pk, {"status": "resolved", "admin_response": "Note corrigée."}).status_code, 200)
        first, second = self.broker.published
        self.assertTrue(first["saved"] and second["saved"])  # published after the compare-and-set
        self.assertEqual([m["data"]["oldStatus"] + ">" + m["data"]["newStatus"] for m in self.broker.messages()],
                         ["new>in_progress", "in_progress>resolved"])
        for message in self.broker.messages():
            self.assertEqual((message["event"], message["actorId"], message["data"]["studentSub"]),
                             ("reclamation.status_changed", self.admin.sub, self.student.sub))
        self.assertEqual(self.change(pk, {"status": "rejected", "admin_response": "x"}).status_code, 400)  # final
        self.assertEqual(len(self.broker.published), 2)

    def test_refused_changes_publish_nothing(self):
        pk = self.create().pk
        self.broker.published.clear()
        self.assertEqual(self.change(pk, {"status": "resolved"}).status_code, 400)                  # invalid transition
        self.assertEqual(self.change(pk, {"status": "rejected"}).status_code, 400)                  # no admin_response
        self.assertEqual(self.change(pk, {"status": "in_progress"}, self.student).status_code, 403)  # not an admin
        self.assertEqual(api(self.student).patch(detail(pk), {"subject": "Sujet modifié"}, format="json").status_code, 200)
        self.assertEqual(api(self.student).delete(detail(pk)).status_code, 204)                    # no event defined
        self.assertEqual(self.broker.published, [])

    def test_concurrent_update_publishes_nothing(self):
        stale = self.create()
        Reclamation.objects.filter(pk=stale.pk).update(status="rejected")  # another admin was faster
        self.broker.published.clear()
        with self.assertRaises(services.ConcurrentUpdate):
            services.change_status(stale, self.admin, status="in_progress")
        self.assertEqual(self.broker.published, [])

    def test_legacy_owner_gets_no_event(self):
        pk = self.create().pk
        Reclamation.objects.filter(pk=pk).update(author_sub=None)
        self.broker.published.clear()
        self.assertEqual(self.change(pk, {"status": "in_progress"}).status_code, 200)
        self.assertEqual(self.broker.published, [])

    def test_broker_down_never_breaks_the_request(self):
        self.broker.fail = "connect"
        with self.assertLogs("reclamations", "WARNING"):
            created = api(self.student).post(URL, payload(), format="json")
            changed = self.change(created.json()["id"], {"status": "in_progress"})
        self.assertEqual((created.status_code, changed.status_code), (201, 200))
        self.assertEqual(Reclamation.objects.get(pk=ObjectId(created.json()["id"])).status, "in_progress")
