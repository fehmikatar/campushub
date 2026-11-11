"""Knowledge-base documents REST API (extra PDFs: syllabus, guides…).

GET    /api/documents          list every indexed document (the regulation JSON included)
POST   /api/documents          upload + index a PDF        multipart/form-data, field "file"
GET    /api/documents/<id>     one document
PUT    /api/documents/<id>     replace its PDF + re-index  multipart/form-data, field "file"
DELETE /api/documents/<id>     delete it (file, row and vectors)

The prepared regulation (origin "json") is read-only here: it is managed by
`manage.py ingest_regulation`. Indexing is synchronous (the response comes back once the
PDF is embedded). Errors: 400 bad request, 409 conflict, 413 too large, 422 unusable PDF,
503 embedding provider unavailable.
"""

from config.api import ApiError, ApiView, get_object, no_content, ok, uploaded_files
from rag.config import cfg

from .models import Document
from .services import (add_uploaded_pdf, check_pdf, delete_uploaded_pdf, pdf_path,
                       replace_uploaded_pdf, safe_pdf_name)

NOT_FOUND = "Document not found."
READ_ONLY = ("This document is the prepared regulation dataset; it is managed with "
             "`python manage.py ingest_regulation`, not through the API.")


def _read_upload(request):
    upload = uploaded_files(request).get("file")
    if upload is None:
        raise ApiError("Send the PDF as multipart/form-data in a field named 'file'.")
    max_mb = cfg("MAX_UPLOAD_MB")
    if upload.size > max_mb * 1024 * 1024:
        raise ApiError(f"File is too large (max {max_mb} MB).", 413)
    if upload.size == 0:
        raise ApiError("The file is empty.")
    return upload


def _editable(pk) -> Document:
    document = get_object(Document, NOT_FOUND, pk=pk)
    if document.origin == Document.Origin.JSON:
        raise ApiError(READ_ONLY, 409)
    return document


class DocumentListView(ApiView):
    def get(self, request):
        documents = [d.to_dict() for d in Document.objects.all()]
        return ok({"count": len(documents), "results": documents})

    def post(self, request):
        upload = _read_upload(request)
        name = safe_pdf_name(upload.name)
        if Document.objects.filter(filename=name).exists() or pdf_path(name).exists():
            raise ApiError(f"A document named '{name}' already exists; "
                           "use PUT /api/documents/<id> to replace it.", 409)
        data = upload.read()
        check_pdf(data, name)
        return ok(add_uploaded_pdf(name, data).to_dict(), status=201)


class DocumentDetailView(ApiView):
    def get(self, request, pk):
        return ok(get_object(Document, NOT_FOUND, pk=pk).to_dict())

    def put(self, request, pk):
        document = _editable(pk)
        data = _read_upload(request).read()
        check_pdf(data, document.filename)
        return ok(replace_uploaded_pdf(document, data).to_dict())

    def delete(self, request, pk):
        delete_uploaded_pdf(_editable(pk))
        return no_content()
