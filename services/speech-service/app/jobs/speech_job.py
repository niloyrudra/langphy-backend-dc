import os
import base64
import json
import logging
from typing import Optional

import redis

from app.config import get_settings
from app.services.circuit_breaker import CircuitBreakerOpen
from app.services.logging import set_correlation_id, set_request_context, clear_correlation_id, clear_request_context
from app.services.cache import hash_audio_content, cache_key_for_text
from app.services.utils import normalize_text

logger = logging.getLogger(__name__)

settings = get_settings()

# Single reusable sync Redis client (the worker process has no event loop).
_redis_client: Optional[redis.Redis] = None


def _get_redis() -> redis.Redis:
    """Get (or create) the worker's sync Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True,
        )
    return _redis_client


def set_job(job_id: str, data: dict) -> None:
    _get_redis().setex(f"speech:{job_id}", settings.JOB_TTL_SECONDS, json.dumps(data))


def _call_nlp_on_text(expected_text: str, spoken_text: str) -> dict:
    """
    Single chokepoint to the NLP service — circuit breaker + retry + graceful
    fallback logic all live in app.services.nlp_client.evaluate_text_sync
    (the async twin is called evaluate_text). Local import avoids a cycle.
    """
    from app.services.nlp_client import evaluate_text_sync
    return evaluate_text_sync(expected_text, spoken_text)


def _get_cached_nlp_result_sync(expected_text: str, spoken_text: str) -> Optional[dict]:
    """Sync Redis lookup for the NLP result cache (worker-safe, no event loop)."""
    if not settings.ENABLE_NLP_CACHE:
        return None
    try:
        key = f"nlp:{cache_key_for_text(f'{expected_text}|{spoken_text}')}"
        raw = _get_redis().get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning("NLP cache GET failed: %s", e)
        return None


def _set_cached_nlp_result_sync(expected_text: str, spoken_text: str, result: dict) -> None:
    """Sync Redis write for the NLP result cache (worker-safe, no event loop)."""
    if not settings.ENABLE_NLP_CACHE:
        return
    try:
        key = f"nlp:{cache_key_for_text(f'{expected_text}|{spoken_text}')}"
        _get_redis().setex(
            key, settings.NLP_CACHE_TTL_SECONDS, json.dumps(result, separators=(",", ":"))
        )
    except Exception as e:
        logger.warning("NLP cache SET failed: %s", e)


def _call_nlp_with_cache(expected_text: str, spoken_text: str) -> dict:
    """
    Call the NLP service with caching, circuit breaker, and retry protection.
    Synchronous and worker-safe (no asyncio.run / shared event-loop pool).
    """
    # Check cache first
    cached_result = _get_cached_nlp_result_sync(expected_text, spoken_text)
    if cached_result is not None:
        logger.info("NLP cache HIT for expected=%r spoken=%r", expected_text[:30], spoken_text[:30])
        return cached_result

    logger.info("NLP cache MISS for expected=%r spoken=%r", expected_text[:30], spoken_text[:30])

    # Call through the single breaker + retry chokepoint
    nlp_result = _call_nlp_on_text(expected_text, spoken_text)

    # Only cache genuine analysis results — never error/fallback payloads (the
    # 401/5xx fallbacks would otherwise poison the cache for the full TTL).
    if (
        nlp_result.get("similarity") is not None
        and nlp_result.get("pronunciation_score") is not None
        and not nlp_result.get("error")
    ):
        _set_cached_nlp_result_sync(expected_text, spoken_text, nlp_result)
    else:
        logger.info("NLP result not cacheable (missing analysis fields), skipping cache")

    return nlp_result


def _get_cached_transcription(audio_hash: str) -> Optional[dict]:
    """Sync Redis lookup for the transcription cache (worker-safe)."""
    if not settings.ENABLE_TRANSCRIPTION_CACHE:
        return None
    try:
        raw = _get_redis().get(f"transcribe:{audio_hash[:16]}")
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning("Transcription cache GET failed: %s", e)
        return None


def _set_cached_transcription(audio_hash: str, transcription: dict) -> None:
    """Sync Redis write for the transcription cache (worker-safe)."""
    if not settings.ENABLE_TRANSCRIPTION_CACHE:
        return
    try:
        _get_redis().setex(
            f"transcribe:{audio_hash[:16]}",
            settings.TRANSCRIPTION_CACHE_TTL_SECONDS,
            json.dumps(transcription, separators=(",", ":")),
        )
    except Exception as e:
        logger.warning("Transcription cache SET failed: %s", e)


def process_job(job_id: str, expected_text: str) -> None:
    """
    RQ job — runs in the worker process (no fork).
    
    Audio bytes are read from Redis (stored by speech-api as base64).
    Written to worker's own /tmp, processed, then deleted.
    No shared filesystem needed between api and worker containers.
    """
    # Set up logging context for this job
    set_correlation_id(job_id[:8])
    set_request_context(job_id=job_id, task="speech_evaluation")
    
    from app.services.whisper_service import whisper_service
    from app.services.audio_utils import normalize_audio
    from app.services.scoring import word_confidence

    tmp_path = f"{settings.AUDIO_TMP_DIR}/{job_id}.m4a"
    wav_path = None

    logger.info("Starting job %s | expected: %r", job_id, expected_text)

    try:
        # Step 1: Retrieve audio bytes from Redis
        r = _get_redis()
        audio_b64 = r.get(f"speech:audio:{job_id}")
        if not audio_b64:
            logger.error("No audio found in Redis for job %s", job_id)
            set_job(job_id, {
                "status": "done",
                "data": {"error": "Audio not found — please try again", "transcription": ""}
            })
            return

        # Write to worker's local /tmp
        audio_bytes = base64.b64decode(audio_b64)
        
        # Hash audio for potential transcription caching
        audio_hash = hash_audio_content(audio_bytes)
        
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)

        # Delete from Redis immediately (don't hold audio in Redis longer than needed)
        r.delete(f"speech:audio:{job_id}")

        logger.info("Audio written to %s (%d bytes)", tmp_path, len(audio_bytes))

        file_size = os.path.getsize(tmp_path)
        if file_size < 1_000:
            set_job(job_id, {
                "status": "done",
                "data": {
                    "error": "Recording too short — please hold the button while speaking",
                    "transcription": "",
                    "segments": [],
                    "words": [],
                    "analysis": None,
                }
            })
            return

        # Step 2: Normalise audio (m4a → wav 16kHz mono)
        logger.info("Normalising audio: %s", tmp_path)
        wav_path = normalize_audio(tmp_path)
        logger.info("Audio normalised: %s", wav_path)

        # Step 3: Transcribe (with optional caching)
        logger.info("Starting Whisper transcription")
        
        # Check transcription cache
        cached_transcription = None
        if settings.ENABLE_TRANSCRIPTION_CACHE:
            cached_transcription = _get_cached_transcription(audio_hash)
        
        if cached_transcription:
            logger.info("Transcription cache HIT")
            transcription = cached_transcription
        else:
            logger.info("Transcription cache MISS")
            transcription = whisper_service.transcribe(wav_path)
            if settings.ENABLE_TRANSCRIPTION_CACHE:
                _set_cached_transcription(audio_hash, transcription)
        
        text = transcription.get("text", "").strip()
        logger.info("Transcription result: %r", text)

        if not text:
            set_job(job_id, {
                "status": "done",
                "data": {
                    "error": "No speech detected",
                    "transcription": "",
                    "segments": [],
                    "words": [],
                    "analysis": None,
                },
            })
            return

        # Step 4: NLP evaluation with circuit breaker, retry, and caching
        expected_clean = normalize_text(expected_text)
        spoken_clean = text.strip()
        
        logger.info("Calling NLP | expected=%r spoken=%r", expected_clean, spoken_clean)
        
        try:
            nlp_result = _call_nlp_with_cache(expected_clean, spoken_clean)
            logger.info("NLP result: %s", json.dumps(nlp_result, ensure_ascii=False))
        except CircuitBreakerOpen as e:
            logger.warning("NLP circuit breaker open, using fallback: %s", e)
            nlp_result = {
                "spoken_text": spoken_clean,
                "similarity": None,
                "pronunciation_score": None,
                "feedback": "Speech evaluation service temporarily unavailable",
                "issues": ["nlp_service_unavailable"],
                "error": str(e),
            }
        except Exception as e:
            logger.exception("NLP evaluation failed after retries: %s", e)
            nlp_result = {
                "spoken_text": spoken_clean,
                "similarity": None,
                "pronunciation_score": None,
                "feedback": "Speech evaluation failed",
                "issues": ["nlp_evaluation_error"],
                "error": str(e),
            }

        # Step 5: Word confidence scores
        words_with_conf = []
        for segment in transcription.get("segments", []):
            for w in segment.get("words", []):
                words_with_conf.append({
                    "text": w.get("word", "").strip(),
                    "confidence": word_confidence(w.get("probability", 0)),
                })

        # Step 6: Store result
        set_job(job_id, {
            "status": "done",
            "data": {
                "transcription": text,
                "segments": transcription.get("segments", []),
                "words": words_with_conf,
                "analysis": nlp_result,
            },
        })
        logger.info("Job %s complete", job_id)

    except Exception as e:
        logger.exception("Job %s FAILED: %s", job_id, e)
        set_job(job_id, {
            "status": "done",
            "data": {
                "error": "Speech evaluation failed",
                "detail": str(e),
            },
        })

    finally:
        # Clean up local temp files
        for path in [tmp_path, wav_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass
        
        # Clear logging context
        clear_correlation_id()
        clear_request_context()