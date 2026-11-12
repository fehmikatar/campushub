"""PDF ingestion: PDF file -> Document row + page chunks in ChromaDB.

Use it for extra documents (syllabus, guides…). The ESPRIT regulation itself is
imported from its prepared JSON with `ingest_regulation`.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

from django.core.exceptions import SuspiciousFileOperation
from django.utils import timezone
from django.utils.text import get_valid_filename

from rag import vectorstore
from rag.articles import assign_articles
from rag.config import cfg
from rag.embeddings import get_embedder
from rag.exceptions import DocumentError, RAGError
from rag.indexing import IndexedPage, index_document_pages
from rag.loader import LoadedPDF, file_sha256, load_pdf, load_pdf_bytes

from .models import Document

log = logging.getLogger("rag.ingest")


@dataclass
class IngestResult:
    document: Document
    skipped: bool = False
    reason: str = ""


def ingest_file(path: Path, force: bool = False) -> IngestResult:
    path = Path(path)
    embedder = get_embedder()
    sha = file_sha256(path)

    document, _ = Document.objects.get_or_create(filename=path.name, defaults={"external_id": path.name})
    if document.origin == Document.Origin.JSON:
        return IngestResult(document, skipped=True,
                            reason="already imported from its prepared JSON (ingest_regulation)")
    unchanged = (document.status == Document.Status.READY and document.sha256 == sha
                 and document.embed_model == embedder.model)
    if unchanged and not force:
        return IngestResult(document, skipped=True, reason="unchanged")

    document.status, document.error = Document.Status.PROCESSING, ""
    document.save(update_fields=["status", "error", "updated_at"])
    try:
        pdf = load_pdf(path)
        if not pdf.pages:
            raise DocumentError(f"{path.name} has no extractable text (scanned PDF? it needs OCR first).")
        articles = assign_articles({p.number: p.text for p in pdf.pages})
        pages = [IndexedPage(number=p.number, text=p.text, articles=articles[p.number]) for p in pdf.pages]
        count = index_document_pages(
            document_id=document.doc_key, source=path.name, title=pdf.title,
            academic_year=cfg("ACADEMIC_YEAR"), origin="pdf", pages=pages)
    except Exception as exc:
        document.status, document.error = Document.Status.FAILED, str(exc)
        document.save(update_fields=["status", "error", "updated_at"])
        raise

    document.title = pdf.title
    document.academic_year = cfg("ACADEMIC_YEAR")
    document.sha256 = sha
    document.page_count = pdf.page_count
    document.chunk_count = count
    document.embed_model = embedder.model
    document.status = Document.Status.READY
    document.ingested_at = timezone.now()
    document.save()
    log.debug("Ingested %s: %d pages, %d chunks", path.name, pdf.page_count, count)
    return IngestResult(document)


def remove_document(document: Document) -> None:
    """Delete a document and all its vectors."""
    if document.embed_model:
        vectorstore.delete_where(cfg("COLLECTION_PAGES"), document.embed_model,
                                 {"document_id": document.doc_key})
    document.delete()


# ---------------------------------------------------------------- uploads (REST API)

def safe_pdf_name(filename: str) -> str:
    """Client file name -> safe name inside PDF_DIR (no folders, no odd characters)."""
    try:
        name = get_valid_filename(Path(str(filename)).name)
    except SuspiciousFileOperation:
        raise DocumentError("Invalid file name.") from None
    if not name.lower().endswith(".pdf"):
        raise DocumentError("Only PDF files are accepted (the file name must end with .pdf).")
    if len(name) > 255:
        raise DocumentError("File name is too long (max 255 characters).")
    return name


def check_pdf(data: bytes, name: str) -> LoadedPDF:
    """Validate an upload in memory, before anything is written or indexed."""
    if b"%PDF-" not in data[:1024]:
        raise DocumentError(f"{name} is not a PDF file.")
    pdf = load_pdf_bytes(data, name)
    if not pdf.pages:
        raise DocumentError(f"{name} has no extractable text (scanned PDF? it needs OCR first).")
    return pdf


def pdf_path(filename: str) -> Path:
    directory = Path(cfg("PDF_DIR")).resolve()
    path = (directory / filename).resolve()
    if path.parent != directory:
        raise DocumentError("Invalid file name.")
    return path


def add_uploaded_pdf(filename: str, data: bytes) -> Document:
    """Store a new (already validated) PDF in PDF_DIR and index it. On failure nothing is kept."""
    path = pdf_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    try:
        return ingest_file(path, force=True).document
    except Exception:
        Document.objects.filter(filename=filename).delete()
        path.unlink(missing_ok=True)
        raise


def replace_uploaded_pdf(document: Document, data: bytes) -> Document:
    """Overwrite a PDF document's file and re-index it. On failure the previous version is restored
    (its vectors are untouched: indexing only deletes old vectors after the new ones are embedded)."""
    path = pdf_path(document.filename)
    previous = path.read_bytes() if path.exists() else None
    status, error = document.status, document.error
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    try:
        return ingest_file(path, force=True).document
    except Exception:
        if previous is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(previous)
        Document.objects.filter(pk=document.pk).update(status=status, error=error)
        raise


def delete_uploaded_pdf(document: Document) -> None:
    """Delete a PDF document: its vectors, its row and its file in PDF_DIR."""
    path = pdf_path(document.filename)
    remove_document(document)
    path.unlink(missing_ok=True)


def find_pdfs(paths: list[Path]) -> list[Path]:
    found = []
    for path in paths:
        path = Path(path)
        if path.is_dir():
            found.extend(sorted(p for p in path.rglob("*") if p.suffix.lower() == ".pdf"))
        elif path.suffix.lower() == ".pdf" and path.exists():
            found.append(path)
        else:
            raise RAGError(f"Not a PDF file or folder: {path}")
    return found
