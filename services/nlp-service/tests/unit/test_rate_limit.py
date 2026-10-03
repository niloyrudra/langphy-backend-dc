"""
Tests for NLP Service Rate Limiting
"""
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.middlewares.rate_limit import (
    InMemoryRateLimiter,
    get_rate_limiter,
    rate_limit_dependency,
)


class TestInMemoryRateLimiter:
    """Test in-memory rate limiter for NLP service."""
    
    @pytest.fixture
    def limiter(self):
        return InMemoryRateLimiter()
    
    def test_allows_under_limit(self, limiter):
        for i in range(5):
            allowed, info = limiter.check_rate_limit("user:1", "/api/test", 10, 60)
            assert allowed
            assert info["remaining"] == 10 - i - 1
    
    def test_blocks_over_limit(self, limiter):
        for _ in range(10):
            limiter.check_rate_limit("user:1", "/api/test", 10, 60)
        
        allowed, info = limiter.check_rate_limit("user:1", "/api/test", 10, 60)
        assert not allowed
        assert info["remaining"] == 0
    
    def test_burst_allowance(self, limiter):
        for _ in range(15):  # 10 limit + 5 burst
            allowed, _ = limiter.check_rate_limit("user:1", "/api/test", 10, 60, burst=5)
            assert allowed
        
        allowed, _ = limiter.check_rate_limit("user:1", "/api/test", 10, 60, burst=5)
        assert not allowed
    
    def test_per_endpoint_limits(self, limiter):
        for _ in range(10):
            limiter.check_rate_limit("user:1", "/api/a", 10, 60)
        
        allowed, _ = limiter.check_rate_limit("user:1", "/api/b", 10, 60)
        assert allowed
    
    def test_per_user_limits(self, limiter):
        for _ in range(10):
            limiter.check_rate_limit("user:1", "/api/test", 10, 60)
        
        allowed, _ = limiter.check_rate_limit("user:2", "/api/test", 10, 60)
        assert allowed
    
    def test_window_expiry(self, limiter):
        for _ in range(5):
            limiter.check_rate_limit("user:1", "/api/test", 5, 1)
        
        allowed, _ = limiter.check_rate_limit("user:1", "/api/test", 5, 1)
        assert not allowed
        
        time.sleep(1.1)
        
        allowed, _ = limiter.check_rate_limit("user:1", "/api/test", 5, 1)
        assert allowed


class TestRateLimiterSingleton:
    """Test rate limiter singleton."""
    
    def test_singleton(self):
        limiter1 = get_rate_limiter()
        limiter2 = get_rate_limiter()
        assert limiter1 is limiter2


class TestRateLimiterMemoryBound:
    """Tests for the bounded-memory behaviour of the in-memory limiter."""

    @pytest.fixture
    def limiter(self):
        return InMemoryRateLimiter()

    def test_expired_window_entries_are_cleaned(self, limiter):
        limiter.check_rate_limit("user:1", "/api/test", 10, 1)
        assert "/api/test:user:1" in limiter._requests
        time.sleep(1.1)
        limiter.check_rate_limit("user:1", "/api/test", 10, 1)
        # The new request starts a fresh window with exactly one entry.
        assert len(limiter._requests["/api/test:user:1"]) == 1

    def test_sweep_drops_expired_identifiers(self, limiter):
        limiter.check_rate_limit("user:1", "/api/test", 10, 1)
        time.sleep(1.1)
        limiter._max_keys = 1
        # Adding a second identifier triggers the sweep, which must drop user:1.
        limiter.check_rate_limit("user:2", "/api/test", 10, 1)
        assert "/api/test:user:1" not in limiter._requests

    def test_sweep_bounds_memory_under_active_load(self, limiter):
        limiter._max_keys = 3
        for i in range(5):
            limiter.check_rate_limit(f"user:{i}", "/api/test", 10, 60)
        assert len(limiter._requests) <= 3


class TestRateLimitDependency:
    """Tests for the FastAPI rate-limit dependency (incl. internal-token path)."""

    def _make_request(self, headers=None):
        request = MagicMock()
        request.headers = headers or {}
        request.url.path = "/api/nlp/analyze"
        request.client.host = "1.2.3.4"
        request.state = MagicMock()
        return request

    @pytest.mark.asyncio
    async def test_internal_token_bypasses_rate_limiting(self):
        """Trusted internal (speech-worker) calls must not be throttled by IP."""
        from app.config import Settings
        settings = Settings()
        settings.RATE_LIMIT_ENABLED = True
        settings.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"

        request = self._make_request(headers={"X-Internal-Token": "s3cret-shared-token"})
        limiter = InMemoryRateLimiter()

        with patch("app.middlewares.rate_limit.get_settings", return_value=settings):
            await rate_limit_dependency(request, user=None, limiter=limiter)

        # No counter was recorded for the request.
        assert len(limiter._requests) == 0

    @pytest.mark.asyncio
    async def test_exceeded_limit_raises_429(self):
        """Requests over the limit raise HTTP 429."""
        from app.config import Settings
        settings = Settings()
        settings.RATE_LIMIT_ENABLED = True
        settings.RATE_LIMIT_REQUESTS = 2
        settings.RATE_LIMIT_WINDOW_SECONDS = 60
        settings.RATE_LIMIT_BURST = 0

        request = self._make_request()
        limiter = InMemoryRateLimiter()

        with patch("app.middlewares.rate_limit.get_settings", return_value=settings):
            await rate_limit_dependency(request, user=None, limiter=limiter)
            await rate_limit_dependency(request, user=None, limiter=limiter)
            with pytest.raises(HTTPException) as exc_info:
                await rate_limit_dependency(request, user=None, limiter=limiter)
            assert exc_info.value.status_code == 429
            assert "Rate limit exceeded" in exc_info.value.detail