"""Seed a tiny, synthetic demo into B2 — no download, no second key.

Creates a couple of recording sessions under `bags/`, each with a realistic
rosbag2 `metadata.yaml` (rosbag2's own format) and a few small synthetic split
files, then describes them from that metadata and rebuilds the Parquet catalog.
Everything is generated locally, so the default demo populates the app end to
end using only your B2 bucket and the standard `B2_*` credentials the app
already reads.

Usage:
    python services/api/scripts/seed_demo.py
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.repo import upload_file  # noqa: E402
from app.service.catalog import rebuild_catalog  # noqa: E402
from app.service.offload import run_describe  # noqa: E402
from app.service.sessions import (  # noqa: E402
    SessionExistsError,
    create_session,
    session_prefix,
)
from app.types import SessionCreate  # noqa: E402

# Keep the seed tiny so verify and screenshots stay fast.
DEMO = [
    {
        "robot": "robot-07",
        "session_id": "20260921T101500Z",
        "ros_distro": "jazzy",
        "compression": "zstd",
        "topics": [
            ("/camera/image_raw", "sensor_msgs/msg/Image", 1200),
            ("/scan", "sensor_msgs/msg/LaserScan", 600),
            ("/tf", "tf2_msgs/msg/TFMessage", 2400),
        ],
        "splits": ["run_0.mcap", "run_1.mcap"],
    },
    {
        "robot": "robot-11",
        "session_id": "20260921T144500Z",
        "ros_distro": "humble",
        "compression": "zstd",
        "topics": [
            ("/imu/data", "sensor_msgs/msg/Imu", 5000),
            ("/odom", "nav_msgs/msg/Odometry", 5000),
        ],
        "splits": ["drive_0.mcap"],
    },
]


def _log(message: str) -> None:
    sys.stdout.write(f"{message}\n")


def _metadata_yaml(spec: dict) -> bytes:
    """A minimal but real rosbag2 metadata.yaml for the demo session."""
    total = sum(count for _, _, count in spec["topics"])
    topic_blocks = "\n".join(
        "    - topic_metadata:\n"
        f"        name: {name}\n"
        f"        type: {msg_type}\n"
        "        serialization_format: cdr\n"
        f"      message_count: {count}"
        for name, msg_type, count in spec["topics"]
    )
    files = "\n".join(f"    - path: {name}" for name in spec["splits"])
    return (
        "rosbag2_bagfile_information:\n"
        "  version: 9\n"
        "  storage_identifier: mcap\n"
        f"  compression_format: {spec['compression']}\n"
        "  compression_mode: FILE\n"
        "  duration:\n"
        "    nanoseconds: 42000000000\n"
        f"  message_count: {total}\n"
        "  topics_with_message_count:\n"
        f"{topic_blocks}\n"
        "  relative_file_paths:\n"
        f"{files}\n"
    ).encode()


def _synthetic_split(name: str, index: int) -> bytes:
    """A small synthetic 'bag split' — just enough bytes to have a real size."""
    header = b"\x89MCAP0\r\n"  # mcap magic-ish; content is synthetic
    body = f"synthetic rosbag2 split {name} #{index}\n".encode() * 512
    return header + body


def seed_one(spec: dict) -> None:
    robot, session_id = spec["robot"], spec["session_id"]
    try:
        create_session(
            SessionCreate(
                robot=robot,
                session_id=session_id,
                ros_distro=spec["ros_distro"],
                topic_set=[name for name, _, _ in spec["topics"]],
                compression=spec["compression"],
            )
        )
        _log(f"created session {robot}/{session_id}")
    except SessionExistsError:
        _log(f"session {robot}/{session_id} already exists — reseeding its splits")

    prefix = session_prefix(robot, session_id)
    for index, name in enumerate(spec["splits"]):
        upload_file(_synthetic_split(name, index), prefix + name, "application/octet-stream")
        _log(f"  offloaded {name}")
    upload_file(_metadata_yaml(spec), prefix + "metadata.yaml", "application/x-yaml")
    _log("  offloaded metadata.yaml")
    detail = run_describe(robot, session_id)
    _log(f"  described ({detail.describe.describe_source if detail.describe else 'n/a'})")


def main() -> int:
    _log(f"Seeding demo sessions at {datetime.now(UTC).isoformat()}")
    for spec in DEMO:
        seed_one(spec)
    summary = rebuild_catalog()
    _log(f"catalog rebuilt: {summary.rows} rows, {summary.bytes} bytes at {summary.parquet_key}")
    _log("Done. Open the app: Dashboard, Catalog, and Bucket now show the seeded sessions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
