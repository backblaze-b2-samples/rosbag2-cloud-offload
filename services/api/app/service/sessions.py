"""Session lifecycle: create, read, update, delete, and the shared helpers.

A session is a rosbag2 recording stored under `bags/<robot>/<session>/`. B2 is
the only store: the session record is `metadata.json` written beside the splits,
so there is no database. All B2 access goes through the boto3 `repo/` layer.

The run verbs (offload, describe, replay) live in `service/offload.py`, which
reuses the helpers here — kept split so each module stays within the 300-line
structural limit.
"""

import json
import re
from datetime import UTC, datetime

from app.repo import (
    delete_file,
    get_file_metadata,
    get_object_bytes,
    list_files,
    upload_file,
)
from app.types import (
    DeleteResult,
    DescribeSummary,
    Session,
    SessionCreate,
    SessionDetail,
    SessionList,
    SessionUpdate,
    SplitInfo,
)
from app.types.formatting import humanize_bytes

BAGS_PREFIX = "bags/"
METADATA_JSON = "metadata.json"
METADATA_YAML = "metadata.yaml"
NON_SPLIT = {METADATA_JSON, METADATA_YAML}
_SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class InvalidSessionError(Exception):
    def __init__(self, detail: str = "Invalid session identifier"):
        self.detail = detail
        super().__init__(detail)


class SessionNotFoundError(Exception):
    def __init__(self, detail: str = "Session not found"):
        self.detail = detail
        super().__init__(detail)


class SessionExistsError(Exception):
    def __init__(self, detail: str = "Session already exists"):
        self.detail = detail
        super().__init__(detail)


def segment(value: str, field: str) -> str:
    value = (value or "").strip()
    if not _SEGMENT_RE.match(value):
        raise InvalidSessionError(
            f"{field} must be 1-128 chars of letters, digits, dot, dash or underscore"
        )
    return value


def session_prefix(robot: str, session_id: str) -> str:
    return f"{BAGS_PREFIX}{robot}/{session_id}/"


def metadata_key(robot: str, session_id: str) -> str:
    return session_prefix(robot, session_id) + METADATA_JSON


def generate_session_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def splits_of(objects: list) -> list:
    return [o for o in objects if o.filename not in NON_SPLIT]


def read_record(robot: str, session_id: str) -> dict | None:
    key = metadata_key(robot, session_id)
    if get_file_metadata(key) is None:
        return None
    try:
        return json.loads(get_object_bytes(key))
    except (ValueError, RuntimeError):
        return None


def write_record(record: dict) -> None:
    key = metadata_key(record["robot"], record["session_id"])
    upload_file(json.dumps(record, indent=2).encode("utf-8"), key, "application/json")


def _parse_created(value: object) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            pass
    return datetime.now(UTC)


def build_session(robot: str, session_id: str, record: dict | None, splits: list) -> Session:
    record = record or {}
    total = sum(o.size_bytes for o in splits)
    return Session(
        robot=robot,
        session_id=session_id,
        ros_distro=record.get("ros_distro", "unknown"),
        topic_set=record.get("topic_set", []),
        compression=record.get("compression", "unknown"),
        tags=record.get("tags", []),
        description=record.get("description"),
        created_at=_parse_created(record.get("created_at")),
        prefix=session_prefix(robot, session_id),
        split_count=len(splits),
        total_size_bytes=total,
        total_size_human=humanize_bytes(total),
        describe_source=(record.get("describe") or {}).get("describe_source"),
    )


def split_infos(splits: list) -> list[SplitInfo]:
    return [
        SplitInfo(
            filename=o.filename, key=o.key, size_bytes=o.size_bytes, size_human=o.size_human
        )
        for o in splits
    ]


def _group(objects: list) -> dict[tuple[str, str], list]:
    groups: dict[tuple[str, str], list] = {}
    for obj in objects:
        parts = obj.key.split("/")
        if len(parts) < 4 or parts[0] != "bags":
            continue
        groups.setdefault((parts[1], parts[2]), []).append(obj)
    return groups


def load_session(robot: str, session_id: str) -> tuple[dict, list]:
    robot = segment(robot, "robot")
    session_id = segment(session_id, "session_id")
    objects = list_files(prefix=session_prefix(robot, session_id))
    if not objects:
        raise SessionNotFoundError(f"Session {robot}/{session_id} not found")
    record = read_record(robot, session_id) or {
        "robot": robot,
        "session_id": session_id,
        "created_at": min(o.uploaded_at for o in objects).isoformat(),
    }
    return record, objects


def list_sessions(
    robot: str | None = None,
    ros_distro: str | None = None,
    since: str | None = None,
    topic: str | None = None,
) -> SessionList:
    since_dt = _parse_created(since) if since else None
    sessions: list[Session] = []
    for (grp_robot, session_id), objects in _group(list_files(prefix=BAGS_PREFIX)).items():
        record = None
        meta = next((o for o in objects if o.filename == METADATA_JSON), None)
        if meta is not None:
            try:
                record = json.loads(get_object_bytes(meta.key))
            except (ValueError, RuntimeError):
                record = None
        session = build_session(grp_robot, session_id, record, splits_of(objects))
        if robot and session.robot != robot:
            continue
        if ros_distro and session.ros_distro != ros_distro:
            continue
        if topic and topic not in session.topic_set:
            continue
        if since_dt and session.created_at < since_dt:
            continue
        sessions.append(session)
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return SessionList(sessions=sessions, count=len(sessions))


def create_session(payload: SessionCreate) -> Session:
    robot = segment(payload.robot, "robot")
    session_id = segment(payload.session_id or generate_session_id(), "session_id")
    if get_file_metadata(metadata_key(robot, session_id)) is not None:
        raise SessionExistsError(f"Session {robot}/{session_id} already exists")
    record = {
        "robot": robot,
        "session_id": session_id,
        "ros_distro": payload.ros_distro,
        "topic_set": payload.topic_set,
        "compression": payload.compression,
        "tags": [],
        "description": None,
        "created_at": datetime.now(UTC).isoformat(),
    }
    write_record(record)
    return build_session(robot, session_id, record, splits=[])


def get_session_detail(robot: str, session_id: str) -> SessionDetail:
    from app.service.catalog import row_from_session  # local: avoids import cycle

    record, objects = load_session(robot, session_id)
    splits = splits_of(objects)
    session = build_session(record["robot"], record["session_id"], record, splits)
    stored = record.get("describe")
    describe = DescribeSummary(**stored) if stored else None
    return SessionDetail(
        session=session,
        splits=split_infos(splits),
        describe=describe,
        catalog_row=row_from_session(session, describe),
    )


def update_session(robot: str, session_id: str, payload: SessionUpdate) -> Session:
    record, objects = load_session(robot, session_id)
    if payload.tags is not None:
        record["tags"] = payload.tags
    if payload.description is not None:
        record["description"] = payload.description
    write_record(record)
    return build_session(record["robot"], record["session_id"], record, splits_of(objects))


def delete_session(robot: str, session_id: str) -> DeleteResult:
    robot = segment(robot, "robot")
    session_id = segment(session_id, "session_id")
    prefix = session_prefix(robot, session_id)
    objects = list_files(prefix=prefix)
    if not objects:
        raise SessionNotFoundError(f"Session {robot}/{session_id} not found")
    deleted = 0
    for obj in objects:
        # Strictly prefix-scoped: never delete outside this one session.
        if not obj.key.startswith(prefix):
            continue
        delete_file(obj.key)
        deleted += 1
    return DeleteResult(deleted=deleted, prefix=prefix)
