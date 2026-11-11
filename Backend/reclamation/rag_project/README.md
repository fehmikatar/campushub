# Campus Hub — ESPRIT regulation assistant (Django + ChromaDB RAG, REST API)

Students ask questions about the **ESPRIT Règlement de scolarité 2026-2027**. Answers are grounded
only in the regulation, cite article + page (+ rule ID), flag the document's known ambiguities,
and are never presented as official decisions.

This service is a **JSON REST API only** (no HTML pages, no Django admin). It is meant to be called
by the Campus Hub frontend through the API Gateway.

```
INGESTION   data/regulation/*.json ──► pages collection   (22 pages → sub-chunks, article + page metadata)
                                   ──► rules collection   (156 structured rules: VAL001, PFE002…)
                                   ──► ambiguities        (11 known contradictions/gaps: C01…C11)
            data/pdfs/*.pdf        ──► pages collection   (optional extra docs: syllabus, guides)

QUERY       question ─► embed + BM25 on each collection ─► RRF fusion ─► evidence package
            (full pages + rules + relevant ambiguities) ─► LLM with the guide's system prompt
            ─► citation verification ─► answer + evidence + citation_check + official_decision=false
```

## 1. Models

Any OpenAI-compatible provider works; everything is set in `.env` (never committed, see `.env.example`).

**Google Gemini (current setup)**: create a key at <https://aistudio.google.com>, then in `.env`:

```ini
EMBED_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
EMBED_API_KEY=<your key>
EMBED_MODEL=gemini-embedding-001     # retrieval eval: pages 97%, rules 87%, ambiguities 100%
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_API_KEY=<your key>
LLM_MODEL=gemini-3.8-flash           # gemini-2.5-* are no longer available to new users
LLM_REASONING_EFFORT=low             # Gemini 3 thinks inside the token budget
```

Free tier: 100 embedded texts/minute, so `ingest_regulation` (206 texts) pauses by itself and
takes about 2–3 minutes. Answers take about 5–15 s.

**Local and free, with Ollama** (slow without a GPU):

```bash
ollama pull bge-m3      # multilingual embeddings (French ↔ English rules)
ollama pull llama3.2    # chat model (try mistral or qwen2.5:7b for better French)
```

The prompt is about 4k tokens: start Ollama with `OLLAMA_CONTEXT_LENGTH=8192` so it is not truncated.
Changing `EMBED_MODEL` requires `python manage.py rebuild_index --yes`.

## 2. Setup (Windows PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py ingest_regulation      # imports the 3 JSON files from data/regulation/
python manage.py eval_rag               # retrieval quality on 20 test questions
python manage.py runserver              # API on http://127.0.0.1:8000/api/...
```

Linux / macOS: `source .venv/bin/activate` and `cp .env.example .env`.

## Commands

| Command | What it does |
|---|---|
| `ingest_regulation [--force]` | Import page chunks, rules, ambiguities (skips unchanged files) |
| `ingest_pdfs [paths] [--force] [--prune]` | Index extra PDFs from `data/pdfs/` |
| `rebuild_index --yes` | Wipe all vectors and re-import everything (**after changing `EMBED_MODEL`**) |
| `ask "question" [--evidence] [--year 2026-2027]` | Ask in the terminal; `--evidence` shows retrieval only |
| `eval_rag [-v 2] [--semantic-weight W] [--lexical-weight W]` | Recall of pages / rules / ambiguities on `data/regulation/eval_questions.json` |
| `test` | 43 tests, no Ollama/API needed |

## REST API

JSON in, JSON out. Every path works **with or without** a trailing slash.

| Method | Endpoint | Body / params | Success |
|---|---|---|---|
| `POST` | `/api/academic-assistant/ask` | `{"question": "...", "conversation_id": 3, "academic_year": "2026-2027"}` (last two optional) | 200 answer + evidence |
| `GET` | `/api/conversations` | `?limit=20&offset=0` (limit 1–100) | 200 `{count, limit, offset, results}` |
| `POST` | `/api/conversations` | `{"title": "..."}` (optional) | 201 conversation |
| `GET` | `/api/conversations/{id}` | | 200 conversation + all messages (with their evidence) |
| `PUT` / `PATCH` | `/api/conversations/{id}` | `{"title": "..."}` | 200 conversation |
| `DELETE` | `/api/conversations/{id}` | | 204 |
| `GET` | `/api/documents` | | 200 indexed documents (regulation + PDFs) |
| `POST` | `/api/documents` | `multipart/form-data`, field `file` = a PDF (max `RAG_MAX_UPLOAD_MB`) | 201 document (indexed) |
| `GET` | `/api/documents/{id}` | | 200 document |
| `PUT` | `/api/documents/{id}` | `multipart/form-data`, field `file` = the new PDF | 200 document (re-indexed) |
| `DELETE` | `/api/documents/{id}` | | 204 (file, row and vectors deleted) |
| `GET` | `/api/academic-rules` | `category`, `article`, `page`, `rule_type`, `automatable`, `academic_year`, `q` | 200 `{count, results}` |
| `GET` | `/api/academic-rules/{rule_id}` | | 200 rule + ambiguities on the same pages |
| `GET` | `/api/ambiguities` | | 200 the 11 flagged ambiguities |
| `GET` | `/api/ambiguities/{amb_id}` | | 200 ambiguity + rules on the same pages |
| `GET` | `/api/health` | | 200 `{"status": "UP", "indexed": true, "index": {...}}` |

- **Rules and ambiguities are read-only**: they are paraphrases of the official PDF, loaded and
  embedded by `ingest_regulation`. The regulation document itself cannot be replaced or deleted
  through `/api/documents` (409); only uploaded PDFs can.
- **Errors** always look like `{"error": "message"}`:
  `400` invalid input · `404` unknown id or URL · `405` method not allowed (with `Allow` header) ·
  `409` conflict (file name exists, regulation is read-only) · `413` file too large ·
  `422` unusable PDF (not a PDF, encrypted, no text) · `503` embedding/LLM provider unavailable or
  nothing indexed yet · `500` unexpected (logged).
- **No CSRF / cookies**: callers authenticate with a JWT at the API Gateway (stateless).

Examples:

```bash
curl -X POST localhost:8000/api/academic-assistant/ask -H "Content-Type: application/json" \
     -d '{"question": "Mon PFE doit durer 26 ou 28 semaines ?"}'
