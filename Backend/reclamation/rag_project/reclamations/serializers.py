"""DRF serializers of the reclamations API, built on the official MongoDB serializers
(django_mongodb_extensions.rest_framework): ObjectIds are returned as 24-character hexadecimal
strings and the embedded history as a list of objects.

Input serializers are strict: a field the caller may not set (author, reference, status,
priority, admin_response, ...) or an unknown field is refused with 400 instead of being silently
ignored, so a client never believes it changed something it cannot change.
"""

from collections.abc import Mapping

from django_mongodb_extensions.rest_framework import EmbeddedModelSerializer, MongoModelSerializer
from rest_framework import serializers

from . import services
from .models import (ADMIN_RESPONSE_MAX_LENGTH, COMMENT_MAX_LENGTH, Category, HistoryEntry, Priority,
                     Reclamation, Status, validate_academic_year)

READ_FIELDS = ["id", "reference", "author_id", "author_sub", "author_username", "category", "subject", "description",
               "module", "academic_year", "status", "priority", "admin_response", "history",
               "created_at", "updated_at", "closed_at"]
ADMIN_FIELDS = {"status", "priority", "admin_response"}
SEARCH_MAX_LENGTH = 100


class StrictInput:
    """Mixin: refuse every key of the body that is not a writable field of the serializer."""

    def protected_field_message(self, name: str) -> str:
        if name in ADMIN_FIELDS:
            return ("Only an administrator can change this field, with "
                    "POST /api/reclamations/{id}/change-status/.")
        if name in READ_FIELDS:
            return "This field is set by the service and cannot be changed."
        return "Unknown field."

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            writable = {name for name, field in self.fields.items() if not field.read_only}
            refused = sorted(set(data) - writable)
            if refused:
                raise serializers.ValidationError({name: [self.protected_field_message(name)] for name in refused})
        return super().to_internal_value(data)


class HistoryEntrySerializer(EmbeddedModelSerializer):
    class Meta:
        model = HistoryEntry
        fields = ["from_status", "to_status", "by_user_id", "by_sub", "by_username", "comment", "at"]
        read_only_fields = fields


class ReclamationSerializer(MongoModelSerializer):
    """A reclamation as returned by the API (read-only)."""

    history = HistoryEntrySerializer(many=True, read_only=True)

    class Meta:
        model = Reclamation
        fields = READ_FIELDS
        read_only_fields = [name for name in READ_FIELDS if name != "history"]


class ReclamationCreateSerializer(StrictInput, MongoModelSerializer):
    """POST by a student. academic_year is optional (default: the RAG academic year)."""

    class Meta:
        model = Reclamation
        fields = ["category", "subject", "description", "module", "academic_year"]


class ReclamationUpdateSerializer(StrictInput, MongoModelSerializer):
    """PUT / PATCH by the author while the reclamation is new: only these four fields."""

    class Meta:
        model = Reclamation
        fields = list(services.STUDENT_EDITABLE_FIELDS)


class ChangeStatusSerializer(StrictInput, serializers.Serializer):
    """POST /api/reclamations/{id}/change-status/ by an administrator."""

    status = serializers.ChoiceField(choices=Status.choices)
    comment = serializers.CharField(max_length=COMMENT_MAX_LENGTH, required=False, allow_blank=True, default="")
    admin_response = serializers.CharField(max_length=ADMIN_RESPONSE_MAX_LENGTH, required=False, allow_blank=True)
    priority = serializers.ChoiceField(choices=Priority.choices, required=False)


class ReclamationListQuerySerializer(serializers.Serializer):
    """Query parameters of GET /api/reclamations/ (empty values are ignored)."""

    status = serializers.ChoiceField(choices=Status.choices, required=False)
    category = serializers.ChoiceField(choices=Category.choices, required=False)
    priority = serializers.ChoiceField(choices=Priority.choices, required=False)
    academic_year = serializers.CharField(required=False, validators=[validate_academic_year])
    search = serializers.CharField(required=False, max_length=SEARCH_MAX_LENGTH)
    ordering = serializers.ChoiceField(choices=list(services.ORDERINGS), required=False,
                                       default=services.DEFAULT_ORDERING)


class StatsQuerySerializer(serializers.Serializer):
    academic_year = serializers.CharField(required=False, validators=[validate_academic_year])


def query_params(request, serializer_class) -> dict:
    """Validated query parameters (400 on an invalid value). Empty values mean "not given"."""
    given = {name: value for name, value in request.query_params.items() if value.strip()}
    serializer = serializer_class(data=given)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
