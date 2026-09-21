# ═══════════════════════════════════════════════════════════════════════════
# Langphy – Speech Service Dockerfile
#
# KEY CHANGE FROM ORIGINAL: model weights are downloaded at IMAGE BUILD TIME
# (the RUN python -c "WhisperModel(...)" layer below).
#
# WHY THIS MATTERS
# ────────────────
# The original Dockerfile downloaded weights lazily at first inference,
# costing ~60 s on every cold pod start.  Baking the weights into the image
# means every pod – including pods rescheduled to new nodes – always finds
# the weights on its local filesystem.  Combined with the warm-up inference
# in app/model.py, the first user request hits an already-warm model.
#
# TRADE-OFF
# ─────────
# Image size grows by ~600 MB (medium model) or ~1.5 GB (large-v3).
# This is a one-time cost on push/pull, not a per-request cost.
# For a language app where transcription latency is user-visible, this
# trade-off is always worth making.
#
# TWO-STAGE BUILD
# ───────────────
# Stage 1 (builder): install Python deps into a venv – leverages Docker
#   layer cache so a requirements.txt change does not re-download the model.
# Stage 2 (runtime): copy venv + app code + baked weights into a clean image.
# ═══════════════════════════════════════════════════════════════════════════

# ── Build arguments for customization ──────────────────────────────────────────
ARG PYTHON_VERSION=3.11
ARG MODEL_SIZE=small
ARG WHISPER_DEVICE=cpu
ARG WHISPER_COMPUTE_TYPE=int8
ARG WHISPER_NUM_WORKERS=2
ARG UID=1000
ARG GID=1000

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS builder

# System deps needed to compile some pip packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Create an isolated venv so stage 2 can copy it cleanly
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Bake model weights into the image ─────────────────────────────────────────
# This layer is cached separately from the app code.  Changing app/*.py does
# NOT re-trigger this download – only a requirements.txt or ARG MODEL_SIZE
# change will invalidate this cache layer.

ENV HF_HOME=/root/.cache/huggingface

RUN python -c "\
import logging; \
logging.basicConfig(level=logging.INFO); \
from faster_whisper import WhisperModel; \
import os; \
print(f'Downloading Faster-Whisper model: size=${MODEL_SIZE}'); \
m = WhisperModel('${MODEL_SIZE}', device='${WHISPER_DEVICE}', compute_type='${WHISPER_COMPUTE_TYPE}'); \
print('Model downloaded and cached at', os.environ['HF_HOME']); \
"

# ── Stage 2: lean runtime image ───────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

# Re-declare build args for this stage (ARGs don't persist across stages)
ARG UID=1000
ARG GID=1000
ARG MODEL_SIZE=small
ARG WHISPER_DEVICE=cpu
ARG WHISPER_COMPUTE_TYPE=int8
ARG WHISPER_NUM_WORKERS=2

# Only the runtime system libs we actually need.
# procps is required for `pgrep`, used by Kubernetes readiness/liveness probes.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    procps \
 && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g ${GID} appuser && \
    useradd -u ${UID} -g ${GID} -m -s /bin/bash appuser

WORKDIR /app

# Copy venv from builder (no pip needed at runtime)
COPY --from=builder /opt/venv /opt/venv

# Copy baked model weights from builder
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Change ownership to non-root user
RUN chown -R ${UID}:${GID} /opt/venv /root/.cache/huggingface /app

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Model config – matches what was baked in.  Override at runtime if needed.
ENV WHISPER_MODEL_SIZE=${MODEL_SIZE}
ENV WHISPER_DEVICE=${WHISPER_DEVICE}
ENV WHISPER_COMPUTE_TYPE=${WHISPER_COMPUTE_TYPE}
ENV WHISPER_NUM_WORKERS=${WHISPER_NUM_WORKERS}
ENV HF_HOME=/root/.cache/huggingface

# Copy application code (changes here do NOT invalidate the model cache layer)
COPY --chown=${UID}:${GID} app/ ./app/

# Switch to non-root user
USER ${UID}

EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8001/health/ready', timeout=5).raise_for_status()" || exit 1

# Default: run the API server.
# The speech-worker overrides this CMD with:
#   command: ["python", "app/worker.py"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--loop", "uvloop", "--http", "httptools"]