<!-- last_verified: 2026-09-21 -->
# App Workflows

User journeys inside the application. Recording itself happens on the robot with
`ros2 bag record`; this app owns everything after a split closes —
offload → describe → catalog → serve.

## Offload

- User navigates to `/upload` (Offload)
- Picks an existing session from the dropdown, or starts a new one ("Start session" — robot, session id, ROS distro, compression, topics)
- Drops or selects the closed rosbag2 splits (`.mcap` / `.db3`) and, ideally, the `metadata.yaml` rosbag2 wrote beside them
- Each split is presigned per-file and uploaded **directly from the browser to B2** under `bags/<robot>/<session>/`; a determinate progress bar tracks the bytes leaving the browser
- On success the session, catalog, and bucket views refresh; a link opens the session detail
- For hands-off, continuous offload the robot runs `services/api/scripts/offload_watcher.py`, which watches the local bag directory, offloads each closed split, confirms it landed with a `head_object`, and only then deletes the local copy
- See: [Continuous Bag Offload](features/bag-offload.md)

## Session Catalog & Search

- User navigates to `/catalog`
- The page lists every session under the `bags/` namespace and supports free-text search across robot, session id, ROS distro, and topic
- "Start session" opens the create form; finite fields (ROS distro, compression) are selectors with safe-default hints (jazzy, zstd)
- "Rebuild catalog" rolls every session into `catalog/catalog.parquet`; "Download .parquet" presigns a GET so the catalog can be queried with DuckDB, pandas, or pyarrow
- Clicking a row opens the session detail at `/catalog/<robot>/<session>`: session record, splits, the rosbag2 describe summary, replay, edit, and delete
- On the detail page: **Run describe** reads the recording from rosbag2 metadata; **Prepare replay** mints presigned URLs; **Edit** updates tags/description; **Delete** removes the session, scoped strictly to its `bags/<robot>/<session>/` prefix
- See: [Session Catalog & Search](features/session-catalog.md)

## Bucket Explorer

- User navigates to `/files` (Bucket)
- The page loads the most recent objects across the whole bucket — both `bags/` and `catalog/` — sorted newest-first, from a shared listing the API warms at startup
- Folders auto-expand until the majority of listed objects are reachable; if the listing is capped, a notice states how many objects the bucket actually holds
- Clicking a row opens a preview with a metadata panel and the object's download/delete actions
- Delete holds its confirmation dialog until the request settles, then reconciles the list against the server
- This full-bucket view coexists with the session-scoped Catalog by design
- See: [Bucket Explorer](features/bucket-explorer.md)

## Offload Dashboard

- User navigates to `/` (home)
- Stat cards show sessions, distinct robots, objects in the bucket, and storage used — session and robot counts derived client-side from the session list, object and storage figures from the bucket stats
- A recent-sessions table lists the newest sessions; each filename links to that session's detail
- Empty state prompts the user to start a session and offload a recording
- See: [Offload Dashboard](features/dashboard.md)

## Change Preferences

- User navigates to `/settings`
- A banner states that the page is mostly a demonstration: only Theme is wired up for real, the rest showcases what a settings page can look like when you adapt the kit
- **Theme** (real): editing and saving applies it immediately and persists it (`next-themes`); the header toggle drives the same state
- **Profile and preference fields** (demo): labelled "Demo field", persisted to `localStorage` only, driving no behaviour — there is no account system, mailer, quota banner, or activity log behind them
- Saving reports honestly: a success toast separating the real theme change from the locally-stored demo values, or a warning toast if the browser blocked storage
- See: [Settings](features/settings.md)
