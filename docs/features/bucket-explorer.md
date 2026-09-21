<!-- last_verified: 2026-09-21 -->
# Feature: Bucket Explorer

## Purpose
Browse **every object in the B2 bucket**, across both the `bags/` and `catalog/`
prefixes, in a tree view with preview, download, and delete. This is the
full-bucket explorer kept from the starter kit — the ground-truth view of what
is actually in storage, complementing the session-scoped
[Session Catalog](session-catalog.md), which is scoped to the `bags/` namespace.
Both coexist deliberately.

## Used By
- UI: `/files` (Bucket) page, file browser + preview components
- API: `GET /files`, `GET /files/stats`, `GET /files/stats/activity`, `GET/DELETE /files-by-key*`, `GET /files-by-key/detail`

## Core Functions
- `apps/web/src/components/files/file-browser.tsx`, `file-tree-row.tsx`, `file-preview*.tsx`, `file-metadata-panel.tsx`
- `apps/web/src/lib/file-tree.ts`, `file-list-limit.ts`, `preview-deep-link.ts`
- `services/api/app/runtime/files.py`, `services/api/app/service/files.py`
- `services/api/app/repo/b2_client.py` — `list_files()`, `get_file_metadata()`, `get_presigned_url()`, `delete_file()`

## Inputs
- `GET /files?prefix=&limit=` — the shared full-bucket listing (paginated server-side)
- By-key routes take an object `key` (query param, with a legacy path-param fallback)

## Outputs
- `FileMetadata[]` for the tree; `FileMetadataDetail` for on-demand rich metadata (checksums, image/PDF fields)
- Presigned GET URLs for inline preview and download; `delete_object` for removal

## Flow
- The page loads the most recent objects (sorted newest-first) from a shared bucket listing the API warms at startup
- Folders auto-expand until the majority of listed objects are reachable; the page states its cap honestly when the bucket holds more than the listed limit
- Clicking a row opens a preview with a metadata panel and the file's download/delete actions
- Delete holds its confirmation dialog until the request settles, then reconciles the list against the server

## Edge Cases
- Empty bucket → "No files found" with a prompt to offload
- Listing capped → a notice states how many objects the bucket actually holds
- B2 unreachable → inline `ErrorState` with a Retry, never a misleading empty tree

## Verification
- Test files: `services/api/tests/test_delete.py`, `test_file_key_routes.py`, `test_list_pagination.py`, `test_recent_files.py`, `apps/web/src/lib/file-tree.test.ts`
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: listing, preview, download, and delete work against a real bucket holding `bags/` and `catalog/` objects

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Session Catalog & Search](session-catalog.md)
- [App Workflows](../app-workflows.md)
