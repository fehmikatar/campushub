"""Detect which article(s) a page belongs to, for citation metadata."""

import re

ARTICLE = re.compile(r"\bArticle\s*(\d{1,2})\b", re.IGNORECASE)
# "7-4 Validation", "7.10 Stage", "7-8 \nDéroulement": number-dash-number followed by a capitalised word
SUB_ARTICLE = re.compile(r"(?<![\d/.,-])(\d{1,2})\s*[-.]\s*(\d{1,2})\s+(?=[A-ZÉÈÀÂÎÔ])")


def article_sort_key(article: str):
    parts = re.findall(r"\d+", article)
    return (0, [int(p) for p in parts]) if parts else (1, [article])


def detect_articles(text: str) -> list[str]:
    """Articles whose heading appears on the page, in reading order."""
    if re.search(r"\bSOMMAIRE\b", text):
        return ["Sommaire"]  # table of contents: its numbering is not authoritative
    found = []
    for match in sorted(
        [(m.start(), m.group(1)) for m in ARTICLE.finditer(text)]
        + [(m.start(), f"{m.group(1)}.{m.group(2)}") for m in SUB_ARTICLE.finditer(text)]
    ):
        if match[1] not in found:
            found.append(match[1])
    return found


def assign_articles(pages: dict[int, str], known: dict[int, set[str]] | None = None) -> dict[int, list[str]]:
    """Articles for every page.

    Priority: `known` (e.g. from the structured rules) > headings detected on the
    page; a page with neither inherits the last article of the previous page
    (its text continues that article).
    """
    known = known or {}
    result, previous = {}, []
    for number in sorted(pages):
        articles = sorted(known.get(number, set()), key=article_sort_key)
        if not articles:
            detected = detect_articles(pages[number])
            articles = detected or (previous[-1:] if previous and previous != ["Sommaire"] else [])
        result[number] = articles
        previous = articles
    return result
