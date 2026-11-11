"""Small REST toolkit shared by every app: JSON responses, errors, parsing, routing.

Every endpoint is a subclass of ApiView, so all of them behave the same way:
  - a valid Keycloak token is required (config.auth) unless the view sets `public = True`;
    the caller is then available as `request.principal` (sub, role, roles)
  - responses are JSON; errors are {"error": "..."} with a meaningful status code
  - AuthError -> 401/403/503, ApiError -> its status, DocumentError -> 422, RAGError -> 503,
    anything else -> 500 (logged)
  - unsupported methods -> 405 JSON with an Allow header
"""

import json
import logging

from django.core.exceptions import RequestDataTooBig
from django.http import HttpResponse, JsonResponse
from django.http.multipartparser import MultiPartParser, MultiPartParserError
from django.urls import re_path
from django.utils.datastructures import MultiValueDict
from django.views import View

from rag.exceptions import DocumentError, RAGError

from .auth import AuthError, authenticate

log = logging.getLogger("rag.api")


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


def ok(data: dict, status: int = 200) -> JsonResponse:
    # explicit charset: Windows PowerShell 5.1 (Invoke-RestMethod) decodes JSON without it as Latin-1
    return JsonResponse(data, status=status, content_type="application/json; charset=utf-8",
                        json_dumps_params={"ensure_ascii": False})


def error(message: str, status: int) -> JsonResponse:
    return ok({"error": message}, status=status)


def no_content() -> HttpResponse:
    return HttpResponse(status=204)


def auth_error(exc: AuthError) -> JsonResponse:
    response = error(exc.message, exc.status)
    if exc.challenge:
        response["WWW-Authenticate"] = exc.challenge
    return response


class ApiView(View):
    public = False  # True only for endpoints that must work without a token (health check)

    def dispatch(self, request, *args, **kwargs):
        try:
            if not self.public:
                # Before any parsing or business logic; identity never comes from the request body.
                request.principal = authenticate(request)
            return super().dispatch(request, *args, **kwargs)
        except AuthError as exc:
            return auth_error(exc)
        except ApiError as exc:
            return error(exc.message, exc.status)
        except DocumentError as exc:
            return error(str(exc), 422)
        except RAGError as exc:
            return error(str(exc), 503)
        except Exception:
            log.exception("Unexpected error on %s %s", request.method, request.path)
            return error("Unexpected server error.", 500)

    def http_method_not_allowed(self, request, *args, **kwargs):
        response = error(f"Method {request.method} is not allowed on this endpoint.", 405)
        response["Allow"] = ", ".join(m.upper() for m in self._allowed_methods())
        return response


def route(pattern: str, view, name: str | None = None):
    """URL pattern (regex, no leading slash) that matches with or without a trailing slash."""
    return re_path(rf"^{pattern}/?$", view, name=name)


# ---------------------------------------------------------------- request parsing

def read_json(request) -> dict:
    try:
        body = request.body
    except RequestDataTooBig:
        raise ApiError("Request body is too large.", 413) from None
    if not body:
        return {}
    try:
        data = json.loads(body)
    except UnicodeDecodeError:
        # typical with curl -d "é…" on Windows (sends the console codepage, not UTF-8)
        raise ApiError("Invalid JSON body: it must be UTF-8 encoded.") from None
    except json.JSONDecodeError:
        raise ApiError("Invalid JSON body.") from None
    if not isinstance(data, dict):
        raise ApiError("The JSON body must be an object.")
    return data


def uploaded_files(request) -> MultiValueDict:
    """Files of a multipart/form-data body. Django only parses them for POST, so PUT is parsed here."""
    if request.method == "POST":
        return request.FILES
    if not request.content_type.startswith("multipart/"):
        return MultiValueDict()
    try:
        _, files = MultiPartParser(request.META, request, request.upload_handlers, request.encoding).parse()
    except MultiPartParserError as exc:
        raise ApiError(f"Invalid multipart body: {exc}") from None
    return files


def int_param(request, name: str, default: int) -> int:
    value = request.GET.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        raise ApiError(f"'{name}' must be an integer.") from None


def paginate(request, queryset, default: int = 20, maximum: int = 100):
    """?limit=&offset= -> (page of the queryset, {"count", "limit", "offset"})."""
    limit, offset = int_param(request, "limit", default), int_param(request, "offset", 0)
    if not 1 <= limit <= maximum:
        raise ApiError(f"'limit' must be between 1 and {maximum}.")
    if offset < 0:
        raise ApiError("'offset' must be 0 or more.")
    return queryset[offset:offset + limit], {"count": queryset.count(), "limit": limit, "offset": offset}


def get_object(model, message: str, **lookup):
    try:
        return model.objects.get(**lookup)
    except (model.DoesNotExist, ValueError):
        raise ApiError(message, 404) from None
