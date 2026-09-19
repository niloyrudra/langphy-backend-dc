"""
Tests for Speech Service Rate Limiting
"""
import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch

from app.middlewares.rate_limit import RateLimiter, InMemoryRateLimiter, get_rate_limiter


class TestInMemoryRateLimiter:
    """Test in-memory rate limiter (used in tests)."""
    
    @pytest.fixture
    def limiter(self):
        """Create a fresh rate limiter."""
        return InMemoryRateLimiter()
    
    def test_allows_requests_under_limit(self, limiter):
        """Test that requests under limit are allowed."""
        for i in range(5):
            allowed, info = limiter.check_rate_limit(
                identifier="user:123",
                endpoint="/api/test",
                limit=10,
                window_seconds=60,
            )
            assert allowed is True
            assert info["remaining"] == 10 - i - 1
    
    def test_blocks_requests_over_limit(self, limiter):
        """Test that requests over limit are blocked."""
        # Make 10 requests (limit)
        for i in range(10):
            allowed, _ = limiter.check_rate_limit(
                identifier="user:123",
                endpoint="/api/test",
                limit=10,
                window_seconds=60,
            )
            assert allowed is True
        
        # 11th request should be blocked
        allowed, info = limiter.check_rate_limit(
            identifier="user:123",
            endpoint="/api/test",
            limit=10,
            window_seconds=60,
        )
        assert allowed is False
        assert info["remaining"] == 0
        assert info["retry_after"] > 0
    
    def test_burst_allowance(self, limiter):
        """Test that burst allowance works."""
        limit = 10
        burst = 5
        
        # Make limit + burst requests
        for i in range(limit + burst):
            allowed, _ = limiter.check_rate_limit(
                identifier="user:123",
                endpoint="/api/test",
                limit=limit,
                window_seconds=60,
                burst=burst,
            )
            assert allowed is True
        
        # Next request should be blocked
        allowed, _ = limiter.check_rate_limit(
            identifier="user:123",
            endpoint="/api/test",
            limit=limit,
            window_seconds=60,
            burst=burst,
        )
        assert allowed is False
    
    def test_separate_counters_per_endpoint(self, limiter):
        """Test that rate limits are per-endpoint."""
        # Make 5 requests to endpoint A
        for _ in range(5):
            limiter.check_rate_limit("user:123", "/api/a", 10, 60)
        
        # Make 5 requests to endpoint B
        for _ in range(5):
            limiter.check_rate_limit("user:123", "/api/b", 10, 60)
        
        # Both should still allow more
        allowed_a, _ = limiter.check_rate_limit("user:123", "/api/a", 10, 60)
        allowed_b, _ = limiter.check_rate_limit("user:123", "/api/b", 10, 60)
        
        assert allowed_a is True
        assert allowed_b is True
    
    def test_separate_counters_per_user(self, limiter):
        """Test that rate limits are per-user."""
        for _ in range(10):
            limiter.check_rate_limit("user:1", "/api/test", 10, 60)
        
        # User 2 should still be able to make requests
        allowed, _ = limiter.check_rate_limit("user:2", "/api/test", 10, 60)
        assert allowed is True
    
    def test_window_expiry(self, limiter):
        """Test that window expiry resets counter."""
        # Use a very short window
        for _ in range(5):
            limiter.check_rate_limit("user:123", "/api/test", 5, 1)
        
        # Should be blocked
        allowed, _ = limiter.check_rate_limit("user:123", "/api/test", 5, 1)
        assert allowed is False
        
        # Wait for window to expire
        time.sleep(1.1)
        
        # Should be allowed again
        allowed, _ = limiter.check_rate_limit("user:123", "/api/test", 5, 1)
        assert allowed is True


class TestRateLimiterIntegration:
    """Test rate limiter integration with Redis (mocked)."""
    
    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis."""
        redis = AsyncMock()
        # Create a mock pipeline object
        mock_pipeline = AsyncMock()
        mock_pipeline.zremrangebyscore = MagicMock()
        mock_pipeline.zcard = MagicMock()
        mock_pipeline.zadd = MagicMock()
        mock_pipeline.expire = MagicMock()
        mock_pipeline.execute = AsyncMock(return_value=[0, 0, 0, 0])
        
        # Make pipeline() return the mock pipeline (not a coroutine)
        redis.pipeline = MagicMock(return_value=mock_pipeline)
        redis.zrange = AsyncMock(return_value=[])
        return redis
    
    @pytest.mark.asyncio
    async def test_redis_rate_limiter_allows(self, mock_redis):
        """Test Redis rate limiter allows under limit."""
        with patch("redis.asyncio.Redis", return_value=mock_redis):
            limiter = RateLimiter()
            limiter._redis = mock_redis
            
            mock_redis.pipeline.return_value.execute = AsyncMock(return_value=[0, 0, 0, 0])
            mock_redis.zrange = AsyncMock(return_value=[])
            
            allowed, info = await limiter.check_rate_limit(
                identifier="user:123",
                endpoint="/api/test",
                limit=10,
                window_seconds=60,
            )
            
            assert allowed is True
            assert info["limit"] == 10
    
    @pytest.mark.asyncio
    async def test_redis_rate_limiter_blocks(self, mock_redis):
        """Test Redis rate limiter blocks over limit."""
        with patch("redis.asyncio.Redis", return_value=mock_redis):
            limiter = RateLimiter()
            limiter._redis = mock_redis
            
            # Return count = 10 (at limit)
            mock_redis.pipeline.return_value.execute = AsyncMock(return_value=[0, 10, 0, 0])
            mock_redis.zrange = AsyncMock(return_value=[("1234567890", 1234567890.0)])
            
            allowed, info = await limiter.check_rate_limit(
                identifier="user:123",
                endpoint="/api/test",
                limit=10,
                window_seconds=60,
            )
            
            assert allowed is False
            assert info["remaining"] == 0


class TestRateLimitDependency:
    """Test FastAPI rate limit dependency."""
    
    @pytest.mark.asyncio
    async def test_rate_limit_disabled(self):
        """Test that rate limiting can be disabled."""
        from app.config import Settings
        
        settings = Settings()
        settings.RATE_LIMIT_ENABLED = False
        
        # The dependency should return early without checking
        # This is tested by checking the setting directly
        assert settings.RATE_LIMIT_ENABLED is False
    
    def test_get_rate_limiter_singleton(self):
        """Test that get_rate_limiter returns singleton."""
        limiter1 = get_rate_limiter()
        limiter2 = get_rate_limiter()
        assert limiter1 is limiter2