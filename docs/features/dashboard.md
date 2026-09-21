<!-- last_verified: 2026-09-21 -->
# Feature: Offload Dashboard

## Purpose
Give a fleet-level overview of what has been offloaded to Backblaze B2: how many
recording sessions exist, across how many robots, how many objects are in the
bucket, and how much storage is used — plus the most recent sessions, each
linking straight to its detail. It is the landing screen (`/`).

## Used By
- UI: `/` (Offload Dashboard)
- API: `GET /sessions` (session + robot counts, recent list), `GET /files/stats` (bucket object count and storage used)

## Core Functions
- `apps/web/src/app/page.tsx` — the dashboard screen (stat cards + recent sessions table)
- `apps/web/src/lib/queries.ts` — `useSessions()`, `useFileStats()`
- `services/api/app/service/sessions.py` — session discovery under `bags/`
- `services/api/app/service/files.py` — `get_stats()` over the bucket

## Inputs
- Session list from `GET /sessions`
- Bucket aggregate figures from `GET /files/stats` (served from the shared bucket listing)

## Outputs
- Stat cards: Sessions, Robots (distinct), Objects in bucket, Storage used
- Recent sessions table: robot/session (linked), ROS distro, split count, stored size, created time

## Flow
- On load, the dashboard fetches the session list and bucket stats in parallel
- Stat cards derive session and robot counts client-side from the session list; object count and storage come from the bucket stats
- The recent-sessions table shows the newest sessions; each row links to `/catalog/[robot]/[session]`

## Edge Cases
- No sessions yet → empty state prompting to start one and offload
- Stats fetch fails → inline `ErrorState` with Retry, never "0 objects" presented as truth
- Bucket listing cold on first load → cards show a brief loading state

## UX States
- Loading: skeleton stat values and table rows
- Empty: "No sessions yet" with guidance
- Error: inline error with Retry

## Verification
- Test files: `services/api/tests/test_download_stats.py`, `test_recent_files.py`
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: with at least one session offloaded, the cards show non-zero counts and the recent table links resolve to session detail

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Session Catalog & Search](session-catalog.md)
- [App Workflows](../app-workflows.md)
