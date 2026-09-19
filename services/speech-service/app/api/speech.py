import json
import uuid
import logging
import os
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, Request
import redis.asyncio as redis_async

import app.state as state
from app.config import get_settings
from app.jobs.speech_job import process_job
from app.middlewares.auth import get_current_user, require_auth
from app.middlewares.rate_limit import rate_limit_dependency
from app.services.validation import validate_upload_file, AudioValidationError
from app.services.redis_pool import get_main_redis, get_rate_limit_redis, get_worker_redis, close_all_pools
from app.services.cache import hash_audio_content

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_job_redis() -> redis_async.Redis:
    """Get Redis client for job storage (main pool)."""
    return await get_main_redis()


async def get_rq_redis() -> redis_async.Redis:
    """Get Redis connection for RQ (worker pool, decode_responses=False)."""
    return await get_worker_redis()


async def get_rl_redis() -> redis_async.Redis:
    """Get Redis client for rate limiting (rate limit pool)."""
    return await get_rate_limit_redis()


async def set_job(job_id: str, data: dict) -> None:
    """Store job status in Redis."""
    settings = get_settings()
    redis = await get_job_redis()
    await redis.setex(f"speech:{job_id}", settings.JOB_TTL_SECONDS, json.dumps(data))


async def get_job(job_id: str) -> dict | None:
    """Retrieve job status from Redis."""
    redis = await get_job_redis()
    result = await redis.get(f"speech:{job_id}")
    return json.loads(result) if result and isinstance(result, str) else None


@router.post(
    "/api/speech/evaluate",
    dependencies=[Depends(rate_limit_dependency), Depends(require_auth)],
    status_code=status.HTTP_202_ACCEPTED,
)
async def evaluate_speech(
    request: Request,
    audio: Annotated[UploadFile, File(...)],
    expected_text: Annotated[str, Form(...)],
    user: Annotated[dict, Depends(get_current_user)],
):
    """
    Submit audio for speech evaluation.
    
    Requires authentication and is rate limited.
    Returns job_id for polling results.
    """
    settings = get_settings()
    
    # Validate expected_text
    if not expected_text or not expected_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expected_text is required",
        )
    
    if len(expected_text) > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expected_text too long (max 5000 characters)",
        )
    
    # Validate and read audio file
    try:
        ext, contents = await validate_upload_file(audio)
    except AudioValidationError as e:
        logger.warning("Audio validation failed for user %s: %s", user["user_id"], e.message)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )
    
    job_id = str(uuid.uuid4())
    
    # Store audio bytes in Redis (base64 encoded, TTL from settings)
    import base64
    audio_b64 = base64.b64encode(contents).decode("utf-8")
    
    redis = await get_job_redis()
    await redis.setex(
        f"speech:audio:{job_id}",
        settings.AUDIO_REDIS_TTL_SECONDS,
        audio_b64,
    )
    
    # Write initial status
    await set_job(job_id, {"status": "processing", "user_id": user["user_id"]})
    
    # Enqueue job
    from rq import Queue
    queue = Queue("speech", connection=await get_rq_redis())
    queue.enqueue(
        process_job,
        job_id,
        expected_text.strip(),
        job_timeout=settings.JOB_TIMEOUT_SECONDS,
        result_ttl=0,
    )
    
    logger.info(
        "Enqueued speech job %s for user %s | expected: %r",
        job_id, user["user_id"], expected_text[:50]
    )
    
    return {"job_id": job_id, "status": "processing"}


@router.post(
    "/api/speech/evaluate/stream",
    dependencies=[Depends(rate_limit_dependency), Depends(require_auth)],
    status_code=status.HTTP_202_ACCEPTED,
)
async def evaluate_speech_stream(
    request: Request,
    expected_text: Annotated[str, Form(...)],
    user: Annotated[dict, Depends(get_current_user)],
):
    """
    Submit audio for speech evaluation via streaming upload.
    
    Requires authentication and is rate limited.
    Uses multipart/form-data with chunked streaming to avoid base64 overhead.
    Returns job_id for polling results.
    
    Note: This endpoint requires ENABLE_STREAMING_UPLOAD=true in settings.
    """
    settings = get_settings()
    
    if not settings.ENABLE_STREAMING_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Streaming upload not enabled. Set ENABLE_STREAMING_UPLOAD=true",
        )
    
    # Validate expected_text
    if not expected_text or not expected_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expected_text is required",
        )
    
    if len(expected_text) > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expected_text too long (max 5000 characters)",
        )
    
    job_id = str(uuid.uuid4())
    
    # Stream audio directly to file (avoids base64 + Redis storage)
    tmp_path = f"{settings.AUDIO_TMP_DIR}/{job_id}.m4a"
    total_size = 0
    
    try:
        async with request.stream() as stream:
            async for chunk in stream:
                total_size += len(chunk)
                
                # Check size limit during streaming
                if total_size > settings.MAX_AUDIO_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File too large (max {settings.MAX_AUDIO_FILE_SIZE} bytes)",
                    )
                
                # Write chunk to file
                with open(tmp_path, "ab") as f:
                    f.write(chunk)
    except HTTPException:
        # Clean up on error
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
    except Exception as e:
        logger.error("Streaming upload failed for job %s: %s", job_id, e)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process streaming upload",
        )
    
    if total_size < 100:
        os.remove(tmp_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recording too short — please hold the button while speaking",
        )
    
    # Compute audio hash for potential caching
    # (We'd need to re-read the file, or compute during streaming)
    audio_hash = ""
    
    # Write initial status
    await set_job(job_id, {
        "status": "processing", 
        "user_id": user["user_id"],
        "streaming": True,
    })
    
    # Enqueue job
    from rq import Queue
    queue = Queue("speech", connection=await get_rq_redis())
    queue.enqueue(
        process_job,
        job_id,
        expected_text.strip(),
        job_timeout=settings.JOB_TIMEOUT_SECONDS,
        result_ttl=0,
    )
    
    logger.info(
        "Enqueued streaming speech job %s for user %s (%d bytes) | expected: %r",
        job_id, user["user_id"], total_size, expected_text[:50]
    )
    
    return {"job_id": job_id, "status": "processing", "streaming": True}


@router.get(
    "/api/speech/result/{job_id}",
    dependencies=[Depends(rate_limit_dependency), Depends(require_auth)],
)
async def get_result(
    job_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    """
    Get speech evaluation result.
    
    Requires authentication and is rate limited.
    Users can only access their own jobs.
    """
    job = await get_job(job_id)
    if not job:
        return {"status": "not_found"}
    
    # Verify job ownership
    job_user_id = job.get("user_id") or job.get("data", {}).get("user_id")
    if job_user_id and job_user_id != user["user_id"]:
        logger.warning(
            "User %s attempted to access job %s owned by %s",
            user["user_id"], job_id, job_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    
    logger.info("Returning job %s for user %s: status=%s", job_id, user["user_id"], job.get("status"))
    return job


@router.get("/health/live", tags=["Health"])
def liveness():
    """Kubernetes liveness probe."""
    return {"status": "alive"}


@router.get("/health/ready", tags=["Health"])
def readiness():
    """Kubernetes readiness probe."""
    if not state.is_ready():
        raise HTTPException(status_code=503, detail="Model not yet loaded")
    return {"status": "ready"}