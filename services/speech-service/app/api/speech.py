import json
import uuid
import os
import unicodedata
import logging

from redis import Redis
from rq import Queue
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

import app.state as state
from app.jobs.speech_job import process_job

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Redis clients ──────────────────────────────────────────────────────────────
# Evaluated at call time via os.getenv so the correct K8s env var is always used.
# Fallback is "redis" (the K8s service name), NOT "localhost".
# decode_responses=True  → get_job() returns str, json.loads() works directly.
# decode_responses=False → required by RQ internally (redis_conn).
redis_client = Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    db=0,
    decode_responses=True,
)

redis_conn = Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    db=0,
)

queue = Queue("speech", connection=redis_conn)

# ── Allowed audio types ────────────────────────────────────────────────────────
# Android sends .m4a as audio/mp4, audio/x-m4a, or even application/octet-stream
# depending on device and OS version. Check extension as a fallback.
ALLOWED_EXTENSIONS = {"m4a", "wav", "mp3", "webm", "ogg", "aac"}


# ── Utilities ──────────────────────────────────────────────────────────────────

def normalize_text(s: str) -> str:
    return unicodedata.normalize("NFC", s.strip())


def set_job(job_id: str, data: dict) -> None:
    redis_client.setex(
        f"speech:{job_id}",
        600,                    # expire in 10 minutes
        json.dumps(data),
    )


def get_job(job_id: str) -> dict | None:
    result = redis_client.get(f"speech:{job_id}")
    return json.loads(result) if result else None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/api/speech/evaluate")
async def evaluate_speech(
    audio: UploadFile = File(...),
    expected_text: str = Form(...),
):
    # Validate audio — check content-type AND filename extension as fallback
    # because Android devices report inconsistent MIME types for .m4a files.
    content_type  = audio.content_type or ""
    filename_ext  = (audio.filename or "").rsplit(".", 1)[-1].lower()

    if not content_type.startswith("audio/") and filename_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid audio file")

    job_id   = str(uuid.uuid4())
    tmp_path = f"/tmp/{job_id}.m4a"

    # Save audio to shared PVC (/tmp is mounted as audio-pvc)
    try:
        contents = await audio.read()
        with open(tmp_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        logger.error("Failed to save audio for job %s: %s", job_id, e)
        raise HTTPException(status_code=500, detail="Failed to save audio")

    # Write initial status so polling starts immediately
    set_job(job_id, {"status": "processing"})

    # Enqueue the job.
    # Do NOT pass job_id=job_id to enqueue() — that sets the RQ-internal job ID
    # to your UUID, which causes a ResponseError if the job is ever retried.
    # Your result tracking uses the speech:{job_id} Redis key independently of
    # RQ's own job tracking, so there is no need to link them.
    queue.enqueue(
        process_job,
        job_id,
        tmp_path,
        expected_text,
        job_timeout=120,   # kill the job if it runs longer than 2 minutes
        result_ttl=0,      # don't store RQ's own result (we use speech:{job_id})
    )

    logger.info("Enqueued speech job %s | expected: %r", job_id, expected_text)

    return {"job_id": job_id, "status": "processing"}


@router.get("/api/speech/result/{job_id}")
async def get_result(job_id: str):
    job = get_job(job_id)

    if not job:
        return {"status": "not_found"}

    logger.info("Returning job %s: status=%s", job_id, job.get("status"))
    return job


# ── Health endpoints ───────────────────────────────────────────────────────────

@router.get("/health/live", tags=["Health"])
def liveness():
    """Kubernetes livenessProbe — returns 200 as long as the process is alive."""
    return {"status": "alive"}


@router.get("/health/ready", tags=["Health"])
def readiness():
    """
    Kubernetes readinessProbe — returns 200 only after load_model() completes.
    Kubernetes will not route traffic here until this returns 200.
    """
    if not state.is_ready():
        raise HTTPException(status_code=503, detail="Model not yet loaded")
    return {"status": "ready"}