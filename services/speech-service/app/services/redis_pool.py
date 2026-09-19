"""
Redis Connection Pool Manager

Provides optimized Redis connection pools for different use cases:
- High-throughput async operations (API)
- Background job processing (Worker)
- Rate limiting (separate pool to avoid blocking)
"""
import logging
from typing import Optional
import redis.asyncio as redis_async

from app.config import get_settings

logger = logging.getLogger(__name__)

# Global connection pools
_main_pool: Optional[redis_async.ConnectionPool] = None
_worker_pool: Optional[redis_async.ConnectionPool] = None
_rate_limit_pool: Optional[redis_async.ConnectionPool] = None


def _create_pool(
    max_connections: int,
    socket_timeout: float,
    socket_connect_timeout: float,
    retry_on_timeout: bool,
    health_check_interval: int,
) -> redis_async.ConnectionPool:
    """Create a Redis connection pool with optimized settings."""
    settings = get_settings()
    
    return redis_async.ConnectionPool(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
        db=settings.REDIS_DB,
        max_connections=max_connections,
        socket_timeout=socket_timeout,
        socket_connect_timeout=socket_connect_timeout,
        retry_on_timeout=retry_on_timeout,
        health_check_interval=health_check_interval,
        decode_responses=True,
    )


def get_main_pool() -> redis_async.ConnectionPool:
    """Get main connection pool for general API operations."""
    global _main_pool
    if _main_pool is None:
        settings = get_settings()
        _main_pool = _create_pool(
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
            retry_on_timeout=settings.REDIS_RETRY_ON_TIMEOUT,
            health_check_interval=settings.REDIS_HEALTH_CHECK_INTERVAL,
        )
        logger.info("Main Redis pool created (max_connections=%d)", settings.REDIS_MAX_CONNECTIONS)
    return _main_pool


def get_worker_pool() -> redis_async.ConnectionPool:
    """Get worker connection pool for background job processing."""
    global _worker_pool
    if _worker_pool is None:
        settings = get_settings()
        # Worker pool can be smaller since it processes jobs sequentially
        worker_max = max(10, settings.REDIS_MAX_CONNECTIONS // 4)
        _worker_pool = _create_pool(
            max_connections=worker_max,
            socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
            retry_on_timeout=settings.REDIS_RETRY_ON_TIMEOUT,
            health_check_interval=settings.REDIS_HEALTH_CHECK_INTERVAL,
        )
        logger.info("Worker Redis pool created (max_connections=%d)", worker_max)
    return _worker_pool


def get_rate_limit_pool() -> redis_async.ConnectionPool:
    """Get dedicated pool for rate limiting (high throughput, low latency)."""
    global _rate_limit_pool
    if _rate_limit_pool is None:
        settings = get_settings()
        # Rate limit pool optimized for high-frequency, low-latency ops
        rl_max = max(20, settings.REDIS_MAX_CONNECTIONS // 2)
        _rate_limit_pool = _create_pool(
            max_connections=rl_max,
            socket_timeout=1.0,  # Fast timeout for rate limiting
            socket_connect_timeout=2.0,
            retry_on_timeout=True,
            health_check_interval=60,
        )
        logger.info("Rate limit Redis pool created (max_connections=%d)", rl_max)
    return _rate_limit_pool


async def get_main_redis() -> redis_async.Redis:
    """Get Redis client from main pool."""
    return redis_async.Redis(connection_pool=get_main_pool())


async def get_worker_redis() -> redis_async.Redis:
    """Get Redis client from worker pool."""
    return redis_async.Redis(connection_pool=get_worker_pool(), decode_responses=False)


async def get_rate_limit_redis() -> redis_async.Redis:
    """Get Redis client from rate limit pool."""
    return redis_async.Redis(connection_pool=get_rate_limit_pool())


async def close_all_pools():
    """Close all connection pools (call on shutdown)."""
    global _main_pool, _worker_pool, _rate_limit_pool
    
    for name, pool in [
        ("main", _main_pool),
        ("worker", _worker_pool),
        ("rate_limit", _rate_limit_pool),
    ]:
        if pool:
            try:
                await pool.disconnect()
                logger.info("%s Redis pool closed", name)
            except Exception as e:
                logger.warning("Error closing %s Redis pool: %s", name, e)
    
    _main_pool = _worker_pool = _rate_limit_pool = None


# Context managers for automatic connection management
class RedisConnection:
    """Context manager for Redis connections with automatic return to pool."""
    
    def __init__(self, pool_name: str = "main"):
        self.pool_name = pool_name
        self.redis: Optional[redis_async.Redis] = None
        self.decode_responses = True
    
    async def __aenter__(self) -> redis_async.Redis:
        if self.pool_name == "main":
            self.redis = await get_main_redis()
        elif self.pool_name == "worker":
            self.redis = await get_worker_redis()
            self.decode_responses = False
        elif self.pool_name == "rate_limit":
            self.redis = await get_rate_limit_redis()
        else:
            raise ValueError(f"Unknown pool: {self.pool_name}")
        return self.redis
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Connections are automatically returned to pool when garbage collected
        # No explicit close needed for pooled connections
        pass


# Convenience functions
async def get_redis(pool: str = "main") -> redis_async.Redis:
    """Get Redis client from specified pool."""
    if pool == "main":
        return await get_main_redis()
    elif pool == "worker":
        return await get_worker_redis()
    elif pool == "rate_limit":
        return await get_rate_limit_redis()
    else:
        raise ValueError(f"Unknown pool: {pool}")