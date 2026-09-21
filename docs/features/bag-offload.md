<!-- last_verified: 2026-09-21 -->
# Feature: Continuous Bag Offload

## Purpose
Stream each closed `rosbag2` split off the robot into Backblaze B2 while the
recording continues, so multi-GB-per-hour bag streams live durably off-machine
without the robot ever holding B2 credentials or standing up its own object
store. Splits are uploaded with a **presigned PUT straight to B2**, so the bytes
never traverse the API and there is no serverless payload ceiling.

## Used By
- UI: `/upload` (Offload page) — pick or start a session, then drop splits
- API: `POST /sessions/{robot}/{session}/offload` (presign), `POST /upload/verify` is not used here
- CLI: `services/api/scripts/offload_watcher.py` (on-device continuous watcher)

## Core Functions
- `services/api/app/service/offload.py` — `plan_offload()`: presigns a PUT per split, keys constrained to `bags/<robot>/<session>/`
- `services/api/app/repo/b2_client.py` — `generate_presigned_upload()` (signed PUT), `get_file_metadata()` (head confirm)
- `apps/web/src/lib/api-client.ts` — `uploadSplit()`: presign → direct browser→B2 PUT (XHR for progress)
- `apps/web/src/components/sessions/offload-panel.tsx` — the drop-to-offload UI
- `apps/web/src/lib/offload-chain.ts` — `chainOffloadFollowUps()`: after a batch, runs describe then catalog rebuild (skips when nothing landed)
- `services/api/scripts/offload_watcher.py` — watches a local bag dir, offloads closed splits, confirms via `head_object`, deletes the local copy only after confirmation

## Inputs
- Offload plan request: `{ splits: [{ filename, size }] }` (JSON)
- Direct PUT: the raw split bytes to the signed B2 URL (never through the API)

## Outputs
- `OffloadPlan`: one `OffloadPresignedSplit` (`filename`, `key`, `url`, `method`, `headers`, `expires_in`) per split
- Side effects: each split stored in B2 under `bags/<robot>/<session>/<filename>`; the shared bucket-listing cache is invalidated so the split shows up in the session, catalog, and `/files`

## Flow
- User picks a session on `/upload` (or starts one), then selects/drops splits
- Client asks the API to presign each split (`POST …/offload`), constrained to the session prefix
- Browser PUTs the raw bytes **directly to B2** with the signed URL, `Content-Length` and `Content-Type` signed in
- The on-device watcher additionally HEADs the object and only then deletes the local copy — no split is dropped before B2 confirms it landed
- Upload metadata.yaml alongside the splits so [Bag Describe](bag-describe.md) can read the recording
- **Auto-chain to catalog:** once a browser offload batch finishes with at least one successful split, the panel automatically runs [Bag Describe](bag-describe.md) for the session and then rebuilds the [Session Catalog](session-catalog.md) — the same two mutations the manual "Run describe" and "Rebuild catalog" buttons call, reused so a first-time user reaches a described, searchable session without hunting for those buttons on other pages. The manual buttons remain. The sequencing rule (skip when nothing landed; rebuild only after describe resolves) lives in `apps/web/src/lib/offload-chain.ts`. Describe returns an "unavailable" summary rather than failing when no `metadata.yaml` is present yet, so the session is still cataloged.

## Edge Cases
- Non-positive or zero split size → `400` at presign
- Filename with path separators → sanitized to a single segment under the session prefix
- B2 rejects the PUT because the body size differs from the signed value → `403`, surfaced as "Offload to storage failed"
- Bucket CORS does not allow a deployed origin → the browser blocks the PUT; run `services/api/scripts/setup_b2_cors.py`

## UX States
- Empty: the drop area invites splits
- Loading: per-split determinate progress bar
- Complete: green check per split; the session and catalog refresh, then an in-progress line ("Describing from rosbag2…" → "Rolling this session into the catalog…") reports the auto-chained follow-ups, ending in a "Described and added to the searchable catalog" toast
- Error: red icon and message per split, retriable by re-dropping; if a follow-up stage fails the splits still landed and an "Offloaded, but cataloging did not finish" toast surfaces the reason

## B2 bucket CORS
Because the browser PUTs directly to B2, the bucket must allow the web origin
(method `PUT` + the `content-type` header). Run once per deployed origin:

```bash
python services/api/scripts/setup_b2_cors.py --origin https://your-app.vercel.app --apply
```

## Verification
- Test files: `services/api/tests/test_structure.py` (boundaries), `apps/web/src/lib/offload-chain.test.ts` (auto-chain sequencing + skip-when-empty), plus offload is exercised end-to-end against a real bucket
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: presign returns a signed PUT scoped to the session prefix; a PUT of the signed size succeeds and the split appears in the session

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Bag Describe](bag-describe.md)
- [Session Catalog & Search](session-catalog.md)
- [App Workflows](../app-workflows.md)
