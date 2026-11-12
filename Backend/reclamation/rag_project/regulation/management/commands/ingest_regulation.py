from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from rag import vectorstore
from rag.config import cfg
from rag.exceptions import RAGError
from regulation.services import import_regulation


class Command(BaseCommand):
    help = "Import the prepared regulation dataset (page chunks, rules, ambiguities) into ChromaDB."

    def add_arguments(self, parser):
        parser.add_argument("--dir", type=Path, default=None,
                            help="Folder with the JSON files (default: RAG_REGULATION_DIR = data/regulation/)")
        parser.add_argument("--force", action="store_true", help="Re-import even if files are unchanged")

    def handle(self, *args, dir, force, **options):
        try:
            report = import_regulation(dir, force=force)
        except RAGError as exc:
            raise CommandError(str(exc))

        self.stdout.write(self.style.SUCCESS(f"{report.document_id} ({report.academic_year})"))
        for line in report.lines:
            self.stdout.write(f"  - {line}")
        self.stdout.write(
            f"Index: {vectorstore.count(cfg('COLLECTION_PAGES'))} page chunks, "
            f"{vectorstore.count(cfg('COLLECTION_RULES'))} rules, "
            f"{vectorstore.count(cfg('COLLECTION_AMBIGUITIES'))} ambiguities."
        )
