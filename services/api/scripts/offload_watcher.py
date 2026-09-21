"""On-device rosbag2 offload watcher.

Watches a local rosbag2 output directory and streams each closed split off the
machine into Backblaze B2, via this app's API — so the robot never needs B2
credentials of its own. For every split it:

  1. asks the API for a presigned PUT (POST /sessions/{robot}/{session}/offload),
  2. PUTs the bytes straight to B2 with that URL,
  3. confirms the object landed (GET /sessions/{robot}/{session} lists it back —
     the server did the head_object), and only THEN
  4. deletes the local copy (with --delete-after).

It also uploads rosbag2's own metadata.yaml and triggers a server-side describe,
so the session is described from rosbag2's metadata the moment it is offloaded.
`ros2 bag info` is preferred locally when a ROS 2 environment is on PATH (see
app/service/describe.py); this watcher itself needs only the Python stdlib.

Usage:
    python services/api/scripts/offload_watcher.py \
        --robot robot-07 --bag-dir /var/lib/rosbag2/run_2026_09_21 \
        --api-url http://localhost:8000 --ros-distro jazzy --once --delete-after
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# rosbag2 writes these beside the splits; they are not themselves bag splits.
_NON_SPLIT = {"metadata.yaml"}
_STABILITY_SECONDS = 5.0


def _log(message: str) -> None:
    sys.stdout.write(f"{message}\n")
    sys.stdout.flush()


def _request(url: str, *, method: str = "GET", body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read() or b"{}")


def _put_bytes(url: str, payload: bytes, content_type: str) -> None:
    req = urllib.request.Request(
        url, data=payload, method="PUT", headers={"Content-Type": content_type}
    )
    with urllib.request.urlopen(req, timeout=600):
        return


def ensure_session(api: str, robot: str, session: str, distro: str, compression: str) -> None:
    body = {
        "robot": robot,
        "session_id": session,
        "ros_distro": distro,
        "compression": compression,
        "topic_set": [],
    }
    try:
        _request(f"{api}/sessions", method="POST", body=body)
        _log(f"Created session {robot}/{session}")
    except urllib.error.HTTPError as exc:
        if exc.code == 409:
            _log(f"Session {robot}/{session} already exists — continuing")
        else:
            raise


def offload_one(api: str, robot: str, session: str, path: Path) -> str:
    """Presign, PUT, and return the B2 key for one file."""
    size = path.stat().st_size
    plan = _request(
        f"{api}/sessions/{robot}/{session}/offload",
        method="POST",
        body={"splits": [{"filename": path.name, "size": size}]},
    )
    split = plan["splits"][0]
    _put_bytes(split["url"], path.read_bytes(), split["headers"]["Content-Type"])
    return split["key"]


def confirm_landed(api: str, robot: str, session: str, key: str, size: int) -> bool:
    """The server lists (head_object) the session's objects; confirm ours is there."""
    detail = _request(f"{api}/sessions/{robot}/{session}")
    for split in detail.get("splits", []):
        if split["key"] == key and split["size_bytes"] == size:
            return True
    return False


def stable_files(bag_dir: Path) -> list[Path]:
    """Files that look closed: not the metadata sidecar, and untouched recently."""
    now = time.time()
    files = []
    for path in sorted(bag_dir.iterdir()):
        if not path.is_file() or path.name in _NON_SPLIT:
            continue
        if now - path.stat().st_mtime >= _STABILITY_SECONDS:
            files.append(path)
    return files


def offload_metadata_and_describe(api: str, robot: str, session: str, bag_dir: Path) -> None:
    meta = bag_dir / "metadata.yaml"
    if meta.exists():
        _log("Offloading rosbag2 metadata.yaml")
        offload_one(api, robot, session, meta)
    try:
        _request(f"{api}/sessions/{robot}/{session}/describe", method="POST", body={})
        _log("Server described the session from rosbag2 metadata")
    except urllib.error.HTTPError as exc:
        _log(f"Describe skipped (HTTP {exc.code})")


def sweep(api: str, robot: str, session: str, bag_dir: Path, delete_after: bool) -> int:
    offloaded = 0
    for path in stable_files(bag_dir):
        size = path.stat().st_size
        _log(f"Offloading {path.name} ({size} bytes)")
        key = offload_one(api, robot, session, path)
        if not confirm_landed(api, robot, session, key, size):
            _log(f"  NOT confirmed on B2 yet — leaving {path.name} in place")
            continue
        _log(f"  confirmed at {key}")
        if delete_after:
            path.unlink()
            _log(f"  deleted local {path.name}")
        offloaded += 1
    return offloaded


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--robot", required=True)
    parser.add_argument("--session", default=None, help="Defaults to the bag dir name.")
    parser.add_argument("--bag-dir", required=True, type=Path)
    parser.add_argument("--ros-distro", default="jazzy")
    parser.add_argument("--compression", default="zstd")
    parser.add_argument("--poll-interval", type=float, default=10.0)
    parser.add_argument("--once", action="store_true", help="One sweep, then exit.")
    parser.add_argument(
        "--delete-after",
        action="store_true",
        help="Delete each local split ONLY after B2 confirms it landed.",
    )
    args = parser.parse_args()

    bag_dir: Path = args.bag_dir
    if not bag_dir.is_dir():
        _log(f"bag dir not found: {bag_dir}")
        return 2
    session = args.session or bag_dir.name
    api = args.api_url.rstrip("/")

    ensure_session(api, args.robot, session, args.ros_distro, args.compression)

    while True:
        moved = sweep(api, args.robot, session, bag_dir, args.delete_after)
        if moved:
            offload_metadata_and_describe(api, args.robot, session, bag_dir)
        if args.once:
            return 0
        time.sleep(args.poll_interval)


if __name__ == "__main__":
    raise SystemExit(main())
