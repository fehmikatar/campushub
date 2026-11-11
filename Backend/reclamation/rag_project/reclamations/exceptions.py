"""Exception handler of the reclamations API (settings.REST_FRAMEWORK["EXCEPTION_HANDLER"]).

Errors keep DRF's usual shapes: {"detail": "..."} or, for invalid fields, {"field": ["..."]}.
Service errors: WorkflowError -> 400, ConcurrentUpdate -> 409, ReclamationGone -> 404;
MongoDB unreachable -> 503. Internal details (stack traces, MongoDB hosts, the connection
string) never reach the client.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from pymongo.errors import ConfigurationError, ConnectionFailure
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from config.auth import AuthError

from . import services
from .course_client import CourseCheckError
from .permissions import NOT_FOUND

log = logging.getLogger("reclamations")

DATABASE_UNAVAILABLE = "The reclamations database is unavailable, please retry later."


def _mongodb_unreachable(exc: BaseException) -> bool:
    # Django wraps driver errors in django.db.Error: the PyMongo error is then the cause.
    while exc is not None:
        if isinstance(exc, (ConnectionFailure, ConfigurationError)):
            return True
        exc = exc.__cause__
    return False


def exception_handler(exc, context):
    if isinstance(exc, AuthError):
        headers = {"WWW-Authenticate": exc.challenge} if exc.challenge else {}
        return Response({"detail": exc.message}, status=exc.status, headers=headers)
    if isinstance(exc, CourseCheckError):  # Course said 404 / 401 / 403, or is unavailable (503)
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else {}
        return Response({"detail": exc.message}, status=exc.status, headers=headers)
    if isinstance(exc, services.WorkflowError):
        body = {exc.field: [exc.message]} if exc.field else {"detail": exc.message}
        return Response(body, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, services.ConcurrentUpdate):
        return Response({"detail": exc.message}, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, services.ReclamationGone):
        return Response({"detail": NOT_FOUND}, status=status.HTTP_404_NOT_FOUND)
    if isinstance(exc, DjangoValidationError):  # model validation in the service layer
        body = exc.message_dict if hasattr(exc, "error_dict") else {"detail": exc.messages}
        return Response(body, status=status.HTTP_400_BAD_REQUEST)
    if _mongodb_unreachable(exc):
        request = context.get("request")
        log.error("MongoDB unreachable during %s %s (%s)", getattr(request, "method", "?"),
                  getattr(request, "path", "?"), type(exc).__name__)
        return Response({"detail": DATABASE_UNAVAILABLE}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return drf_exception_handler(exc, context)
