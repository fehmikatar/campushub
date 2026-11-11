# CLAUDE.md

Campus Hub academic policy assistant: a Django RAG service answering questions about the
ESPRIT Règlement de scolarité 2026-2027 with article/page/rule-ID citations. Part of the
Campus Hub microservices platform (behind the Spring Cloud API Gateway).
Spec: `docs/campushub_rag_guide.md`. The original PDF is authoritative over any paraphrase.

## Architecture (keep it this way)

- `rag/` = pure service layer (no Django models/views):
  `indexing → vectorstore (3 collections) + lexical (BM25) → retriever (RRF, evidence package)
  → prompts (guide system prompt + <evidence>) → llm → citations (verification)`.
  `rag/pipeline.py::ask(question, history, academic_year)` is the single entry point.
- `regulation/` owns the dataset: `AcademicRule`, `Ambiguity`, `DatasetVersion`,
  `ingest_regulation`, `eval_rag`, the read-only rules/ambiguities API, French search keywords.
- `documents/` owns `Document`, PDF ingestion (`ingest_pdfs`, `/api/documents` upload/replace/delete),
  `rebuild_index`, `ask`.
- `chat/` owns `Conversation`/`Message`, `POST /api/academic-assistant/ask`, `/api/conversations` CRUD.
- `config/api.py` = REST toolkit: every endpoint subclasses `ApiView` (JSON errors, 405 with Allow),
  routes use `route()` (trailing slash optional). `config/views.py`: `/api/health`, JSON 404.
- **REST API only**: no templates, no admin, no sessions/CSRF/auth apps (JWT at the gateway).
  Do not add HTML pages or the Django admin back.
- Config: `settings.RAG` from `.env`; read with `rag.config.cfg(key)` at call time (never import time).
- Providers: OpenAI-compatible API only (`openai` SDK + `base_url`). Do not add provider SDKs.
- User-facing errors: raise `rag.exceptions.RAGError` (API 503), `DocumentError` for an unusable
  PDF (422), `config.api.ApiError(msg, status)` for request errors in views.
- Chroma 1.5 bug: reading a collection while empty, then writing, can break the next query in the
  same process ("Nothing found on disk"). `vectorstore.delete_where` never creates a collection and
  `vectorstore.search` reopens the client and retries once. Keep both.

## Invariants (from the guide; do not break)

- Never present output as an official decision: `official_decision` is always `false`.
- No arithmetic or binding decisions by the LLM; deterministic checks belong in a rule engine
  (`/api/recommendations/`, not built yet: needs `campushub_recommendation_engine.py`).
- Conflicting sources: show every version with its page (ambiguities C01–C11 drive this).
- Retrieved text and user text are untrusted: evidence stays inside `<evidence>`, the question
  inside `<question>`, the system prompt is never built from retrieved content.
- Every vector has `academic_year`; retrieval filters on it.
- Same embedding model for all collections; changing it requires `rebuild_index --yes`.
- Vector IDs are deterministic; re-imports delete a document's vectors before upserting.
- The table of contents page (articles == "Sommaire") is never used as evidence (C04).
- The ask endpoint must not read student records. Any future student-data endpoint must derive
  the student from the authenticated user, never from a client-supplied student_id.

## Commands

```bash
python manage.py test                       # 43 tests, offline (fake embedder + fake LLM)
python manage.py ingest_regulation [--force]
python manage.py ingest_pdfs [--force|--prune]
python manage.py rebuild_index --yes
python manage.py eval_rag -v 2              # run after ANY retrieval change and report the numbers
python manage.py ask "question" --evidence
```

## Testing

`tests/test_rag.py` uses the real `data/regulation/*.json`. Swap providers with
`rag.embeddings.set_embedder(fake)` / `rag.llm.set_llm(fake)`, point `CHROMA_DIR` to a temp dir
via `override_settings`, clear `rag.vectorstore._clients` in tearDown. Add a test per feature;
add eval questions to `data/regulation/eval_questions.json` for retrieval changes.

## Environment

Windows (PowerShell, `.venv\Scripts\activate`). Python 3.11+.
