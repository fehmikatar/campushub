"""Refuses request bodies that Django cannot read, instead of processing them as empty.

Django reads exactly CONTENT_LENGTH bytes of a body. The API Gateway forwards bodies with
Transfer-Encoding: chunked and no Content-Length; served by `manage.py runserver`, such a body
reaches the views EMPTY: a POST fails validation, a PATCH silently changes nothing. waitress (the
server to use behind the Gateway, see README) turns chunked bodies into normal ones, so this never
triggers there; elsewhere the request gets a clear 411 instead of a misleading answer.
"""

from .api import error

UNREADABLE_BODY = ("The request body is chunked without Content-Length and this server cannot read it "
                   "(deployment issue: see the Reclamation Service README, 'API Gateway').")


class RejectUnreadableBody:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        meta = request.META
        if "chunked" in meta.get("HTTP_TRANSFER_ENCODING", "").lower() and not meta.get("CONTENT_LENGTH"):
            return error(UNREADABLE_BODY, 411)
        return self.get_response(request)
