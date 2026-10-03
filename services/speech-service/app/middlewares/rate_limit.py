"""
Rate Limiting Middleware for Speech Service

Implements sliding window rate limiting with Redis backend.
Supports per-user and per-IP limits with burst allowance.
Includes in-memory fallback for testing.
"""
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
    """In-memory sliding window rate limiter (for testing/single-instance)."""
    
    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._settings = get_settings()
    
    def _get_key(self, identifier: str, endpoint: str) -> str:
        return f"{endpoint}:{identifier}"
    
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
        
        # Clean expired entries
        self._requests[key] = [ts for ts in self._requests[key] if ts > window_start]
        
        current_count = len(self._requests[key])
        allowed = current_count < limit + burst
        
        if allowed:
            self._requests[key].append(now)
        
        reset_time = int(now + window_seconds)
        
        info = {
            "limit": limit,
            "remaining": max(0, limit + burst - current_count - 1) if allowed else 0,
            "reset": reset_time,
            "retry_after": max(1, reset_time - int(now)) if not allowed else 0,
        }
        
        return allowed, info


class RateLimiter:
    """Redis-backed sliding window rate limiter."""
    
    def __init__(self):
        self._redis = None
        self._settings = get_settings()
    
    @property
    def redis(self):
        """Lazy Redis connection."""
        if self._redis is None:
            import redis.asyncio as redis_async
            self._redis = redis_async.Redis(
                host=self._settings.REDIS_HOST,
                port=self._settings.REDIS_PORT,
                password=self._settings.REDIS_PASSWORD,
                db=self._settings.REDIS_DB,
                decode_responses=True,
                max_connections=self._settings.REDIS_MAX_CONNECTIONS,
            )
        return self._redis
    
    async def close(self):
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()
            self._redis = None
    
    def _get_key(self, identifier: str, endpoint: str) -> str:
        """Generate Redis key for rate limit counter."""
        return f"ratelimit:{endpoint}:{identifier}"
    
    async def check_rate_limit(
        self,
        identifier: str,
        endpoint: str,
        limit: int,
        window_seconds: int,
        burst: int = 0,
    ) -> Tuple[bool, dict]:
        """
        Check if request is within rate limit.
        
        Returns:
            (allowed: bool, info: dict with limit, remaining, reset_time)
        """
        key = self._get_key(identifier, endpoint)
        now = time.time()
        window_start = now - window_seconds

        # Use Redis sorted set for sliding window. Expired entries are removed
        # and the current request is COUNTED first. A rejected request must
        # NEVER be recorded, otherwise the window gets poisoned by its own
        # 429 responses and stays full even after the client stops.
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        results = await pipe.execute()

        current_count = results[1]
        allowed = current_count < limit + burst

        # Record the request only when allowed.
        if allowed:
            record = self.redis.pipeline()
            record.zadd(key, {str(now): now})
            record.expire(key, window_seconds + 1)
            await record.execute()
        
        # Calculate reset time (when oldest request expires)
        oldest = await self.redis.zrange(key, 0, 0, withscores=True)
        reset_time = int(oldest[0][1] + window_seconds) if oldest else int(now + window_seconds)
        
        info = {
            "limit": limit,
            "remaining": max(0, limit + burst - current_count - 1) if allowed else 0,
            "reset": reset_time,
            "retry_after": max(1, reset_time - int(now)) if not allowed else 0,
        }
        
        return allowed, info


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get or create rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


async def rate_limit_dependency(
    request: Request,
    user: Optional[dict] = Depends(get_current_user_optional),
    limiter: RateLimiter = Depends(get_rate_limiter),
) -> None:
    """
    FastAPI dependency for rate limiting.

    Uses user_id if authenticated, otherwise falls back to client IP.
    """
    settings = get_settings()

    if not settings.RATE_LIMIT_ENABLED:
        return

    # Determine identifier: user_id > IP
    if user and user.get("user_id"):
        identifier = f"user:{user['user_id']}"
    else:
        client_host = request.client.host if request.client else "unknown"
        identifier = f"ip:{client_host}"

    endpoint = request.url.path
    
    allowed, info = await limiter.check_rate_limit(
        identifier=identifier,
        endpoint=endpoint,
        limit=settings.RATE_LIMIT_REQUESTS,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
        burst=settings.RATE_LIMIT_BURST,
    )
    
    # Add rate limit headers
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