from datetime import datetime

from pydantic import BaseModel, Field

from app.types.base import ResponseModel
from app.types.catalog import CatalogRow


class DescribeSummary(ResponseModel):
    """What rosbag2 says about a recording.

    Produced by `ros2 bag info` when a ROS 2 environment is on PATH (the
    on-device watcher path), otherwise by parsing the `metadata.yaml` rosbag2
    itself writes beside every bag. Never a third-party bag reader — the source
    is always rosbag2's own CLI or its own metadata file.
    """

    describe_source: str = Field(
        description='"ros2 bag info", "metadata.yaml", or "unavailable".'
    )
    ros2_available: bool = Field(
        description="True when the `ros2` CLI was found on PATH where describe ran."
    )
    ros_distro: str | None = None
    storage_identifier: str | None = Field(
        default=None, description='rosbag2 storage plugin id, e.g. "mcap" or "sqlite3".'
    )
    serialization_format: str | None = None
    duration_seconds: float | None = None
    message_count: int | None = None
    topics: list[str] = Field(default_factory=list)
    topic_types: dict[str, str] = Field(default_factory=dict)
    compression_format: str | None = None
    compression_mode: str | None = None
    original_size_bytes: int | None = Field(
        default=None, description="Uncompressed size from rosbag2 metadata, when recorded."
    )
    compressed_size_bytes: int | None = Field(
        default=None, description="Bytes actually stored in B2 for the session's splits."
    )
    compression_ratio: float | None = None


class SplitInfo(ResponseModel):
    """One closed rosbag2 split as stored in B2."""

    filename: str
    key: str
    size_bytes: int
    size_human: str


class Session(ResponseModel):
    """A single rosbag2 recording session — the primary entity.

    One session is the set of splits a robot's rosbag2 writes during one run,
    stored under `bags/<robot>/<session>/`, plus the `metadata.json` record this
    API keeps beside them.
    """

    robot: str
    session_id: str
    ros_distro: str
    topic_set: list[str]
    compression: str = Field(description='Requested compression, e.g. "zstd" or "none".')
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    created_at: datetime
    prefix: str = Field(description="B2 key prefix: bags/<robot>/<session>/.")
    split_count: int
    total_size_bytes: int
    total_size_human: str
    describe_source: str | None = Field(
        default=None, description="Set once the session has been described."
    )


class SessionList(ResponseModel):
    """A filtered list of sessions."""

    sessions: list[Session]
    count: int


class SessionDetail(ResponseModel):
    """A session plus its splits, its rosbag2 describe summary, and its catalog row."""

    session: Session
    splits: list[SplitInfo]
    describe: DescribeSummary | None = None
    catalog_row: CatalogRow | None = None


class SessionCreate(BaseModel):
    """Start a new session (the record; splits arrive via the offload flow)."""

    robot: str = Field(description="Robot / vehicle id, e.g. robot-07.")
    session_id: str | None = Field(
        default=None,
        description="Optional session id. Generated from the timestamp when omitted.",
    )
    ros_distro: str = Field(description='ROS 2 distribution, e.g. "jazzy".')
    topic_set: list[str] = Field(
        default_factory=list, description="Topics this run is expected to record."
    )
    compression: str = Field(
        default="zstd", description='Compression rosbag2 used: "zstd", "lz4", or "none".'
    )


class SessionUpdate(BaseModel):
    """Edit a session's human-owned fields. Both are optional; omit to leave as-is."""

    tags: list[str] | None = None
    description: str | None = None


class DeleteResult(ResponseModel):
    """Acknowledgement of a prefix-scoped session delete."""

    deleted: int = Field(description="Number of objects removed under the prefix.")
    prefix: str


class OffloadSplit(BaseModel):
    """One closed split the robot/browser wants to offload."""

    filename: str
    size: int = Field(description="Exact byte size; signed into the presigned PUT.")


class OffloadRequest(BaseModel):
    """The set of closed splits to offload for a session."""

    splits: list[OffloadSplit]


class OffloadPresignedSplit(ResponseModel):
    """A presigned PUT for one split, plus the headers the client must send."""

    filename: str
    key: str
    url: str
    method: str
    headers: dict[str, str]
    expires_in: int


class OffloadPlan(ResponseModel):
    """The presigned-PUT plan for a session's splits, all under its own prefix."""

    robot: str
    session_id: str
    prefix: str
    splits: list[OffloadPresignedSplit]


class ReplayRequest(BaseModel):
    """Prepare a replay manifest; expiry is optional."""

    expiry_seconds: int | None = Field(
        default=None, description="Presigned-URL lifetime in seconds (default 3600)."
    )


class ReplayUrl(ResponseModel):
    """A presigned GET for one split, for `ros2 bag play` to stream from B2."""

    filename: str
    key: str
    url: str


class ReplayManifest(ResponseModel):
    """Everything `ros2 bag play` needs to replay a session straight from B2."""

    robot: str
    session_id: str
    ros_distro: str
    topic_set: list[str]
    storage_id_hint: str = Field(
        description='rosbag2 storage plugin to replay with, e.g. "mcap" or "sqlite3".'
    )
    urls: list[ReplayUrl]
    expires_in: int
