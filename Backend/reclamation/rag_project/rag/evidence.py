"""The evidence package: everything retrieved for one question."""

from dataclasses import asdict, dataclass, field


def parse_pages(value) -> list[int]:
    if isinstance(value, list):
        return [int(p) for p in value]
    return [int(p) for p in str(value).split(",") if p.strip().isdigit()]


@dataclass
class PageEvidence:
    document_id: str
    title: str
    source: str
    page: int
    articles: list[str]
    text: str          # full page (parent)
    excerpt: str       # best-matching sub-chunk
    score: float
    similarity: float | None = None
    cited: bool = False


@dataclass
class RuleEvidence:
    rule_id: str
    article: str
    pages: list[int]
    category: str
    rule_type: str
    automatable: bool
    text: str
    citation: str
    score: float
    similarity: float | None = None
    cited: bool = False


@dataclass
class AmbiguityEvidence:
    amb_id: str
    issue: str
    pages: list[int]
    details: str
    handling: str
    score: float


@dataclass
class Evidence:
    academic_year: str
    pages: list[PageEvidence] = field(default_factory=list)
    rules: list[RuleEvidence] = field(default_factory=list)
    ambiguities: list[AmbiguityEvidence] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.pages and not self.rules

    def page_numbers(self) -> set[int]:
        """Every page the answer may legitimately cite."""
        numbers = {p.page for p in self.pages}
        for r in self.rules:
            numbers.update(r.pages)
        for a in self.ambiguities:
            numbers.update(a.pages)
        return numbers

    def rule_ids(self) -> set[str]:
        return {r.rule_id for r in self.rules}

    def to_dict(self) -> dict:
        return {
            "academic_year": self.academic_year,
            "pages": [asdict(p) for p in self.pages],
            "rules": [asdict(r) for r in self.rules],
            "ambiguities": [asdict(a) for a in self.ambiguities],
        }
