from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from documents.models import Document
from documents.services import find_pdfs, ingest_file, remove_document
from rag import vectorstore
from rag.config import cfg
from rag.exceptions import RAGError


class Command(BaseCommand):
    help = "Index extra PDFs (syllabus, guides…): load, chunk, embed, store in ChromaDB."

    def add_arguments(self, parser):
        parser.add_argument("paths", nargs="*", type=Path,
                            help="PDF files or folders (default: RAG_PDF_DIR, i.e. data/pdfs/)")
        parser.add_argument("--force", action="store_true",
                            help="Re-ingest files even if unchanged (e.g. after changing chunk size)")
        parser.add_argument("--prune", action="store_true",
                            help="Remove PDF documents whose file no longer exists")

    def handle(self, *args, paths, force, prune, **options):
        pdf_dir = cfg("PDF_DIR")
        paths = paths or [pdf_dir]
        try:
            files = find_pdfs(paths)
        except RAGError as exc:
            raise CommandError(str(exc))
        if not files:
            self.stdout.write(self.style.WARNING(f"No PDF found in: {', '.join(map(str, paths))}"))

        ok = skipped = failed = 0
        for path in files:
            self.stdout.write(f"- {path.name} ... ", ending="")
            try:
                result = ingest_file(path, force=force)
            except RAGError as exc:
                failed += 1
                self.stdout.write(self.style.ERROR(f"FAILED: {exc}"))
                continue
            if result.skipped:
                skipped += 1
                self.stdout.write(f"skipped ({result.reason})")
            else:
                ok += 1
                doc = result.document
                self.stdout.write(self.style.SUCCESS(f"{doc.page_count} pages, {doc.chunk_count} chunks"))

        if prune:
            existing = {p.name for p in find_pdfs([pdf_dir])}
            for document in Document.objects.filter(origin=Document.Origin.PDF).exclude(filename__in=existing):
                remove_document(document)
                self.stdout.write(self.style.WARNING(f"- removed {document.filename} (file missing)"))

        self.stdout.write(self.style.SUCCESS(
            f"\nDone: {ok} ingested, {skipped} skipped, {failed} failed. "
            f"{vectorstore.count(cfg('COLLECTION_PAGES'))} page chunks in the index."
        ))
        if failed:
            raise CommandError(f"{failed} file(s) failed.")
