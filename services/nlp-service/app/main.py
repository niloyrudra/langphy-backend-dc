import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse

from app.nlp import analyze_text, analyze_lesson, analyze_answer, analyze_speaking, _run_nlp
from app.schemas import AnalyzeRequest, LessonRequest, AnswerRequest, SpeechRequest
from app.config import get_settings
from app.middlewares.cors import setup_cors
from app.middlewares.rate_limit import rate_limit_dependency, add_rate_limit_headers
from app.middlewares.auth import require_auth, require_auth_or_internal_token
from app.services.validation import (
    validate_text_input,
    validate_lesson_text,
    validate_answer_text,
    validate_speaking_text,
    ValidationError,
)
from app.services.logging import (
    setup_logging,
    logging_middleware,
)

# Configure structured logging
settings = get_settings()
setup_logging(
    service_name="nlp-service",
    level=settings.LOG_LEVEL,
    format_type=settings.LOG_FORMAT,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting NLP Service...")
    
    try:
        settings.validate()
    except ValueError as e:
        logger.error("Configuration validation failed: %s", e)
        raise
    
    # Pre-warm spaCy model (already loaded at import; warm the pipeline once)
    _ = _run_nlp("Warmup")
    
    logger.info("NLP Service ready on port %d", settings.PORT)
    yield
    
    # Shutdown
    logger.info("Shutting down NLP Service...")


app = FastAPI(
    title="Langphy NLP Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.LOG_LEVEL == "DEBUG" else None,
    redoc_url=None,
)

# ── Middleware ──────────────────────────────────────────────────────────────
setup_cors(app)

# Structured logging middleware (adds correlation ID, request context)
app.middleware("http")(logging_middleware)

# Rate limit headers on all responses
@app.middleware("http")
async def rate_limit_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    return add_rate_limit_headers(response, request)

# ── Global Exception Handlers ───────────────────────────────────────────────
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    logger.warning("Validation error on %s: %s (field=%s)", request.url.path, exc.message, exc.field)
    return JSONResponse(
        status_code=400,
        content={"detail": exc.message, "code": exc.code, "field": exc.field},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# ── Health Checks ───────────────────────────────────────────────────────────

@app.get("/health/live", tags=["Health"])
def liveness():
    """Kubernetes liveness probe - returns 200 if process is alive."""
    return {"status": "alive", "service": "nlp-service"}


@app.get("/health/ready", tags=["Health"])
async def readiness():
    """
    Kubernetes readiness probe - returns 200 if spaCy model is loaded.
    """
    checks = {}
    overall_healthy = True
    
    # Check spaCy model
    try:
        _ = _run_nlp("health check")
        checks["spacy_model"] = {"status": "healthy"}
    except Exception as e:
        logger.warning("spaCy model health check failed: %s", e)
        checks["spacy_model"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False
    
    status_code = 200 if overall_healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if overall_healthy else "not_ready",
            "service": "nlp-service",
            "checks": checks,
        },
    )


@app.get("/health", tags=["Health"])
def health():
    """Simple health endpoint for load balancers."""
    return {"status": "ok", "service": "nlp-service"}


# ── Routes ──────────────────────────────────────────────────────────────────

@app.post("/api/nlp/analyze", dependencies=[Depends(rate_limit_dependency), Depends(require_auth)])
def analyze_text_data(req: AnalyzeRequest):
    """Analyze German text - tokenize, POS tag, lemmatize."""
    text = validate_text_input(req.text, field_name="text")
    return analyze_text(text)


@app.post("/api/nlp/analyze/lesson", dependencies=[Depends(rate_limit_dependency), Depends(require_auth)])
def analyze_lesson_data(req: LessonRequest):
    """Analyze lesson text with dictionary lookups and pronunciation hints."""
    text = validate_lesson_text(req.text)
    return analyze_lesson(text)


@app.post("/api/nlp/analyze/answer", dependencies=[Depends(rate_limit_dependency), Depends(require_auth)])
def analyze_answer_data(data: AnswerRequest):
    """Compare expected vs user answer using spaCy similarity."""
    expected, user_answer = validate_answer_text(data.expected, data.user_answer)
    return analyze_answer(expected, user_answer)


@app.post("/api/nlp/analyze/evaluate-speaking", dependencies=[Depends(rate_limit_dependency), Depends(require_auth_or_internal_token)])
def analyze_speaking_data(data: SpeechRequest):
    """Evaluate spoken text against expected text for pronunciation scoring."""
    expected, spoken = validate_speaking_text(data.expected_text, data.spoken_text)
    return analyze_speaking(expected, spoken)