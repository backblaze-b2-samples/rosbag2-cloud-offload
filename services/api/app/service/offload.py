"""Session run verbs: offload (presigned PUT), describe (rosbag2), replay (presigned GET).

Split out of `service/sessions.py` to keep each module within the 300-line
structural limit. Reuses the helpers there; all B2 access is through the boto3
`repo/` layer.
"""

import re

from app.config import settings
from app.repo import generate_presigned_upload, get_object_bytes, get_presigned_url
from app.service.describe import describe_from_metadata_yaml, ros2_available
from app.service.sessions import (
    METADATA_YAML,
    InvalidSessionError,
    SessionNotFoundError,
    build_session,
    load_session,
    segment,
    session_prefix,
    split_infos,
    splits_of,
    write_record,
)
from app.types import (
    DescribeSummary,
    OffloadPlan,
    OffloadPresignedSplit,
    OffloadRequest,
    ReplayManifest,
    ReplayRequest,
    ReplayUrl,
    SessionDetail,
)

DEFAULT_REPLAY_EXPIRY = 3600


def _sanitize_filename(name: str) -> str:
    name = (name or "").replace("\\", "/").split("/")[-1].replace("\x00", "")
    name = re.sub(r"[^\w.\-]", "_", name).lstrip(".").strip()
    if not name:
        raise InvalidSessionError("split filename is empty after sanitization")
    return name[:200]


def _storage_id_hint(splits: list) -> str:
    for split in splits:
        if split.filename.endswith(".mcap"):
            return "mcap"
        if split.filename.endswith(".db3"):
            return "sqlite3"
    return "sqlite3"


def plan_offload(robot: str, session_id: str, request: OffloadRequest) -> OffloadPlan:
    robot = segment(robot, "robot")
    session_id = segment(session_id, "session_id")
    if not request.splits:
        raise InvalidSessionError("no splits to offload")
    prefix = session_prefix(robot, session_id)
    expiry = settings.presign_upload_expiry_seconds
    splits: list[OffloadPresignedSplit] = []
    for split in request.splits:
        if split.size <= 0:
            raise InvalidSessionError(f"split '{split.filename}' has a non-positive size")
        filename = _sanitize_filename(split.filename)
        # Keys are constrained to this session's own bags/<robot>/<session>/ prefix.
        key = prefix + filename
        url = generate_presigned_upload(key, "application/octet-stream", split.size, expiry)
        splits.append(
            OffloadPresignedSplit(
                filename=filename,
                key=key,
                url=url,
                method="PUT",
                headers={"Content-Type": "application/octet-stream"},
                expires_in=expiry,
            )
        )
    return OffloadPlan(robot=robot, session_id=session_id, prefix=prefix, splits=splits)


def run_describe(robot: str, session_id: str) -> SessionDetail:
    from app.service.catalog import row_from_session  # local: avoids import cycle

    record, objects = load_session(robot, session_id)
    splits = splits_of(objects)
    compressed = sum(o.size_bytes for o in splits)
    yaml_obj = next((o for o in objects if o.filename == METADATA_YAML), None)
    if yaml_obj is not None:
        summary = describe_from_metadata_yaml(
            get_object_bytes(yaml_obj.key), compressed_size_bytes=compressed
        )
    else:
        summary = DescribeSummary(
            describe_source="unavailable",
            ros2_available=ros2_available(),
            compressed_size_bytes=compressed or None,
        )
    summary.ros_distro = summary.ros_distro or record.get("ros_distro")
    record["describe"] = summary.model_dump(mode="json")
    write_record(record)
    session = build_session(record["robot"], record["session_id"], record, splits)
    return SessionDetail(
        session=session,
        splits=split_infos(splits),
        describe=summary,
        catalog_row=row_from_session(session, summary),
    )


def prepare_replay(robot: str, session_id: str, request: ReplayRequest) -> ReplayManifest:
    record, objects = load_session(robot, session_id)
    splits = splits_of(objects)
    if not splits:
        raise SessionNotFoundError("Session has no splits to replay")
    expiry = request.expiry_seconds or DEFAULT_REPLAY_EXPIRY
    urls = [
        ReplayUrl(
            filename=o.filename,
            key=o.key,
            url=get_presigned_url(o.key, filename=o.filename, expires_in=expiry),
        )
        for o in splits
    ]
    return ReplayManifest(
        robot=record["robot"],
        session_id=record["session_id"],
        ros_distro=record.get("ros_distro", "unknown"),
        topic_set=record.get("topic_set", []),
        storage_id_hint=_storage_id_hint(splits),
        urls=urls,
        expires_in=expiry,
    )
