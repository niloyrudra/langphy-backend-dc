"""
Tests for NLP Service Rate Limiting
"""
import pytest
import time
from app.middlewares.rate_limit import InMemoryRateLimiter, get_rate_limiter


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