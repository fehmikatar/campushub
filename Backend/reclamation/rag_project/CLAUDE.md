# CLAUDE.md

Campus Hub reclamation service, part of the Campus Hub microservices platform (behind the Spring
Cloud API Gateway). Two functionalities:
- **Reclamations (main)**: students submit reclamations, administrators process them. DRF + MongoDB,
  `reclamations/` (see "Reclamations (MongoDB)" below).
- **Academic policy assistant**: a RAG answering questions about the ESPRIT Règlement de scolarité
  2026-2027 with article/page/rule-ID citations. Spec: `docs/campushub_rag_guide.md`. The original
  PDF is authoritative over any paraphrase.

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
- `config/api.py` = REST toolkit of the RAG apps: every RAG endpoint subclasses `ApiView` (Keycloak
  JWT checked by `config/auth.py` unless `public = True`, JSON errors, 405 with Allow), routes use
  `route()` (trailing slash optional). `config/views.py`: `/api/health`, JSON 404.
- **REST API only**: no templates, no admin, no login page. Do not add HTML pages or the Django
  admin back. `django.contrib.auth` / `sessions` remain for legacy local accounts only; neither
  API accepts local credentials (Keycloak Bearer only).
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

## Reclamations (MongoDB)

- **Databases** (`config/db_router.py`): `reclamations` models -> alias `mongodb` (official
  django-mongodb-backend; its major.minor must equal Django's), everything else (RAG apps, auth,
  contenttypes, sessions) -> `default` SQLite, for reads, writes AND migrations. No relation across
  the two. `MongoRouter` runs first (no collection for embedded models). Two commands:
  `migrate` and `migrate --database mongodb`. `ReclamationsConfig.default_auto_field` =
  `ObjectIdAutoField`; `DEFAULT_AUTO_FIELD` stays BigAutoField for the SQLite apps.
- **Layers**: `views.py` (ModelViewSet: permissions per action, validation, HTTP) -> `services.py`
  (all business rules). Never put rules in the viewset. Serializers use `MongoModelSerializer` /
  `EmbeddedModelSerializer` (django_mongodb_extensions); input serializers refuse protected or
  unknown fields (400), they never ignore them silently. Errors: `exceptions.py` (WorkflowError 400,
  ConcurrentUpdate 409, ReclamationGone 404, MongoDB unreachable 503, never internal details).
- **Authentication**: `reclamations/authentication.py` calls `config.auth.authenticate`; one verifier
  and signing-key cache for RAG + CRUD. `request.user` and `request.principal` are the same immutable
  Principal (sub, role, roles, username, is_authenticated). No automatic Django users, group queries,
  Basic/Session fallback, raw JWT retention or DEBUG bypass. AuthError maps unchanged to 401/403/503
  with DRF `detail` bodies and Bearer challenge for 401.
- **Permissions** (`permissions.py`): verified realm roles, highest only: ADMIN > ENSEIGNANT > ETUDIANT.
  ETUDIANT: create, own read/list, edit `STUDENT_EDITABLE_FIELDS` / delete only while `new`.
  ADMIN: read all (including legacy), `change-status`, `stats`; no create / student edit / delete.
  ENSEIGNANT: nothing. No role: 403. Another student's or unmapped legacy record: 404.
- **Identity**: `author_sub` is the validated Keycloak UUID string, the sole ownership source in
  queries, object checks, service mutations and conditional student writes. New history uses `by_sub`.
  Snapshots use verified preferred_username (bounded to 150) or sub; never match users by name/email.
  Nullable legacy `author_id` / `by_user_id` remain but confer no access; never guess a mapping.
  `0002_keycloak_identity` adds model state + ownership index without rewriting documents/history
  or counters, removing old indexes or changing SQLite. Test migrations only on isolated databases;
  never automatically migrate development data. README documents reviewed future mapping/backups.
  `setup_roles` keeps its original local group names for compatibility and grants no API access.
- **References**: `services.next_reference()` = `find_one_and_update($inc, upsert)` on the
  `counters` collection, one document per calendar year (Africa/Tunis). Never count()+1. The unique
  index on `reference` stays; on a duplicate, `resync_counter()` moves the counter past the highest
  existing number and the creation is retried.
- **Workflow invariants**: `services.TRANSITIONS` (new -> in_progress | rejected, in_progress ->
  resolved | rejected; resolved / rejected final). Final status needs a non-empty `admin_response`
  and sets `closed_at`. Every status change appends one `HistoryEntry`; creation writes the first
  (`from_status=None`). Only `change_status` changes `status` / `priority` / `admin_response`.
- **Concurrency**: no transactions (standalone MongoDB) and no `select_for_update` (no-op). Every
  write is `filter(pk=..., status=<status read>).update(...)` (compare and set); 0 rows -> reload
  -> 400 / 404 / 409. Keep it: history only changes with the status and no status comes back, so a
  matching status means an unchanged history. Use `QuerySet.update()` with explicit fields, never
  `save()` on an existing reclamation (it rewrites every field).
- Datetimes: MongoDB keeps milliseconds; use `services.now()` (truncated) for stored timestamps.

## Commands

```bash
python manage.py test                       # 207 tests (162 offline + 45 MongoDB): RAG offline (fake embedder + fake LLM),
                                            # reclamations offline + against a real MongoDB (skipped without one)
python manage.py migrate && python manage.py migrate --database mongodb
python manage.py setup_roles [--demo]       # optional legacy groups/users; no API access
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

Reclamations (`tests/reclamation_support.py`): `ApiTestCase` is SQLite-only (`databases =
{"default"}`), so any MongoDB access fails the test: use it for everything refused before MongoDB.
`MongoTestCase` (TransactionTestCase, both databases flushed after each test) runs on the real
server's `test_<MONGODB_NAME>` and is skipped with a reason when no server answers; never report
skipped MongoDB tests as passing integration tests. All API tests sign Keycloak tokens with
`tests/fake_keycloak.py`; never use force_authenticate for CRUD. `test_reclamations_auth` covers
DRF verification and local-auth rejection; `test_reclamations_identity` verifies legacy migration,
UUID ownership and history on the isolated MongoDB database. See README for split suite commands.

## Environment

Windows (PowerShell, `.venv\Scripts\activate`). Python 3.11+.
