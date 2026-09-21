# Build plan — `rosbag2-cloud-offload`

Derived from `vibe-coding-starter-kit` (Next.js 16 web + FastAPI api + B2 S3).
Source of truth: `.claude/scratch/vcsk-b8e17cfe-821d-4cd1-a975-90b57771e8ba/`.

## 1. Purpose

`rosbag2-cloud-offload` is a B2 sample for ROS 2 fleets: it takes the bag splits a
robot's `rosbag2` writes during every run, streams each closed split off the machine
into Backblaze B2 under `bags/<robot>/<session>/`, describes it from rosbag2's own
metadata, and rolls every session into a searchable Parquet catalog so any recording
can be found and replayed later with `ros2 bag play` from a presigned B2 URL. It is
for ROS 2 vehicle/robot programs that need durable, queryable off-machine storage of
multi-GB-per-hour bag streams without standing up their own object store — B2 is the
storage layer, reached through the S3-compatible API with a custom user agent and the
standard `B2_*` env vars, and no second API key.

**rosbag2 is the vendor engine and stays the vendor engine.** The describe step
prefers the real `ros2 bag info` CLI when a ROS 2 environment is on `PATH`, and falls
back to parsing the `metadata.yaml` that rosbag2 itself writes beside each bag (still
rosbag2's own artifact format, never a third-party bag reader such as `rosbags`).
Compression figures come from the `compression_format` / size fields rosbag2 records
in that `metadata.yaml`. This is a `deployment: local` sample — all bag handling runs
on-device; there is no external API and no ML model, so no GPU/accelerator path
applies (the CPU-default rule is satisfied trivially: nothing heavier than pyarrow).

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling. Keep its plumbing, restyle the file domain into the
bag/session/catalog domain, strip nothing structural.

### KEEP (as-is or near-as-is)
- Monorepo shape: `apps/web` (Next.js 16), `services/api` (FastAPI), `packages/shared`,
  `scripts/` (gen:api, gen:docs, doctor), `infra/`, `.github/workflows/ci.yml`.
- **Bucket explorer — NON-NEGOTIABLE KEEP.** `apps/web/src/components/files/*`
  (`file-browser.tsx`, `file-tree-row.tsx`, `file-preview*.tsx`,
  `file-metadata-panel.tsx`) + lib helpers (`file-tree.ts`, `file-list-limit.ts`,
  `preview-deep-link.ts`) and the `/files` route stay: full-bucket browse across
  `bags/` **and** `catalog/`. It is never removable.
- B2/S3 repo layer `services/api/app/repo/` (`b2_client.py` client factory with
  `user_agent_extra`, `list_cache.py` single-flight list cache, presign machinery),
  `config/settings.py` + `config/b2_required_vars.json`, health/`/health`,
  presign upload endpoints (`/upload/presign`, `/upload/verify`), `/metrics`.
- Web infra: `lib/api-client.ts`, `lib/generated/*` (regenerated via `pnpm gen:api`),
  TanStack Query setup, shadcn `ui/` primitives, layout (`app-sidebar`, `header`,
  `command-palette`, `health-banner`, theme provider), `/design` showcase, error/
  loading/not-found boundaries.
- Settings page (`/settings`, `settings-form.tsx`, `danger-zone.tsx`) — kept, lightly
  trimmed (see doc transforms). It is the **form-UX exemplar**: RadioGroup/Select for
  finite-value fields, `FormDescription` hints, honest demo labelling. New create/edit
  forms in this sample MUST follow that pattern.
- Doc/gen harness: `scripts/gen/sample.schema.json`, `gen-docs.mjs`, `gen-api.mjs`,
  `branding.mjs` (single attribution token enforcement), region-marked README/
  ARCHITECTURE/AGENTS/infra docs.

### TRIM (remove from starter)
- Nothing structural. The file domain is **re-skinned, not deleted**: `/upload`
  becomes the offload/ingest flow, `/` becomes the offload dashboard, generic
  "file metadata" becomes "bag describe". Delete only genuinely dead copy in feature
  docs that no longer applies (see §5).
- Do NOT remove the bucket explorer even though a session-scoped catalog view is added
  (both coexist — this is the mandated keep + add).

### ADD (new for rosbag2-cloud-offload)
- **Session domain (primary entity).** Backend `service/sessions.py` +
  `service/catalog.py`, Pydantic models in `types/sessions.py` / `types/catalog.py`,
  router `runtime/sessions.py` + `runtime/catalog.py`. See §3 for the endpoint
  contract.
- **rosbag2 describe** `service/describe.py`: detect `ros2` on PATH → run
  `ros2 bag info` (subprocess, guarded, timeout); else parse the session's
  `metadata.yaml`. Produces the session record written to
  `bags/<robot>/<session>/metadata.json`. Never crash the request if ROS 2 is absent —
  fall back and set `describe_source: "metadata.yaml"`.
- **Parquet catalog** `service/catalog.py` using `pyarrow`: roll session records into
  `catalog/catalog.parquet` keyed by robot, date, topic set, ROS distro; query/filter.
- **Sample-scoped asset explorer (mandated ADD).** Web `/catalog` route = the
  session catalog: a Session list/search view scoped to the sample's own `bags/`
  namespace (distinct from the full-bucket `/files` explorer), plus session detail at
  `/catalog/[robot]/[session]`.
- **Offload watcher CLI** `services/api/scripts/offload_watcher.py`: watches a local
  rosbag2 output dir, presigns + uploads each closed split, verifies with `head_object`,
  then deletes the local copy only after confirmed. Documented, not part of the web UI.
- Web pages/components: `catalog/page.tsx` (list+search), `catalog/[robot]/[session]/
  page.tsx` (detail: splits, describe summary, compression sizes, replay, edit, delete),
  session create form, replay-manifest panel. Offload flow layered onto `/upload`.

## 3. B2 surface (S3-only — no b2-native)

All S3-compatible via boto3, custom `user_agent_extra`, standard `B2_*` env vars. No
b2-native API. Ops exercised: `put_object` (metadata.json + parquet catalog),
presigned PUT (split upload), `list_objects_v2` (enumerate splits + discover sessions),
`head_object` (confirm-before-local-delete + sizes), `get_object` (read metadata.yaml +
parquet), presigned GET (`ros2 bag play` streaming + catalog download),
`delete_object` (prefix-scoped session delete).

### API endpoints (recorded ONCE — this table is the builder's contract)

Kept from starter (unchanged): `GET /health`; `GET /files`, `GET /files/stats`,
`GET /files/stats/activity`, `GET/DELETE /files-by-key*` + legacy `/files/{key:path}`;
`POST /upload/presign`, `POST /upload/verify`; `GET /metrics` (server-only).

New / added for this sample:

| Path | Method | Request model | Response model |
|---|---|---|---|
| `/sessions` | POST | `SessionCreate` {robot, session_id?, ros_distro, topic_set[], compression} | `Session` |
| `/sessions` | GET | query: robot?, ros_distro?, since?, topic? | `SessionList` |
| `/sessions/{robot}/{session}` | GET | — | `SessionDetail` (splits[], describe summary, orig/compressed sizes, catalog row) |
| `/sessions/{robot}/{session}` | PATCH | `SessionUpdate` {tags[]?, description?} | `Session` |
| `/sessions/{robot}/{session}` | DELETE | — | `DeleteResult` (deleted count, prefix) |
| `/sessions/{robot}/{session}/offload` | POST | `OffloadRequest` {splits:[{filename,size}]} | `OffloadPlan` (presigned PUT url per split, key layout) |
| `/sessions/{robot}/{session}/describe` | POST | — | `SessionDetail` (runs ros2 bag info / metadata.yaml, writes metadata.json) |
| `/sessions/{robot}/{session}/replay` | POST | `ReplayRequest` {expiry_seconds?} | `ReplayManifest` {urls[], ros_distro, topic_set, storage_id_hint} |
| `/catalog` | GET | query: robot?, date?, topic?, ros_distro? | `CatalogRows` |
| `/catalog/rebuild` | POST | — | `CatalogSummary` (rows, parquet key, bytes) |
| `/catalog/download` | GET | — | `PresignedUrl` (presigned GET for catalog.parquet) |

`primary_entity.schema` = `Session` (must be a real `components.schemas` key in the
exported OpenAPI). Offload presign reuses the starter's presign service but constrains
keys to `bags/<robot>/<session>/`.

## 4. Key features (seed README + docs/features/ stubs)

deployment for every feature: **local** (no external provider, no API key, no GPU).

1. **Continuous Bag Offload** — route `/upload`; doc `bag-offload.md`. Presigned-PUT
   per closed split into `bags/<robot>/<session>/`; watcher deletes local copy only
   after `head_object` confirms. Split-and-stream: uploads run while recording
   continues.
2. **Session Catalog & Search** — route `/catalog`; doc `session-catalog.md`. Parquet
   catalog keyed by robot/date/topic set/ROS distro; the sample-scoped explorer over
   the `bags/` namespace. This is the primary-entity list view.
3. **Bag Describe (rosbag2)** — route `null` (backend, surfaced on session detail);
   doc `bag-describe.md`. `ros2 bag info` when ROS 2 present, else parse rosbag2
   `metadata.yaml`; writes `metadata.json`, records compression sizes.
4. **Replay via Presigned URL** — route `null` (action on session detail); doc
   `replay-streaming.md`. Presigned GET manifest for `ros2 bag play` against B2.
5. **Bucket Explorer** — route `/files`; doc `bucket-explorer.md`. Full-bucket browse,
   kept from the starter kit (never removed).
6. **Offload Dashboard** — route `/`; doc `dashboard.md`. Offload volume, sessions,
   compression ratio stats over the `bags/` prefix.

### Primary-entity lifecycle (Session) — UI completeness

Single primary entity: **Session** (`singular: session`, `plural: sessions`). All
CRUD+run verbs are UI-accessible:
- **create** — "Start session" form (robot, session id, ROS distro via **Select**,
  topic set, compression via **Select**/RadioGroup), reachable from `/catalog`. Follows
  the `settings-form.tsx` exemplar: finite-value fields use selectors; create-form
  fields carry safe-default hints as placeholders / `FormDescription` (e.g. distro
  default `jazzy`, compression default `zstd`), never an autofill button.
- **read** — `/catalog` (list + search) and `/catalog/[robot]/[session]` (detail).
- **edit** — edit tags/description form on the detail page (pre-filled; selectors for
  any finite fields).
- **delete** — danger action on detail page; DELETE scoped strictly to the session's
  `bags/<robot>/<session>/` prefix (reuse `danger-zone.tsx` pattern).
- **run** — offload (ingest splits), describe, and prepare-replay, all reachable from
  the detail page / offload flow.

**Non-UI upstream step (not an omitted CRUD verb):** the `ros2 bag record` step runs on
the robot/CLI, outside the web app; the app owns offload→describe→catalog→serve. This is
inherent scope, not a suppressed Session verb, so it is **not** an `omitted_ui_verbs`
entry. No Session CRUD+run verb is omitted → `omitted_ui_verbs` is expected empty.

## 5. Doc transforms

- `file-upload.md` → rewrite as `bag-offload.md`.
- `metadata-extraction.md` → rewrite as `bag-describe.md`.
- `file-browser.md` → rewrite as `bucket-explorer.md` (full-bucket browse, kept).
- `dashboard.md` → rewrite for offload/volume/compression stats.
- `settings.md` → keep, trim to what remains.
- ADD stubs: `session-catalog.md`, `replay-streaming.md`.
- `_template.md` stays.
- Regenerate region-marked README/ARCHITECTURE/AGENTS/infra + `app-workflows.md` via
  `pnpm gen:docs` from the manifest below.

### Declared identity — `docs/exec-plans/sample.json`

Builder writes this file **verbatim** into the sample tree **before** running
`pnpm gen:docs` (it is the one declared-identity file; app name, slug, API_TITLE,
localStorage namespace, CORS rule id all derive from it). `name` must equal `APP_NAME`
in `apps/web/src/lib/app-config.ts` and its derived slug must equal `slug` below;
`settings.py app_slug` and the CORS rule id derive from the same slug; the
`attribution_token` must equal `user_agent_extra` in `b2_client.py` and every
`utm_content`.

```json
{
  "$schema": "../../scripts/gen/sample.schema.json",
  "schema_version": 1,
  "name": "Rosbag2 Cloud Offload",
  "slug": "rosbag2-cloud-offload",
  "package_scope": "@rosbag2-cloud-offload",
  "purpose": "Stream ROS 2 rosbag2 recordings off the robot into Backblaze B2, describe them from rosbag2's own metadata, and catalog every session in Parquet so any recording can be found and replayed with ros2 bag play from a presigned B2 URL.",
  "tagline": "Continuous rosbag2 offload, describe, and catalog on Backblaze B2 — bags off the robot, searchable and replayable.",
  "primary_entity": { "schema": "Session", "singular": "session", "plural": "sessions" },
  "features": [
    { "title": "Continuous Bag Offload", "route": "/upload", "doc": "bag-offload.md", "summary": "Presigned-PUT each closed rosbag2 split into bags/<robot>/<session>/ while recording continues; local copies deleted only after head_object confirms.", "workflow_heading": "Offload" },
    { "title": "Session Catalog & Search", "route": "/catalog", "doc": "session-catalog.md", "summary": "Parquet catalog keyed by robot, date, topic set and ROS distro; sample-scoped explorer over the bags/ namespace." },
    { "title": "Bag Describe", "route": null, "doc": "bag-describe.md", "summary": "ros2 bag info when a ROS 2 env is present, else parse rosbag2 metadata.yaml; writes metadata.json and records compression sizes." },
    { "title": "Replay via Presigned URL", "route": null, "doc": "replay-streaming.md", "summary": "Presigned GET manifest streams a session's splits for ros2 bag play against B2." },
    { "title": "Bucket Explorer", "route": "/files", "doc": "bucket-explorer.md", "summary": "Full-bucket browse across bags/ and catalog/, kept from the starter kit." },
    { "title": "Offload Dashboard", "route": "/", "doc": "dashboard.md", "summary": "Offload volume, session count, and compression-ratio stats over the bags/ prefix." }
  ],
  "b2_surface": [
    { "operation": "put_object", "why": "Write each session's metadata.json and roll the Parquet catalog under catalog/." },
    { "operation": "presigned PUT (put_object)", "why": "Direct robot/browser upload of each closed bag split under bags/<robot>/<session>/." },
    { "operation": "list_objects_v2", "why": "Enumerate a session's splits and discover sessions under the bags/ prefix for the catalog." },
    { "operation": "head_object", "why": "Confirm a split landed before the watcher deletes the local copy, and read split sizes." },
    { "operation": "get_object", "why": "Read rosbag2 metadata.yaml and the Parquet catalog for describe and query." },
    { "operation": "presigned GET (get_object)", "why": "Stream bag splits for ros2 bag play replay and download the catalog." },
    { "operation": "delete_object", "why": "Delete a session's bags, scoped strictly to its bags/<robot>/<session>/ prefix." }
  ],
  "b2_key_prefix": "bags/",
  "stack": { "web": "Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui, TanStack Query)", "api": "FastAPI (Python 3.12+, boto3, Pydantic v2, pyarrow)", "storage": "Backblaze B2 (S3-compatible API)", "package_manager": "pnpm" },
  "deployment_targets": ["vercel", "railway"],
  "env_vars": [
    { "name": "B2_APPLICATION_KEY_ID", "required": true, "secret": true, "note": "B2 application key id." },
    { "name": "B2_APPLICATION_KEY", "required": true, "secret": true, "note": "B2 application key." },
    { "name": "B2_BUCKET_NAME", "required": true, "secret": false, "note": "Target B2 bucket for bags/ and catalog/." },
    { "name": "B2_REGION", "required": true, "secret": false, "note": "B2 region, e.g. us-east-005; endpoint is derived from it." },
    { "name": "B2_PUBLIC_URL_BASE", "required": false, "secret": false, "note": "Optional public base URL for objects served publicly." },
    { "name": "NEXT_PUBLIC_API_URL", "required": false, "secret": false, "note": "Frontend override for the API base URL (dev/deploy)." }
  ],
  "attribution_token": "rosbag2-cloud-offload",
  "repo": { "org": "backblaze-b2-samples", "name": "rosbag2-cloud-offload" },
  "screenshots": []
}
```

**Prefix note (flag):** the app uses two top-level prefixes — `bags/` (primary,
manifest `b2_key_prefix`) and `catalog/`. Keep `ALLOWED_KEY_PREFIX` **empty** in
`settings.py` so catalog writes are not blocked; do not set it to `bags/`. If
`gen:check` asserts `allowed_key_prefix == b2_key_prefix`, prefer relaxing/removing that
assertion's coupling for this sample over breaking catalog writes, and record it as a
deviation. The sample-scoped `/catalog` explorer is what enforces the `bags/`-scoped
view in the UI.

## 6. Rename table (`vibe-coding-starter-kit` → `rosbag2-cloud-offload`)

| Identifier | From | To | Where |
|---|---|---|---|
| App name (Title Case) | `Vibe Coding Starter Kit` | `Rosbag2 Cloud Offload` | `apps/web/src/lib/app-config.ts` (`APP_NAME`) — derived `APP_SLUG` = `rosbag2-cloud-offload` |
| App description | file-management template | see manifest `purpose`/`tagline` | `app-config.ts` (`APP_DESCRIPTION`) |
| Slug (kebab) | `vibe-coding-starter-kit` | `rosbag2-cloud-offload` | derived slug, `settings.py app_slug`, manifest `slug` |
| Package scope | `@vibe-coding-starter-kit` | `@rosbag2-cloud-offload` | root+`apps/web`+`packages/shared` `package.json`, ~14 `apps/web/src/**` imports of `@…/shared`, root `pnpm --filter` scripts |
| API title | `Vibe Coding Starter Kit API` | `Rosbag2 Cloud Offload API` | `services/api/main.py` (`API_TITLE`, `API_DESCRIPTION`), `docs/api/openapi.json` info |
| Attribution token (user_agent + utm_content) | `b2ai-oss-start` | `rosbag2-cloud-offload` | `b2_client.py` `user_agent_extra`, `setup_b2_cors.py`, all `README.md` `utm_content=…`, manifest `attribution_token` |
| CORS rule id | `vibe-coding-starter-kit-direct-upload` | `rosbag2-cloud-offload-direct-upload` | `setup_b2_cors.py` (`RULE_ID`, derived from `app_slug`) |
| localStorage namespace | `vibe-coding-starter-kit-demo-preferences` | `rosbag2-cloud-offload-demo-preferences` | `demo-preferences.ts` (derived from `APP_SLUG`) |
| Repo name / image / railway | `vibe-coding-starter-kit` | `rosbag2-cloud-offload` | `railway.json`, root `package.json` name, `infra/*`, `next.config.ts`, manifest `repo.name` |

Rename both slug declarations together: `app-config.ts` (`APP_NAME`→`APP_SLUG`, TS) and
`settings.py` (`app_slug`, Python — cannot import the TS). Manifest `slug` must equal
both. `branding.mjs` enforces the single attribution token across `user_agent_extra`
and every `utm_content`.

## 7. Build order for the builder

1. Copy the pre-cloned starter tree to `./rosbag2-cloud-offload`, strip `.git`.
2. Write `docs/exec-plans/sample.json` (verbatim block above).
3. Rename sweep (§6) incl. `APP_NAME`/`app_slug`/token/scope.
4. Backend: add `types/sessions.py`,`types/catalog.py`; `service/sessions.py`,
   `service/catalog.py`,`service/describe.py`; routers `runtime/sessions.py`,
   `runtime/catalog.py` wired in `main.py`; `pyarrow` in requirements;
   `scripts/offload_watcher.py`. Re-skin file domain copy to bag/session terms.
5. Web: `catalog/page.tsx`, `catalog/[robot]/[session]/page.tsx`, session create/edit
   forms (settings-form exemplar), replay panel; re-skin `/upload` to offload and `/`
   to offload dashboard; keep `/files` bucket explorer intact; sidebar nav updates.
6. `pnpm contract:export` (FastAPI→openapi.json) then `pnpm gen:api` (regen TS
   routes/types/query-keys) then `pnpm gen:docs`.
7. Doc transforms (§5).
8. Apply the three B2 standards via `/b2-doctor`; ensure S3-only, `user_agent_extra`
   set on every client, standard `B2_*` names.
9. Commit within the sample's own repo (starter's conventions).
