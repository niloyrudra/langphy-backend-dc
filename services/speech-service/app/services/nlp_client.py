import httpx
import logging
from typing import Optional

from app.config import get_settings
from app.services.circuit_breaker import get_circuit_breaker, CircuitBreakerOpen
from app.services.retry import retry, HTTP_RETRY_POLICY

logger = logging.getLogger(__name__)

settings = get_settings()

NLP_SERVICE_URL = settings.NLP_SERVICE_URL


class NLPClientError(Exception):
    """A permanent (4xx) NLP response — never retried and never trips the breaker."""


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


# Circuit breaker for NLP service.
# Only real service failures (transport errors or 5xx HTTP responses) count
# toward tripping it — permanent 4xx client errors are raised as
# NLPClientError and deliberately excluded (a single bad input must not open
# the breaker for every user for 30 s).
nlp_circuit_breaker = get_circuit_breaker(
    name="nlp-service",
    failure_threshold=5,
    recovery_timeout=30.0,
    expected_exception=(httpx.RequestError, httpx.HTTPStatusError),
)


def _internal_headers() -> dict:
    """Optional internal service-to-service auth header (shared secret with NLP)."""
    token = settings.INTERNAL_SERVICE_TOKEN
    if not token:
        return {}
    return {"X-Internal-Token": token}


@retry(HTTP_RETRY_POLICY)
async def _call_nlp_async(expected: str, spoken: str) -> dict:
    """Call NLP with retry (circuit breaker applied in caller).

    Internal service-to-service auth is sent via X-Internal-Token; 4xx
    responses become NLPClientError so they are neither retried nor counted
    against the circuit breaker.
    """
    client = get_async_client()
    response = await client.post(
        f"{NLP_SERVICE_URL}/api/nlp/analyze/evaluate-speaking",
        json={
            "expected_text": expected,
            "spoken_text": spoken,
        },
        headers=_internal_headers(),
    )
    if 400 <= response.status_code < 500:
        raise NLPClientError(f"NLP service client error: {response.status_code}")
    response.raise_for_status()
    return response.json()


@retry(HTTP_RETRY_POLICY)
def _call_nlp_sync(expected: str, spoken: str) -> dict:
    """Call NLP with retry (circuit breaker applied in caller).

    Internal service-to-service auth is sent via X-Internal-Token; 4xx
    responses become NLPClientError so they are neither retried nor counted
    against the circuit breaker.
    """
    client = get_sync_client()
    response = client.post(
        f"{NLP_SERVICE_URL}/api/nlp/analyze/evaluate-speaking",
        json={
            "expected_text": expected,
            "spoken_text": spoken,
        },
        headers=_internal_headers(),
    )
    if 400 <= response.status_code < 500:
        raise NLPClientError(f"NLP service client error: {response.status_code}")
    response.raise_for_status()
    return response.json()


async def evaluate_text(expected: str, spoken: str) -> dict:
    """
    Evaluate speech by calling NLP service (async version).

    Uses circuit breaker + retry for resilience. Never raises for NLP failures —
    always returns a graceful fallback carrying an 'error' field, so callers
    (and the cache layer) can tell a real analysis from a degradation.
    """
    expected_clean = expected.strip()
    spoken_clean = spoken.strip()

    try:
        # Apply circuit breaker
        return await nlp_circuit_breaker.call_async(_call_nlp_async, expected_clean, spoken_clean)

    except NLPClientError as e:
        logger.warning("NLP client error (4xx): %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_client_error"],
            "error": str(e),
        }

    except CircuitBreakerOpen as e:
        logger.warning("NLP circuit breaker open: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_service_unavailable"],
            "error": str(e),
        }

    except httpx.HTTPStatusError as e:
        # 5xx after retries exhausted — graceful fallback (never cached).
        logger.warning("NLP server error after retries: %d", e.response.status_code)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_server_error"],
            "error": f"NLP service error: {e.response.status_code}",
        }

    except httpx.RequestError as e:
        # Network/connection errors after retries exhausted — graceful fallback.
        logger.warning("NLP service unreachable after retries: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_unreachable"],
            "error": str(e),
        }

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
    Never raises for NLP failures — always returns a graceful fallback carrying
    an 'error' field, so the caller (and the cache layer) can tell a real
    analysis from a degradation.
    """
    expected_clean = expected.strip()
    spoken_clean = spoken.strip()

    try:
        # Apply circuit breaker
        return nlp_circuit_breaker.call(_call_nlp_sync, expected_clean, spoken_clean)

    except NLPClientError as e:
        logger.warning("NLP client error (4xx): %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_client_error"],
            "error": str(e),
        }

    except CircuitBreakerOpen as e:
        logger.warning("NLP circuit breaker open: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_service_unavailable"],
            "error": str(e),
        }

    except httpx.HTTPStatusError as e:
        # 5xx after retries exhausted — graceful fallback (never cached).
        logger.warning("NLP server error after retries: %d", e.response.status_code)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_server_error"],
            "error": f"NLP service error: {e.response.status_code}",
        }

    except httpx.RequestError as e:
        # Network/connection errors after retries exhausted — graceful fallback.
        logger.warning("NLP service unreachable after retries: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_unreachable"],
            "error": str(e),
        }

    except Exception as e:
        logger.exception("Unexpected error in NLP evaluation: %s", e)
        return {
            **DEFAULT_ANALYSIS,
            "spoken_text": spoken_clean,
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": [],
            "error": str(e),
        }