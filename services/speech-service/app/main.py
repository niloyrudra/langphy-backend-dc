import logging
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import redis.asyncio as redis_async
import httpx

import app.state as state
from app.model import load_model
from app.api.speech import router as speech_router
from app.config import get_settings
from app.middlewares.cors import setup_cors
from app.middlewares.rate_limit import get_rate_limiter, add_rate_limit_headers
from app.services.logging import (
    setup_logging,
    logging_middleware,
    set_correlation_id,
    set_request_context,
    clear_correlation_id,
    clear_request_context,
)
from app.services.redis_pool import close_all_pools
from app.services.nlp_client import close_clients as close_nlp_clients

# Configure structured logging
settings = get_settings()
setup_logging(
    service_name="speech-service",
    level=settings.LOG_LEVEL,
    format_type=settings.LOG_FORMAT,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("Starting Speech Service...")
    
    # Validate critical settings
    try:
        settings.validate()
    except ValueError as e:
        logger.error("Configuration validation failed: %s", e)
        raise
    
    # Load and warm up Whisper model
    load_model()
    state.set_ready()
    
    logger.info("Speech Service ready on port %d", settings.PORT)
    yield
    
    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("Shutting down Speech Service...")
    
    # Close rate limiter Redis connection
    limiter = get_rate_limiter()
    await limiter.close()
    
    # Close NLP HTTP clients
    await close_nlp_clients()
    
    # Close Redis connection pools
    await close_all_pools()
    
    logger.info("Speech Service shutdown complete")


app = FastAPI(
    title="Speech Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.LOG_LEVEL == "DEBUG" else None,
    redoc_url=None,
)

# ── Middleware ──────────────────────────────────────────────────────────────
# CORS
setup_cors(app)

# Structured logging middleware (adds correlation ID, request context)
app.middleware("http")(logging_middleware)

# Rate limit headers on all responses
@app.middleware("http")
async def rate_limit_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    return add_rate_limit_headers(response, request)

# ── Routers ─────────────────────────────────────────────────────────────────
app.include_router(speech_router)

# ── Health Checks ───────────────────────────────────────────────────────────

@app.get("/health/live", tags=["Health"])
def liveness():
    """Kubernetes liveness probe - returns 200 if process is alive."""
    return {"status": "alive", "service": "speech-service"}


@app.get("/health/ready", tags=["Health"])
async def readiness():
    """
    Kubernetes readiness probe - returns 200 only if all dependencies are healthy.
    
    Checks:
    - Whisper model loaded
    - Redis connectivity
    - NLP service connectivity
    """
    checks = {}
    overall_healthy = True
    
    # Check model readiness
    model_ready = state.is_ready()
    checks["model"] = {"status": "ready" if model_ready else "loading"}
    if not model_ready:
        overall_healthy = False
    
    # Check Redis
    try:
        redis = redis_async.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
        await redis.ping()
        await redis.close()
        checks["redis"] = {"status": "healthy"}
    except Exception as e:
        logger.warning("Redis health check failed: %s", e)
        checks["redis"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False
    
    # Check NLP service
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)
        ) as client:
            response = await client.get(f"{settings.NLP_SERVICE_URL}/health/ready")
            if response.status_code == 200:
                checks["nlp_service"] = {"status": "healthy"}
            else:
                checks["nlp_service"] = {"status": "unhealthy", "error": f"HTTP {response.status_code}"}
                overall_healthy = False
    except Exception as e:
        logger.warning("NLP service health check failed: %s", e)
        checks["nlp_service"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False
    
    status_code = 200 if overall_healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if overall_healthy else "not_ready",
            "service": "speech-service",
            "checks": checks,
        },
    )


@app.get("/health", tags=["Health"])
def health():
    """Simple health endpoint for load balancers."""
    return {"status": "ok", "service": "speech-service"}


# ── Global Exception Handlers ───────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )