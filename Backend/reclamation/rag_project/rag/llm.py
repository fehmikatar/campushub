"""Step 7 — generate the answer with an LLM (OpenAI-compatible chat API)."""

import logging
import re

import openai

from .config import cfg
from .exceptions import RAGError
from .ratelimit import retry_after

log = logging.getLogger(__name__)

THINK_TAGS = re.compile(r"<think>.*?</think>", re.DOTALL)  # reasoning models (qwen3, deepseek-r1)
# Thinking models (Gemini 3, o-series…) count their hidden reasoning in max_tokens, so an answer
# can be cut mid-sentence. On finish_reason == "length" we retry once with this much more room.
TRUNCATION_RETRY_FACTOR = 4
TRUNCATED_NOTE = "\n\n(Réponse tronquée : limite de longueur atteinte. / Answer truncated: length limit reached.)"
NOT_CONFIGURED = ("The LLM provider is not configured (LLM_API_KEY is empty): the academic assistant "
                  "is unavailable until an administrator sets it.")


class LLM:
    def __init__(self, base_url: str, api_key: str, model: str, temperature: float = 0.1,
                 max_tokens: int = 2048, timeout: float = 120, reasoning_effort: str = ""):
        self.base_url = base_url
        self.api_key = api_key or ""
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.reasoning_effort = reasoning_effort  # "" = not sent (providers that do not support it)
        # Empty key = not configured: each question raises RAGError (API 503), never a client error
        self._client = (openai.OpenAI(base_url=base_url, api_key=self.api_key, timeout=timeout, max_retries=1)
                        if self.api_key.strip() else None)

    def chat(self, messages: list[dict]) -> str:
        choice = self._complete(messages, self.max_tokens)
        if choice.finish_reason == "length":
            log.warning("LLM answer hit max_tokens=%d; retrying with %d.",
                        self.max_tokens, self.max_tokens * TRUNCATION_RETRY_FACTOR)
            choice = self._complete(messages, self.max_tokens * TRUNCATION_RETRY_FACTOR)
        text = THINK_TAGS.sub("", choice.message.content or "").strip()
        if choice.finish_reason == "length":
            log.warning("LLM answer still truncated; returning it with a notice.")
            text += TRUNCATED_NOTE
        return text

    def _complete(self, messages: list[dict], max_tokens: int):
        if self._client is None:
            raise RAGError(NOT_CONFIGURED)
        extra = {"reasoning_effort": self.reasoning_effort} if self.reasoning_effort else {}
        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=max_tokens,
                **extra,
            )
        except openai.APITimeoutError as exc:  # subclass of APIConnectionError: must come first
            raise RAGError("The LLM took too long to answer. Try again or use a smaller model.") from exc
        except openai.APIConnectionError as exc:
            raise RAGError(
                f"Cannot reach the LLM server at {self.base_url}. "
                "If you use Ollama, check that it is running (`ollama serve`)."
            ) from exc
        except openai.RateLimitError as exc:
            raise RAGError(f"The LLM provider's rate limit or quota was reached. "
                           f"Try again in about {retry_after(exc):.0f} s.") from exc
        except openai.NotFoundError as exc:
            raise RAGError(
                f"LLM model '{self.model}' not found or no longer available. "
                f"Check LLM_MODEL in .env (with Ollama: ollama pull {self.model})."
            ) from exc
        except openai.APIError as exc:
            raise RAGError(f"LLM request failed: {exc}") from exc
        if not response.choices:
            raise RAGError("The LLM returned no answer.")
        return response.choices[0]


_instance = None
_override = None


def _settings() -> dict:
    return dict(base_url=cfg("LLM_BASE_URL"), api_key=cfg("LLM_API_KEY"), model=cfg("LLM_MODEL"),
                temperature=cfg("LLM_TEMPERATURE"), max_tokens=cfg("LLM_MAX_TOKENS"),
                timeout=cfg("LLM_TIMEOUT"), reasoning_effort=cfg("LLM_REASONING_EFFORT"))


def get_llm():
    """Return the shared LLM client (re-created when its settings change)."""
    global _instance
    if _override is not None:
        return _override
    wanted = _settings()
    if _instance is None or {k: getattr(_instance, k) for k in wanted} != wanted:
        _instance = LLM(**wanted)
    return _instance


def set_llm(llm):
    """Swap the LLM (used by tests). Pass None to restore the real one."""
    global _override
    _override = llm
