"""Measure retrieval quality on a test set (no LLM call).

    python manage.py eval_rag
    python manage.py eval_rag --semantic-weight 0     # keyword search only
    python manage.py eval_rag --lexical-weight 0      # semantic search only
    python manage.py eval_rag -v 2                    # show misses per question
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.test import override_settings

from rag.exceptions import RAGError
from rag.retriever import retrieve


def recall(expected, got):
    expected = set(expected)
    return None if not expected else len(expected & set(got)) / len(expected)


class Command(BaseCommand):
    help = "Evaluate retrieval (pages, rules, ambiguities) against data/regulation/eval_questions.json"

    def add_arguments(self, parser):
        parser.add_argument("--file", type=Path, default=None)
        parser.add_argument("--semantic-weight", type=float, default=None)
        parser.add_argument("--lexical-weight", type=float, default=None)

    def handle(self, *args, file, semantic_weight, lexical_weight, verbosity, **options):
        path = file or settings.RAG["REGULATION_DIR"] / "eval_questions.json"
        try:
            questions = json.loads(Path(path).read_text(encoding="utf-8"))["questions"]
        except (FileNotFoundError, KeyError, json.JSONDecodeError) as exc:
            raise CommandError(f"Cannot read {path}: {exc}")

        rag = dict(settings.RAG)
        if semantic_weight is not None:
            rag["SEMANTIC_WEIGHT"] = semantic_weight
        if lexical_weight is not None:
            rag["LEXICAL_WEIGHT"] = lexical_weight

        totals = {"pages": [], "rules": [], "ambiguities": []}
        with override_settings(RAG=rag):
            self.stdout.write(f"weights: semantic={rag['SEMANTIC_WEIGHT']} lexical={rag['LEXICAL_WEIGHT']}  "
                              f"(top {rag['TOP_PAGES']} pages, {rag['TOP_RULES']} rules)\n")
            self.stdout.write(f"{'pages':>6} {'rules':>6} {'amb.':>6}  question")
            for item in questions:
                try:
                    ev = retrieve(item["q"])
                except RAGError as exc:
                    raise CommandError(str(exc))
                got = {"pages": [p.page for p in ev.pages], "rules": [r.rule_id for r in ev.rules],
                       "ambiguities": [a.amb_id for a in ev.ambiguities]}
                scores = {k: recall(item.get(k, []), got[k]) for k in totals}
                for k, v in scores.items():
                    if v is not None:
                        totals[k].append(v)
                cells = " ".join(f"{'—' if v is None else f'{v:.0%}':>6}" for v in scores.values())
                self.stdout.write(f"{cells}  {item['q'][:70]}")
                if verbosity > 1:
                    for k in totals:
                        missing = set(item.get(k, [])) - set(got[k])
                        if missing:
                            self.stdout.write(self.style.WARNING(f"{'':>22}missing {k}: {sorted(missing)}  got: {got[k]}"))

        self.stdout.write("")
        for k, values in totals.items():
            if values:
                avg = sum(values) / len(values)
                style = self.style.SUCCESS if avg >= 0.8 else self.style.WARNING
                self.stdout.write(style(f"{k:<12} recall {avg:.0%}  ({len(values)} questions)"))
