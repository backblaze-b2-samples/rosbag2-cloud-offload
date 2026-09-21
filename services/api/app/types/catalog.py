from pydantic import Field

from app.types.base import ResponseModel


class CatalogRow(ResponseModel):
    """One session as the searchable Parquet catalog records it.

    Keyed by robot, date, topic set and ROS distro — the axes a fleet asks a
    recording catalog to answer ("every /camera bag from robot-07 on the 3rd").
    """

    robot: str
    session_id: str
    date: str = Field(description="UTC recording date (YYYY-MM-DD), from created_at.")
    ros_distro: str
    topic_set: list[str]
    topic_count: int
    split_count: int
    message_count: int | None = Field(
        default=None, description="Total messages across the bag, from rosbag2 metadata."
    )
    duration_seconds: float | None = Field(
        default=None, description="Recording duration, from rosbag2 metadata."
    )
    compression_format: str | None = Field(
        default=None, description='rosbag2 compression format (e.g. "zstd"), or null.'
    )
    original_size_bytes: int | None = Field(
        default=None, description="Uncompressed size from rosbag2 metadata, when recorded."
    )
    compressed_size_bytes: int | None = Field(
        default=None, description="Bytes actually stored in B2 for this session's splits."
    )
    compression_ratio: float | None = Field(
        default=None,
        description="original_size_bytes / compressed_size_bytes when both are known.",
    )
    prefix: str = Field(description="B2 key prefix: bags/<robot>/<session>/.")


class CatalogRows(ResponseModel):
    """The catalog as a filtered list of rows."""

    rows: list[CatalogRow]
    count: int


class CatalogSummary(ResponseModel):
    """Result of rolling every session into catalog/catalog.parquet."""

    rows: int
    parquet_key: str
    bytes: int


class PresignedUrl(ResponseModel):
    """A short-lived presigned GET URL (used to download the Parquet catalog)."""

    url: str
