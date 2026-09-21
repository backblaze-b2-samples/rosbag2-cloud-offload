"""The session catalog: roll every session into a searchable Parquet file.

`catalog/catalog.parquet` is derived from the session records under `bags/`. It
is keyed by robot, date, topic set and ROS distro — the axes a fleet queries a
recording catalog by. Parquet (de)serialization is contained in the repo layer
(`repo/catalog_store.py`); all B2 I/O uses the boto3 repo functions.
"""

from app.repo import (
    get_file_metadata,
    get_object_bytes,
    get_presigned_url,
    parquet_bytes_to_rows,
    rows_to_parquet_bytes,
    upload_file,
)
from app.service.sessions import list_sessions, read_record
from app.types import (
    CatalogRow,
    CatalogRows,
    CatalogSummary,
    DescribeSummary,
    PresignedUrl,
    Session,
)

CATALOG_KEY = "catalog/catalog.parquet"


def row_from_session(session: Session, describe: DescribeSummary | None) -> CatalogRow:
    """Project a session (plus its rosbag2 describe summary, if any) to a catalog row."""
    topics = describe.topics if (describe and describe.topics) else session.topic_set
    compression = (describe.compression_format if describe else None) or (
        session.compression if session.compression not in ("none", "unknown") else None
    )
    compressed = (
        describe.compressed_size_bytes
        if (describe and describe.compressed_size_bytes)
        else session.total_size_bytes
    )
    return CatalogRow(
        robot=session.robot,
        session_id=session.session_id,
        date=session.created_at.date().isoformat(),
        ros_distro=session.ros_distro,
        topic_set=topics,
        topic_count=len(topics),
        split_count=session.split_count,
        message_count=describe.message_count if describe else None,
        duration_seconds=describe.duration_seconds if describe else None,
        compression_format=compression,
        original_size_bytes=describe.original_size_bytes if describe else None,
        compressed_size_bytes=compressed,
        compression_ratio=describe.compression_ratio if describe else None,
        prefix=session.prefix,
    )


def _describe_of(session: Session) -> DescribeSummary | None:
    stored = (read_record(session.robot, session.session_id) or {}).get("describe")
    return DescribeSummary(**stored) if stored else None


def _rows_from_sessions() -> list[CatalogRow]:
    return [row_from_session(s, _describe_of(s)) for s in list_sessions().sessions]


def _current_rows() -> list[CatalogRow]:
    """Prefer the built Parquet catalog; fall back to deriving live from sessions."""
    if get_file_metadata(CATALOG_KEY) is not None:
        try:
            raw = parquet_bytes_to_rows(get_object_bytes(CATALOG_KEY))
            return [CatalogRow(**row) for row in raw]
        except Exception:
            # A corrupt or unreadable catalog object just re-derives from sessions.
            pass
    return _rows_from_sessions()


def get_catalog(
    robot: str | None = None,
    date: str | None = None,
    topic: str | None = None,
    ros_distro: str | None = None,
) -> CatalogRows:
    rows = _current_rows()
    if robot:
        rows = [r for r in rows if r.robot == robot]
    if ros_distro:
        rows = [r for r in rows if r.ros_distro == ros_distro]
    if date:
        rows = [r for r in rows if r.date == date]
    if topic:
        rows = [r for r in rows if topic in r.topic_set]
    rows.sort(key=lambda r: (r.date, r.robot, r.session_id), reverse=True)
    return CatalogRows(rows=rows, count=len(rows))


def rebuild_catalog() -> CatalogSummary:
    rows = _rows_from_sessions()
    data = rows_to_parquet_bytes([r.model_dump(mode="json") for r in rows])
    upload_file(data, CATALOG_KEY, "application/vnd.apache.parquet")
    return CatalogSummary(rows=len(rows), parquet_key=CATALOG_KEY, bytes=len(data))


def download_catalog() -> PresignedUrl:
    if get_file_metadata(CATALOG_KEY) is None:
        # Build it lazily so the download link always resolves to a real object.
        rebuild_catalog()
    url = get_presigned_url(CATALOG_KEY, filename="catalog.parquet", disposition="attachment")
    return PresignedUrl(url=url)
