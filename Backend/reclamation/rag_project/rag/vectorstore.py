"""ChromaDB access, shared by all collections.

Collections (names in settings.RAG):
    COLLECTION_PAGES        sub-chunks of document pages (PDFs and the prepared regulation)
    COLLECTION_RULES        one entry per structured rule (VAL001, PFE002, …)
    COLLECTION_AMBIGUITIES  one entry per known ambiguity (C01, …)

Every collection records the embedding model in its metadata; using another
model on an existing collection raises a RAGError (vectors would be incompatible).
"""

import json
import logging
import time
from dataclasses import dataclass, field

import chromadb
from chromadb.api.client import SharedSystemClient
from chromadb.errors import InternalError

from .config import cfg
from .exceptions import RAGError

log = logging.getLogger(__name__)

_clients: dict[str, chromadb.ClientAPI] = {}

# Chroma 1.5.x bug (reproduced in isolation, ~5% of runs): if a collection is read while it is
# empty (e.g. delete(where=…) right after creating it) and then written, the next query in the
# same process can fail with "Error creating hnsw segment reader: Nothing found on disk".
# The data on disk is fine: a freshly opened client reads it. Hence (1) delete_where never
# creates a collection and (2) search() reopens the client and retries once on that error.
STALE_INDEX_ERROR = "Nothing found on disk"


@dataclass
class Hit:
    id: str
    text: str
    metadata: dict = field(default_factory=dict)
    similarity: float | None = None  # cosine similarity (semantic hits only)


def get_client() -> chromadb.ClientAPI:
    """One PersistentClient per storage path, shared by the whole process."""
    path = str(cfg("CHROMA_DIR"))
    if path not in _clients:
        cfg("CHROMA_DIR").mkdir(parents=True, exist_ok=True)
        _clients[path] = chromadb.PersistentClient(path=path)
    return _clients[path]


def get_collection(name: str, embed_model: str):
    collection = get_client().get_or_create_collection(
        name=name,
        embedding_function=None,  # we always pass our own vectors
        metadata={"hnsw:space": "cosine", "embed_model": embed_model},
    )
    stored_model = (collection.metadata or {}).get("embed_model")
    if stored_model and stored_model != embed_model:
        raise RAGError(
            f"The '{name}' index was built with embedding model '{stored_model}' but the "
            f"current model is '{embed_model}'. Run: python manage.py rebuild_index"
        )
    return collection


def _existing(name: str):
    try:
        return get_client().get_collection(name)
    except Exception:
        return None


# ---------------------------------------------------------------- versions
# A tiny JSON file next to the DB lets every process (runserver, commands)
# know when a collection changed, so in-memory caches (BM25) can refresh.

def _versions_path():
    return cfg("CHROMA_DIR") / "_versions.json"


def touch(name: str) -> None:
    path = _versions_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        data = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    data[name] = time.time()
    path.write_text(json.dumps(data))


def version(name: str) -> float:
    try:
        return json.loads(_versions_path().read_text()).get(name, 0.0)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0.0


# ---------------------------------------------------------------- writes

def upsert(name: str, embed_model: str, *, ids: list[str], embeddings: list[list[float]],
           documents: list[str], metadatas: list[dict]) -> None:
    if not ids:
        return
    collection = get_collection(name, embed_model)
    batch = 1000
    for i in range(0, len(ids), batch):
        collection.upsert(ids=ids[i:i + batch], embeddings=embeddings[i:i + batch],
                          documents=documents[i:i + batch], metadatas=metadatas[i:i + batch])
    touch(name)


def delete_where(name: str, embed_model: str, where: dict) -> None:
    if _existing(name) is None:
        return  # nothing to delete, and creating it here would trigger the Chroma bug above
    get_collection(name, embed_model).delete(where=where)
    touch(name)


def reset(names: list[str]) -> None:
    """Delete whole collections."""
    for name in names:
        try:
            get_client().delete_collection(name)
        except Exception:
            pass  # did not exist
        touch(name)


# ---------------------------------------------------------------- reads

def _reopen() -> None:
    """Forget this process's Chroma client so the next call reloads the index from disk."""
    _clients.pop(str(cfg("CHROMA_DIR")), None)
    SharedSystemClient.clear_system_cache()  # only drops the cache; open clients keep working


def search(name: str, embed_model: str, query_embedding: list[float], top_k: int,
           where: dict | None = None) -> list[Hit]:
    try:
        return _search(name, embed_model, query_embedding, top_k, where)
    except InternalError as exc:
        if STALE_INDEX_ERROR not in str(exc):
            raise
        log.warning("Stale Chroma index for '%s'; reopening the client and retrying.", name)
        _reopen()
        return _search(name, embed_model, query_embedding, top_k, where)


def _search(name: str, embed_model: str, query_embedding: list[float], top_k: int,
            where: dict | None) -> list[Hit]:
    collection = _existing(name)
    if collection is None or collection.count() == 0:
        return []
    get_collection(name, embed_model)  # model compatibility check
    result = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        where=where or None,
        include=["documents", "metadatas", "distances"],
    )
    return [
        Hit(id=i, text=t, metadata=m, similarity=round(1.0 - float(d), 4))
        for i, t, m, d in zip(result["ids"][0], result["documents"][0],
                              result["metadatas"][0], result["distances"][0])
    ]


def get_all(name: str, where: dict | None = None) -> list[Hit]:
    collection = _existing(name)
    if collection is None:
        return []
    result = collection.get(where=where or None, include=["documents", "metadatas"])
    return [Hit(id=i, text=t, metadata=m)
            for i, t, m in zip(result["ids"], result["documents"], result["metadatas"])]


def count(name: str) -> int:
    collection = _existing(name)
    return collection.count() if collection else 0
