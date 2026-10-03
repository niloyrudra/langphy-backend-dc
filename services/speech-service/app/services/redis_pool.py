"""
Redis Connection Pool Manager

Provides optimized Redis connection pools for different use cases:
- High-throughput async operations (API)
- Background job processing (Worker)
"""
import logging
from typing import Optional
import redis.asyncio as redis_async

from app.config import get_settings

logger = logging.getLogger(__name__)

# Global connection pools
_main_pool: Optional[redis_async.ConnectionPool] = None
_worker_pool: Optional[redis_async.ConnectionPool] = None


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


async def get_main_redis() -> redis_async.Redis:
    """Get Redis client from main pool."""
    return redis_async.Redis(connection_pool=get_main_pool())


async def get_worker_redis() -> redis_async.Redis:
    """Get Redis client from worker pool (raw bytes for RQ pickled jobs)."""
    return redis_async.Redis(connection_pool=get_worker_pool(), decode_responses=False)


async def close_all_pools():
    """Close all connection pools (call on shutdown)."""
    global _main_pool, _worker_pool

    for name, pool in [
        ("main", _main_pool),
        ("worker", _worker_pool),
    ]:
        if pool:
            try:
                await pool.disconnect()
                logger.info("%s Redis pool closed", name)
            except Exception as e:
                logger.warning("Error closing %s Redis pool: %s", name, e)

    _main_pool = _worker_pool = None