<!-- last_verified: 2026-09-21 -->
# Feature: Replay via Presigned URL

## Purpose
Replay a stored session with `ros2 bag play` straight from Backblaze B2. The API
mints a short-lived **presigned GET** for each split and returns a replay
manifest — the ROS distro, the topic set, the rosbag2 storage plugin hint
(`mcap` / `sqlite3`), and one signed URL per split — so a recording offloaded
weeks ago can be pulled back and played without keeping it on local disk.

## Used By
- UI: session detail (`/catalog/[robot]/[session]`) — the "Prepare replay" panel
- API: `POST /sessions/{robot}/{session}/replay`

## Core Functions
- `services/api/app/service/offload.py` — `prepare_replay()`: lists splits, presigns a GET for each, derives the storage-plugin hint from the split extension
- `services/api/app/repo/b2_client.py` — `get_presigned_url()` (signed GET)
- `apps/web/src/components/sessions/replay-panel.tsx` — renders the manifest and a copyable download-and-play script

## Inputs
- `ReplayRequest`: `{ expiry_seconds? }` (defaults to 3600)

## Outputs
- `ReplayManifest`: `robot`, `session_id`, `ros_distro`, `topic_set[]`, `storage_id_hint`, `urls[]` (`filename`, `key`, `url`), `expires_in`

## Flow
- The user prepares a replay on the session detail page
- The API lists the session's splits and presigns a GET for each
- The panel shows the presigned URLs and a copyable script: download each split, then `ros2 bag play <session> --storage <hint>`
- URLs expire after `expires_in` seconds — regenerate by preparing replay again

## Edge Cases
- Session has no splits → `404` ("no splits to replay")
- Mixed or unknown split extensions → the storage hint defaults to `sqlite3`
- Expired URL → re-prepare replay for fresh signatures

## Verification
- Test files: exercised end-to-end against a real session's splits
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: preparing replay for a session with splits returns one presigned URL per split and a storage hint

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Bag Describe](bag-describe.md)
- [Session Catalog & Search](session-catalog.md)
- [App Workflows](../app-workflows.md)
