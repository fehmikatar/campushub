# Campus Hub — Reclamation service (Django REST API)

Two functionalities in one Django service:

1. **Reclamations (main functionality)**: ESPRIT students submit academic or administrative
   reclamations (grade, exam, absence, registration, internship…) and administrators process them
   through a status workflow. Django REST Framework + **MongoDB**. See [Reclamations API](#reclamations-api-mongodb).
2. **Regulation assistant (RAG)**: students ask questions about the **ESPRIT Règlement de scolarité
   2026-2027**. Answers are grounded only in the regulation, cite article + page (+ rule ID), flag the
   document's known ambiguities, and are never presented as official decisions. SQLite + ChromaDB.

This service is a **JSON REST API only** (no HTML pages, no Django admin). It is meant to be called
by the Campus Hub frontend through the API Gateway. RAG and Reclamations both require
`Authorization: Bearer <Keycloak access token>`; only `GET /api/health` is public. See
[Authentication](#authentication-keycloak). Local Django accounts do not authorize either API.

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
copy .env.example .env                  # turns DJANGO_DEBUG on for local development
python manage.py migrate                         # SQLite: RAG apps + users, groups, sessions
python manage.py migrate --database mongodb      # MongoDB: the reclamations collection + indexes
python manage.py ingest_regulation      # imports the 3 JSON files from data/regulation/
python manage.py eval_rag               # retrieval quality on 20 test questions
python manage.py test                   # see "Commands" (MongoDB tests need a MongoDB server)
python manage.py runserver              # API on http://127.0.0.1:8000/api/...
# With Eureka (team port 8087): runserver 8087 + manage.py eureka_register, see "Eureka" below
# Behind the API Gateway: serve with waitress instead of runserver, see "API Gateway" below
```

The two `migrate` commands are both needed: each database only receives its own tables /
collections (`config/db_router.py`). MongoDB must be running for the second one and for the
reclamations API (see [Local MongoDB](#local-mongodb)); the RAG endpoints work without it.

Linux / macOS: `source .venv/bin/activate` and `cp .env.example .env`.

The `.env` matters: without it (or without `DJANGO_DEBUG=True`) the settings start in production
mode and refuse to load unless a real `DJANGO_SECRET_KEY` is set (see [Configuration](#configuration)).

## Commands

| Command | What it does |
|---|---|
| `ingest_regulation [--force]` | Import page chunks, rules, ambiguities (skips unchanged files) |
| `ingest_pdfs [paths] [--force] [--prune]` | Index extra PDFs from `data/pdfs/` |
| `rebuild_index --yes` | Wipe all vectors and re-import everything (**after changing `EMBED_MODEL`**) |
| `ask "question" [--evidence] [--year 2026-2027]` | Ask in the terminal; `--evidence` shows retrieval only |
| `eval_rag [-v 2] [--semantic-weight W] [--lexical-weight W]` | Recall of pages / rules / ambiguities on `data/regulation/eval_questions.json` |
| `setup_roles [--demo]` | Optional legacy local accounts/groups only; grants no API access |
| `eureka_register [--once]` | Register in Eureka and send heartbeats until Ctrl+C (deregisters); see [Eureka](#eureka-service-discovery) |
| `test` | 246 tests: no Ollama/API/Keycloak/Eureka/Gateway needed; never touches `db.sqlite3`, `data/chroma` or the development MongoDB database |
| `test tests.test_gateway` | the 8 API Gateway tests (chunked bodies, waitress, pagination links; 1 needs MongoDB) |
| `test tests.test_reclamations_offline` | 43 reclamations tests that need **no** MongoDB (routing, rules, roles, validation…) |
| `test tests.test_reclamations` | 36 reclamations tests against a **real MongoDB** (skipped, with the reason, when none is running) |
| `test tests.test_auth` | the 39 shared/RAG Keycloak authentication / security tests |
| `test tests.test_reclamations_auth` | 25 DRF Keycloak security tests, no MongoDB required |
| `test tests.test_reclamations_identity` | 9 real MongoDB ownership and migration tests |
| `test tests.test_conversation_ownership` | 10 private-conversation tests (RAG), no MongoDB required |
| `test tests.test_eureka` | 21 Eureka registration tests against a local fake Eureka (no real Eureka) |

## Configuration

Everything comes from environment variables (the `.env` file locally). Paths: relative = inside
this folder, absolute = used as is (e.g. a Docker volume), empty = the default.

| Variable | Local default | Container (Dockerfile comes later) |
|---|---|---|
| `DJANGO_DEBUG` | `True`, set by `.env.example` (**off** when missing or empty) | `False` |
| `DJANGO_SECRET_KEY` | `change-me`, accepted only while DEBUG is on | random, 50+ characters (required when DEBUG is off) |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | the service's Docker host name, `localhost`, `127.0.0.1` |
| `DJANGO_DB_PATH` | `db.sqlite3` in this folder | `/app/data/db.sqlite3` |
| `RAG_CHROMA_DIR` | `data/chroma` | `/app/data/chroma` |
| `RAG_PDF_DIR` | `data/pdfs` | `/app/data/pdfs` |
| `RAG_REGULATION_DIR` | `data/regulation` | the dataset shipped in the image, outside the volume |
| `EMBED_*`, `LLM_*` | see [Models](#1-models) | passed by the deployment (the API key is a secret) |
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8180/realms/campushub` | the same (see [Authentication](#authentication-keycloak)) |
| `KEYCLOAK_JWKS_URI` | empty (= derived from the issuer) | `http://keycloak:8080/realms/campushub/protocol/openid-connect/certs` |
| `MONGODB_URI` | `mongodb://localhost:27017` | e.g. `mongodb://mongo:27017` (a connection string: may contain credentials, so it is a secret) |
| `MONGODB_NAME` | `campushub` | to be agreed (Forum uses `campushub_forum`; `campushub_reclamations` would follow the same convention) |
| `EUREKA_ENABLED` | `true` (only `false`/`0`/`no`/`off` disable) | `true` |
| `EUREKA_HOST`, `EUREKA_PORT` | `localhost`, `8761` | `eureka-server`, `8761` |
| `EUREKA_APP_NAME` | `reclamation-service` (registered as `RECLAMATION-SERVICE`) | the same |
| `EUREKA_INSTANCE_HOST`, `EUREKA_INSTANCE_PORT` | `localhost`, `8087` | the service's Docker host name, `8087` |
| `EUREKA_INSTANCE_IP` | `127.0.0.1` (like Forum / Notification) | to be decided with the Dockerfile |
| `PUBLIC_API_URL` | empty (page links use the address the request was sent to) | the Gateway address of `/api`, e.g. `http://localhost:8080/api/v1/reclamation` |

- With DEBUG off, the service **refuses to start** if `DJANGO_SECRET_KEY` is missing or weak (the
  rule of `manage.py check --deploy`). Generate one with
  `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`.
- Keep SQLite, Chroma and the uploaded PDFs in **one** volume. The database records what is indexed
  (`ingest_regulation` skips files it already imported), so losing one without the other leaves an
  empty index that is not rebuilt automatically (fix: `ingest_regulation --force`).
- SQLite does not create folders: the folder of `DJANGO_DB_PATH` must exist (a Docker volume does).
  The Chroma and PDF folders are created when needed.
- The regulation dataset is read-only and versioned with the code. A volume mounted at `/app/data`
  would hide the image's `/app/data/regulation`, so `RAG_REGULATION_DIR` must then point elsewhere
  (decided with the Dockerfile).
- Production server: Gunicorn (Linux only; `requirements.txt` skips it on Windows, where
  `runserver` stays the local command):
  `gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 1 --threads 8`.
  One worker because Chroma's local storage and the in-memory keyword index belong to one process;
  threads because an answer mostly waits 4–15 s for the LLM. The port is not decided yet.
  **To verify with the Dockerfile:** behind the API Gateway, request bodies arrive chunked (see
  "API Gateway"); Django only reads bodies that have a `Content-Length`. waitress is verified to
  handle this; Gunicorn is not verified yet (if it passes chunked bodies through, every POST gets
  the 411 of `config/middleware.py`), so the container may have to use waitress too.

## Reclamations API (MongoDB)

### Architecture

```
HTTP ─► reclamations/urls.py   DRF router: /api/reclamations/…
     ─► reclamations/views.py  ModelViewSet: who may call what (permissions.py), input validation
                               (serializers.py), HTTP status codes (exceptions.py)
     ─► reclamations/services.py  business rules: references, workflow, history, statistics
     ─► MongoDB  collection `reclamations` (+ `counters`), official django-mongodb-backend

Users, role groups, sessions ─► SQLite (django.contrib.auth), like the RAG data
```

| Database | Alias | Holds |
|---|---|---|
| SQLite | `default` | RAG apps (chat, documents, regulation), `auth` users and groups, sessions, content types |
| MongoDB | `mongodb` | only the `reclamations` app: the `reclamations` collection and the `counters` collection |

`config/db_router.py` sends every `reclamations` model to `mongodb` and everything else to
`default`, for reads, writes **and migrations**; relations between the two databases are refused
(a reclamation stores the Keycloak UUID string, not a foreign key; legacy integer IDs remain).
`django_mongodb_backend.routers.MongoRouter` runs first so the embedded history entries get no
collection of their own. Versions: Django 6.1.3, django-mongodb-backend 6.1.0 (its major.minor
must match Django's), django-mongodb-extensions 0.3.0 (`MongoModelSerializer`), DRF 3.18.3,
PyMongo 4.19.0; tested with MongoDB 8.2 (standalone).

### Local MongoDB

Any MongoDB 7+ server on `MONGODB_URI` works. An already installed Windows MongoDB service on
`localhost:27017` is used as is. Otherwise, with Docker:

```powershell
docker run -d --name campushub-mongo -p 27017:27017 -v campushub-mongo-data:/data/db mongo:8.0
python manage.py shell -c "from django.db import connections; print(connections['mongodb'].database.command('ping'))"
```

(The root `docker-compose.yml` already has a `mongo` service, deliberately without a published
port; this service is not in the compose file yet.)

### Roles and authentication

DRF `reclamations.authentication.KeycloakAuthentication` calls the existing
`config.auth.authenticate(request)`. RAG and CRUD use the same RS256 verification, issuer and
required-claim checks, role extraction, JWKS cache and outage rules. DRF receives a lightweight
immutable principal as `request.user` and `request.principal` (`sub`, `role`, `roles`, `username`,
`is_authenticated`); `request.auth` is `None`. No Django user is created, no groups are queried,
and no raw JWT is retained on the principal. BasicAuthentication and SessionAuthentication have
been removed from CRUD. Sessions, passwords, local groups and superuser flags confer no API access.

Only `realm_access.roles` supplies roles; the highest recognized role wins:
`ADMIN` > `ENSEIGNANT` > `ETUDIANT`. Legacy `role` and unrelated Keycloak roles are ignored.
Multiple roles do not combine student and administrator privileges.

| Role | Can |
|---|---|
| `ETUDIANT` | create; list/read own; edit `subject`, `description`, `category`, `module` and delete only while `new` |
| `ADMIN` | list/read all including legacy records; change status, priority and `admin_response` through `change-status`; statistics. Cannot create, edit student fields or delete |
| `ENSEIGNANT` | nothing: 403 on every routed reclamations endpoint |
| valid token without a CampusHub role | 403 |
| anonymous | 401 with `WWW-Authenticate: Bearer`; 503 if authentication is unconfigured |

Another student's reclamation answers **404**. Ownership is enforced in the filtered queryset,
object permissions, mutation services and conditional student writes. `setup_roles [--demo]`
remains available only for legacy local accounts; it does not grant Keycloak roles or API access.

### Identity and existing-data migration

- `author_sub` is the lowercase, validated Keycloak `sub` UUID string and the sole ownership key.
  All new reclamations store it; the client cannot submit it.
- Every new history entry, including creation, stores the actor's UUID in `by_sub`.
- `author_username` / `by_username` are display snapshots from the verified `preferred_username`
  claim. Missing, blank, non-string or oversized names fall back to the validated `sub`. Names
  are never used for authorization; two users with the same name remain separate.
- `author_id` / `by_user_id` retain legacy local Django integers. They are nullable for new records,
  never derived from UUIDs, and never used for authorization. Existing history is retained with
  no invented `by_sub` values. APIs expose both the new and legacy fields during transition.

Migration `reclamations/0002_keycloak_identity.py` adds nullable UUID fields to the model state,
allows nullable legacy IDs, and adds `(author_sub, -created_at)` index `reclamation_sub_recent`.
ObjectIds, the unique reference index and all existing indexes remain. The backend's ordinary
`AddField` writes a default to every document, so the nullable `author_sub` uses
`SeparateDatabaseAndState` with no document write: absent fields read as `None`. Embedded fields
are recorded explicitly in migration state, with no separate collection or history rewrite.
See [Django migration operations](https://docs.djangoproject.com/en/6.1/ref/migration-operations/)
and [MongoDB model documentation](https://www.mongodb.com/docs/languages/python/django-mongodb/current/model-data/models/).

**Deployment:** back up MongoDB and review the migration, then apply it deliberately with
`python manage.py migrate --database mongodb`. This implementation only applied it in isolated
test databases; the real development database and `.env` were not changed. No SQLite schema
migration is needed. Do not run the old local-auth application against newly created UUID-owned
records. A schema rollback does not convert UUID owners into local IDs.

Legacy records without `author_sub` remain visible to administrators only. A later ownership
mapping requires an explicitly verified relation between the legacy account and a Keycloak UUID:
export an inventory, establish identity using authoritative account records and human review,
record evidence and approval, back up, then apply an audited conditional update only where the
legacy ID matches and `author_sub` is absent/null. Rehearse on a restored isolated copy, verify
counts and cross-user isolation, and retain a rollback audit. Never infer this relation from
matching usernames, emails, integer-to-UUID conversion or a student's request body. Do not change
historical actor identities without separate verified evidence. No mapping/backfill runs here;
unmapped records may safely remain administrative-only indefinitely.

### Endpoints

Every path works with or without the trailing slash. JSON in, JSON out (`charset=utf-8`).

| Method | Endpoint | Who | Body / params | Success |
|---|---|---|---|---|
| `GET` | `/api/reclamations/` | student (own), admin (all) | `status`, `category`, `priority`, `academic_year`, `search`, `ordering`, `page` | 200 `{count, next, previous, results}` |
| `POST` | `/api/reclamations/` | student | `category`, `subject`, `description`, `module` (optional), `academic_year` (optional) | 201 reclamation |
| `GET` | `/api/reclamations/{id}/` | student (own), admin | | 200 reclamation |
| `PUT` | `/api/reclamations/{id}/` | author, status `new` | `category`, `subject`, `description` (+ `module`) | 200 reclamation |
| `PATCH` | `/api/reclamations/{id}/` | author, status `new` | any of `category`, `subject`, `description`, `module` | 200 reclamation |
| `DELETE` | `/api/reclamations/{id}/` | author, status `new` | | 204 |
| `POST` | `/api/reclamations/{id}/change-status/` | admin | `status`, `comment`, `admin_response`, `priority` (last three optional) | 200 reclamation |
| `GET` | `/api/reclamations/stats/` | admin | `academic_year` (optional) | 200 counts |

- **Fields:** `category` ∈ `grade`, `exam`, `absence`, `registration`, `internship`,
  `administrative`, `other` · `subject` 5–150 characters · `description` 20–5000 · `module` ≤ 100 ·
  `academic_year` `YYYY-YYYY` with consecutive years (default: `RAG_ACADEMIC_YEAR`, 2026-2027) ·
  `status` ∈ `new`, `in_progress`, `resolved`, `rejected` · `priority` ∈ `low`, `normal` (default), `high`.
  Text is trimmed before the length checks.
- **Set by the service only:** `id` (24 hexadecimal characters), `reference`, `author_id`, `author_sub`,
  `author_username`, `status`, `priority`, `admin_response`, `history`, `created_at`, `updated_at`,
  `closed_at`. Sending one of them (or an unknown field) is refused with 400 instead of being
  silently ignored.
- **List:** 20 per page (`?page=2`); filters are exact matches; `search` is a case-insensitive
  substring of `subject`, `description` or `reference` (plain text, not a regex, max 100);
  `ordering` ∈ `created_at`, `-created_at` (default), `updated_at`, `-updated_at`, `priority`
  (low → high), `-priority`. An invalid value is a 400; an empty value means "not given".
- **References:** `REC-<year>-<00001>`, numbered per calendar year (Africa/Tunis) by an atomic
  counter (`counters` collection, `find_one_and_update` + `$inc` + upsert): unique even for
  simultaneous creations, never reused after a deletion. The unique index on `reference` is a
  second safeguard: if the counter was lost, it is moved past the highest existing number and
  the creation is retried (logged as a warning).
- **Errors** (DRF format): `400` `{"field": ["message"]}` or `{"detail": "..."}` (invalid input,
  invalid transition, edit after processing started) · `401` not authenticated · `403` role not
  allowed · `404` `{"detail": "Reclamation not found."}` (unknown, another student's) or, for an id
  that is not 24 hexadecimal characters, the service's `{"error": "No endpoint …"}` ·
  `409` changed by someone else in the meantime (reload and retry) · `415` not JSON ·
  `503` MongoDB unreachable, Keycloak signing keys unavailable, or missing Keycloak configuration. No stack trace, host name or connection string is ever returned.

### Status workflow

```
            ┌──────────► rejected (final)
            │
  new ──────┼──────────► in_progress ──────► resolved (final)
                               │
                               └───────────► rejected (final)
```

- Only an administrator changes the status, with `POST /api/reclamations/{id}/change-status/`
  (`status` required; `priority`, `admin_response` and `comment` can be set in the same call).
- Any other transition (e.g. `new → resolved`, anything from a final status) is a **400**.
- `resolved` and `rejected` need a non-empty `admin_response` (given now or earlier) and set
  `closed_at`.
- Every change appends a history entry `{from_status, to_status, by_sub, by_username, comment, at} (plus nullable legacy `by_user_id`)`;
  creation writes the first one (`from_status: null → new`). Editing the student's fields is not a
  status change and adds no entry.
- Concurrency: every write is a single-document conditional update on the status that was read
  ("compare and set"), atomic in MongoDB. Two administrators changing the same reclamation, or a
  student editing while an administrator starts processing, can never overwrite each other: the
  late request gets 409 (or 400 "processing has started").

### Examples

curl (bash; obtain student/admin access tokens from Keycloak first):

```bash
API=http://127.0.0.1:8000/api/reclamations
curl -H "Authorization: Bearer $STUDENT_TOKEN" -X POST $API/ -H "Content-Type: application/json" \
     -d '{"category": "grade", "subject": "Note de l examen final", "description": "Ma note de mathématiques semble erronée.", "module": "Mathématiques"}'
curl -H "Authorization: Bearer $STUDENT_TOKEN" "$API/?status=new&search=examen"
curl -H "Authorization: Bearer $STUDENT_TOKEN" -X PATCH $API/<id>/ -H "Content-Type: application/json" -d '{"subject": "Note de l examen de juin"}'
curl -H "Authorization: Bearer $ADMIN_TOKEN" -X POST $API/<id>/change-status/ -H "Content-Type: application/json" \
     -d '{"status": "in_progress", "priority": "high", "comment": "Vérification auprès de l enseignant"}'
curl -H "Authorization: Bearer $ADMIN_TOKEN" -X POST $API/<id>/change-status/ -H "Content-Type: application/json" \
     -d '{"status": "resolved", "admin_response": "La note a été corrigée."}'
curl -H "Authorization: Bearer $ADMIN_TOKEN" $API/stats/
```

Windows PowerShell (keep `charset=utf-8` so accents are sent as UTF-8):

```powershell
$api = "http://127.0.0.1:8000/api/reclamations"
# Obtain tokens as shown in "Authentication (Keycloak)" below, once for each role.
$studentHeaders = @{ Authorization = "Bearer $studentToken" }
$adminHeaders = @{ Authorization = "Bearer $adminToken" }
$teacherHeaders = @{ Authorization = "Bearer $teacherToken" }
$json = "application/json; charset=utf-8"
$body = @{ category = "grade"; subject = "Note de l'examen final"; description = "Ma note de mathématiques semble erronée."; module = "Mathématiques" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post "$api/" -Headers $studentHeaders -ContentType $json -Body $body
$r.reference; $r.history
Invoke-RestMethod "$api/?search=examen" -Headers $studentHeaders
Invoke-RestMethod -Method Post "$api/$($r.id)/change-status/" -Headers $adminHeaders -ContentType $json -Body (@{ status = "in_progress"; priority = "high" } | ConvertTo-Json)
Invoke-RestMethod -Method Post "$api/$($r.id)/change-status/" -Headers $adminHeaders -ContentType $json -Body (@{ status = "resolved"; admin_response = "La note a été corrigée." } | ConvertTo-Json)
Invoke-RestMethod "$api/stats/" -Headers $adminHeaders
try { Invoke-RestMethod "$api/" -Headers $teacherHeaders } catch { $_.ErrorDetails.Message }   # 403
```

Postman: *Authorization* tab → *Basic Auth* (`etudiant1` / `campushub123`); *Body* → *raw* → *JSON*.

A reclamation:

```json
{
  "id": "6553f1a2b3c4d5e6f7a8b9c0",
  "reference": "REC-2026-00001",
  "author_id": null,
  "author_sub": "11111111-1111-4111-8111-111111111111",
  "author_username": "etudiant1",
  "category": "grade",
  "subject": "Note de l'examen final",
  "description": "Ma note de mathématiques semble erronée.",
  "module": "Mathématiques",
  "academic_year": "2026-2027",
  "status": "resolved",
  "priority": "high",
  "admin_response": "La note a été corrigée.",
  "history": [
    {"from_status": null, "to_status": "new", "by_user_id": null, "by_sub": "11111111-1111-4111-8111-111111111111", "by_username": "etudiant1", "comment": "", "at": "2026-11-11T17:50:08.590000+01:00"},
    {"from_status": "new", "to_status": "in_progress", "by_user_id": null, "by_sub": "99999999-9999-4999-8999-999999999999", "by_username": "admin1", "comment": "", "at": "2026-11-11T17:52:30.104000+01:00"},
    {"from_status": "in_progress", "to_status": "resolved", "by_user_id": null, "by_sub": "99999999-9999-4999-8999-999999999999", "by_username": "admin1", "comment": "", "at": "2026-11-11T18:03:12.877000+01:00"}
  ],
  "created_at": "2026-11-11T17:50:08.590000+01:00",
  "updated_at": "2026-11-11T18:03:12.877000+01:00",
  "closed_at": "2026-11-11T18:03:12.877000+01:00"
}
```

`GET /api/reclamations/stats/` returns `{"academic_year": null, "total": 4, "by_status": {...},
"by_category": {...}, "by_priority": {...}}`, every known value listed (0 when none), computed by
one MongoDB aggregation (`$facet`).

### Tests

```powershell
python manage.py test --noinput                       # 246 total with MongoDB: 200 offline + 46 integration
python manage.py check
# Offline suite: real signed RS256 tokens, local fake JWKS, fake embedding/LLM providers
python manage.py test tests.test_rag tests.test_settings tests.test_auth tests.test_reclamations_offline tests.test_reclamations_auth --noinput
# Real MongoDB CRUD, concurrency, ownership, and old-to-new migration
python manage.py test tests.test_reclamations tests.test_reclamations_identity --noinput
```

- Django's runner uses the official MongoDB backend's database creation/teardown support and
  `TransactionTestCase` (standalone MongoDB cannot roll back transactions). Tests create and clean
  `test_<MONGODB_NAME>` (`test_campushub`), never the configured development database. The integration
  base class refuses to run against any other database. Do not use that test name for valuable data.
- Without MongoDB, the 45 integration tests are **skipped with a reason**, not counted as passed.
  The 162 offline tests still run. To exercise that path without stopping your MongoDB service,
  temporarily set `MONGODB_URI` to an unused local port in the test process only.
- The offline reclamation tests forbid MongoDB access. Tokens are verified through actual DRF
  requests; tests never contact real Keycloak and never use `force_authenticate`.
- Coverage includes 401/403/503, cache sharing/outages/rotation, local-auth rejection, role priority,
  forged fields, same-name users, legacy isolation, trusted history, migration/index preservation,
  atomic references, status conflicts, filters, search, pagination, statistics and RAG regressions.

### MongoDB-specific limitations

- **No multi-document transactions** (they need a replica set; `select_for_update()` is a no-op on
  MongoDB): every operation is one atomic single-document update, with the status check above.
- Datetimes are stored with **millisecond** precision (the service truncates them before writing,
  so a value returned right after a write equals the value read back later).
- `migrate --fake-initial`, `dumpdata` / `loaddata` and `inspectdb` are not supported for the
  MongoDB database. Review generated embedded-model migrations explicitly: the history field
  changes must appear in migration state, and embedded models must not get their own collection.
- `search` is a case-insensitive regular-expression scan (input escaped) and `priority` ordering is
  computed: neither uses an index. Fine at this scale; a text or Atlas Search index would replace it.
- The priority can only change together with a status change (`change-status` requires `status`).

## Eureka (service discovery)

The service registers in the team's existing Eureka server (`Backend/eureka-server`, port 8761)
as **`RECLAMATION-SERVICE`** (vipAddress `reclamation-service`), instance
`reclamation-service:<EUREKA_INSTANCE_HOST>:<EUREKA_INSTANCE_PORT>`, port **8087**, health and
status page `GET /api/health` (public). Same REST protocol and payload as Forum and Notification.

Registration is a separate, explicitly started process, like Notification's
`php artisan eureka:register`: **starting Django never contacts Eureka** (no thread at startup,
so tests, migrations and the runserver autoreloader never register anything).

```powershell
python manage.py runserver 8087          # terminal 1: the service, on the team port
python manage.py eureka_register         # terminal 2: register + heartbeat; Ctrl+C deregisters
python manage.py eureka_register --once  # register once and exit (Eureka drops it after ~90 s)
```

- **Only while the service is up:** the agent checks `http://127.0.0.1:8087/api/health` first and
  advertises the instance only while it answers `UP`; if Django stops, it deregisters, and it
  registers again when Django is back. Start the server (`runserver`, or waitress behind the
  Gateway) on the same port as `EUREKA_INSTANCE_PORT`.
- **Heartbeat** every 30 s (lease 90 s). A heartbeat answered `404` (Eureka restarted) triggers a
  new registration.
- **Eureka down:** nothing fails. The agent retries after 5, 10, 20, then every 30 s; every call has
  a 3 s timeout. Django keeps serving normally: it does not depend on the agent.
- **Graceful shutdown:** Ctrl+C, Ctrl+Break or SIGTERM -> deregistration, then exit.
- **Without Eureka:** just don't start the agent (or set `EUREKA_ENABLED=false`, which makes it
  exit at once).
- **One agent per instance.** In a container, the agent will run next to Gunicorn (decided with the
  Dockerfile).

Check the registration: open the Eureka dashboard <http://localhost:8761> (section *Instances
currently registered with Eureka*), or
`Invoke-RestMethod http://localhost:8761/eureka/apps/RECLAMATION-SERVICE -Headers @{Accept="application/json"}`.
The automated tests (`python manage.py test tests.test_eureka`) use a local fake Eureka.

## API Gateway

**Proposed, not applied yet:** the team Gateway (`Backend/api-gateway`, Spring Cloud Gateway
Server WebMVC) belongs to its owner, who has to approve the prefix `/api/v1/reclamation/**`. The
ready-to-apply change is [`docs/gateway/01-reclamation-route.patch`](docs/gateway/01-reclamation-route.patch)
(6 lines in `src/main/resources/application.properties`, same pattern as Notification):

```properties
spring.cloud.gateway.server.webmvc.routes[6].id=reclamation-service
spring.cloud.gateway.server.webmvc.routes[6].uri=lb://reclamation-service
spring.cloud.gateway.server.webmvc.routes[6].predicates[0]=Path=/api/v1/reclamation/**
spring.cloud.gateway.server.webmvc.routes[6].filters[0]=RewritePath=/api/v1/reclamation(?<segment>/?.*), /api$\{segment}
```

| Through the Gateway (port 8080) | In this service |
|---|---|
| `/api/v1/reclamation/reclamations/[{id}/[change-status/]]`, `…/reclamations/stats/` | `/api/reclamations/…` |
| `/api/v1/reclamation/academic-assistant/ask` | `/api/academic-assistant/ask` |
| `/api/v1/reclamation/conversations[/{id}]` | `/api/conversations[/{id}]` |
| `/api/v1/reclamation/academic-rules[/{rule_id}]`, `…/ambiguities[/{id}]` | `/api/academic-rules…`, `/api/ambiguities…` |
| `/api/v1/reclamation/documents[/{id}]` | `/api/documents…` |
| `/api/v1/reclamation/health` | `/api/health` (a token is still required at the Gateway) |

Trailing slashes stay optional, and methods and query strings are kept. `/api/v1/reclamation/api/…`
becomes `/api/api/…` (JSON 404): no doubled or stripped `/api`.

**Run the service with waitress behind the Gateway, not runserver:**

```powershell
python -m waitress --listen=127.0.0.1:8087 config.wsgi:application   # terminal 1
python manage.py eureka_register                                     # terminal 2
```

The Gateway forwards request bodies chunked, without `Content-Length`. Django reads exactly
`Content-Length` bytes, so under `runserver` every POST / PUT / PATCH / upload would arrive empty.
waitress turns chunked bodies into normal ones. A chunked body that cannot be read now gets `411`
with an explanation (`config/middleware.py`) instead of being processed as empty. Direct calls
(curl, Postman, tests) send `Content-Length` and work with both servers.

What the Gateway does (measured 2026-11-11 on a scratch copy with this route, the real
`eureka_register` agent and a local stub Keycloak/Eureka; not yet with the team's live servers):

- **Authentication:** the Gateway checks the token (signature, issuer, expiry) and forwards the
  `Authorization` header unchanged; this service checks it again and applies roles and ownership.
  A missing, invalid or expired token gets `401` from the Gateway, and the service is not called.
  Service answers (`400`, `403`, `404`, `409`, `411`, `413`, `422`, `503`…) come back unchanged.
- `OPTIONS` without a token is let through by the Gateway (CORS); the service answers it `401`.
  CORS preflights are answered by the Gateway itself.
- **Pagination links:** the Gateway sends the service's own `Host` and no `X-Forwarded-*`, so
  set `PUBLIC_API_URL=http://localhost:8080/api/v1/reclamation`; `next` / `previous` then go
  through the Gateway instead of exposing `http://localhost:8087/…`.
- **Bodies and queries:** JSON and multipart bodies (25 MB tested) arrive byte for byte; the Gateway adds
  `;charset=UTF-8` to the request `Content-Type` and re-encodes `+` as `%20` in queries (same meaning).
- **No read timeout** at the Gateway (a slow RAG answer is waited for).
- **Service down:** the Gateway answers **500** (both while the stopped instance is still listed
  and once it is deregistered). The optional, Gateway-wide
  [`docs/gateway/02-optional-service-unavailable-503.patch`](docs/gateway/02-optional-service-unavailable-503.patch)
  makes it `503` (tested). Stop `eureka_register` **before** the server: it deregisters at once;
  otherwise the stopped instance stays listed for up to ~30 s (agent) + the Gateway's caches.
- In Docker, `Host` will be the advertised `EUREKA_INSTANCE_HOST`: add it to `DJANGO_ALLOWED_HOSTS`.

## Authentication (Keycloak)

Keycloak (realm `campushub`) is the identity provider: this service never issues tokens and has no
login, registration or password endpoint. Every RAG and Reclamations endpoint except
`GET /api/health` needs the header
`Authorization: Bearer <access token>`, and checks it itself, also behind the API Gateway
(`config/auth.py`; team rules: `Documentation/regles-communes-keycloak.txt`).

| Variable | Local | Docker |
|---|---|---|
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8180/realms/campushub` | the same: tokens keep the browser-side issuer |
| `KEYCLOAK_JWKS_URI` | empty = `<issuer>/protocol/openid-connect/certs` | `http://keycloak:8080/realms/campushub/protocol/openid-connect/certs` |

- **Checks:** RS256 only (HS256, unsigned `none` and any other algorithm are refused), signature
  with the realm's public key, exact issuer, expiry, required `exp` / `iat` / `iss` / `sub`.
  The audience (`account`) is not checked.
- **Identity and role:** `sub` (a UUID) is the user id. The role is the highest CampusHub role in
  `realm_access.roles`: `ADMIN` > `ENSEIGNANT` > `ETUDIANT`; other Keycloak roles and the old
  `role` claim are ignored. Views read `request.principal` (`sub`, `role`, `roles`); the identity
  never comes from the request body or query string.
- **Public keys:** downloaded from the JWKS address (3 s timeout) and cached 10 minutes. A token
  signed with a new key id triggers a refresh (key rotation), at most one download every 10 s.
  If Keycloak is down, keys already downloaded keep working for up to 1 hour.
- **Not configured = closed:** with an empty `KEYCLOAK_ISSUER_URI`, every protected endpoint
  answers 503. There is no anonymous or DEBUG bypass and no legacy token mode. An existing `.env`
  needs the `KEYCLOAK_ISSUER_URI` line from `.env.example`.

| Status | When | `error` |
|---|---|---|
| 401 | no token, malformed header (+ `WWW-Authenticate: Bearer`) | `Authentication required: …` / `The Authorization header must be 'Bearer <token>'.` |
| 401 | bad signature, wrong issuer, HS256 / unsigned, missing claim, invalid `sub` | `Invalid token.` |
| 401 | expired token | `The token has expired.` |
| 403 | valid token without a CampusHub role | `Access denied: this account has no CampusHub role.` |
| 503 | Keycloak unreachable and the signing key not cached | `Authentication service unavailable, please retry later.` |
| 503 | `KEYCLOAK_ISSUER_URI` empty | `Authentication is not configured on this service.` |

The table uses the RAG `error` key; CRUD returns the same safe messages under DRF's `detail` key.
Error bodies never contain tokens, keys, host names or technical details.

**Private conversations:** a conversation belongs to the `sub` of the token that created it
(`owner_sub`, set by the server; an `owner_sub` sent in a request is ignored). Every user, whatever
the role (`ADMIN` included), only lists, reads, renames, deletes and continues their own
conversations; anyone else's answers `404 Conversation not found.`, exactly like a missing one.
For `POST /api/academic-assistant/ask` with a `conversation_id`, this check runs before the
previous messages are read and before any embedding / LLM call. Conversations created before
ownership existed keep `owner_sub` empty: they are kept in the database but no one can reach them
through the API (no owner is guessed from a username).

Local test token (PowerShell). Start Keycloak as in section 8 of
`Documentation/regles-communes-keycloak.txt`; the test users and their password are in section 7.
Tokens last 30 minutes.

```powershell
$kc = "http://localhost:8180/realms/campushub/protocol/openid-connect/token"
$tok = Invoke-RestMethod -Method Post $kc -ContentType "application/x-www-form-urlencoded" `
       -Body "grant_type=password&client_id=campushub-frontend&username=etudiant1&password=<test password>"
$h = @{ Authorization = "Bearer $($tok.access_token)" }
Invoke-RestMethod "http://127.0.0.1:8000/api/conversations" -Headers $h
```

The offline security tests (`python manage.py test tests.test_auth`) use test RSA keys and a local
fake Keycloak: localhost JWKS only, no external network or real Keycloak.

## REST API (regulation assistant)

JSON in, JSON out. Every path works **with or without** a trailing slash. The reclamations
endpoints are described in [Reclamations API](#reclamations-api-mongodb).

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
| `GET` | `/api/health` | no token needed | 200 `{"status": "UP", "indexed": true, "index": {...}}` |

- **Rules and ambiguities are read-only**: they are paraphrases of the official PDF, loaded and
  embedded by `ingest_regulation`. The regulation document itself cannot be replaced or deleted
  through `/api/documents` (409); only uploaded PDFs can.
- **Errors** of these endpoints always look like `{"error": "message"}`:
  `400` invalid input · `401` / `403` authentication (see [Authentication](#authentication-keycloak)) ·
  `404` unknown id or URL · `405` method not allowed (with `Allow` header) ·
  `409` conflict (file name exists, regulation is read-only) · `413` file too large ·
  `422` unusable PDF (not a PDF, encrypted, no text) · `503` embedding/LLM provider unavailable,
  nothing indexed yet, or Keycloak unavailable · `500` unexpected (logged).
- **No CSRF / cookies**: callers send a Keycloak Bearer token (stateless). Local Django credentials
  (Basic or a session) are accepted by neither RAG nor Reclamations.

Examples (`$TOKEN` = a Keycloak access token, see [Authentication](#authentication-keycloak)):

```bash
AUTH="Authorization: Bearer $TOKEN"
curl -X POST localhost:8000/api/academic-assistant/ask -H "$AUTH" -H "Content-Type: application/json" \
     -d '{"question": "Mon PFE doit durer 26 ou 28 semaines ?"}'
curl -X POST localhost:8000/api/documents -H "$AUTH" -F "file=@syllabus.pdf"
curl -X PUT  localhost:8000/api/documents/2 -H "$AUTH" -F "file=@syllabus-v2.pdf"
curl -X PUT  localhost:8000/api/conversations/3 -H "$AUTH" -H "Content-Type: application/json" -d '{"title": "PFE"}'
curl -X DELETE localhost:8000/api/conversations/3 -H "$AUTH"
```

Windows PowerShell (in a second terminal, while `runserver` is running; `$h` = the header built in
[Authentication](#authentication-keycloak)). Keep `charset=utf-8` in the content type, otherwise
accents (é, è…) are not sent as UTF-8:

```powershell
$api = "http://127.0.0.1:8000/api"
Invoke-RestMethod "$api/health"                                     # public: no token
$body = @{ question = "Mon PFE doit durer 26 ou 28 semaines ?" } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post "$api/academic-assistant/ask" -Headers $h -ContentType "application/json; charset=utf-8" -Body $body
$r.answer; $r.evidence.ambiguities; $r.citation_check
Invoke-RestMethod "$api/conversations/$($r.conversation_id)" -Headers $h
Invoke-RestMethod -Method Put "$api/conversations/$($r.conversation_id)" -Headers $h -ContentType "application/json; charset=utf-8" -Body (@{ title = "PFE" } | ConvertTo-Json)
Invoke-RestMethod -Method Delete "$api/conversations/$($r.conversation_id)" -Headers $h
curl.exe -X POST "$api/documents" -H "Authorization: Bearer $($tok.access_token)" -F "file=@C:\path\to\guide.pdf"   # curl.exe, not curl (alias)
try { Invoke-RestMethod "$api/conversations/999" -Headers $h } catch { $_.ErrorDetails.Message }   # see an error body
try { Invoke-RestMethod "$api/conversations" } catch { $_.ErrorDetails.Message }   # no token -> 401
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

- API Gateway route: prepared and tested on a scratch copy (see "API Gateway"); waiting for the
  Gateway owner's approval of `/api/v1/reclamation/**`, then a live test with the team's Keycloak,
  Eureka and Gateway.
- Role rules for `/api/documents` writes: today every authenticated role (students included) can
  upload, replace or delete regulation PDFs, also through the Gateway. To decide (ADMIN only?).

- Reclamations: suggested related regulation rules on creation — deferred. The hybrid retriever
  would send the student's (private) reclamation text to the external embedding provider inside
  the create request (latency, rate-limit waits). Keyword-only (BM25) suggestions work offline and
  are relevant for typical reclamations, but also return unrelated rules for an off-topic one, so
  they first need a relevance threshold evaluated on labelled examples.
- `POST /api/recommendations/` — needs `campushub_recommendation_engine.py` (referenced by the
  guide, not in this repo) and an authorized student snapshot from the Enrollment/Evaluation services.
- Dockerfile (with the Gunicorn / waitress check of "Configuration").
- Reranking with a cross-encoder (e.g. bge-reranker) — RRF is the current ranking step.
