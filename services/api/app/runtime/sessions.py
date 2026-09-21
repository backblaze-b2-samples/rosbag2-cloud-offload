import logging
from collections.abc import Callable

# Sync `def` handlers on purpose: the whole chain is blocking boto3, so Starlette
# runs these in its threadpool and one slow B2 scan can't stall the event loop
# (see runtime/files.py for the full rationale).
from fastapi import APIRouter, HTTPException

from app.service.offload import plan_offload, prepare_replay, run_describe
from app.service.sessions import (
    InvalidSessionError,
    SessionExistsError,
    SessionNotFoundError,
    create_session,
    delete_session,
    get_session_detail,
    list_sessions,
    update_session,
)
from app.types import (
    DeleteResult,
    OffloadPlan,
    OffloadRequest,
    ReplayManifest,
    ReplayRequest,
    Session,
    SessionCreate,
    SessionDetail,
    SessionList,
    SessionUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: these routes are intentionally UNAUTHENTICATED and bucket-wide
# (single-tenant demo stance — see docs/SECURITY.md). A multi-tenant clone must
# add an auth dependency to every route AND scope the bags/ prefix to the
# caller, or one user can read, describe, replay, and delete another's sessions.


def _run(fn: Callable, *args):
    try:
        return fn(*args)
    except InvalidSessionError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except SessionExistsError as e:
        raise HTTPException(status_code=409, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Storage backend error") from None


@router.post("/sessions", response_model=Session, status_code=201)
def create_session_endpoint(payload: SessionCreate):
    """Start a session: write its metadata.json record under bags/<robot>/<session>/."""
    return _run(create_session, payload)


@router.get("/sessions", response_model=SessionList)
def list_sessions_endpoint(
    robot: str | None = None,
    ros_distro: str | None = None,
    since: str | None = None,
    topic: str | None = None,
):
    return _run(list_sessions, robot, ros_distro, since, topic)


@router.get("/sessions/{robot}/{session}", response_model=SessionDetail)
def get_session_endpoint(robot: str, session: str):
    return _run(get_session_detail, robot, session)


@router.patch("/sessions/{robot}/{session}", response_model=Session)
def update_session_endpoint(robot: str, session: str, payload: SessionUpdate):
    return _run(update_session, robot, session, payload)


@router.delete("/sessions/{robot}/{session}", response_model=DeleteResult)
def delete_session_endpoint(robot: str, session: str):
    """Delete a session, scoped strictly to its bags/<robot>/<session>/ prefix."""
    result = _run(delete_session, robot, session)
    logger.info("Session deleted: %s (%d objects)", result.prefix, result.deleted)
    return result


@router.post("/sessions/{robot}/{session}/offload", response_model=OffloadPlan)
def offload_endpoint(robot: str, session: str, payload: OffloadRequest):
    """Presigned-PUT plan for the session's closed splits, all under its prefix."""
    return _run(plan_offload, robot, session, payload)


@router.post("/sessions/{robot}/{session}/describe", response_model=SessionDetail)
def describe_endpoint(robot: str, session: str):
    """Describe via rosbag2's metadata.yaml (ros2 bag info on-device); persist it."""
    return _run(run_describe, robot, session)


@router.post("/sessions/{robot}/{session}/replay", response_model=ReplayManifest)
def replay_endpoint(robot: str, session: str, payload: ReplayRequest):
    """Presigned-GET manifest so `ros2 bag play` can stream the session from B2."""
    return _run(prepare_replay, robot, session, payload)
