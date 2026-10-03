"""
Rate Limiting Middleware for NLP Service

Implements sliding window rate limiting with in-memory fallback.
For production, Redis-backed is recommended (see speech service).
"""
import hmac
import logging
import time
from collections import defaultdict
from typing import Optional, Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.middlewares.auth import get_current_user, get_current_user_optional

logger = logging.getLogger(__name__)


class InMemoryRateLimiter:
    """In-memory sliding window rate limiter (for single-instance deployments)."""

    # Hard cap on tracked identifiers — beyond this we evict the least-recently
    # active windows so the map cannot grow unboundedly with one-off identifiers.
    _max_keys = 10_000

    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._settings = get_settings()

    def _get_key(self, identifier: str, endpoint: str) -> str:
        return f"{endpoint}:{identifier}"

    def _sweep(self, now: float) -> None:
        """Evict expired identifiers; if still over the cap, evict the oldest."""
        # 1) Drop identifiers whose windows have fully expired.
        stale = [
            k for k, v in self._requests.items()
            if not v or v[-1] <= now - self._settings.RATE_LIMIT_WINDOW_SECONDS
        ]
        for k in stale:
            del self._requests[k]

        # 2) If still over the cap, evict the least-recently-active identifiers.
        if len(self._requests) > self._max_keys:
            oldest = sorted(self._requests.items(), key=lambda kv: kv[1][-1])
            for k, _ in oldest[: len(self._requests) - self._max_keys]:
                del self._requests[k]

    def check_rate_limit(
        self,
        identifier: str,
        endpoint: str,
        limit: int,
        window_seconds: int,
        burst: int = 0,
    ) -> Tuple[bool, dict]:
        key = self._get_key(identifier, endpoint)
        now = time.time()
        window_start = now - window_seconds

        # Clean expired entries. If the window is empty, drop the key entirely
        # so identifiers that stop being used do not accumulate forever.
        entries = [ts for ts in self._requests[key] if ts > window_start]
        if entries:
            self._requests[key] = entries
        else:
            self._requests.pop(key, None)

        current_count = len(entries)
        allowed = current_count < limit + burst

        if allowed:
            self._requests[key].append(now)

        # Bound total memory when the identifier map grows large.
        if len(self._requests) > self._max_keys:
            self._sweep(now)

        reset_time = int(now + window_seconds)

        info = {
            "limit": limit,
            "remaining": max(0, limit + burst - current_count - 1) if allowed else 0,
            "reset": reset_time,
            "retry_after": max(1, reset_time - int(now)) if not allowed else 0,
        }

        return allowed, info


# Global rate limiter instance
_rate_limiter: Optional[InMemoryRateLimiter] = None


def get_rate_limiter() -> InMemoryRateLimiter:
    """Get or create rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = InMemoryRateLimiter()
    return _rate_limiter


async def rate_limit_dependency(
    request: Request,
    user: Optional[dict] = Depends(get_current_user_optional),
    limiter: InMemoryRateLimiter = Depends(get_rate_limiter),
) -> None:
    """FastAPI dependency for rate limiting."""
    settings = get_settings()
    
    if not settings.RATE_LIMIT_ENABLED:
        return
    
    # Trusted internal service-to-service calls (speech-worker) are already
    # rate-limited upstream — do not throttle them by IP/user.
    internal_token = settings.INTERNAL_SERVICE_TOKEN
    if internal_token:
        supplied = request.headers.get("X-Internal-Token")
        if supplied and hmac.compare_digest(supplied, internal_token):
            return
    
    # Determine identifier: user_id > IP
    if user and user.get("user_id"):
        identifier = f"user:{user['user_id']}"
    else:
        client_host = request.client.host if request.client else "unknown"
        identifier = f"ip:{client_host}"
    
    endpoint = request.url.path
    
    allowed, info = limiter.check_rate_limit(
        identifier=identifier,
        endpoint=endpoint,
        limit=settings.RATE_LIMIT_REQUESTS,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
        burst=settings.RATE_LIMIT_BURST,
    )
    
    request.state.rate_limit_info = info
    
    if not allowed:
        logger.warning(
            "Rate limit exceeded for %s on %s (limit=%d, window=%ds)",
            identifier, endpoint, settings.RATE_LIMIT_REQUESTS, settings.RATE_LIMIT_WINDOW_SECONDS
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please slow down.",
            headers={
                "X-RateLimit-Limit": str(info["limit"]),
                "X-RateLimit-Remaining": str(info["remaining"]),
                "X-RateLimit-Reset": str(info["reset"]),
                "Retry-After": str(info["retry_after"]),
            },
        )


def add_rate_limit_headers(response: JSONResponse, request: Request) -> JSONResponse:
    """Add rate limit headers to response."""
    info = getattr(request.state, "rate_limit_info", None)
    if info:
        response.headers["X-RateLimit-Limit"] = str(info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(info["reset"])
    return response