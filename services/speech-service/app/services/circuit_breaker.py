"""
Circuit Breaker Implementation

Prevents cascade failures when downstream services are unavailable.
Based on the circuit breaker pattern: CLOSED -> OPEN -> HALF_OPEN
"""
import logging
import time
import threading
from enum import Enum
from typing import Callable, TypeVar, Optional

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    CLOSED = "closed"      # Normal operation, requests pass through
    OPEN = "open"          # Failing, requests blocked immediately
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is open and rejects calls."""
    def __init__(self, service_name: str, retry_after: float):
        self.service_name = service_name
        self.retry_after = retry_after
        super().__init__(f"Circuit breaker OPEN for {service_name}. Retry after {retry_after:.1f}s")


class CircuitBreaker:
    """
    Thread-safe circuit breaker for protecting downstream service calls.
    
    States:
    - CLOSED: Normal operation, count failures
    - OPEN: Too many failures, reject calls immediately
    - HALF_OPEN: Allow test request to see if service recovered
    """
    
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        expected_exception: type = Exception,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: Optional[float] = None
        self._lock = threading.RLock()
        
        logger.info("Circuit breaker '%s' initialized (threshold=%d, recovery=%.1fs)",
                    name, failure_threshold, recovery_timeout)
    
    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                # Check if recovery timeout has passed
                if self._last_failure_time and \
                   time.time() - self._last_failure_time >= self.recovery_timeout:
                    self._state = CircuitState.HALF_OPEN
                    logger.info("Circuit breaker '%s' transitioned to HALF_OPEN", self.name)
            return self._state
    
    def call(self, func: Callable[..., T], *args, **kwargs) -> T:
        """
        Execute function with circuit breaker protection.
        
        Raises:
            CircuitBreakerOpen: If circuit is OPEN
            Original exception: If func fails (after recording failure)
        """
        # Check state before execution
        current_state = self.state
        if current_state == CircuitState.OPEN:
            retry_after = self.recovery_timeout - (time.time() - (self._last_failure_time or 0))
            raise CircuitBreakerOpen(self.name, max(0, retry_after))
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except self.expected_exception as e:
            self._on_failure()
            raise
    
    async def call_async(self, func: Callable[..., T], *args, **kwargs) -> T:
        """Async version of call()."""
        current_state = self.state
        if current_state == CircuitState.OPEN:
            retry_after = self.recovery_timeout - (time.time() - (self._last_failure_time or 0))
            raise CircuitBreakerOpen(self.name, max(0, retry_after))
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except self.expected_exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                self._failure_count = 0
                logger.info("Circuit breaker '%s' CLOSED after successful test call", self.name)
            elif self._state == CircuitState.CLOSED:
                self._failure_count = 0  # Reset on success
    
    def _on_failure(self):
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            
            if self._state == CircuitState.HALF_OPEN:
                # Failed test call, go back to OPEN
                self._state = CircuitState.OPEN
                logger.warning("Circuit breaker '%s' reopened after failed test call", self.name)
            elif self._state == CircuitState.CLOSED and \
                 self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning("Circuit breaker '%s' OPENED after %d failures",
                              self.name, self._failure_count)
    
    def reset(self):
        """Manually reset the circuit breaker to CLOSED state."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._last_failure_time = None
            logger.info("Circuit breaker '%s' manually reset", self.name)


# Global circuit breaker registry
_breakers: dict[str, CircuitBreaker] = {}
_breakers_lock = threading.Lock()


def get_circuit_breaker(
    name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 30.0,
    expected_exception: type = Exception,
) -> CircuitBreaker:
    """Get or create a circuit breaker by name."""
    with _breakers_lock:
        if name not in _breakers:
            _breakers[name] = CircuitBreaker(
                name=name,
                failure_threshold=failure_threshold,
                recovery_timeout=recovery_timeout,
                expected_exception=expected_exception,
            )
        return _breakers[name]