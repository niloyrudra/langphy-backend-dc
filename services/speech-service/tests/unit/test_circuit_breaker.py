"""
Tests for Circuit Breaker
"""
import pytest
import time
from unittest.mock import MagicMock

from app.services.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    CircuitBreakerOpen,
    get_circuit_breaker,
)


class TestCircuitBreaker:
    """Test circuit breaker functionality."""
    
    def test_initial_state_closed(self):
        """Test circuit breaker starts in CLOSED state."""
        cb = CircuitBreaker("test", failure_threshold=3)
        assert cb.state == CircuitState.CLOSED
    
    def test_success_resets_failure_count(self):
        """Test successful calls reset failure count."""
        cb = CircuitBreaker("test", failure_threshold=3)
        
        # Fail twice
        def fail():
            raise ValueError("fail")
        
        for _ in range(2):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        assert cb._failure_count == 2
        
        # Succeed
        def succeed():
            return "ok"
        
        result = cb.call(succeed)
        assert result == "ok"
        assert cb._failure_count == 0
    
    def test_opens_after_threshold(self):
        """Test circuit opens after failure threshold."""
        cb = CircuitBreaker("test", failure_threshold=3)
        
        def fail():
            raise ValueError("fail")
        
        # Fail 3 times
        for _ in range(3):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        assert cb.state == CircuitState.OPEN
        assert cb._failure_count == 3
    
    def test_open_rejects_calls(self):
        """Test open circuit rejects calls immediately."""
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=60)
        
        def fail():
            raise ValueError("fail")
        
        # Open the circuit
        for _ in range(2):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        # Next call should be rejected
        def succeed():
            return "ok"
        
        with pytest.raises(CircuitBreakerOpen) as exc_info:
            cb.call(succeed)
        
        assert exc_info.value.service_name == "test"
        assert exc_info.value.retry_after > 0
    
    def test_half_open_after_timeout(self):
        """Test circuit goes to HALF_OPEN after recovery timeout."""
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=0.1)
        
        def fail():
            raise ValueError("fail")
        
        # Open the circuit
        for _ in range(2):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        assert cb.state == CircuitState.OPEN
        
        # Wait for recovery timeout
        time.sleep(0.15)
        
        # State should transition to HALF_OPEN
        assert cb.state == CircuitState.HALF_OPEN
    
    def test_half_open_success_closes(self):
        """Test successful call in HALF_OPEN closes circuit."""
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=0.1)
        
        def fail():
            raise ValueError("fail")
        
        for _ in range(2):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        time.sleep(0.15)
        assert cb.state == CircuitState.HALF_OPEN
        
        # Successful call should close
        def succeed():
            return "ok"
        
        result = cb.call(succeed)
        assert result == "ok"
        assert cb.state == CircuitState.CLOSED
    
    def test_half_open_failure_reopens(self):
        """Test failed call in HALF_OPEN reopens circuit."""
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=0.1)
        
        def fail():
            raise ValueError("fail")
        
        for _ in range(2):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        time.sleep(0.15)
        assert cb.state == CircuitState.HALF_OPEN
        
        # Failed call should reopen
        try:
            cb.call(fail)
        except ValueError:
            pass
        
        assert cb.state == CircuitState.OPEN
    
    def test_expected_exception_filter(self):
        """Test only expected exceptions count as failures."""
        cb = CircuitBreaker("test", failure_threshold=2, expected_exception=ValueError)
        
        def raise_key_error():
            raise KeyError("not expected")
        
        def raise_value_error():
            raise ValueError("expected")
        
        # KeyError should not count
        for _ in range(5):
            try:
                cb.call(raise_key_error)
            except KeyError:
                pass
        
        assert cb.state == CircuitState.CLOSED
        assert cb._failure_count == 0
        
        # ValueError should count
        for _ in range(2):
            try:
                cb.call(raise_value_error)
            except ValueError:
                pass
        
        assert cb.state == CircuitState.OPEN
    
    def test_reset(self):
        """Test manual reset."""
        cb = CircuitBreaker("test", failure_threshold=2)
        
        def fail():
            raise ValueError("fail")
        
        for _ in range(2):
            try:
                cb.call(fail)
            except ValueError:
                pass
        
        assert cb.state == CircuitState.OPEN
        
        cb.reset()
        assert cb.state == CircuitState.CLOSED
        assert cb._failure_count == 0
    
    def test_get_circuit_breaker_singleton(self):
        """Test get_circuit_breaker returns singleton."""
        cb1 = get_circuit_breaker("singleton-test")
        cb2 = get_circuit_breaker("singleton-test")
        assert cb1 is cb2


class TestCircuitBreakerOpen:
    """Test CircuitBreakerOpen exception."""
    
    def test_attributes(self):
        """Test exception has correct attributes."""
        exc = CircuitBreakerOpen("test-service", 30.5)
        assert exc.service_name == "test-service"
        assert exc.retry_after == 30.5
        assert "test-service" in str(exc)
        assert "30.5" in str(exc)