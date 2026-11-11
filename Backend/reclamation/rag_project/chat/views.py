"""Assistant + conversations REST API.

POST   /api/academic-assistant/ask      ask a question (creates the conversation if none is given)
GET    /api/conversations               list (?limit=&offset=)
POST   /api/conversations               create an empty conversation {title?}
GET    /api/conversations/<id>          one conversation with all its messages
PUT    /api/conversations/<id>          rename {title}   (PATCH accepted too)
DELETE /api/conversations/<id>          delete it and its messages

Policy questions only: no student records are read here. In Campus Hub these endpoints sit
behind the API Gateway, which authenticates the caller (JWT).
"""

import re

from django.db import transaction
from django.db.models import Count

from config.api import ApiError, ApiView, get_object, no_content, ok, paginate, read_json
from rag.config import cfg
from rag.pipeline import ask
from regulation.models import AcademicRule

from .models import TITLE_MAX_LENGTH, Conversation, Message

MAX_QUESTION_LENGTH = 2000
YEAR = re.compile(r"^\d{4}-\d{4}$")
NOT_FOUND = "Conversation not found."


def _conversation_id(value) -> int:
    if isinstance(value, bool) or not (isinstance(value, int) or (isinstance(value, str) and value.isdigit())):
        raise ApiError("conversation_id must be an integer.")
    return int(value)


def _title(payload: dict, required: bool) -> str:
    if "title" not in payload:
        if required:
            raise ApiError("'title' is required.")
        return ""
    title = payload["title"]
    if not isinstance(title, str):
        raise ApiError("'title' must be a string.")
    title = title.strip()
    if len(title) > TITLE_MAX_LENGTH:
        raise ApiError(f"'title' is too long (max {TITLE_MAX_LENGTH} characters).")
    return title


class AskView(ApiView):
    def post(self, request):
        payload = read_json(request)

        question = payload.get("question", "")
        if not isinstance(question, str) or not question.strip():
            raise ApiError("'question' is required and must be a non-empty string.")
        question = question.strip()
        if len(question) > MAX_QUESTION_LENGTH:
            raise ApiError(f"Question is too long (max {MAX_QUESTION_LENGTH} characters).")

        academic_year = payload.get("academic_year") or None
        if academic_year is not None and not (isinstance(academic_year, str) and YEAR.match(academic_year)):
            raise ApiError("academic_year must look like 2026-2027.")

        conversation = None
        if payload.get("conversation_id") is not None:
            conversation = get_object(Conversation, NOT_FOUND, pk=_conversation_id(payload["conversation_id"]))

        history = conversation.history(cfg("HISTORY_MESSAGES")) if conversation else []
        known_rules = set(AcademicRule.objects.values_list("rule_id", flat=True))
        answer = ask(question, history=history, academic_year=academic_year, known_rule_ids=known_rules)

        data = answer.to_dict()
        meta = {k: data[k] for k in ("evidence", "citation_check", "official_decision", "academic_year")}
        with transaction.atomic():
            if conversation is None:
                conversation = Conversation.objects.create(title=question[:TITLE_MAX_LENGTH])
            Message.objects.create(conversation=conversation, role=Message.Role.USER, content=question)
            Message.objects.create(conversation=conversation, role=Message.Role.ASSISTANT,
                                   content=answer.text, sources=meta)
            conversation.save(update_fields=["updated_at"])

        return ok({"conversation_id": conversation.pk, **data})


class ConversationListView(ApiView):
    def get(self, request):
        queryset = Conversation.objects.annotate(message_count=Count("messages"))
        page, meta = paginate(request, queryset)
        return ok({**meta, "results": [c.to_dict(message_count=c.message_count) for c in page]})

    def post(self, request):
        conversation = Conversation.objects.create(title=_title(read_json(request), required=False))
        return ok(conversation.to_dict(with_messages=True), status=201)


class ConversationDetailView(ApiView):
    def get(self, request, pk):
        return ok(get_object(Conversation, NOT_FOUND, pk=pk).to_dict(with_messages=True))

    def put(self, request, pk):
        conversation = get_object(Conversation, NOT_FOUND, pk=pk)
        conversation.title = _title(read_json(request), required=True)
        conversation.save(update_fields=["title", "updated_at"])
        return ok(conversation.to_dict(with_messages=True))

    patch = put  # the title is the only editable field

    def delete(self, request, pk):
        get_object(Conversation, NOT_FOUND, pk=pk).delete()
        return no_content()
