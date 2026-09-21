# ═══════════════════════════════════════════════════════════════════════════
# Langphy – NLP Service Dockerfile
#
# Multi-stage build for smaller runtime image.
# spaCy model is installed at build time via requirements.txt (explicit wheel).
# ═══════════════════════════════════════════════════════════════════════════

# ── Build arguments for customization ──────────────────────────────────────────
ARG PYTHON_VERSION=3.11
ARG SPACY_MODEL=de_core_news_lg
ARG UID=1000
ARG GID=1000

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS builder

# System deps needed to compile some pip packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Create an isolated venv so stage 2 can copy it cleanly
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage 2: lean runtime image ───────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

# Re-declare build args for this stage (ARGs don't persist across stages)
ARG UID=1000
ARG GID=1000

# Only runtime system libs needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
 && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g ${GID} appuser && \
    useradd -u ${UID} -g ${GID} -m -s /bin/bash appuser

WORKDIR /app

# Copy venv from builder (no pip needed at runtime)
COPY --from=builder /opt/venv /opt/venv

# Change ownership to non-root user
RUN chown -R ${UID}:${GID} /opt/venv /app

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Copy application code
COPY --chown=${UID}:${GID} app/ ./app/

# Switch to non-root user
USER ${UID}

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health/ready', timeout=5).raise_for_status()" || exit 1

# Run with optimized settings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--loop", "uvloop", "--http", "httptools"]