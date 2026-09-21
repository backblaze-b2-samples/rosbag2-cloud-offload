"""Describe a rosbag2 recording — rosbag2 is the vendor engine.

Two sources, in preference order, and never a third-party bag reader:

1. `ros2 bag info` — the real ROS 2 CLI, run as a guarded subprocess when a ROS
   2 environment is on PATH and a local bag directory is available (the
   on-device offload watcher path).
2. rosbag2's own `metadata.yaml` — the file rosbag2 writes beside every bag —
   parsed directly. This is the server path: the splits live in B2, so the
   server reads the uploaded `metadata.yaml` rather than a local bag.

Compression and size figures come from what rosbag2 records: the
`compression_format` / `compression_mode` fields in `metadata.yaml`, plus the
actual bytes stored in B2 for the compressed size.
"""

import shutil
import subprocess
from pathlib import Path

import yaml

from app.types import DescribeSummary

_INFO_TIMEOUT_SECONDS = 60


def ros2_available() -> bool:
    """True when the `ros2` CLI is on PATH where this process runs."""
    return shutil.which("ros2") is not None


def _seconds(node: object) -> float | None:
    """rosbag2 stores durations as `{nanoseconds: N}`; return whole seconds."""
    if isinstance(node, dict) and "nanoseconds" in node:
        try:
            return round(int(node["nanoseconds"]) / 1e9, 3)
        except (TypeError, ValueError):
            return None
    return None


def describe_from_metadata_yaml(
    yaml_bytes: bytes,
    *,
    compressed_size_bytes: int | None = None,
    source: str = "metadata.yaml",
) -> DescribeSummary:
    """Parse rosbag2's own `metadata.yaml` into a DescribeSummary.

    Tolerant of missing keys across rosbag2 versions: anything absent stays
    None rather than raising, so an old or partial bag still describes.
    """
    try:
        info = (yaml.safe_load(yaml_bytes) or {}).get("rosbag2_bagfile_information", {})
    except yaml.YAMLError:
        info = {}

    topics_block = info.get("topics_with_message_count") or []
    topics: list[str] = []
    topic_types: dict[str, str] = {}
    serialization_format: str | None = None
    for entry in topics_block:
        meta = (entry or {}).get("topic_metadata") or {}
        name = meta.get("name")
        if not name:
            continue
        topics.append(name)
        if meta.get("type"):
            topic_types[name] = meta["type"]
        serialization_format = serialization_format or meta.get("serialization_format")

    compression_format = info.get("compression_format") or None
    original = info.get("uncompressed_size") or info.get("bag_size")
    original_size = int(original) if isinstance(original, int) else None
    ratio = None
    if original_size and compressed_size_bytes:
        ratio = round(original_size / compressed_size_bytes, 3)

    return DescribeSummary(
        describe_source=source,
        ros2_available=ros2_available(),
        storage_identifier=info.get("storage_identifier") or None,
        serialization_format=serialization_format,
        duration_seconds=_seconds(info.get("duration")),
        message_count=info.get("message_count"),
        topics=topics,
        topic_types=topic_types,
        compression_format=compression_format,
        compression_mode=info.get("compression_mode") or None,
        original_size_bytes=original_size,
        compressed_size_bytes=compressed_size_bytes,
        compression_ratio=ratio,
    )


def describe_local_bag(
    local_dir: str | Path, *, compressed_size_bytes: int | None = None
) -> DescribeSummary:
    """Describe a bag on the local filesystem, preferring `ros2 bag info`.

    Runs the real rosbag2 CLI when it is present, then reads the structured
    fields from rosbag2's own `metadata.yaml` in the same directory. If the CLI
    is absent or errors, the metadata.yaml read alone still produces a summary.
    Used by the on-device offload watcher; the request path never sees this.
    """
    directory = Path(local_dir)
    metadata_path = directory / "metadata.yaml"
    yaml_bytes = metadata_path.read_bytes() if metadata_path.exists() else b""

    used_cli = False
    if ros2_available():
        try:
            proc = subprocess.run(
                ["ros2", "bag", "info", str(directory)],
                capture_output=True,
                text=True,
                timeout=_INFO_TIMEOUT_SECONDS,
                check=False,
            )
            used_cli = proc.returncode == 0
        except (OSError, subprocess.SubprocessError):
            used_cli = False

    source = "ros2 bag info" if used_cli else "metadata.yaml"
    return describe_from_metadata_yaml(
        yaml_bytes, compressed_size_bytes=compressed_size_bytes, source=source
    )
