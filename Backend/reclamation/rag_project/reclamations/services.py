"""Business rules of the reclamations API. The views only translate HTTP to these functions.

References
    REC-<year>-<00001>, numbered per calendar year (Africa/Tunis) by an atomic counter: one
    document per year in the `counters` collection, incremented with find_one_and_update($inc,
    upsert). No count()+1, so two simultaneous creations never get the same number; the unique
    index on `reference` stays as a second line of defence (see create_reclamation).

Workflow
    new -> in_progress | rejected, in_progress -> resolved | rejected. Resolved and rejected are
    final, need an admin_response and set closed_at. Every change appends a history entry.

Concurrency
    No select_for_update (a no-op on MongoDB) and no multi-document transaction (needs a replica
    set). Every write is a single-document conditional update on the status read before
    ("compare and set"), which MongoDB applies atomically. The history only changes together
    with the status and a status never comes back, so a matching status also means an unchanged
    history. Two admins, or a student editing while an admin starts processing, therefore never
    overwrite each other: the late request gets a clear error instead.
"""

import logging
from datetime import datetime

from django.db import IntegrityError, connections
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from rest_framework.exceptions import PermissionDenied

from .permissions import ADMIN, ETUDIANT, user_role

from .models import Category, HistoryEntry, Priority, Reclamation, Status

log = logging.getLogger("reclamations")

COUNTERS_COLLECTION = "counters"
REFERENCE_PREFIX = "REC"
REFERENCE_ATTEMPTS = 3

TRANSITIONS = {
    Status.NEW: (Status.IN_PROGRESS, Status.REJECTED),
    Status.IN_PROGRESS: (Status.RESOLVED, Status.REJECTED),
    Status.RESOLVED: (),
    Status.REJECTED: (),
}
FINAL_STATUSES = frozenset({Status.RESOLVED, Status.REJECTED})

# The only fields a student may change, and only while the reclamation is new
STUDENT_EDITABLE_FIELDS = ("category", "subject", "description", "module")

# ?ordering= values -> order_by(). Priority is ranked low < normal < high (not alphabetically).
PRIORITY_RANK = Case(*(When(priority=value, then=Value(rank)) for rank, value in enumerate(Priority.values)),
                     default=Value(len(Priority.values)), output_field=IntegerField())
ORDERINGS = {
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "-id"),
    "updated_at": ("updated_at", "id"),
    "-updated_at": ("-updated_at", "-id"),
    "priority": ("priority_rank", "-created_at", "-id"),
    "-priority": ("-priority_rank", "-created_at", "-id"),
}
DEFAULT_ORDERING = "-created_at"


class WorkflowError(Exception):
    """A business rule refuses the operation (HTTP 400). `field` names the field at fault."""

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.message, self.field = message, field


class ConcurrentUpdate(Exception):
    """The reclamation changed between reading and writing it (HTTP 409)."""

    def __init__(self, message: str = "This reclamation was changed by someone else in the meantime. "
                                      "Reload it and try again."):
        super().__init__(message)
        self.message = message


class ReclamationGone(Exception):
    """The reclamation was deleted between reading and writing it (HTTP 404)."""


