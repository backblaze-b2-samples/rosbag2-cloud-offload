<!-- last_verified: 2026-09-21 -->
# Feature: Bag Describe (rosbag2)

## Purpose
Describe an offloaded recording using **rosbag2 as the vendor engine** — never a
third-party bag reader. Describe prefers the real `ros2 bag info` CLI when a ROS
2 environment is on `PATH`, and otherwise parses the `metadata.yaml` that
rosbag2 itself writes beside every bag. The result — duration, message count,
topics and types, serialization format, storage plugin, and compression figures
— is written to the session's `metadata.json` and shown on the session detail.

## Used By
- UI: session detail (`/catalog/[robot]/[session]`) — the "Run describe" action; also auto-run once per browser offload batch by the offload panel (see [Continuous Bag Offload](bag-offload.md))
- API: `POST /sessions/{robot}/{session}/describe`
- CLI: `services/api/scripts/offload_watcher.py` (prefers `ros2 bag info` on-device)

## Core Functions
- `services/api/app/service/describe.py` — `describe_from_metadata_yaml()` (parse rosbag2's own metadata), `describe_local_bag()` (prefers `ros2 bag info`), `ros2_available()`
- `services/api/app/service/offload.py` — `run_describe()`: reads `metadata.yaml` from B2, describes, persists the summary into `metadata.json`
- `services/api/app/repo/b2_client.py` / `b2_object.py` — `get_object_bytes()` reads the metadata

## Inputs
- The session's `bags/<robot>/<session>/metadata.yaml` (read from B2)
- On-device: a local bag directory, when `ros2 bag info` is available

## Outputs
- `DescribeSummary`: `describe_source` (`ros2 bag info` | `metadata.yaml` | `unavailable`), `ros2_available`, `duration_seconds`, `message_count`, `topics[]`, `topic_types{}`, `serialization_format`, `storage_identifier`, `compression_format`, `compression_mode`, `original_size_bytes`, `compressed_size_bytes`, `compression_ratio`
- Side effect: the summary is merged into `metadata.json` under the session prefix

## Flow
- The server reads `metadata.yaml` from the session prefix in B2
- It parses rosbag2's `rosbag2_bagfile_information` block (tolerant of version differences)
- `compressed_size_bytes` is the real bytes stored in B2 for the session's splits; `original_size_bytes` comes from rosbag2 metadata when recorded, and the ratio is derived when both are known
- The summary is written back into `metadata.json`, so the next read is instant
- On-device, the watcher runs `ros2 bag info` first and records `describe_source: "ros2 bag info"`

## Edge Cases
- No `metadata.yaml` offloaded yet → `describe_source: "unavailable"`, empty topics, still returns 200
- Unparseable YAML → tolerated; fields default to null rather than raising
- ROS 2 absent on the server → always falls back to `metadata.yaml`; the request never crashes

## Verification
- Test files: `services/api/tests/test_structure.py` (pyarrow/boto3 containment); describe is exercised against a real offloaded session
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: describing a session with a `metadata.yaml` returns topics and compression fields and records `describe_source`

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Continuous Bag Offload](bag-offload.md)
- [Replay via Presigned URL](replay-streaming.md)
- [App Workflows](../app-workflows.md)
