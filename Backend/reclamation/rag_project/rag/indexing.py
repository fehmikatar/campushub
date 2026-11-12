"""Write records into the collections (used by both PDF and JSON ingestion)."""

from dataclasses import dataclass

from . import vectorstore
from .chunker import split_text
from .config import cfg
from .embeddings import get_embedder
from .loader import clean_text


@dataclass
class IndexedPage:
    number: int
    text: str            # cleaned full page text (the "parent" sent to the LLM)
    articles: list[str]


def index_document_pages(*, document_id: str, source: str, title: str, academic_year: str,
                         origin: str, pages: list[IndexedPage]) -> int:
    """Split pages into overlapping sub-chunks, embed them, replace the document's old chunks.

    Small chunks are what we search; each carries its full page in `page_text`
    so the LLM always receives whole pages (tables and lists stay intact).
    """
    ids, documents, metadatas = [], [], []
    index = 0
    for page in pages:
        text = clean_text(page.text)
        if not text:
            continue
        for chunk in split_text(text, cfg("CHUNK_SIZE"), cfg("CHUNK_OVERLAP")):
            ids.append(f"{document_id}::p{page.number}::c{index}")
            documents.append(chunk)
            metadatas.append({
                "kind": "page",
                "document_id": document_id,
                "source": source,
                "title": title,
                "page": page.number,
                "chunk_index": index,
                "parent_id": f"{document_id}::p{page.number}",
                "articles": ", ".join(page.articles),
                "academic_year": academic_year,
                "origin": origin,
                "page_text": text,
            })
            index += 1

    embedder = get_embedder()
    embeddings = embedder.embed_documents(documents) if documents else []
    name = cfg("COLLECTION_PAGES")
    vectorstore.delete_where(name, embedder.model, {"document_id": document_id})
    vectorstore.upsert(name, embedder.model, ids=ids, embeddings=embeddings,
                       documents=documents, metadatas=metadatas)
    return len(ids)


def index_records(collection: str, *, ids: list[str], texts: list[str], metadatas: list[dict],
                  replace_where: dict) -> int:
    """Embed `texts` and replace everything matching `replace_where` in `collection`."""
    embedder = get_embedder()
    embeddings = embedder.embed_documents(texts) if texts else []
    vectorstore.delete_where(collection, embedder.model, replace_where)
    vectorstore.upsert(collection, embedder.model, ids=ids, embeddings=embeddings,
                       documents=texts, metadatas=metadatas)
    return len(ids)
