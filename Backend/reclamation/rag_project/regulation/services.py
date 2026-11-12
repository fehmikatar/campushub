"""Import the prepared regulation dataset into Django + ChromaDB.

Input files (data/regulation/):
  campushub_rag_source_chunks.json         full French text, one entry per PDF page
  campushub_academic_rules_2026_2027.json  structured rules (+ ambiguities, usage notes)
  campushub_rag_ambiguities.json           ambiguities (optional; else taken from the rules file)

Each part is skipped when its file hash and the embedding model are unchanged.
"""

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from documents.models import Document
from rag.articles import assign_articles
from rag.config import cfg
from rag.embeddings import get_embedder
from rag.exceptions import RAGError
from rag.indexing import IndexedPage, index_document_pages, index_records

from .keywords import CATEGORY_KEYWORDS_FR, keywords_for
from .models import AcademicRule, Ambiguity, DatasetVersion

CHUNKS_FILE = "campushub_rag_source_chunks.json"
RULES_FILE = "campushub_academic_rules_2026_2027.json"
AMBIGUITIES_FILE = "campushub_rag_ambiguities.json"


@dataclass
class ImportReport:
    document_id: str = ""
    academic_year: str = ""
    lines: list[str] = field(default_factory=list)


def _sha(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _load(path: Path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise RAGError(f"File not found: {path}")
    except json.JSONDecodeError as exc:
        raise RAGError(f"{Path(path).name} is not valid JSON: {exc}")


def _unchanged(name: str, sha: str, model: str) -> bool:
    return DatasetVersion.objects.filter(name=name, sha256=sha, embed_model=model).exists()


def _mark(name: str, sha: str, model: str, count: int) -> None:
    DatasetVersion.objects.update_or_create(
        name=name, defaults={"sha256": sha, "embed_model": model, "item_count": count})


def _validate(chunks_data: dict, rules_data: dict) -> None:
    if not chunks_data.get("chunks"):
        raise RAGError("The chunks file has no 'chunks' list.")
    rules = rules_data.get("rules") or []
    ids = [r.get("id") for r in rules]
    if len(ids) != len(set(ids)):
        raise RAGError("Duplicate rule IDs in the rules file.")
    for r in rules:
        missing = {"id", "article", "pages", "category", "rule_type", "rule", "source_citation"} - set(r)
        if missing:
            raise RAGError(f"Rule {r.get('id', '?')} is missing fields: {sorted(missing)}")
    declared = rules_data.get("rule_count")
    if declared is not None and declared != len(rules):
        raise RAGError(f"rule_count says {declared} but the file contains {len(rules)} rules.")


def import_regulation(directory: Path | None = None, force: bool = False) -> ImportReport:
    directory = Path(directory or cfg("REGULATION_DIR"))
    chunks_data = _load(directory / CHUNKS_FILE)
    rules_data = _load(directory / RULES_FILE)
    amb_path = directory / AMBIGUITIES_FILE
    ambiguities = _load(amb_path) if amb_path.exists() else rules_data.get("ambiguities", [])
    _validate(chunks_data, rules_data)

    doc_meta = chunks_data.get("document", {})
    document_id = doc_meta.get("id") or "regulation"
    first_meta = chunks_data["chunks"][0].get("metadata", {})
    academic_year = first_meta.get("academic_year") or cfg("ACADEMIC_YEAR")
    rules = rules_data.get("rules", [])
    model = get_embedder().model
    report = ImportReport(document_id=document_id, academic_year=academic_year)

    # Articles per page come from the structured rules (more reliable than headings)
    rule_articles: dict[int, set[str]] = defaultdict(set)
    rule_categories: dict[int, set[str]] = defaultdict(set)
    for r in rules:
        for p in r["pages"]:
            rule_articles[int(p)].add(str(r["article"]))
            rule_categories[int(p)].add(r["category"])

    # ---------------------------------------------------------------- pages
    name = f"pages:{document_id}"
    sha = _sha(chunks_data)
    if force or not _unchanged(name, sha, model):
        page_texts = {int(c["page"]): c["text"] for c in chunks_data["chunks"]}
        articles = assign_articles(page_texts, rule_articles)
        pages = [IndexedPage(number=n, text=t, articles=articles[n]) for n, t in sorted(page_texts.items())]
        title = doc_meta.get("name") or chunks_data["chunks"][0].get("title", document_id)
        source = doc_meta.get("source_file") or f"{document_id}.json"
        count = index_document_pages(document_id=document_id, source=source, title=title,
                                     academic_year=academic_year, origin="json", pages=pages)
        Document.objects.update_or_create(
            external_id=document_id,
            defaults=dict(filename=source, title=title, origin=Document.Origin.JSON,
                          academic_year=academic_year, sha256=sha, page_count=len(pages),
                          chunk_count=count, embed_model=model, status=Document.Status.READY,
                          error="", ingested_at=timezone.now()))
        _mark(name, sha, model, count)
        report.lines.append(f"pages: {len(pages)} pages -> {count} chunks")
    else:
        report.lines.append("pages: unchanged, skipped")

    # ---------------------------------------------------------------- rules
    name = f"rules:{document_id}"
    sha = _sha(rules)
    if force or not _unchanged(name, sha, model):
        ids, texts, metas = [], [], []
        for r in rules:
            pages = [int(p) for p in r["pages"]]
            ids.append(f"{document_id}::{r['id']}")
            texts.append(f"{r['id']} — article {r['article']} — {r['rule']}")
            metas.append({
                "kind": "rule", "document_id": document_id, "academic_year": academic_year,
                "rule_id": r["id"], "article": str(r["article"]), "pages": ",".join(map(str, pages)),
                "category": r["category"], "rule_type": r["rule_type"],
                "automatable": bool(r.get("automatable", False)), "rule": r["rule"],
                "citation": r["source_citation"],
                "lexical_text": f"{r['id']} article {r['article']} {r['rule']} "
                                f"{CATEGORY_KEYWORDS_FR.get(r['category'], '')}",
            })
        count = index_records(cfg("COLLECTION_RULES"), ids=ids, texts=texts, metadatas=metas,
                              replace_where={"document_id": document_id})
        with transaction.atomic():
            AcademicRule.objects.filter(document_id=document_id).exclude(
                rule_id__in=[r["id"] for r in rules]).delete()
            for r in rules:
                AcademicRule.objects.update_or_create(rule_id=r["id"], defaults=dict(
                    document_id=document_id, academic_year=academic_year, article=str(r["article"]),
                    pages=[int(p) for p in r["pages"]], category=r["category"], rule_type=r["rule_type"],
                    rule=r["rule"], source_citation=r["source_citation"],
                    authority=r.get("authority", ""), automatable=bool(r.get("automatable", False))))
        _mark(name, sha, model, count)
        report.lines.append(f"rules: {count} rules")
    else:
        report.lines.append("rules: unchanged, skipped")

    # ---------------------------------------------------------------- ambiguities
    name = f"ambiguities:{document_id}"
    sha = _sha(ambiguities)
    if force or not _unchanged(name, sha, model):
        ids, texts, metas = [], [], []
        for a in ambiguities:
            pages = [int(p) for p in a["pages"]]
            categories = set().union(*(rule_categories.get(p, set()) for p in pages)) if pages else set()
            ids.append(f"{document_id}::{a['id']}")
            texts.append(f"{a['issue']}. {a['details']} Handling: {a['handling']}")
            metas.append({
                "kind": "ambiguity", "document_id": document_id, "academic_year": academic_year,
                "amb_id": a["id"], "issue": a["issue"], "pages": ",".join(map(str, pages)),
                "details": a["details"], "handling": a["handling"],
                "lexical_text": f"{a['id']} {a['issue']} {a['details']} {keywords_for(categories)}",
            })
        count = index_records(cfg("COLLECTION_AMBIGUITIES"), ids=ids, texts=texts, metadatas=metas,
                              replace_where={"document_id": document_id})
        with transaction.atomic():
            Ambiguity.objects.filter(document_id=document_id).delete()
            Ambiguity.objects.bulk_create([
                Ambiguity(amb_id=a["id"], document_id=document_id, academic_year=academic_year,
                          issue=a["issue"], pages=[int(p) for p in a["pages"]],
                          details=a["details"], handling=a["handling"]) for a in ambiguities])
        _mark(name, sha, model, count)
        report.lines.append(f"ambiguities: {count} ambiguities")
    else:
        report.lines.append("ambiguities: unchanged, skipped")

    return report