curl -X POST localhost:8000/api/documents -F "file=@syllabus.pdf"
curl -X PUT  localhost:8000/api/documents/2 -F "file=@syllabus-v2.pdf"
curl -X PUT  localhost:8000/api/conversations/3 -H "Content-Type: application/json" -d '{"title": "PFE"}'
curl -X DELETE localhost:8000/api/conversations/3
```

Windows PowerShell (in a second terminal, while `runserver` is running). Keep `charset=utf-8` in the
content type, otherwise accents (é, è…) are not sent as UTF-8:

```powershell
$api = "http://127.0.0.1:8000/api"
Invoke-RestMethod "$api/health"
$body = @{ question = "Mon PFE doit durer 26 ou 28 semaines ?" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post "$api/academic-assistant/ask" -ContentType "application/json; charset=utf-8" -Body $body
$r.answer; $r.evidence.ambiguities; $r.citation_check
Invoke-RestMethod "$api/conversations/$($r.conversation_id)"
Invoke-RestMethod -Method Put "$api/conversations/$($r.conversation_id)" -ContentType "application/json; charset=utf-8" -Body (@{ title = "PFE" } | ConvertTo-Json)
Invoke-RestMethod -Method Delete "$api/conversations/$($r.conversation_id)"
curl.exe -X POST "$api/documents" -F "file=@C:\path\to\guide.pdf"     # curl.exe, not curl (alias)
try { Invoke-RestMethod "$api/conversations/999" } catch { $_.ErrorDetails.Message }   # see an error body
```

Look inside ChromaDB, and see what the search retrieves without calling the LLM:

```powershell
python manage.py shell -c "from rag import vectorstore as v; print({n: v.count(n) for n in ('source_chunks', 'academic_rules', 'ambiguities')})"
python manage.py ask "Je peux sortir de la salle pendant l'examen ?" --evidence
```

Ask response:

```json
{
  "conversation_id": 3,
  "answer": "Le document indique 28 semaines (p. 5), au moins six mois (p. 12) et 26 semaines (p. 14)… [Art. 7.10, p. 12; PFE002]",
  "academic_year": "2026-2027",
  "official_decision": false,
  "evidence": {
    "pages": [{"page": 12, "articles": ["7.9", "7.10"], "text": "…", "excerpt": "…", "cited": true}],
    "rules": [{"rule_id": "PFE002", "article": "7.10", "pages": [12], "text": "…", "cited": true}],
    "ambiguities": [{"amb_id": "C01", "pages": [5, 12, 14], "details": "…", "handling": "…"}]
  },
  "citation_check": {"verified": true, "cited_pages": [12], "cited_rules": ["PFE002"], "warnings": []}
}
```

## How retrieval works

- **Small-to-big:** pages are split into ~375-token sub-chunks (overlap ~75) for search, but the LLM
  always receives the **whole page**, so tables and lists stay intact.
- **Hybrid:** semantic search (bge-m3) + keyword search (BM25, accent-insensitive, light French
  stemming) are merged with Reciprocal Rank Fusion. Rules get French keywords per category
  (`regulation/keywords.py`) because the rule texts are English paraphrases.
- **Ambiguities** are attached only if they match the question **and** share a page with the evidence.
- **Year filter:** every vector carries `academic_year`; queries filter on it.
- **Table of contents** (p. 2) is never used as evidence: its numbering differs from the body (C04).
- **Citation check:** cited pages / rule IDs must exist in the retrieved evidence; otherwise
  `citation_check.verified = false` with warnings (for the client to display).

## Tuning

Run `python manage.py eval_rag -v 2` after any change. Typical levers:
`RAG_TOP_RULES`, `RAG_TOP_PAGES`, `RAG_SEMANTIC_WEIGHT` / `RAG_LEXICAL_WEIGHT`,
`RAG_AMBIGUITY_MIN_SIMILARITY`, chunk size (+ `ingest_regulation --force`).
Add real student questions to `data/regulation/eval_questions.json`.

## Not done yet (needs input)

- `POST /api/recommendations/` — needs `campushub_recommendation_engine.py` (referenced by the
  guide, not in this repo) and an authorized student snapshot from the Enrollment/Evaluation services.
- Authentication — in Campus Hub the API Gateway validates the JWT. This service does not check it
  yet: conversations are not tied to a user, and `/api/documents` writes should be restricted to
  the `ADMIN` role. Next step: validate the Keycloak JWT here (like the Evaluation Service).
- Gateway route + Eureka registration + Dockerfile.
- Reranking with a cross-encoder (e.g. bge-reranker) — RRF is the current ranking step.
