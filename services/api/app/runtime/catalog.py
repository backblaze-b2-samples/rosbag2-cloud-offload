import logging

# Sync `def` handlers: blocking boto3 + pyarrow work runs in Starlette's
# threadpool, not on the event loop (see runtime/files.py).
from fastapi import APIRouter, HTTPException

from app.service.catalog import download_catalog, get_catalog, rebuild_catalog
from app.types import CatalogRows, CatalogSummary, PresignedUrl

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/catalog", response_model=CatalogRows)
def catalog_endpoint(
    robot: str | None = None,
    date: str | None = None,
    topic: str | None = None,
    ros_distro: str | None = None,
):
    """The session catalog, filtered. Reads catalog/catalog.parquet when built,
    else derives rows live from the session records under bags/."""
    try:
        return get_catalog(robot=robot, date=date, topic=topic, ros_distro=ros_distro)
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None


@router.post("/catalog/rebuild", response_model=CatalogSummary)
def rebuild_catalog_endpoint():
    """Roll every session into catalog/catalog.parquet and return the summary."""
    try:
        summary = rebuild_catalog()
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None
    logger.info("Catalog rebuilt: %d rows, %d bytes", summary.rows, summary.bytes)
    return summary


@router.get("/catalog/download", response_model=PresignedUrl)
def download_catalog_endpoint():
    """Presigned GET for catalog/catalog.parquet (built lazily if absent)."""
    try:
        return download_catalog()
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None
