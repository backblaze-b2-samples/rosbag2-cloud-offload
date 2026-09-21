<!-- last_verified: 2026-08-06 -->
# Architecture

## Components

<!-- gen:begin arch-components -->
Stream ROS 2 rosbag2 recordings off the robot into Backblaze B2, describe them from rosbag2's own metadata, and catalog every session in Parquet so any recording can be found and replayed with ros2 bag play from a presigned B2 URL.

- **apps/web/** — Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query)
  - Continuous Bag Offload (`/upload`) — Presigned-PUT each closed rosbag2 split into bags/<robot>/<session>/ while recording continues; local copies deleted only after head_object confirms.
  - Session Catalog & Search (`/catalog`) — Parquet catalog keyed by robot, date, topic set and ROS distro; sample-scoped explorer over the bags/ namespace.
  - Bucket Explorer (`/files`) — Full-bucket browse across bags/ and catalog/, kept from the starter kit.
  - Offload Dashboard (`/`) — Offload volume, session count, and compression-ratio stats over the bags/ prefix.
- **services/api/** — FastAPI (Python 3.12+, boto3, Pydantic v2, pyarrow)
  - REST API for every operation the frontend consumes, exported to `docs/api/openapi.json`
  - Backblaze B2 (S3-compatible API) access isolated in the `repo/` layer
  - Bag Describe — ros2 bag info when a ROS 2 env is present, else parse rosbag2 metadata.yaml; writes metadata.json and records compression sizes.
  - Replay via Presigned URL — Presigned GET manifest streams a session's splits for ros2 bag play against B2.
  - Structured JSON logging with request tracing, plus `/health` and Prometheus `/metrics`
- **packages/shared/** — TypeScript types generated from the API contract by `pnpm gen:api`, consumed by `apps/web/` as a workspace dependency (pnpm)
<!-- gen:end arch-components -->

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Authored Python files under `services/api/app/` stay under 300 lines

### Directory Structure

<!-- gen:begin arch-directory -->
```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models, and the response-model base
    config/                Settings loaded from environment
    repo/                  B2 S3 client (data access layer)
    service/               Business logic
    runtime/               FastAPI route handlers
  scripts/                 Operational scripts (OpenAPI export, bucket CORS)
  tests/                   pytest tests (structural + integration)
```
<!-- gen:end arch-directory -->

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. Each service's versioned config sits at its own root —
  `railway.json` and `services/api/railway.json` — the default path Railway
  discovers, so a one-click template deploy inherits the same build, start, and
  health behavior with nothing to configure by hand. The human-approved
  staging/production contract lives in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — one project using [Vercel Services](https://vercel.com/docs/services):
  the `web` (Next.js) and `api` (FastAPI) services build from the same repo and
  share one origin — the web app at `/`, the API under `/api`. The repo-root
  `vercel.json` declares both services and routes `/api/*` to the API service;
  the Vercel-only `services/api/index.py` strips the `/api` prefix so FastAPI
  keeps its native paths (`/health`, `/files`, …). Bag splits are offloaded
  directly from the browser (or the on-device watcher) to B2 via a presigned PUT
  (see [Continuous Bag Offload](docs/features/bag-offload.md)), so they bypass
  the Function's 4.5 MB payload ceiling entirely — the bucket must allow the
  deploy origin in its CORS. A two-separate-Projects alternative and the full
  delivery contract live in [infra/vercel/README.md](infra/vercel/README.md).

External provisioning and deployment remain explicit user-approved actions.

## Data Stores

<!-- gen:begin arch-data-stores -->
- **Backblaze B2 (S3-compatible API)** — the only data store; there is no application database
  - Every object this app writes lives under the `bags/` key prefix of one bucket
  - Listing, per-key metadata and presigned URLs all come from the S3 surface below
  - The primary entity is `Session`; one session is one object
<!-- gen:end arch-data-stores -->

## External Services

<!-- gen:begin arch-external-services -->
- **Backblaze B2 (S3-compatible API)** — reached only through `services/api/app/repo/`, using:
  - `put_object` — Write each session's metadata.json and roll the Parquet catalog under catalog/.
  - `presigned PUT (put_object)` — Direct robot/browser upload of each closed bag split under bags/<robot>/<session>/.
  - `list_objects_v2` — Enumerate a session's splits and discover sessions under the bags/ prefix for the catalog.
  - `head_object` — Confirm a split landed before the watcher deletes the local copy, and read split sizes.
  - `get_object` — Read rosbag2 metadata.yaml and the Parquet catalog for describe and query.
  - `presigned GET (get_object)` — Stream bag splits for ros2 bag play replay and download the catalog.
  - `delete_object` — Delete a session's bags, scoped strictly to its bags/<robot>/<session>/ prefix.
<!-- gen:end arch-external-services -->

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

- **Offload**: Browser/watcher -> `POST /sessions/{robot}/{session}/offload` (API presigns a PUT per split, keys scoped to `bags/<robot>/<session>/`) -> client PUTs each split **directly to B2** -> the watcher confirms with `head_object` before deleting the local copy
- **Describe**: `POST /sessions/{robot}/{session}/describe` -> service reads rosbag2's `metadata.yaml` from B2 (or `ros2 bag info` on-device) -> writes the summary into the session's `metadata.json`
- **Catalog**: `GET /catalog` reads `catalog/catalog.parquet` (or derives live from session records); `POST /catalog/rebuild` rolls every session into Parquet via `put_object`; `GET /catalog/download` presigns a GET for the file
- **Replay**: `POST /sessions/{robot}/{session}/replay` -> repo presigns a GET per split -> client streams them with `ros2 bag play`
- **Delete**: `DELETE /sessions/{robot}/{session}` -> service lists the prefix and deletes each object, scoped strictly to `bags/<robot>/<session>/`
- **Bucket browse**: `GET /files` -> shared full-bucket listing across `bags/` and `catalog/` -> `DELETE /files-by-key` removes one object

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

<!-- gen:begin arch-api-contract -->
- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export / check: `pnpm contract:export` / `pnpm contract:check`
- Generate the client seam from it: `pnpm gen:api` (drift gate: `pnpm gen:check`)
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The FastAPI routers and Pydantic models are the single source of truth. The
frontend's `API_CLIENT_ROUTES` registry, the `qk` query-key factory and the
shared TypeScript types are **generated** from the exported artifact by
`pnpm gen:api`, so the client cannot drift from the backend — there is no
hand-written copy left to disagree. The two contract tests are kept as a
belt-and-braces check that the generated files and the committed artifact are
still in step.

| Route | Returns | Generated client route |
| --- | --- | --- |
| `DELETE /files-by-key` | `DeleteFileResponse` | `fileByKeyDelete` |
| `DELETE /files/{key}` | `DeleteFileResponse` | `legacyFileDelete` |
| `DELETE /sessions/{robot}/{session}` | `DeleteResult` | `sessionDelete` |
| `GET /catalog` | `CatalogRows` | `catalog` |
| `GET /catalog/download` | `PresignedUrl` | `catalogDownload` |
| `GET /files` | `FileMetadata[]` | `files` |
| `GET /files-by-key/detail` | `FileMetadataDetail` | `fileByKeyDetail` |
| `GET /files-by-key/download` | `FileUrlResponse` | `fileByKeyDownload` |
| `GET /files-by-key/metadata` | `FileMetadata` | `fileByKeyMetadata` |
| `GET /files-by-key/preview` | `FileUrlResponse` | `fileByKeyPreview` |
| `GET /files/{key}` | `FileMetadata` | `legacyFileMetadata` |
| `GET /files/{key}/download` | `FileUrlResponse` | `legacyFileDownload` |
| `GET /files/{key}/preview` | `FileUrlResponse` | `legacyFilePreview` |
| `GET /files/stats` | `UploadStats` | `fileStats` |
| `GET /files/stats/activity` | `DailyUploadCount[]` | `uploadActivity` |
| `GET /health` | `HealthStatus` | `health` |
| `GET /metrics` | — | _server-only_ |
| `GET /sessions` | `SessionList` | `sessions` |
| `GET /sessions/{robot}/{session}` | `SessionDetail` | `sessionDetail` |
| `PATCH /sessions/{robot}/{session}` | `Session` | `sessionUpdate` |
| `POST /catalog/rebuild` | `CatalogSummary` | `catalogRebuild` |
| `POST /sessions` | — | `sessionCreate` |
| `POST /sessions/{robot}/{session}/describe` | `SessionDetail` | `sessionDescribe` |
| `POST /sessions/{robot}/{session}/offload` | `OffloadPlan` | `sessionOffload` |
| `POST /sessions/{robot}/{session}/replay` | `ReplayManifest` | `sessionReplay` |
| `POST /upload/presign` | `PresignUploadResponse` | `uploadPresign` |
| `POST /upload/verify` | `FileUploadResponse` | `uploadVerify` |
<!-- gen:end arch-api-contract -->

## Canonical Files

<!-- gen:begin arch-canonical-files -->
Hand-written — this is the file to edit:

- Layered API handler: `services/api/app/runtime/`
- Service orchestration: `services/api/app/service/`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`base.py` carries the response-model config)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client — error policy, transport, fallback: `apps/web/src/lib/api-client.ts`
- Frontend data layer — caching, invalidation, polling: `apps/web/src/lib/queries.ts`
- Shared type barrel: `packages/shared/src/types.ts`
- Generator policy: `scripts/gen/api-gen.config.json`
- Sample manifest behind the generated docs: `docs/exec-plans/sample.json`

Generated — **never hand-edit**; change the source and re-run the command:

- `docs/api/openapi.json` — `pnpm contract:export` (source: the routers and models)
- `packages/shared/src/generated/api-types.ts` — `pnpm gen:api`
- `apps/web/src/lib/generated/api-routes.ts` — `pnpm gen:api`
- `apps/web/src/lib/generated/query-keys.ts` — `pnpm gen:api`
- The marker-delimited regions of this file, `AGENTS.md`, `README.md` and the 2 `infra/` runbooks — `pnpm gen:docs`
<!-- gen:end arch-canonical-files -->

## Core Features

<!-- gen:begin arch-core-features -->
- [Continuous Bag Offload](docs/features/bag-offload.md) — Presigned-PUT each closed rosbag2 split into bags/<robot>/<session>/ while recording continues; local copies deleted only after head_object confirms.
- [Session Catalog & Search](docs/features/session-catalog.md) — Parquet catalog keyed by robot, date, topic set and ROS distro; sample-scoped explorer over the bags/ namespace.
- [Bag Describe](docs/features/bag-describe.md) — ros2 bag info when a ROS 2 env is present, else parse rosbag2 metadata.yaml; writes metadata.json and records compression sizes.
- [Replay via Presigned URL](docs/features/replay-streaming.md) — Presigned GET manifest streams a session's splits for ros2 bag play against B2.
- [Bucket Explorer](docs/features/bucket-explorer.md) — Full-bucket browse across bags/ and catalog/, kept from the starter kit.
- [Offload Dashboard](docs/features/dashboard.md) — Offload volume, session count, and compression-ratio stats over the bags/ prefix.
<!-- gen:end arch-core-features -->

## References

<!-- gen:begin arch-references -->
- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
- [infra/vercel/README.md](infra/vercel/README.md) — Vercel deployment contract
- [infra/railway/README.md](infra/railway/README.md) — Railway delivery contract
<!-- gen:end arch-references -->
