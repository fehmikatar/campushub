"""REST API /api/reclamations/ (DRF ModelViewSet).

The viewset only checks who may call what, validates the input and turns the results into
HTTP; the business rules are in services.py. Students only ever see their own reclamations
(filtered queryset): another student's reclamation is a 404, like a missing one.
"""

from urllib.parse import urlsplit

from bson import ObjectId
from bson.errors import InvalidId
from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from . import services
from .authentication import KeycloakAuthentication
from .models import Reclamation
from .permissions import ADMIN, NOT_FOUND, IsAdministrateur, IsEtudiant, user_role
from .serializers import (ChangeStatusSerializer, ReclamationCreateSerializer, ReclamationListQuerySerializer,
                          ReclamationSerializer, ReclamationUpdateSerializer, StatsQuerySerializer, query_params)

READERS = IsEtudiant | IsAdministrateur
ACTION_PERMISSIONS = {
    "list": (READERS,),
    "retrieve": (READERS,),
    "create": (IsEtudiant,),
    "update": (IsEtudiant,),
    "partial_update": (IsEtudiant,),
    "destroy": (IsEtudiant,),
    "change_status": (IsAdministrateur,),
    "stats": (IsAdministrateur,),
}
# Any other request (OPTIONS, an unsupported method -> 405) still needs a student or admin role
DEFAULT_PERMISSIONS = (READERS,)


class ReclamationPagination(PageNumberPagination):
    page_size = 20

    def get_next_link(self):
        return public_link(super().get_next_link())

    def get_previous_link(self):
        return public_link(super().get_previous_link())


def public_link(url: str | None) -> str | None:
    """Behind the API Gateway, http://<this service>/api/... becomes settings.PUBLIC_API_URL + ...
    (query kept), so a page link never exposes or bypasses the Gateway. Unchanged when unset."""
    base = settings.PUBLIC_API_URL
    if not url or not base:
        return url
    parts = urlsplit(url)
    path = parts.path[len("/api"):] if parts.path.startswith("/api/") else parts.path
    return base + path + (f"?{parts.query}" if parts.query else "")


class ReclamationViewSet(viewsets.ModelViewSet):
    authentication_classes = (KeycloakAuthentication,)
    serializer_class = ReclamationSerializer
    pagination_class = ReclamationPagination
    # Anything else is not a reclamation id: the URL does not match -> JSON 404
    lookup_value_regex = "[0-9a-fA-F]{24}"

    def get_permissions(self):
        return [permission() for permission in ACTION_PERMISSIONS.get(self.action, DEFAULT_PERMISSIONS)]

    def get_queryset(self):
        queryset = Reclamation.objects.all()
        if user_role(self.request.user) != ADMIN:
            queryset = queryset.filter(author_sub=self.request.user.sub)
        return queryset

    def get_object(self):
        try:
            pk = ObjectId(self.kwargs[self.lookup_field])
        except (InvalidId, TypeError):
            raise NotFound(NOT_FOUND) from None
        try:
            reclamation = self.get_queryset().get(pk=pk)
        except Reclamation.DoesNotExist:
            raise NotFound(NOT_FOUND) from None
        self.check_object_permissions(self.request, reclamation)
        return reclamation

    # ------------------------------------------------------------ CRUD

    def list(self, request, *args, **kwargs):
        filters = query_params(request, ReclamationListQuerySerializer)
        page = self.paginate_queryset(services.filter_reclamations(self.get_queryset(), **filters))
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def create(self, request, *args, **kwargs):
        serializer = ReclamationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reclamation = services.create_reclamation(request.user, dict(serializer.validated_data))
        return Response(ReclamationSerializer(reclamation).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        reclamation = self.get_object()
        services.ensure_new(reclamation, "modified")  # before validating: the state decides first
        serializer = ReclamationUpdateSerializer(reclamation, data=request.data,
                                                 partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        reclamation = services.update_reclamation(reclamation, request.user, dict(serializer.validated_data))
        return Response(ReclamationSerializer(reclamation).data)

    def destroy(self, request, *args, **kwargs):
        services.delete_reclamation(self.get_object(), request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------ administration

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        reclamation = self.get_object()
        serializer = ChangeStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reclamation = services.change_status(reclamation, request.user, **serializer.validated_data)
        return Response(ReclamationSerializer(reclamation).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        return Response(services.statistics(**query_params(request, StatsQuerySerializer)))
