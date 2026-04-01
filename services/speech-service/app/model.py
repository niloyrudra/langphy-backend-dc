"""
app/model.py

Single source of truth for the Faster-Whisper model instance.

WHY THIS MODULE EXISTS
----------------------
Faster-Whisper (backed by CTranslate2) has two cold-start costs:
  1. Weight loading  – reading ~600 MB from disk into RAM/VRAM
  2. Kernel warm-up  – CTranslate2 JIT-compiles its CPU/CUDA kernels
     on the very first inference call

Both happen exactly once per process lifetime.  After that, every
subsequent transcription runs in ~5 s.  The goal of this module is to
pay both costs at *container startup*, before any user request arrives,
so the first real transcription is already fast.

USAGE
-----
    from app.model import get_model

    model = get_model()           # always returns the already-warm instance
    segments, info = model.transcribe(audio, language="de")

The module is intentionally not a class – a module-level singleton is
the simplest, safest pattern for a single-process FastAPI + RQ setup.
"""

import logging
import os
import time

import numpy as np
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
#
# Override any of these via environment variables so you can tune without
# rebuilding the image.
#
#   MODEL_SIZE      – whisper model variant (tiny / base / small / medium / large-v3)
#   DEVICE          – "cpu" or "cuda"
#   COMPUTE_TYPE    – "int8" (CPU default), "float16" (GPU), "int8_float16" (GPU mixed)
#   NUM_WORKERS     – parallel decoding workers (increase on multi-core machines)
#   MODEL_CACHE_DIR – where CTranslate2 caches downloaded weights
#                     Mount a PVC here so weights survive pod restarts.
#
MODEL_SIZE      = os.getenv("WHISPER_MODEL_SIZE",  "small")
DEVICE          = os.getenv("WHISPER_DEVICE",      "cpu")
COMPUTE_TYPE    = os.getenv("WHISPER_COMPUTE_TYPE","int8")       # int8 = fastest on CPU, minimal accuracy loss
NUM_WORKERS     = int(os.getenv("WHISPER_NUM_WORKERS", "2"))
MODEL_CACHE_DIR = os.getenv("HF_HOME", "/root/.cache/huggingface")  # must match PVC mountPath

# ── Module-level singleton ─────────────────────────────────────────────────────
_model: WhisperModel | None = None


def load_model() -> WhisperModel:
    """
    Instantiate the model and run a silent warm-up inference.

    Call this ONCE at startup (from lifespan or worker boot).
    Subsequent calls to get_model() return the cached instance immediately.

    Steps
    -----
    1. Instantiate WhisperModel  → loads weights from disk/PVC into memory
    2. Transcribe 1 second of silence → triggers CTranslate2 kernel compilation
    3. Store in module global so get_model() is O(1) forever after
    """
    global _model

    if _model is not None:
        logger.info("model.load_model() called but model already loaded – skipping")
        return _model

    logger.info(
        "Loading Faster-Whisper model: size=%s device=%s compute_type=%s",
        MODEL_SIZE, DEVICE, COMPUTE_TYPE,
    )
    t0 = time.perf_counter()

    _model = WhisperModel(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        num_workers=NUM_WORKERS,
        download_root=MODEL_CACHE_DIR,
        # cpu_threads=2, # cpu_threads: leave at 0 (auto) unless you need to cap CPU usage
        # inter_op_threads=1,
        # intra_threads=2,
        # inter_threads=1,
    )

    t1 = time.perf_counter()
    logger.info("Model weights loaded in %.1f s – running warm-up inference …", t1 - t0)

    # ── Warm-up: 1 second of silence at 16 kHz ────────────────────────────────
    # This forces CTranslate2 to JIT-compile its compute kernels NOW, during
    # container startup, so the very first real user transcription is fast.
    #
    # We pass language="de" because that is Langphy's target language – the
    # warm-up should exercise the exact same code path as production calls.
    silence = np.zeros(16_000, dtype=np.float32)   # 1 s × 16 000 samples/s
    segments, _ = _model.transcribe(
        silence,
        language="de",
        beam_size=1,          # minimal beam → fastest warm-up
        vad_filter=False,     # skip VAD during warm-up (silence would be filtered)
    )
    # The transcribe() return value is a *generator* – we must consume it to
    # actually execute the inference.
    _ = list(segments)

    t2 = time.perf_counter()
    logger.info(
        "Warm-up complete in %.1f s (total startup cost: %.1f s). "
        "Model is ready for requests.",
        t2 - t1,
        t2 - t0,
    )

    return _model


def get_model() -> WhisperModel:
    """
    Return the already-loaded, already-warmed model.

    Raises RuntimeError if load_model() has not been called yet.
    This makes misconfiguration (forgetting to call load_model at startup)
    loudly obvious rather than silently causing a 60-second first request.
    """
    if _model is None:
        raise RuntimeError(
            "Whisper model has not been loaded. "
            "Ensure load_model() is called during application startup "
            "(FastAPI lifespan or RQ worker boot)."
        )
    return _model