import os
import asyncio
import unicodedata
import json
import logging

import redis

logger = logging.getLogger(__name__)


def _get_redis() -> redis.Redis:
    return redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        db=0,
        decode_responses=True,
    )


def normalize_text(s: str) -> str:
    return unicodedata.normalize("NFC", s.strip())


def set_job(job_id: str, data: dict) -> None:
    _get_redis().setex(
        f"speech:{job_id}",
        600,
        json.dumps(data),
    )


def process_job(job_id: str, tmp_path: str, expected_text: str) -> None:
    """
    RQ job — runs in the SAME worker process (no fork).
    worker.work(fork_job_execution=False) ensures this.
 
    Because there is no fork, the pre-loaded WhisperModel singleton from
    app/model.py is safe to use directly — no thread pool inheritance,
    no deadlock, no SIGSEGV.
    """
    from app.services.whisper_service import whisper_service
    from app.services.nlp_client import evaluate_text
    from app.services.audio_utils import normalize_audio
    from app.services.scoring import word_confidence
 
    wav_path = None

    logger.info("[process_job] Starting job %s | expected: %r", job_id, expected_text)

    try:
        # Step 1: normalise audio
        logger.info("[process_job] Normalising audio: %s", tmp_path)
        wav_path = normalize_audio(tmp_path)
        logger.info("[process_job] Audio normalised: %s", wav_path)

        file_size = os.path.getsize(wav_path)
        if file_size < 16_000:
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

        # Step 2: transcribe with fresh model (no fork-inherited thread pool deadlock)
        logger.info("[process_job] Starting Whisper transcription")
        
        # transcription = _transcribe(wav_path)
        transcription = whisper_service.transcribe(wav_path)
        text = transcription.get("text", "").strip()
        
        logger.info("[process_job] Transcription result: %r", text)

        if not text:
            logger.warning("[process_job] No speech detected in audio")
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

        # Step 3: NLP evaluation
        expected_clean = normalize_text(expected_text)
        spoken_clean   = text.strip()
        logger.info("[process_job] Calling NLP service | expected=%r spoken=%r", expected_clean, spoken_clean)
        
        nlp_result = asyncio.run(evaluate_text(expected_clean, spoken_clean))
        
        logger.info("[process_job] NLP result: %s", json.dumps(nlp_result, ensure_ascii=False))

        # Step 4: word confidence scores
        words_with_conf = []
        for segment in transcription.get("segments", []):
            for w in segment.get("words", []):
                words_with_conf.append({
                    "text":       w.get("word", "").strip(),
                    "confidence": word_confidence(w.get("probability", 0)),
                })

        # Step 5: store result
        set_job(job_id, {
            "status": "done",
            "data": {
                "transcription": text,
                "segments":      transcription.get("segments", []),
                "words":         words_with_conf,
                "analysis":      nlp_result,
            },
        })
        logger.info("[process_job] Job %s complete", job_id)

    except Exception as e:
        logger.exception("[process_job] Job %s FAILED: %s", job_id, e)
        set_job(job_id, {
            "status": "done",
            "data": {
                "error":  "Speech evaluation failed",
                "detail": str(e),
            },
        })

    finally:
        for path in [tmp_path, wav_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass