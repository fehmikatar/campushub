from django.core.management.base import BaseCommand, CommandError

from rag.exceptions import RAGError
from rag.pipeline import ask
from regulation.models import AcademicRule


class Command(BaseCommand):
    help = 'Ask a question from the terminal. Example: python manage.py ask "Mon PFE dure combien ?"'

    def add_arguments(self, parser):
        parser.add_argument("question")
        parser.add_argument("--year", default=None, help="Academic year filter (default: RAG_ACADEMIC_YEAR)")
        parser.add_argument("--evidence", action="store_true", help="Only show the retrieved evidence (no LLM call)")

    def handle(self, *args, question, year, evidence, **options):
        try:
            if evidence:
                from rag.retriever import retrieve
                self._print_evidence(retrieve(question, academic_year=year))
                return
            answer = ask(question, academic_year=year,
                         known_rule_ids=set(AcademicRule.objects.values_list("rule_id", flat=True)))
        except RAGError as exc:
            raise CommandError(str(exc))

        self.stdout.write(answer.text + "\n")
        self._print_evidence(answer.evidence)
        check = answer.citation_check
        style = self.style.SUCCESS if check["verified"] else self.style.WARNING
        self.stdout.write(style("Citations verified" if check["verified"] else "; ".join(check["warnings"])))

    def _print_evidence(self, ev):
        for p in ev.pages:
            mark = "*" if p.cited else " "
            self.stdout.write(f" {mark} page {p.page:>2}  art. {', '.join(p.articles) or '-':<14} {p.source}")
        for r in ev.rules:
            mark = "*" if r.cited else " "
            self.stdout.write(f" {mark} {r.rule_id:<7} art. {r.article:<6} p.{','.join(map(str, r.pages)):<6} {r.text[:70]}")
        for a in ev.ambiguities:
            self.stdout.write(self.style.WARNING(f" ! {a.amb_id} {a.issue} (pages {a.pages})"))
