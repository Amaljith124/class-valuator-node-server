# Humaniti Node API

Public REST API, job queue and database owner for the Humaniti classroom video-analysis system.

The Node server accepts recordings, stores them in Cloudflare R2, queues analysis jobs in PostgreSQL (pg-boss), calls the internal FastAPI analysis service, stores the results, and pushes live status updates to the UI over Socket.IO.

```
React site ──HTTP/Socket.IO──▶ Node API ──pg-boss job──▶ worker ──HTTP──▶ FastAPI (Whisper + Gemini)
                                  │                                          │
                                  ├──▶ PostgreSQL (evaluation, process, logs, queue)
                                  └──▶ Cloudflare R2 (recordings/)  ◀────────┘
```

The browser only talks to this server. FastAPI is internal and is reached only with a shared token. This server owns **all SQL**; FastAPI only updates the `evaluation` table.

## Tech stack

| Area | Technology |
|---|---|
| Runtime | Node.js >= 20 |
| HTTP | Express 4, cors, multer (in-memory uploads) |
| Queue | pg-boss 10 (PostgreSQL-backed) |
| Realtime | socket.io 4 |
| Database | PostgreSQL via `pg` |
| Storage | Cloudflare R2 via the MinIO client |
| Upstream | axios to the FastAPI analysis service |

## Requirements

- Node.js 20 or newer
- A PostgreSQL database
- A private Cloudflare R2 bucket and bucket-scoped credentials
- The FastAPI service running (see `../fastapi-server/README.md`)

## Quick start

```sh
npm install
cp .env.example .env     # then fill in the values
# apply the database schema manually (see "Database" below)
npm run dev              # nodemon, or: npm start
```

The server listens on `PORT` and logs `<APP_NAME> listening on <PORT>`.

Health check (no auth): `GET /health`

## Configuration

