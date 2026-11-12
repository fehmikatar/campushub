"""Citation verification: check the answer only cites pages / rule IDs from the evidence.

Accepts the guide's long form [Règlement ESPRIT 2026–2027, article 7.4, page 7] and the
short form [Art. 7.4, p. 7; VAL001]. The check never edits the answer; it reports
problems so the API client (or a stricter policy) can warn or block.
"""

import re

from .evidence import Evidence

RULE_ID = re.compile(r"\b([A-Z]{2,4}\d{3})\b")
PAGE_REF = re.compile(r"\b(?:pages?|pp?)\.?\s*((?:\d{1,3})(?:\s*(?:,|-|–|et|and|&)\s*\d{1,3})*)", re.IGNORECASE)
BRACKET = re.compile(r"\[[^\[\]]{2,200}\]")


def extract(answer: str) -> tuple[list[int], list[str]]:
    pages, rules = [], []
    for block in BRACKET.findall(answer):
        for group in PAGE_REF.findall(block):
            pages.extend(int(n) for n in re.findall(r"\d{1,3}", group))
        rules.extend(RULE_ID.findall(block))
    # rule IDs may also appear outside brackets ("règle PFE002")
    rules.extend(RULE_ID.findall(BRACKET.sub(" ", answer)))
    return sorted(set(pages)), sorted(set(rules))


def verify(answer: str, evidence: Evidence, known_rule_ids: set[str] | None = None) -> dict:
    cited_pages, cited_rules = extract(answer)
    allowed_pages = evidence.page_numbers()
    allowed_rules = evidence.rule_ids()

    invalid_pages = [p for p in cited_pages if p not in allowed_pages]
    invalid_rules = [r for r in cited_rules if r not in allowed_rules]
    unknown_rules = [r for r in invalid_rules if known_rule_ids is not None and r not in known_rule_ids]
    missing = not cited_pages and not cited_rules

    warnings = []
    if missing:
        warnings.append("The answer contains no page or rule citation.")
    if invalid_pages:
        warnings.append(f"Cited page(s) not in the retrieved evidence: {invalid_pages}.")
    if unknown_rules:
        warnings.append(f"Cited rule ID(s) that do not exist: {unknown_rules}.")
    elif invalid_rules:
        warnings.append(f"Cited rule ID(s) not in the retrieved evidence: {invalid_rules}.")

    return {
        "verified": not warnings,
        "cited_pages": cited_pages,
        "cited_rules": cited_rules,
        "invalid_pages": invalid_pages,
        "invalid_rules": invalid_rules,
        "missing_citations": missing,
        "warnings": warnings,
    }
