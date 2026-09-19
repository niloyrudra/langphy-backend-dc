"""
Retry Logic with Exponential Backoff

Provides configurable retry policies for transient failures.
Supports both sync and async functions.
"""
import logging
import random
import time
import asyncio
from typing import Callable, TypeVar, Optional, Tuple, Type
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar('T')


class RetryPolicy:
    """Configuration for retry behavior."""
    
    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        jitter_factor: float = 0.1,
        retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
        should_retry: Optional[Callable[[Exception], bool]] = None,
    ):
        """
        Args:
            max_attempts: Maximum number of attempts (including first)
            base_delay: Initial delay in seconds
            max_delay: Maximum delay cap in seconds
            exponential_base: Multiplier for exponential backoff
            jitter: Add random jitter to prevent thundering herd
            jitter_factor: Jitter as fraction of delay (0.1 = ±10%)
            retryable_exceptions: Exception types that trigger retry
            should_retry: Optional custom function to determine retryability
        """
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.jitter_factor = jitter_factor
        self.retryable_exceptions = retryable_exceptions
        self.should_retry = should_retry
    
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt number (0-indexed)."""
        delay = min(
            self.base_delay * (self.exponential_base ** attempt),
            self.max_delay
        )
        if self.jitter:
            jitter_range = delay * self.jitter_factor
            delay += random.uniform(-jitter_range, jitter_range)
        return max(0, delay)
    
    def is_retryable(self, exception: Exception) -> bool:
        """Check if exception is retryable."""
        if self.should_retry:
            return self.should_retry(exception)
        return isinstance(exception, self.retryable_exceptions)


def retry(policy: Optional[RetryPolicy] = None, **policy_kwargs) -> Callable:
    """
    Decorator for adding retry logic to a function.
    
    Usage:
        @retry(max_attempts=3, base_delay=1.0)
        def my_function():
            ...
        
        @retry(RetryPolicy(max_attempts=5, base_delay=2.0))
        async def my_async_function():
            ...
    """
    if policy is None:
        policy = RetryPolicy(**policy_kwargs)
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            last_exception = None
            
            for attempt in range(policy.max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if not policy.is_retryable(e) or attempt == policy.max_attempts - 1:
                        logger.warning(
                            "Function %s failed after %d attempts (non-retryable or max reached): %s",
                            func.__name__, attempt + 1, e
                        )
                        raise
                    
                    delay = policy.get_delay(attempt)
                    logger.warning(
                        "Function %s attempt %d/%d failed: %s. Retrying in %.2fs",
                        func.__name__, attempt + 1, policy.max_attempts, e, delay
                    )
                    time.sleep(delay)
            
            # Should not reach here, but just in case
            raise last_exception
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            last_exception = None
            
            for attempt in range(policy.max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if not policy.is_retryable(e) or attempt == policy.max_attempts - 1:
                        logger.warning(
                            "Async function %s failed after %d attempts: %s",
                            func.__name__, attempt + 1, e
                        )
                        raise
                    
                    delay = policy.get_delay(attempt)
                    logger.warning(
                        "Async function %s attempt %d/%d failed: %s. Retrying in %.2fs",
                        func.__name__, attempt + 1, policy.max_attempts, e, delay
                    )
                    await asyncio.sleep(delay)
            
            raise last_exception
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


# Predefined retry policies for common scenarios
REDIS_RETRY_POLICY = RetryPolicy(
    max_attempts=3,
    base_delay=0.5,
    max_delay=10.0,
    exponential_base=2.0,
    retryable_exceptions=(
        ConnectionError,
        TimeoutError,
        IOError,
    ),
)

HTTP_RETRY_POLICY = RetryPolicy(
    max_attempts=3,
    base_delay=1.0,
    max_delay=30.0,
    exponential_base=2.0,
    retryable_exceptions=(
        ConnectionError,
        TimeoutError,
    ),
    should_retry=lambda e: (
        isinstance(e, (ConnectionError, TimeoutError)) or
        (hasattr(e, 'response') and e.response is not None and e.response.status_code >= 500)
    ),
)

NLP_SERVICE_RETRY_POLICY = RetryPolicy(
    max_attempts=2,  # Fewer retries for NLP since it's user-facing
    base_delay=1.0,
    max_delay=10.0,
    exponential_base=2.0,
    retryable_exceptions=(
        ConnectionError,
        TimeoutError,
    ),
)