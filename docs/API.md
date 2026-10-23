# Node API

Protected /api/v1/* routes use Authorization: Bearer <API_ACCESS_TOKEN>. The browser calls Node only.

For local UI development only, Node accepts these requests without a bearer token when NODE_ENV=development and API_ACCESS_TOKEN is empty; CORS remains limited to CORS_ORIGIN. Set API_ACCESS_TOKEN and place an authenticated same-origin proxy/session in front of the UI for shared or deployed environments. Do not add the API token to Vite variables or browser code.

- POST /api/v1/agent/video-analysis
- POST /api/v1/user/evaluations/upload multipart file, title, teacher, subject, notes
- GET /api/v1/user/evaluations?limit=25&offset=0
- GET /api/v1/user/evaluations/:id
- GET /api/v1/user/processes?include_logs=true
- GET /api/v1/user/processes/:id?include_logs=true
- POST /api/v1/user/processes/:id/retry
- POST /api/v1/user/testing/transcription|teaching-effectiveness|audio-quality|video-screen multipart file

The Node server owns all SQL. Apply `database/scripts/schemaCreation.sql` manually to an empty database. For an existing installation, apply numbered scripts in order: `0001.sql`, `0002.sql` to create the process API log table, then `0003.sql` to add the English transcript field. No startup schema check or automatic SQL execution is present. Process API logs record one sanitized row per full analysis attempt; do not store internal tokens, authorization headers, provider keys, signed URLs or media bytes.

The process list endpoint reads current rows from `process` and includes a bounded latest-attempt summary for each row. The detail endpoint loads the selected process and its ordered attempt logs, including the actual request body, response body, HTTP status, duration, timestamps, and error message when present. The React Process Monitor calls both endpoints directly; it does not use demo process records.

## Cloudflare R2

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, and `R2_REGION=auto` in both server environments. Use bucket-scoped credentials and keep the bucket private. Node uploads the existing multipart request to R2 using a server-generated object key; FastAPI receives only that object key in its internal job request. Never put R2 credentials or signed URLs in API responses or queue payloads.

API_ACCESS_TOKEN is a static challenge-stage bearer token. Since browser code must not contain a private token, production deployments should put a same-origin authenticated reverse proxy/session in front of the UI and Node.
