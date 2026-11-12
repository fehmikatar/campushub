"""
Django settings for the RAG project.

All environment-specific values (secrets, model names, paths) come from a
`.env` file at the project root. Copy `.env.example` to `.env` to start.
"""

import os
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured
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


def env_path(key, default):
    """A file or folder setting. Unset or empty -> `default`. Relative paths are resolved against
    BASE_DIR; absolute ones (e.g. a Docker volume such as /app/data) are used as they are."""
    return BASE_DIR / ((env(key) or "").strip() or default)


# Same threshold as Django's own deployment check (`manage.py check --deploy`, security.W009)
SECRET_KEY_MIN_LENGTH = 50


def is_strong_secret_key(value: str) -> bool:
    return (len(value) >= SECRET_KEY_MIN_LENGTH and len(set(value)) >= 5
            and not value.startswith("django-insecure-"))


# --------------------------------------------------------------------------
# Core Django
# --------------------------------------------------------------------------
# Secure by default: with no .env (e.g. in a container) DEBUG is off and a real secret key is
# required. Local development switches DEBUG on in .env (see .env.example).
DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = (env("DJANGO_SECRET_KEY") or "").strip()
if not DEBUG and not is_strong_secret_key(SECRET_KEY):
    raise ImproperlyConfigured(
        f"DJANGO_SECRET_KEY must be a random value of at least {SECRET_KEY_MIN_LENGTH} characters "
        "when DJANGO_DEBUG is off. Generate one with: python -c \"from django.core.management.utils "
        "import get_random_secret_key; print(get_random_secret_key())\". "
        "For local development, copy .env.example to .env (it sets DJANGO_DEBUG=True)."
    )
SECRET_KEY = SECRET_KEY or "django-insecure-change-me-in-production"  # DEBUG on: local development only
ALLOWED_HOSTS = [h.strip() for h in (env("DJANGO_ALLOWED_HOSTS") or "localhost,127.0.0.1").split(",")
                 if h.strip()]

# RAG and DRF both use config.auth for stateless Keycloak authentication.
# Legacy local users/groups/sessions remain in SQLite for compatibility only.
INSTALLED_APPS = [
    "django.contrib.auth",          # legacy local users + groups
    "django.contrib.contenttypes",  # required by auth
    "django.contrib.sessions",      # legacy sessions (not API authentication)
    "django_mongodb_backend",       # MongoDB backend: management commands, embedded-model migrations
    "django_mongodb_extensions",    # MongoModelSerializer (ObjectId, embedded models) for DRF
    "rest_framework",
    "documents",     # Document model, PDF upload/ingestion, /api/documents
    "regulation",    # ESPRIT regulation dataset: rules, ambiguities, ingest_regulation, /api/academic-rules
    "rag",           # Pure service layer: chunk -> embed -> store -> hybrid retrieve -> generate -> verify
    "chat",          # Conversations + /api/academic-assistant/ask
    "reclamations",  # Student reclamations (MongoDB) + /api/reclamations
    "discovery",     # Eureka registration: `manage.py eureka_register` only, nothing at startup
]

# Bearer-only APIs do not authenticate with cookies.
MIDDLEWARE = [
    "config.middleware.RejectUnreadableBody",  # chunked body without Content-Length -> 411, never "empty"
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

ROOT_URLCONF = "config.urls"
# URLs work with or without a trailing slash (see config.api.route); never redirect a POST.
APPEND_SLASH = False

WSGI_APPLICATION = "config.wsgi.application"

# SQLite file. Default: db.sqlite3 in the project folder. In Docker: DJANGO_DB_PATH=/app/data/db.sqlite3
# (same volume as Chroma and the uploaded PDFs). SQLite does not create missing folders.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": env_path("DJANGO_DB_PATH", "db.sqlite3"),
    }
}

