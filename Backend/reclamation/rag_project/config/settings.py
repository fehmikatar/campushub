"""
Django settings for the RAG project.

All environment-specific values (secrets, model names, paths) come from a
`.env` file at the project root. Copy `.env.example` to `.env` to start.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.getenv(key, default)


def env_bool(key, default=False):
    return env(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_int(key, default):
    return int(env(key, default))


def env_float(key, default):
    return float(env(key, default))


# --------------------------------------------------------------------------
# Core Django
# --------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY", "django-insecure-change-me-in-production")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [h for h in env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

# REST API only: no admin, templates, sessions or static files. Callers authenticate with a
# JWT at the API Gateway (stateless), so there is no cookie session and no CSRF middleware.
INSTALLED_APPS = [
    "documents",   # Document model, PDF upload/ingestion, /api/documents
    "regulation",  # ESPRIT regulation dataset: rules, ambiguities, ingest_regulation, /api/academic-rules
    "rag",         # Pure service layer: chunk -> embed -> store -> hybrid retrieve -> generate -> verify
    "chat",        # Conversations + /api/academic-assistant/ask
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
# URLs work with or without a trailing slash (see config.api.route); never redirect a POST.
APPEND_SLASH = False

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Tunis"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"rag": {"handlers": ["console"], "level": env("RAG_LOG_LEVEL", "INFO")}},
}

# --------------------------------------------------------------------------
# RAG configuration
# --------------------------------------------------------------------------
# Every provider is reached through the OpenAI-compatible API, so the same
# code works with Ollama (local), OpenAI, Gemini, Groq, OpenRouter, ...
# Just change BASE_URL / API_KEY / MODEL in .env.
RAG = {
    # Extra PDFs (syllabus, guides…) for `ingest_pdfs` and POST /api/documents
    "PDF_DIR": BASE_DIR / env("RAG_PDF_DIR", "data/pdfs"),
    "MAX_UPLOAD_MB": env_int("RAG_MAX_UPLOAD_MB", 20),
    # Prepared regulation dataset (page chunks, rules, ambiguities) for `ingest_regulation`
    "REGULATION_DIR": BASE_DIR / env("RAG_REGULATION_DIR", "data/regulation"),
    # ChromaDB persistent storage: 3 collections
    "CHROMA_DIR": BASE_DIR / env("RAG_CHROMA_DIR", "data/chroma"),
    "COLLECTION_PAGES": env("RAG_COLLECTION_PAGES", "source_chunks"),
    "COLLECTION_RULES": env("RAG_COLLECTION_RULES", "academic_rules"),
    "COLLECTION_AMBIGUITIES": env("RAG_COLLECTION_AMBIGUITIES", "ambiguities"),
    # Default academic year used to filter retrieval
    "ACADEMIC_YEAR": env("RAG_ACADEMIC_YEAR", "2026-2027"),
    # Chunking in characters (~4 chars ≈ 1 token): 1500/300 ≈ 375/75 tokens
    "CHUNK_SIZE": env_int("RAG_CHUNK_SIZE", 1500),
    "CHUNK_OVERLAP": env_int("RAG_CHUNK_OVERLAP", 300),
    "EMBED_BATCH_SIZE": env_int("RAG_EMBED_BATCH_SIZE", 32),
    # Retrieval: candidates per search method, then fused (RRF) and trimmed
    "CANDIDATES": env_int("RAG_CANDIDATES", 20),
    "TOP_PAGES": env_int("RAG_TOP_PAGES", 4),          # full pages sent to the LLM
    "TOP_RULES": env_int("RAG_TOP_RULES", 6),          # structured rules sent to the LLM
    "TOP_AMBIGUITIES": env_int("RAG_TOP_AMBIGUITIES", 2),
    # Weights of the two rankings in Reciprocal Rank Fusion (tune with `manage.py eval_rag`)
    "SEMANTIC_WEIGHT": env_float("RAG_SEMANTIC_WEIGHT", 1.0),
    "LEXICAL_WEIGHT": env_float("RAG_LEXICAL_WEIGHT", 1.0),
    # Semantic hits below this cosine similarity are ignored (0 = keep all)
    "MIN_SIMILARITY": env_float("RAG_MIN_SIMILARITY", 0.0),
    # An ambiguity is attached only if this similar (or keyword-matched) AND it shares a page with the evidence
    "AMBIGUITY_MIN_SIMILARITY": env_float("RAG_AMBIGUITY_MIN_SIMILARITY", 0.5),
    # How many past messages of the conversation are sent to the LLM
    "HISTORY_MESSAGES": env_int("RAG_HISTORY_MESSAGES", 4),
    # Embeddings provider (OpenAI-compatible)
    "EMBED_BASE_URL": env("EMBED_BASE_URL", "http://localhost:11434/v1"),
    "EMBED_API_KEY": env("EMBED_API_KEY", "ollama"),
    "EMBED_MODEL": env("EMBED_MODEL", "bge-m3"),
    # LLM provider (OpenAI-compatible)
    "LLM_BASE_URL": env("LLM_BASE_URL", "http://localhost:11434/v1"),
    "LLM_API_KEY": env("LLM_API_KEY", "ollama"),
    "LLM_MODEL": env("LLM_MODEL", "llama3.2"),
    "LLM_TEMPERATURE": env_float("LLM_TEMPERATURE", 0.1),
    # Thinking models count hidden reasoning in this budget: keep room above the ~300-token answer
    "LLM_MAX_TOKENS": env_int("LLM_MAX_TOKENS", 2048),
    "LLM_TIMEOUT": env_float("LLM_TIMEOUT", 120),
    # Optional "none" / "low" / "medium" / "high" for thinking models (Gemini, OpenAI o-series).
    # Empty = not sent, for providers that reject the parameter.
    "LLM_REASONING_EFFORT": env("LLM_REASONING_EFFORT", "").strip(),
}
