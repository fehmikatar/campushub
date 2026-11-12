"""Read-only REST API over the structured rules and ambiguities.

GET /api/academic-rules?category=VAL&article=7.4&page=7&rule_type=…&automatable=true&academic_year=…&q=…
GET /api/academic-rules/<rule_id>
GET /api/ambiguities
GET /api/ambiguities/<amb_id>

Read-only on purpose: the rules are paraphrases of the official PDF and are loaded (and embedded)
by `manage.py ingest_regulation`; editing them through the API would desync them from the index.
"""

from config.api import ApiView, get_object, ok

from .models import AcademicRule, Ambiguity

OFFICIAL_SOURCE = "Règlement de scolarité ESPRIT"


def _related_ambiguities(pages):
    pages = set(pages)
    return [a.to_dict() for a in Ambiguity.objects.all() if pages.intersection(a.pages)]


def _related_rules(pages):
    pages = set(pages)
    return [r.rule_id for r in AcademicRule.objects.all() if pages.intersection(r.pages)]


class RuleListView(ApiView):
    def get(self, request):
        qs = AcademicRule.objects.all()
        params = request.GET
        if params.get("category"):
            qs = qs.filter(category__iexact=params["category"])
        if params.get("article"):
            qs = qs.filter(article=params["article"])
        if params.get("rule_type"):
            qs = qs.filter(rule_type=params["rule_type"])
        if params.get("academic_year"):
            qs = qs.filter(academic_year=params["academic_year"])
        if params.get("automatable") in {"true", "false"}:
            qs = qs.filter(automatable=params["automatable"] == "true")
        if params.get("q"):
            qs = qs.filter(rule__icontains=params["q"])
        rules = [r.to_dict() for r in qs]
        if params.get("page", "").isdigit():
            page = int(params["page"])
            rules = [r for r in rules if page in r["pages"]]
        return ok({"count": len(rules), "results": rules, "official_source": OFFICIAL_SOURCE})


class RuleDetailView(ApiView):
    def get(self, request, rule_id):
        rule = get_object(AcademicRule, "Rule not found.", rule_id=rule_id.upper())
        return ok({**rule.to_dict(), "related_ambiguities": _related_ambiguities(rule.pages),
                   "official_source": OFFICIAL_SOURCE})


class AmbiguityListView(ApiView):
    def get(self, request):
        items = [a.to_dict() for a in Ambiguity.objects.all()]
        return ok({"count": len(items), "results": items})


class AmbiguityDetailView(ApiView):
    def get(self, request, amb_id):
        ambiguity = get_object(Ambiguity, "Ambiguity not found.", amb_id=amb_id.upper())
        return ok({**ambiguity.to_dict(), "related_rules": _related_rules(ambiguity.pages)})
