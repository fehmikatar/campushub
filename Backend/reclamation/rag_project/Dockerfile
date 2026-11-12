# syntax=docker/dockerfile:1
# Reclamation Service (Django: reclamations on MongoDB + academic RAG on SQLite / ChromaDB).
# Image for LOCAL DEVELOPMENT and team testing with the root docker-compose.yml, not a production image.
# Build context = this folder (Backend/reclamation/rag_project). Nothing has to be installed or built
# on the host. Python 3.14 = the version the test suite runs on.

ARG PYTHON_IMAGE=python:3.14-slim-trixie

# ---- 1. Python dependencies, in a virtual environment copied into the final image --------------
# Wheels only (no compiler in the image), exact versions from constraints-docker.txt. PyMuPDF,
# ChromaDB and cryptography ship their native code inside their wheels: no system package needed.
FROM ${PYTHON_IMAGE} AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt constraints-docker.txt /tmp/
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --only-binary=:all: -r /tmp/requirements.txt -c /tmp/constraints-docker.txt

# ---- 2. Runtime ---------------------------------------------------------------------------------
FROM ${PYTHON_IMAGE}
# tini = PID 1: forwards stop signals to docker/entrypoint.py and reaps child processes.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8087 \
    DJANGO_DB_PATH=/data/db.sqlite3 \
    RAG_CHROMA_DIR=/data/chroma \
    RAG_PDF_DIR=/data/pdfs \
    DJANGO_SECRET_KEY_FILE=/data/.django-secret-key

# Non-root user. /data = the only writable folder (named volume: SQLite, ChromaDB, uploaded PDFs,
# generated secret key). The regulation dataset stays in the image (/app/data/regulation, read-only).
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home --shell /usr/sbin/nologin app \
 && mkdir -p /data/chroma /data/pdfs \
 && chown -R app:app /data

COPY --from=deps /opt/venv /opt/venv
WORKDIR /app
COPY . .
RUN python -m compileall -q /app

USER app
EXPOSE 8087
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=6 CMD ["python", "/app/docker/healthcheck.py"]
ENTRYPOINT ["tini", "--", "python", "/app/docker/entrypoint.py"]
