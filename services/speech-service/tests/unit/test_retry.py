"""
Tests for Retry Logic
"""
import pytest
import time
from unittest.mock import MagicMock, patch

from app.services.retry import (
    RetryPolicy,
    retry,
    REDIS_RETRY_POLICY,
    HTTP_RETRY_POLICY,
    NLP_SERVICE_RETRY_POLICY,
)


class TestRetryPolicy:
    """Test retry policy configuration."""
    
    def test_default_values(self):
        """Test default retry policy values."""
        policy = RetryPolicy()
        assert policy.max_attempts == 3
        assert policy.base_delay == 1.0
        assert policy.max_delay == 60.0
        assert policy.exponential_base == 2.0
        assert policy.jitter is True
        assert policy.jitter_factor == 0.1
    
    def test_custom_values(self):
        """Test custom retry policy values."""
        policy = RetryPolicy(
            max_attempts=5,
            base_delay=2.0,
            max_delay=30.0,
            exponential_base=3.0,
            jitter=False,
        )
        assert policy.max_attempts == 5
        assert policy.base_delay == 2.0
        assert policy.max_delay == 30.0
        assert policy.exponential_base == 3.0
        assert policy.jitter is False
    
    def test_get_delay_exponential(self):
        """Test exponential backoff delay calculation."""
        policy = RetryPolicy(base_delay=1.0, exponential_base=2.0, jitter=False)
        
        assert policy.get_delay(0) == 1.0
        assert policy.get_delay(1) == 2.0
        assert policy.get_delay(2) == 4.0
        assert policy.get_delay(3) == 8.0
    
    def test_get_delay_max_cap(self):
        """Test delay is capped at max_delay."""
        policy = RetryPolicy(base_delay=10.0, max_delay=15.0, exponential_base=2.0, jitter=False)
        
        assert policy.get_delay(0) == 10.0
        assert policy.get_delay(1) == 15.0  # capped
        assert policy.get_delay(2) == 15.0  # capped
    
    def test_jitter_adds_randomness(self):
        """Test jitter adds randomness."""
        policy = RetryPolicy(base_delay=10.0, jitter=True, jitter_factor=0.1)
        
        delays = [policy.get_delay(0) for _ in range(100)]
        # All should be within ±10% of base
        for d in delays:
            assert 9.0 <= d <= 11.0
        # Should have some variation
        assert len(set(round(d, 1) for d in delays)) > 1
    
    def test_is_retryable_default(self):
        """Test default retryable exceptions."""
        policy = RetryPolicy()
        assert policy.is_retryable(Exception())
        assert policy.is_retryable(ValueError())
        assert policy.is_retryable(ConnectionError())
    
    def test_is_retryable_custom(self):
        """Test custom retryable exceptions."""
        policy = RetryPolicy(retryable_exceptions=(ValueError, TypeError))
        assert policy.is_retryable(ValueError())
        assert policy.is_retryable(TypeError())
        assert not policy.is_retryable(KeyError())
    
    def test_should_retry_custom_function(self):
        """Test custom should_retry function."""
        policy = RetryPolicy(
            retryable_exceptions=(Exception,),
            should_retry=lambda e: "retry-me" in str(e).lower()
        )
        assert policy.is_retryable(ValueError("retry-me please"))
        assert not policy.is_retryable(ValueError("do not retry"))


class TestRetryDecorator:
    """Test @retry decorator."""
    
    def test_sync_success_first_attempt(self):
        """Test successful call on first attempt."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01)
        def succeed():
            nonlocal call_count
            call_count += 1
            return "ok"
        
        result = succeed()
        assert result == "ok"
        assert call_count == 1
    
    def test_sync_retry_then_success(self):
        """Test retry then success."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01)
        def fail_twice_then_succeed():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("fail")
            return "ok"
        
        result = fail_twice_then_succeed()
        assert result == "ok"
        assert call_count == 3
    
    def test_sync_max_attempts_exceeded(self):
        """Test exception raised after max attempts."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01)
        def always_fail():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("fail")
        
        with pytest.raises(ConnectionError):
            always_fail()
        
        assert call_count == 3
    
    def test_sync_non_retryable_exception(self):
        """Test non-retryable exception raised immediately."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01, retryable_exceptions=(ConnectionError,))
        def raise_value_error():
            nonlocal call_count
            call_count += 1
            raise ValueError("not retryable")
        
        with pytest.raises(ValueError):
            raise_value_error()
        
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_async_success_first_attempt(self):
        """Test async successful call on first attempt."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01)
        async def succeed():
            nonlocal call_count
            call_count += 1
            return "ok"
        
        result = await succeed()
        assert result == "ok"
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_async_retry_then_success(self):
        """Test async retry then success."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01)
        async def fail_twice_then_succeed():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("fail")
            return "ok"
        
        result = await fail_twice_then_succeed()
        assert result == "ok"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_async_max_attempts_exceeded(self):
        """Test async exception raised after max attempts."""
        call_count = 0
        
        @retry(max_attempts=3, base_delay=0.01)
        async def always_fail():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("fail")
        
        with pytest.raises(ConnectionError):
            await always_fail()
        
        assert call_count == 3


class TestPredefinedPolicies:
    """Test predefined retry policies."""
    
    def test_redis_retry_policy(self):
        """Test Redis retry policy configuration."""
        assert REDIS_RETRY_POLICY.max_attempts == 3
        assert REDIS_RETRY_POLICY.base_delay == 0.5
        assert REDIS_RETRY_POLICY.max_delay == 10.0
        assert ConnectionError in REDIS_RETRY_POLICY.retryable_exceptions
        assert TimeoutError in REDIS_RETRY_POLICY.retryable_exceptions
    
    def test_http_retry_policy(self):
        """Test HTTP retry policy configuration."""
        assert HTTP_RETRY_POLICY.max_attempts == 3
        assert HTTP_RETRY_POLICY.base_delay == 1.0
        assert HTTP_RETRY_POLICY.max_delay == 30.0
        assert HTTP_RETRY_POLICY.should_retry is not None
    
    def test_nlp_retry_policy(self):
        """Test NLP service retry policy configuration."""
        assert NLP_SERVICE_RETRY_POLICY.max_attempts == 2
        assert NLP_SERVICE_RETRY_POLICY.base_delay == 1.0
        assert NLP_SERVICE_RETRY_POLICY.max_delay == 10.0