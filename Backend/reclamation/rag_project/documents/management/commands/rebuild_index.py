from django.core.management import call_command
from django.core.management.base import BaseCommand

from documents.models import Document
from rag import vectorstore
from rag.config import cfg
from regulation.models import AcademicRule, Ambiguity, DatasetVersion


class Command(BaseCommand):
    help = ("Wipe ALL vectors and re-index everything (regulation + PDFs). "
            "Required after changing EMBED_MODEL.")

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation")

    def handle(self, *args, yes, **options):
        if not yes and input("This deletes the whole index and rebuilds it. Continue? [y/N] ").lower() != "y":
            self.stdout.write("Aborted.")
            return

        vectorstore.reset([cfg("COLLECTION_PAGES"), cfg("COLLECTION_RULES"), cfg("COLLECTION_AMBIGUITIES")])
        Document.objects.all().delete()
        AcademicRule.objects.all().delete()
        Ambiguity.objects.all().delete()
        DatasetVersion.objects.all().delete()
        self.stdout.write(self.style.WARNING("Index cleared."))

        if (cfg("REGULATION_DIR")).exists():
            call_command("ingest_regulation", stdout=self.stdout)
        call_command("ingest_pdfs", stdout=self.stdout)
