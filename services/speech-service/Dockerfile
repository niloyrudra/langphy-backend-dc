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

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM python:3.11-slim AS builder

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
ARG MODEL_SIZE=small
ARG WHISPER_DEVICE=cpu
ARG WHISPER_COMPUTE_TYPE=int8

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
FROM python:3.11-slim AS runtime

# Only the runtime system libs we actually need.
# procps is required for `pgrep`, used by the Kubernetes readiness/liveness
# probes in speech-worker-depl.yaml.  python:3.11-slim does not include it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    procps \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy venv from builder (no pip needed at runtime)
COPY --from=builder /opt/venv /opt/venv

# Copy baked model weights from builder
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Model config – matches what was baked in.  Override at runtime if needed.
ARG MODEL_SIZE=small
ENV WHISPER_MODEL_SIZE=${MODEL_SIZE}
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8
ENV WHISPER_NUM_WORKERS=2
ENV HF_HOME=/root/.cache/huggingface

# Copy application code (changes here do NOT invalidate the model cache layer)
COPY app/ ./app/

EXPOSE 8001

# Default: run the API server.
# The speech-worker-depl.yaml overrides this CMD with:
#   command: ["rq"]
#   args: ["worker", "speech", "--worker-class", "app.worker.WarmWorker"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]

# Base image
# FROM python:3.11-slim

# # Install system dependencies
# RUN apt-get update && apt-get install -y \
#     ffmpeg \
#     libsndfile1 \
#  && rm -rf /var/lib/apt/lists/*

# # Set working directory
# WORKDIR /app

# # Ensure app directory is on Python path
# ENV PYTHONPATH=/app
# ENV PYTHONUNBUFFERED=1

# # Copy requirements first for caching
# COPY requirements.txt .

# # Upgrade pip and install Python dependencies
# RUN pip install --upgrade pip
# RUN pip install --no-cache-dir -r requirements.txt

# # Copy the rest of your app
# COPY . .

# # Expose your app port
# EXPOSE 8001

# # Run Uvicorn
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
# # CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--timeout-keep-alive", "300"]