"""The public entry point: ask(question) -> grounded answer + evidence + citation check.

Views, management commands and tests should only call this function.
"""

from dataclasses import dataclass, field

from . import citations
from .evidence import Evidence
from .llm import get_llm
from .prompts import NOT_FOUND_ANSWER, build_messages
from .retriever import retrieve


@dataclass
class Answer:
    text: str
    evidence: Evidence
    citation_check: dict = field(default_factory=dict)
    official_decision: bool = False  # always False: guidance only (ambiguity C11)

    def to_dict(self) -> dict:
        return {
            "answer": self.text,
            "academic_year": self.evidence.academic_year,
            "official_decision": self.official_decision,
            "evidence": self.evidence.to_dict(),
            "citation_check": self.citation_check,
        }


def retrieval_query(question: str, history: list[dict] | None) -> str:
    """Short follow-ups ("Et la date limite ?") are searched together with the previous question."""
    previous = [m["content"] for m in (history or []) if m["role"] == "user"]
    if previous and len(question.split()) <= 8:
        return f"{previous[-1]} {question}"
    return question


def ask(question: str, history: list[dict] | None = None, academic_year: str | None = None,
        known_rule_ids: set[str] | None = None) -> Answer:
    question = question.strip()
    evidence = retrieve(retrieval_query(question, history), academic_year=academic_year)
    if evidence.is_empty:
        return Answer(text=NOT_FOUND_ANSWER, evidence=evidence,
                      citation_check={"verified": True, "warnings": [], "cited_pages": [],
                                      "cited_rules": [], "invalid_pages": [], "invalid_rules": [],
                                      "missing_citations": False})

    text = get_llm().chat(build_messages(question, evidence, history))
    check = citations.verify(text, evidence, known_rule_ids)

    cited_pages, cited_rules = set(check["cited_pages"]), set(check["cited_rules"])
    for p in evidence.pages:
        p.cited = p.page in cited_pages
    for r in evidence.rules:
        r.cited = r.rule_id in cited_rules
    return Answer(text=text, evidence=evidence, citation_check=check)