# MongoDB (official django-mongodb-backend): ONLY the `reclamations` app; see config/db_router.py.
# The connection opens on first use, so the RAG endpoints keep working while MongoDB is down
# (the reclamations API then answers 503).
MONGODB_URI = (env("MONGODB_URI") or "").strip() or "mongodb://localhost:27017"
MONGODB_NAME = (env("MONGODB_NAME") or "").strip() or "campushub"
DATABASES["mongodb"] = {
    "ENGINE": "django_mongodb_backend",
    "HOST": MONGODB_URI,  # a connection string: may contain credentials, never logged or returned
    "NAME": MONGODB_NAME,
    # Fail after 5 s (PyMongo's default is 30 s) when the server cannot be reached
    "OPTIONS": {"serverSelectionTimeoutMS": 5000},
    # `manage.py test` creates and drops this database; the development database is never used.
    "TEST": {"NAME": f"test_{MONGODB_NAME}"},
}
DATABASE_ROUTERS = [
    "django_mongodb_backend.routers.MongoRouter",  # embedded models get no collection of their own
    "config.db_router.DatabaseRouter",             # reclamations -> mongodb, everything else -> default
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Tunis"
USE_I18N = True
USE_TZ = True

# SQLite apps. The reclamations app overrides it with ObjectIdAutoField (reclamations/apps.py).
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# Reclamations API (Django REST Framework)
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["reclamations.authentication.KeycloakAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["reclamations.renderers.JSONRenderer"],  # JSON only, UTF-8 charset
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "reclamations.exceptions.exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# --------------------------------------------------------------------------
# Keycloak (realm campushub): every endpoint except /api/health needs a valid token (config/auth.py)
# --------------------------------------------------------------------------
# The expected "iss" claim, exactly as in the tokens: always the browser-side address, also in
# Docker. Empty = protected endpoints answer 503 (fail closed: this service has no legacy token mode).
KEYCLOAK_ISSUER_URI = (env("KEYCLOAK_ISSUER_URI") or "").strip()
# Where the realm's public keys are downloaded. Empty = <issuer>/protocol/openid-connect/certs.
# In Docker: http://keycloak:8080/realms/campushub/protocol/openid-connect/certs
KEYCLOAK_JWKS_URI = (env("KEYCLOAK_JWKS_URI") or "").strip()


# --------------------------------------------------------------------------
# Eureka (service discovery). Registration is done ONLY by `python manage.py eureka_register`,
# run next to the web server (like Notification's `php artisan eureka:register`): starting
# Django, tests or migrations never contact Eureka. See discovery/eureka.py.
# --------------------------------------------------------------------------
def env_text(key, default):
    return (env(key) or "").strip() or default


def env_port(key, default):
    value = env_text(key, str(default))
    if not value.isdigit() or not 1 <= int(value) <= 65535:
        raise ImproperlyConfigured(f"{key} must be a TCP port number (1-65535).")
    return int(value)


EUREKA = {
    # Like Forum (EUREKA_ENABLED !== 'false'): on unless explicitly switched off
    "ENABLED": env_text("EUREKA_ENABLED", "true").lower() not in {"false", "0", "no", "off"},
    "HOST": env_text("EUREKA_HOST", "localhost"),           # Docker later: eureka-server
    "PORT": env_port("EUREKA_PORT", 8761),
    "APP_NAME": env_text("EUREKA_APP_NAME", "reclamation-service"),  # registered as RECLAMATION-SERVICE
    "INSTANCE_HOST": env_text("EUREKA_INSTANCE_HOST", "localhost"),  # the name other services call
    "INSTANCE_PORT": env_port("EUREKA_INSTANCE_PORT", 8087),        # where this service listens
    "INSTANCE_IP": env_text("EUREKA_INSTANCE_IP", "127.0.0.1"),
}

# --------------------------------------------------------------------------
# API Gateway. The address clients use for this service's /api, i.e. the Gateway route, e.g.
# http://localhost:8080/api/v1/reclamation. The pagination links (next / previous) are built with
# it, so they never point at this service's own address. Empty = the address the request was sent
# to (direct access, tests). The Gateway sends no X-Forwarded-* headers to rebuild it from.
# --------------------------------------------------------------------------
def env_http_url(key, example):
    value = env_text(key, "").rstrip("/")
    if value:
        parts = urlsplit(value)
        if parts.scheme not in ("http", "https") or not parts.netloc or parts.query or parts.fragment:
            raise ImproperlyConfigured(f"{key} must be an http(s) URL without query, e.g. {example} (or empty).")
    return value


PUBLIC_API_URL = env_http_url("PUBLIC_API_URL", "http://localhost:8080/api/v1/reclamation")

# --------------------------------------------------------------------------
# Synchronous call Reclamation -> Course (reclamations/course_client.py, team rules
# "communication synchrone"): GET /courses/{id} with the caller's own token, one attempt, 3 s.
# COURSE_SERVICE_URL (e.g. http://course-service:8082 in Docker) replaces the Eureka lookup of
# COURSE-SERVICE (EUREKA_HOST / EUREKA_PORT above). Never through the Gateway.
# --------------------------------------------------------------------------
COURSE_SERVICE_URL = env_http_url("COURSE_SERVICE_URL", "http://localhost:8082")

# --------------------------------------------------------------------------
# Asynchronous events Reclamation -> Notification (reclamations/events.py): best effort, published
# after the MongoDB write, never declares a queue (Notification declares and consumes it). OFF by
# default: RECLAMATION_EVENTS_ENABLED=true AND a RABBITMQ_URL are both needed, only where the
# Notification consumer runs. Empty RABBITMQ_URL = no publishing (team rule).
# --------------------------------------------------------------------------
RABBITMQ_URL = env_text("RABBITMQ_URL", "")
RECLAMATION_EVENTS = {
    "ENABLED": env_bool("RECLAMATION_EVENTS_ENABLED", False),
    "QUEUE": env_text("RECLAMATION_EVENTS_QUEUE", "reclamation.events"),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "rag": {"handlers": ["console"], "level": env("RAG_LOG_LEVEL", "INFO")},
        "reclamations": {"handlers": ["console"], "level": env("RECLAMATIONS_LOG_LEVEL", "INFO")},
        "discovery": {"handlers": ["console"], "level": env("EUREKA_LOG_LEVEL", "INFO")},
        # RabbitMQ client: failures are reported once by reclamations.events (without the URL)
        "pika": {"level": "CRITICAL"},
    },
}

# --------------------------------------------------------------------------
# RAG configuration
# --------------------------------------------------------------------------
# Every provider is reached through the OpenAI-compatible API, so the same
# code works with Ollama (local), OpenAI, Gemini, Groq, OpenRouter, ...
# Just change BASE_URL / API_KEY / MODEL in .env.
RAG = {
    # Extra PDFs (syllabus, guides…) for `ingest_pdfs` and POST /api/documents
    "PDF_DIR": env_path("RAG_PDF_DIR", "data/pdfs"),
    "MAX_UPLOAD_MB": env_int("RAG_MAX_UPLOAD_MB", 20),
    # Prepared regulation dataset (page chunks, rules, ambiguities) for `ingest_regulation`
    "REGULATION_DIR": env_path("RAG_REGULATION_DIR", "data/regulation"),
    # ChromaDB persistent storage: 3 collections
    "CHROMA_DIR": env_path("RAG_CHROMA_DIR", "data/chroma"),
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