def now() -> datetime:
    """The current time at MongoDB's precision (milliseconds), so a value returned by the API
    right after a write is identical to the value read back later."""
    current = timezone.now()
    return current.replace(microsecond=current.microsecond // 1000 * 1000)


# ---------------------------------------------------------------- references

def _collection(name: str):
    """A raw PyMongo collection of the database the router assigns to reclamations."""
    return connections[Reclamation.objects.db].get_collection(name)


def counter_key(year: int) -> str:
    return f"reclamation-{year}"


def format_reference(year: int, number: int) -> str:
    return f"{REFERENCE_PREFIX}-{year}-{number:05d}"


def next_reference(year: int) -> str:
    """Atomically take the next number of `year` (1 for the first reclamation of the year)."""
    counters = _collection(COUNTERS_COLLECTION)
    try:
        counter = counters.find_one_and_update({"_id": counter_key(year)}, {"$inc": {"seq": 1}},
                                               upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        # Two first-of-the-year upserts at the same instant: one created the document, the
        # other one now simply increments it.
        counter = counters.find_one_and_update({"_id": counter_key(year)}, {"$inc": {"seq": 1}},
                                               return_document=ReturnDocument.AFTER)
    return format_reference(year, counter["seq"])


def resync_counter(year: int) -> int:
    """Move the counter past the highest reference already used in `year`, e.g. after the
    `counters` collection was dropped or restored from an older backup. Returns that number."""
    prefix = f"{REFERENCE_PREFIX}-{year}-"
    numbers = (reference[len(prefix):] for reference in
               Reclamation.objects.filter(reference__startswith=prefix).values_list("reference", flat=True))
    highest = max((int(number) for number in numbers if number.isdigit()), default=0)
    _collection(COUNTERS_COLLECTION).update_one({"_id": counter_key(year)}, {"$max": {"seq": highest}},
                                                upsert=True)
    return highest


# ---------------------------------------------------------------- student operations

def create_reclamation(user, data: dict) -> Reclamation:
    """A new reclamation by `user` (a student): status new, priority normal, first history entry.

    `data` holds already validated student fields (category, subject, description, module,
    academic_year); the author always comes from the authenticated user.
    """
    require_role(user, ETUDIANT)
    unexpected = set(data) - {*STUDENT_EDITABLE_FIELDS, "academic_year"}
    if unexpected:
        raise WorkflowError(f"These fields cannot be set by a student: {', '.join(sorted(unexpected))}.")
    created_at = now()
    year = timezone.localtime(created_at).year
    entry = HistoryEntry(from_status=None, to_status=Status.NEW, by_sub=user.sub,
                         by_username=user.username or user.sub, comment="", at=created_at)
    reclamation = Reclamation(author_sub=user.sub, author_username=user.username or user.sub,
                              status=Status.NEW, priority=Priority.NORMAL, admin_response="",
                              history=[entry], created_at=created_at, updated_at=created_at,
                              closed_at=None, **data)
    for attempt in range(1, REFERENCE_ATTEMPTS + 1):
        reclamation.reference = next_reference(year)
        reclamation.full_clean(validate_unique=False)  # the unique index checks the reference
        try:
            reclamation.save(force_insert=True)
            return reclamation
        except IntegrityError:
            # Only `reference` is unique: the counter is behind the data (lost or restored).
            if attempt == REFERENCE_ATTEMPTS:
                raise
            highest = resync_counter(year)
            log.warning("Reference %s was already used: counter of %s moved to %s.",
                        reclamation.reference, year, highest)


def require_role(user, role):
    if user_role(user) != role:
        raise PermissionDenied("This role cannot perform this operation.")


def require_owner(reclamation, user):
    require_role(user, ETUDIANT)
    if not reclamation.author_sub or reclamation.author_sub != user.sub:
        raise ReclamationGone()


def _reload_owned(reclamation, user):
    current = _reload(reclamation)
    require_owner(current, user)
    return current


def ensure_new(reclamation: Reclamation, action: str):
    if reclamation.status != Status.NEW:
        raise WorkflowError(f"This reclamation can no longer be {action}: its processing has started "
                            f"(status '{reclamation.status}').")


def update_reclamation(reclamation: Reclamation, user, changes: dict) -> Reclamation:
    """A student edits their reclamation: only STUDENT_EDITABLE_FIELDS, only while it is new."""
    require_owner(reclamation, user)
    ensure_new(reclamation, "modified")
    unexpected = set(changes) - set(STUDENT_EDITABLE_FIELDS)
    if unexpected:
        raise WorkflowError(f"These fields cannot be changed by a student: {', '.join(sorted(unexpected))}.")
    if not changes:
        return reclamation
    for name, value in changes.items():
        setattr(reclamation, name, value)
    reclamation.updated_at = now()
    reclamation.full_clean(validate_unique=False)
    updated = Reclamation.objects.filter(pk=reclamation.pk, author_sub=user.sub, status=Status.NEW).update(
        **changes, updated_at=reclamation.updated_at)
    if not updated:
        ensure_new(_reload_owned(reclamation, user), "modified")  # an admin started processing meanwhile
        raise ConcurrentUpdate()
    return reclamation


def delete_reclamation(reclamation: Reclamation, user):
    """A student deletes their reclamation, only while it is new."""
    require_owner(reclamation, user)
    ensure_new(reclamation, "deleted")
    deleted, _ = Reclamation.objects.filter(pk=reclamation.pk, author_sub=user.sub, status=Status.NEW).delete()
    if not deleted:
        ensure_new(_reload_owned(reclamation, user), "deleted")
        raise ConcurrentUpdate()


# ---------------------------------------------------------------- administrator operations

def allowed_transitions(status: str) -> tuple[str, ...]:
    return TRANSITIONS.get(status, ())


def change_status(reclamation: Reclamation, user, *, status: str, comment: str = "",
                  admin_response: str | None = None, priority: str | None = None) -> Reclamation:
    """An administrator moves the reclamation along the workflow, optionally setting its
    priority and admin_response at the same time. Appends one history entry."""
    require_role(user, ADMIN)
    current = reclamation.status
    if status not in allowed_transitions(current):
        if current in FINAL_STATUSES:
            raise WorkflowError(f"This reclamation is '{current}', a final status: it can no longer change.",
                                field="status")
        allowed = ", ".join(f"'{s}'" for s in allowed_transitions(current))
        raise WorkflowError(f"Invalid transition '{current}' -> '{status}'. From '{current}' the status can "
                            f"become: {allowed}.", field="status")
    response = reclamation.admin_response if admin_response is None else admin_response.strip()
    if status in FINAL_STATUSES and not response:
        raise WorkflowError(f"An admin_response is required to set the status to '{status}'.",
                            field="admin_response")
    changed_at = now()
    entry = HistoryEntry(from_status=current, to_status=status, by_sub=user.sub,
                         by_username=user.username or user.sub, comment=(comment or "").strip(), at=changed_at)
    changes = {"status": status, "admin_response": response, "history": [*reclamation.history, entry],
               "updated_at": changed_at}
    if priority is not None:
        changes["priority"] = priority
    if status in FINAL_STATUSES:
        changes["closed_at"] = changed_at
    for name, value in changes.items():
        setattr(reclamation, name, value)
    reclamation.full_clean(validate_unique=False)
    if not Reclamation.objects.filter(pk=reclamation.pk, status=current).update(**changes):
        _reload(reclamation)  # 404 if it was deleted meanwhile
        raise ConcurrentUpdate()
    return reclamation


def statistics(academic_year: str | None = None) -> dict:
    """Counts by status, category and priority, in one MongoDB aggregation ($facet). Every
    known value is listed, with 0 when there is none."""
    pipeline = [{"$match": {"academic_year": academic_year}}] if academic_year else []
    pipeline.append({"$facet": {
        name: [{"$group": {"_id": f"${name}", "count": {"$sum": 1}}}]
        for name in ("status", "category", "priority")
    }})
    [facets] = _collection(Reclamation._meta.db_table).aggregate(pipeline)

    def counts(name, choices):
        found = {group["_id"]: group["count"] for group in facets[name]}
        return {value: found.pop(value, 0) for value in choices} | found

    by_status = counts("status", Status.values)
    return {
        "academic_year": academic_year,
        "total": sum(by_status.values()),
        "by_status": by_status,
        "by_category": counts("category", Category.values),
        "by_priority": counts("priority", Priority.values),
    }


# ---------------------------------------------------------------- listing

def filter_reclamations(queryset, *, status=None, category=None, priority=None, academic_year=None,
                        search=None, ordering=DEFAULT_ORDERING):
    """Apply already validated list filters: exact matches, a case-insensitive text search in
    subject / description / reference (a plain substring, not a regex), and the ordering."""
    exact = {"status": status, "category": category, "priority": priority, "academic_year": academic_year}
    queryset = queryset.filter(**{name: value for name, value in exact.items() if value})
    if search:
        queryset = queryset.filter(Q(subject__icontains=search) | Q(description__icontains=search)
                                   | Q(reference__icontains=search))
    if ordering in ("priority", "-priority"):
        queryset = queryset.annotate(priority_rank=PRIORITY_RANK)
    return queryset.order_by(*ORDERINGS[ordering])


def _reload(reclamation: Reclamation) -> Reclamation:
    try:
        return Reclamation.objects.get(pk=reclamation.pk)
    except Reclamation.DoesNotExist:
        raise ReclamationGone() from None
