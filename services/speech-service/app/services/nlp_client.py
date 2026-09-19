import httpx
import logging
from typing import Optional

from app.config import get_settings
from app.services.circuit_breaker import get_circuit_breaker, CircuitBreakerOpen
from app.services.retry import retry, HTTP_RETRY_POLICY

logger = logging.getLogger(__name__)

settings = get_settings()

NLP_SERVICE_URL = settings.NLP_SERVICE_URL

# Default analysis fallback if NLP fails
DEFAULT_ANALYSIS = {
    "pronunciation": None,
    "fluency": None,
    "accuracy": None,
    "errors": [],
}

# Shared HTTP client with connection pooling
_async_client: Optional[httpx.AsyncClient] = None
_sync_client: Optional[httpx.Client] = None


def get_async_client() -> httpx.AsyncClient:
    """Get or create async HTTP client with connection pooling."""
    global _async_client
    if _async_client is None or _async_client.is_closed:
        _async_client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=settings.NLP_TIMEOUT_CONNECT,
                read=settings.NLP_TIMEOUT_READ,
                write=settings.NLP_TIMEOUT_WRITE,
            ),
            limits=httpx.Limits(
                max_keepalive_connections=10,
                max_connections=50,
                keepalive_expiry=30.0,
            ),
        )
    return _async_client


def get_sync_client() -> httpx.Client:
    """Get or create sync HTTP client with connection pooling."""
    global _sync_client
    if _sync_client is None or _sync_client.is_closed:
        _sync_client = httpx.Client(
            timeout=httpx.Timeout(
                connect=settings.NLP_TIMEOUT_CONNECT,
                read=settings.NLP_TIMEOUT_READ,
                write=settings.NLP_TIMEOUT_WRITE,
            ),
            limits=httpx.Limits(
                max_keepalive_connections=10,
                max_connections=50,
                keepalive_expiry=30.0,
            ),
        )
    return _sync_client


async def close_clients():
    """Close HTTP clients (call on shutdown)."""
    global _async_client, _sync_client
    if _async_client and not _async_client.is_closed:
        await _async_client.aclose()
        _async_client = None
    if _sync_client and not _sync_client.is_closed:
        _sync_client.close()
        _sync_client = None


# Circuit breaker for NLP service
nlp_circuit_breaker = get_circuit_breaker(
    name="nlp-service",
    failure_threshold=5,
    recovery_timeout=30.0,
    expected_exception=Exception,
)


@retry(HTTP_RETRY_POLICY)
async def _call_nlp_async(expected: str, spoken: str) -> dict:
    """Internal function to call NLP with retry (circuit breaker applied in caller)."""
    client = get_async_client()
    response = await client.post(
        f"{NLP_SERVICE_URL}/api/nlp/analyze/evaluate-speaking",
        json={
            "expected_text": expected,
            "spoken_text": spoken,
        },
    )
    response.raise_for_status()
    return response.json()


@retry(HTTP_RETRY_POLICY)
def _call_nlp_sync(expected: str, spoken: str) -> dict:
    """Internal function to call NLP with retry (circuit breaker applied in caller)."""
    client = get_sync_client()
    response = client.post(
        f"{NLP_SERVICE_URL}/api/nlp/analyze/evaluate-speaking",
        json={
            "expected_text": expected,
            "spoken_text": spoken,
        },
    )
    response.raise_for_status()
    return response.json()


async def evaluate_text(expected: str, spoken: str) -> dict:
    """
    Evaluate speech by calling NLP service (async version).
    
    Uses circuit breaker + retry for resilience.
    """
    expected_clean = expected.strip()
    spoken_clean = spoken.strip()
    
    try:
        # Apply circuit breaker
        return nlp_circuit_breaker.call_async(_call_nlp_async, expected_clean, spoken_clean)
    
    except CircuitBreakerOpen as e:
        logger.warning("NLP circuit breaker open: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "errors": [f"NLP service temporarily unavailable (retry after {e.retry_after:.0f}s)"],
        }
    
    except httpx.HTTPStatusError as e:
        # NLP returned 4xx/5xx - don't retry on 4xx
        if 400 <= e.response.status_code < 500:
            logger.warning("NLP service client error: %d", e.response.status_code)
            return {
                **DEFAULT_ANALYSIS,
                "errors": [f"NLP service error: {e.response.status_code}"],
            }
        # 5xx errors are retried by retry decorator
        raise
    
    except httpx.RequestError as e:
        # Network/connection errors - retried by retry decorator
        logger.warning("NLP service request error: %s", e)
        raise
    
    except Exception as e:
        logger.exception("Unexpected error in NLP evaluation: %s", e)
        return {
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": [],
            "error": str(e),
        }


def evaluate_text_sync(expected: str, spoken: str) -> dict:
    """
    Synchronous version for use inside RQ worker jobs.
    
    Uses circuit breaker + retry for resilience.
    Avoids asyncio.new_event_loop() conflicts in worker threads.
    """
    expected_clean = expected.strip()
    spoken_clean = spoken.strip()
    
    try:
        # Apply circuit breaker
        return nlp_circuit_breaker.call(_call_nlp_sync, expected_clean, spoken_clean)
    
    except CircuitBreakerOpen as e:
        logger.warning("NLP circuit breaker open: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "errors": [f"NLP service temporarily unavailable (retry after {e.retry_after:.0f}s)"],
        }
    
    except httpx.HTTPStatusError as e:
        if 400 <= e.response.status_code < 500:
            logger.warning("NLP service client error: %d", e.response.status_code)
            return {
                **DEFAULT_ANALYSIS,
                "errors": [f"NLP service error: {e.response.status_code}"],
            }
        raise
    
    except httpx.RequestError as e:
        logger.warning("NLP service request error: %s", e)
        raise
    
    except Exception as e:
        logger.exception("Unexpected error in NLP evaluation: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "errors": [f"Unexpected error: {str(e)}"],
        }