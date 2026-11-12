"""Reclamation events for the Notification Service (RabbitMQ), best effort.

Team conventions (Notification README / RabbitMqConsumer, Forum and Course publishers):
  - default exchange, routing key = the queue name (`sendToQueue`). Notification is the only
    consumer and the only one that declares queues: this producer NEVER declares a queue.
  - persistent JSON (delivery_mode 2, application/json), shared envelope
      {"event": "...", "occurredAt": "2026-11-11T18:00:00Z", "actorId": "<keycloak sub>", "data": {...}}
  - best effort: a RabbitMQ failure never fails the request; empty RABBITMQ_URL = nothing sent.

Consumer: Notification (EventMessageProcessor, queue `reclamation.events` declared by its
`php artisan rabbitmq:consume`): the student for a status change, the administrators of its
RECLAMATION_ADMIN_IDS for a new reclamation. Publishing stays OFF by default: it needs
RECLAMATION_EVENTS_ENABLED=true AND RABBITMQ_URL (when off, no network call is made). Enable it where
the consumer runs; start RabbitMQ, then Notification, then this service (a message sent before
Notification declared the queue comes back unroutable and is logged, not stored).

  reclamation.created         after the insert        data {reclamationId, reference, studentSub, category}
  reclamation.status_changed  after the atomic update data {reclamationId, reference, studentSub,
                                                            oldStatus, newStatus}
actorId = the verified token's sub; studentSub = the persisted owner (author_sub), never a client
field. No token, no secret, no free text (subject, description, admin_response) in a message.

Not a transactional outbox: an event is lost if RabbitMQ is down or the process stops right after the
MongoDB write (the write is never undone). This code publishes at most once per successful change.
"""

import json
import logging
import threading
from datetime import timezone as dt_timezone

import pika
from django.conf import settings

log = logging.getLogger("reclamations")

CREATED = "reclamation.created"
STATUS_CHANGED = "reclamation.status_changed"
CONNECT_TIMEOUT_SECONDS = 2   # TCP connect
SETUP_TIMEOUT_SECONDS = 3     # whole AMQP connection set-up (pika stack_timeout)
PUBLISH_TIMEOUT_SECONDS = 3   # the request never waits longer for RabbitMQ (connect + publish + confirm)


def iso_utc(moment) -> str:
    return moment.astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def envelope(event: str, occurred_at, actor_sub: str, data: dict) -> dict:
    return {"event": event, "occurredAt": iso_utc(occurred_at), "actorId": actor_sub, "data": data}


def created_event(reclamation, actor) -> dict:
    return envelope(CREATED, reclamation.created_at, actor.sub, {
        "reclamationId": str(reclamation.pk),
        "reference": reclamation.reference,
        "studentSub": reclamation.author_sub,
        "category": reclamation.category,
    })


def status_changed_event(reclamation, actor) -> dict:
    entry = reclamation.history[-1]  # the history entry saved by this very change
    return envelope(STATUS_CHANGED, entry.at, actor.sub, {
        "reclamationId": str(reclamation.pk),
        "reference": reclamation.reference,
        "studentSub": reclamation.author_sub,
        "oldStatus": entry.from_status,
        "newStatus": entry.to_status,
    })


def enabled() -> bool:
    return bool(settings.RECLAMATION_EVENTS["ENABLED"] and settings.RABBITMQ_URL)


def _send(message: dict, queue: str, outcome: dict):
    """One connection per event (BlockingConnection is not shared between threads)."""
    try:
        params = pika.URLParameters(settings.RABBITMQ_URL)
        params.connection_attempts, params.retry_delay = 1, 0
        params.socket_timeout = CONNECT_TIMEOUT_SECONDS
        params.stack_timeout = SETUP_TIMEOUT_SECONDS
        params.blocked_connection_timeout = SETUP_TIMEOUT_SECONDS
        connection = pika.BlockingConnection(params)
        try:
            channel = connection.channel()
            channel.confirm_delivery()  # wait for the broker's ack; mandatory -> unroutable is reported
            channel.basic_publish(exchange="", routing_key=queue,
                                  body=json.dumps(message, ensure_ascii=False).encode("utf-8"),
                                  properties=pika.BasicProperties(content_type="application/json",
                                                                  delivery_mode=2),
                                  mandatory=True)
            outcome["ok"] = True
        finally:
            try:
                connection.close()
            except Exception:  # already closed by the broker: nothing to do
                pass
    except pika.exceptions.UnroutableError:
        outcome["error"] = f"queue {queue!r} does not exist (Notification declares it)"
    except Exception as exc:  # the URL, which may hold a password, is never logged
        outcome["error"] = f"RabbitMQ unavailable ({type(exc).__name__})"


def publish(message: dict) -> bool:
    """True when RabbitMQ confirmed the message. Never raises; waits PUBLISH_TIMEOUT_SECONDS at most."""
    if not enabled():
        return False
    outcome = {}
    worker = threading.Thread(target=_send, args=(message, settings.RECLAMATION_EVENTS["QUEUE"], outcome),
                              name="reclamation-event", daemon=True)
    worker.start()
    worker.join(PUBLISH_TIMEOUT_SECONDS)
    if worker.is_alive():
        outcome["error"] = f"RabbitMQ did not answer within {PUBLISH_TIMEOUT_SECONDS} s"
    if outcome.get("ok"):
        return True
    log.warning("Event %s for %s not published: %s.", message.get("event"),
                message.get("data", {}).get("reference"), outcome.get("error", "unknown error"))
    return False


def emit(builder, reclamation, actor) -> bool:
    """Called by the services right after a successful write. Never raises."""
    if not enabled():
        return False
    try:
        message = builder(reclamation, actor)
    except Exception as exc:
        log.warning("Event for %s not built (%s).", getattr(reclamation, "reference", "?"), type(exc).__name__)
        return False
    if not message["data"].get("studentSub"):  # legacy reclamation without a verified owner: no recipient
        log.info("Event %s for %s not published: no verified owner.", message["event"], reclamation.reference)
        return False
    return publish(message)
