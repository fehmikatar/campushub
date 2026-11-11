"""Service-level endpoints: health check and JSON errors for unknown URLs."""

from documents.models import Document
from rag import vectorstore
from rag.config import cfg

from .api import ApiView, error, ok

SERVICE_NAME = "campushub-academic-assistant"


class HealthView(ApiView):
    """GET /api/health — liveness + index status. Never calls the model providers (stays fast)."""

    def get(self, request):
        index = {
            "page_chunks": vectorstore.count(cfg("COLLECTION_PAGES")),
            "rules": vectorstore.count(cfg("COLLECTION_RULES")),
            "ambiguities": vectorstore.count(cfg("COLLECTION_AMBIGUITIES")),
        }
        return ok({
            "status": "UP",
            "service": SERVICE_NAME,
            "academic_year": cfg("ACADEMIC_YEAR"),
            "indexed": bool(index["page_chunks"] or index["rules"]),
            "index": index,
            "documents": Document.objects.filter(status=Document.Status.READY).count(),
            "embed_model": cfg("EMBED_MODEL"),
            "llm_model": cfg("LLM_MODEL"),
        })


def not_found(request, *args, **kwargs):
    return error(f"No endpoint {request.method} {request.path}.", 404)


def not_found_handler(request, exception=None):  # handler404 (DEBUG=False)
    return not_found(request)


def server_error_handler(request):  # handler500 (DEBUG=False)
    return error("Unexpected server error.", 500)
