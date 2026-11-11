"""Hybrid retrieval: semantic (ChromaDB) + keyword (BM25), fused with RRF.

For one question we search three collections and build an Evidence package:
  - pages:       best sub-chunks -> their full parent pages (deduplicated)
  - rules:       best structured rules (VAL001, …)
  - ambiguities: known contradictions, kept only if relevant AND on a page
                 that is already part of the evidence
"""

import logging

from . import lexical, vectorstore
from .config import cfg
from .embeddings import get_embedder
from .exceptions import RAGError
from .evidence import AmbiguityEvidence, Evidence, PageEvidence, RuleEvidence, parse_pages

log = logging.getLogger(__name__)

RRF_K = 60  # standard Reciprocal Rank Fusion constant


def hybrid_search(collection: str, question: str, query_vector: list[float], embed_model: str,
                  where: dict | None) -> list[dict]:
    """Return candidates sorted by fused score: [{hit, score, similarity, lexical}]."""
    n = cfg("CANDIDATES")
    min_sim = cfg("MIN_SIMILARITY")
    w_sem, w_lex = cfg("SEMANTIC_WEIGHT"), cfg("LEXICAL_WEIGHT")
    semantic = [h for h in vectorstore.search(collection, embed_model, query_vector, n, where)
                if h.similarity >= min_sim]
    keyword = lexical.search(collection, question, n, where)

    fused: dict[str, dict] = {}

    def entry(hit):
        return fused.setdefault(hit.id, {"hit": hit, "score": 0.0, "similarity": None,
                                         "lexical": 0.0, "lexical_rank": None})

    for rank, hit in enumerate(semantic):
        e = entry(hit)
        e["score"] += w_sem / (RRF_K + rank + 1)
        e["similarity"] = hit.similarity
    for rank, (hit, bm25_score) in enumerate(keyword):
        e = entry(hit)
        e["score"] += w_lex / (RRF_K + rank + 1)
        e["lexical"], e["lexical_rank"] = bm25_score, rank
    return sorted(fused.values(), key=lambda e: e["score"], reverse=True)


def retrieve(question: str, academic_year: str | None = None) -> Evidence:
    academic_year = academic_year or cfg("ACADEMIC_YEAR")
    if not vectorstore.count(cfg("COLLECTION_PAGES")) and not vectorstore.count(cfg("COLLECTION_RULES")):
        raise RAGError("Nothing is indexed yet. Run: python manage.py ingest_regulation")
    where = {"academic_year": academic_year}
    embedder = get_embedder()
    vector = embedder.embed_query(question)
    evidence = Evidence(academic_year=academic_year)

    # 1) Pages: search small chunks, return whole parent pages
    seen = set()
    for c in hybrid_search(cfg("COLLECTION_PAGES"), question, vector, embedder.model, where):
        m = c["hit"].metadata
        if m["parent_id"] in seen or m.get("articles") == "Sommaire":
            continue  # table of contents: its numbering differs from the body (ambiguity C04)
        seen.add(m["parent_id"])
        evidence.pages.append(PageEvidence(
            document_id=m["document_id"], title=m.get("title", ""), source=m.get("source", ""),
            page=int(m["page"]), articles=[a for a in m.get("articles", "").split(", ") if a],
            text=m.get("page_text") or c["hit"].text, excerpt=c["hit"].text,
            score=round(c["score"], 5), similarity=c["similarity"],
        ))
        if len(evidence.pages) >= cfg("TOP_PAGES"):
            break
    evidence.pages.sort(key=lambda p: (p.document_id, p.page))

    # 2) Structured rules
    for c in hybrid_search(cfg("COLLECTION_RULES"), question, vector, embedder.model, where)[: cfg("TOP_RULES")]:
        m = c["hit"].metadata
        evidence.rules.append(RuleEvidence(
            rule_id=m["rule_id"], article=m["article"], pages=parse_pages(m["pages"]),
            category=m["category"], rule_type=m["rule_type"], automatable=bool(m["automatable"]),
            text=m["rule"], citation=m["citation"], score=round(c["score"], 5), similarity=c["similarity"],
        ))

    # 3) Ambiguities: relevant to the question AND touching a page already in the evidence
    evidence_pages = {p.page for p in evidence.pages} | {pg for r in evidence.rules for pg in r.pages}
    for c in hybrid_search(cfg("COLLECTION_AMBIGUITIES"), question, vector, embedder.model, where)[:4]:
        m = c["hit"].metadata
        pages = parse_pages(m["pages"])
        keyword_top = c["lexical_rank"] is not None and c["lexical_rank"] < 2
        relevant = (c["similarity"] or 0) >= cfg("AMBIGUITY_MIN_SIMILARITY") or keyword_top
        if relevant and evidence_pages.intersection(pages):
            evidence.ambiguities.append(AmbiguityEvidence(
                amb_id=m["amb_id"], issue=m["issue"], pages=pages, details=m["details"],
                handling=m["handling"], score=round(c["score"], 5),
            ))
        if len(evidence.ambiguities) >= cfg("TOP_AMBIGUITIES"):
            break

    log.info("Evidence for %r: pages=%s rules=%s ambiguities=%s", question[:60],
             [p.page for p in evidence.pages], [r.rule_id for r in evidence.rules],
             [a.amb_id for a in evidence.ambiguities])
    return evidence
