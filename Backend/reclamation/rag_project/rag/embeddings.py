"""Step 3 — turn text into vectors.

Uses the OpenAI-compatible /embeddings endpoint, which Ollama, OpenAI, Gemini
and most providers expose. The SAME embedder must be used for ingestion and
for queries, otherwise similarity search returns garbage.
"""

import logging
import time

import openai

from .config import cfg
from .exceptions import RAGError
from .ratelimit import retry_after

log = logging.getLogger(__name__)

# Ingestion waits out rate limits (Gemini free tier: 100 texts/minute) this many times per batch.
# A live question never waits: it fails fast with a clear message (API 503).
MAX_RATE_LIMIT_WAITS = 5
sleep = time.sleep  # swapped in tests
NOT_CONFIGURED = ("The embedding provider is not configured (EMBED_API_KEY is empty): the academic "
                  "assistant and document indexing are unavailable until an administrator sets it.")


class Embedder:
    def __init__(self, base_url: str, api_key: str, model: str, batch_size: int = 32):
        self.model = model
        self.base_url = base_url
        self.api_key = api_key or ""
        self.batch_size = batch_size
        # Empty key = not configured: each request raises RAGError (API 503), like an unreachable
        # provider; the OpenAI client itself would fail at construction (an unexpected 500).
        self._client = (openai.OpenAI(base_url=base_url, api_key=self.api_key, timeout=120, max_retries=2)
                        if self.api_key.strip() else None)

    def _embed(self, texts: list[str], wait_on_rate_limit: bool = False) -> list[list[float]]:
        waits = 0
        while True:
            try:
                return self._request(texts)
            except openai.RateLimitError as exc:
                delay = retry_after(exc)
                if not wait_on_rate_limit or waits >= MAX_RATE_LIMIT_WAITS:
                    raise RAGError(f"The embedding provider's rate limit or quota was reached. "
                                   f"Try again in about {delay:.0f} s.") from exc
                waits += 1
                log.warning("Embedding rate limit reached; waiting %.0f s (batch of %d texts, wait %d/%d).",
                            delay, len(texts), waits, MAX_RATE_LIMIT_WAITS)
                sleep(delay)

    def _request(self, texts: list[str]) -> list[list[float]]:
        """One API call. Rate-limit errors propagate (the caller decides to wait); others -> RAGError."""
        if self._client is None:
            raise RAGError(NOT_CONFIGURED)
        try:
            response = self._client.embeddings.create(model=self.model, input=texts)
        except openai.RateLimitError:
            raise
        except openai.APITimeoutError as exc:  # subclass of APIConnectionError: must come first
            raise RAGError(f"The embedding server at {self.base_url} took too long to answer.") from exc
        except openai.APIConnectionError as exc:
            raise RAGError(
                f"Cannot reach the embedding server at {self.base_url}. "
                "If you use Ollama, check that it is running (`ollama serve`)."
            ) from exc
        except openai.NotFoundError as exc:
            raise RAGError(
                f"Embedding model '{self.model}' not found. "
                f"With Ollama run: ollama pull {self.model}"
            ) from exc
        except openai.APIError as exc:
            raise RAGError(f"Embedding request failed: {exc}") from exc
        if len(response.data) != len(texts):
            raise RAGError(f"The embedding server returned {len(response.data)} vectors for {len(texts)} texts.")
        # Gemini omits "index" when it is 0 (protobuf default), so a missing index means 0
        return [item.embedding for item in sorted(response.data, key=lambda d: d.index or 0)]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            log.debug("Embedding batch %s-%s", start, start + len(batch))
            vectors.extend(self._embed(batch, wait_on_rate_limit=True))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]


_instance = None
_override = None


def get_embedder():
    """Return the shared embedder (created once per process)."""
    global _instance
    if _override is not None:
        return _override
    key = (cfg("EMBED_BASE_URL"), cfg("EMBED_API_KEY"), cfg("EMBED_MODEL"))
    if _instance is None or (_instance.base_url, _instance.api_key, _instance.model) != key:
        _instance = Embedder(*key, batch_size=cfg("EMBED_BATCH_SIZE"))
    return _instance


def set_embedder(embedder):
    """Swap the embedder (used by tests). Pass None to restore the real one."""
    global _override
    _override = embedder
