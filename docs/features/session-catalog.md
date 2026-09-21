<!-- last_verified: 2026-09-21 -->
# Feature: Session Catalog & Search

## Purpose
Make every offloaded recording findable. Session records under `bags/` are
rolled into a **Parquet catalog** (`catalog/catalog.parquet`) keyed by robot,
date, topic set, and ROS distro — the axes a fleet queries a recording archive
by. The `/catalog` screen is the sample-scoped explorer over the `bags/`
namespace and the primary-entity list view; the Parquet file itself is
downloadable for offline analysis (DuckDB, pandas, pyarrow). This is distinct
from the full-bucket [Bucket Explorer](bucket-explorer.md).

## Used By
- UI: `/catalog` (list + search + start session), `/catalog/[robot]/[session]` (detail)
- API: `GET /catalog`, `POST /catalog/rebuild`, `GET /catalog/download`, plus `GET /sessions` and `GET /sessions/{robot}/{session}`

## Core Functions
- `services/api/app/service/catalog.py` — `get_catalog()` (query/filter), `rebuild_catalog()` (roll sessions → Parquet), `download_catalog()` (presigned GET), `row_from_session()` (projection)
- `services/api/app/repo/catalog_store.py` — pyarrow (de)serialization, contained in the repo layer (structural test asserts it)
- `services/api/app/service/sessions.py` — session discovery under `bags/`, CRUD
- `apps/web/src/components/sessions/sessions-table.tsx`, `apps/web/src/app/catalog/page.tsx`

## Inputs
- Query params on `GET /catalog`: `robot?`, `date?`, `topic?`, `ros_distro?`
- Session discovery: `list_objects_v2` under the `bags/` prefix + each session's `metadata.json`

## Outputs
- `CatalogRows`: rows keyed by robot/date/topic-set/distro with split count, message count, duration, and compression figures
- `CatalogSummary` (rebuild): row count, `parquet_key`, byte size
- `PresignedUrl` (download): a short-lived GET for `catalog/catalog.parquet`
- Side effect: `put_object` writes `catalog/catalog.parquet`

## Flow
- `/catalog` lists rows (reads the built Parquet when present, else derives live from session records) and supports free-text search across robot, session, distro, and topic
- "Start session" opens a create form (the settings-form exemplar: ROS distro and compression are selectors with safe-default hints)
- "Rebuild catalog" rolls every session into `catalog/catalog.parquet`
- "Download .parquet" presigns a GET so you can query the catalog with your own tools

## Edge Cases
- No sessions yet → empty state; rebuild writes a valid (empty) Parquet file
- Corrupt/unreadable catalog object → the query transparently re-derives rows from session records
- Catalog not built yet on download → it is built lazily so the link always resolves

## Verification
- Test files: `services/api/tests/test_structure.py` (pyarrow containment)
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: offloading a session then querying `/catalog` returns a row for it; rebuild reports a positive byte size

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Continuous Bag Offload](bag-offload.md)
- [Bucket Explorer](bucket-explorer.md)
- [App Workflows](../app-workflows.md)