All settings come from environment variables (see `.env.example`). Never commit `.env`.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` allows requests without a bearer token when `API_ACCESS_TOKEN` is empty |
| `PORT`, `APP_NAME` | HTTP port and service name |
| `DATABASE_URL` | PostgreSQL connection string (used by the app and pg-boss) |
| `FASTAPI_BASE_URL` | Base URL of the analysis service, e.g. `http://127.0.0.1:8000` |
| `FASTAPI_INTERNAL_TOKEN` | Sent as `x-internal-token`; must equal FastAPI's `INTERNAL_API_TOKEN` |
| `FASTAPI_TIMEOUT_MS` | Timeout for one analysis call (long recordings need minutes) |
| `API_ACCESS_TOKEN` | Bearer token required on `/api/v1/*` |
| `CORS_ORIGIN` | Allowed browser origin (the React site) |
| `PG_BOSS_QUEUE` | Queue name, e.g. `video-analysis` |
| `PG_BOSS_BATCH_SIZE`, `PG_BOSS_POLL_SECONDS` | Optional worker tuning: jobs per fetch (default 1) and polling interval in seconds (default 2) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_REGION` | Cloudflare R2 access (`R2_REGION=auto`) |
| `MAX_UPLOAD_MB` | Maximum upload size (default setup: 500) |
| `UPLOAD_DIR` | Legacy local upload directory |

`R2_ENDPOINT` must be `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` with no path.

## Database

SQL is applied **manually**; nothing runs at startup.

- New database: run `database/scripts/schemaCreation.sql`.
- Existing database: run `database/scripts/updateScripts/0001.sql`, `0002.sql`, `0003.sql` in order, skipping any already recorded in the `scripts` table.

Tables:

| Table | Purpose |
|---|---|
| `evaluation` | One row per recording: input metadata, R2 object key, transcripts, result JSON, status |
| `process` | One row per analysis run: pg-boss job id, status, request/response payloads |
| `process_api_logs` | One sanitized row per FastAPI call attempt (status, duration, errors) |
| `scripts` | Ledger of applied migration scripts |

Statuses: `evaluation` is `pending → processing → completed | failed`; `process` is `queued → processing → processed | failed`.

## API

All `/api/v1/*` routes require `Authorization: Bearer <API_ACCESS_TOKEN>`. Responses use `{ success, message, data }`.

| Method and path | Purpose |
|---|---|
| `GET /health` | Health check (no auth) |
| `POST /api/v1/user/evaluations/upload` | Multipart upload (`file`, `title`, `teacher`, `subject`, `notes`); stores in R2 and queues analysis. Audio/video only |
| `GET /api/v1/user/evaluations?limit=&offset=` | List evaluations |
| `GET /api/v1/user/evaluations/:id` | One evaluation with transcripts and result |
| `GET /api/v1/user/processes?include_logs=true` | Recent processes with latest attempt summary |
| `GET /api/v1/user/processes/:id?include_logs=true` | Process detail with ordered attempt logs |
| `POST /api/v1/user/processes/:id/retry` | Re-queue a process |
| `POST /api/v1/user/testing/:type` | Run one stage alone: `transcription`, `teaching-effectiveness`, `audio-quality`, `video-screen` (multipart `file`) |
| `POST /api/v1/agent/video-analysis` | Machine-to-machine submit with an existing `objectKey` |

Full details: `docs/API.md`.

### Realtime

Socket.IO on the same port. Clients may emit `process:subscribe` with a process id. The server broadcasts `process:update` (`process_id`, `evaluation_id`, `status`, `updated_at`) whenever a process changes state; the UI refetches on this event.

## How a recording is processed

1. `POST /user/evaluations/upload` buffers the file (multer), validates it is audio/video, and uploads it to R2 as `recordings/YYYY-MM-DD/<uuid>.<ext>`, verifying the stored size.
2. An `evaluation` row (`pending`) and a `process` row (`queued`) are created and a pg-boss job is sent; the job id is saved on the process.
3. The pg-boss worker marks the process `processing` and calls FastAPI `POST /api/v1/analyze` with `{ object_key, evaluation_id }` and the internal token.
4. FastAPI downloads the file from R2, runs transcription, translation, speaker roles, teaching scoring, audio quality and video analysis, and saves the result.
5. Node writes the attempt to `process_api_logs` (transcripts and evidence redacted), completes the evaluation, marks the process `processed`, and emits `process:update`.
6. On failure the evaluation and process are marked `failed`, the error is logged, and pg-boss may retry. On startup, queued processes whose job failed are re-tried automatically.

## Project structure

```
server.js                 App bootstrap: Express, Socket.IO, pg-boss, graceful shutdown
config/                   appConfig.js, dbConfig.js (environment)
routes/                   general/, user/ (evaluations, processes, testing), agent/
middlewares/              tokenHandler.js (bearer auth), logHandler.js (request log)
helpers/                  videoAnalysisManager (queue + worker), evaluationManager,
                          uploadManager, r2Storage, testingManager, socketManager,
                          responseManager
controllers/              SQL access: evaluation.js, process.js
models/                   Row-to-camelCase mappers
database/                 db.js (pool) and scripts/ (schema + numbered updates)
docs/API.md               API notes
CODE_STYLE.md             Required coding conventions
```

Layering: routes handle HTTP, managers hold workflow logic, controllers own SQL, models map rows.

## Security notes

- Keep the R2 bucket private; use bucket-scoped credentials. Object keys must start with `recordings/` and are validated.
- Set `API_ACCESS_TOKEN` outside local development. For deployed UIs, put an authenticated same-origin proxy or session in front; do not put the token in browser code.
- `FASTAPI_INTERNAL_TOKEN` and R2/DB credentials must never appear in API responses, logs or queue payloads. Process logs redact transcripts and evidence.
- Do not commit `.env`.

## Development

- Follow `CODE_STYLE.md` (Promise `.catch()` only, no `try/catch`, every `if` has an `else`, explicit SQL columns, bracketed log labels).
- Scripts: `npm start`, `npm run dev`.
