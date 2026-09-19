"""
Caching Layer for Performance Optimization

Provides LRU cache with TTL for NLP evaluations and transcription results.
Uses Redis as backend with local in-memory fallback.
"""
import hashlib
import json
import logging
import time
from typing import Optional, Any, Dict
from functools import wraps

from app.config import get_settings
from app.services.redis_pool import get_main_redis

logger = logging.getLogger(__name__)

settings = get_settings()


class CacheManager:
    """Two-tier cache: Redis (distributed) + in-memory (fast)."""
    
    def __init__(self, namespace: str, default_ttl: int = 3600):
        self.namespace = namespace
        self.default_ttl = default_ttl
        self._local_cache: Dict[str, tuple[Any, float]] = {}  # key -> (value, expiry)
        self._local_max_size = 1000
    
    def _make_key(self, *parts: str) -> str:
        """Create namespaced cache key."""
        return f"{self.namespace}:{':'.join(parts)}"
    
    def _hash_key(self, key: str) -> str:
        """Hash long keys to fixed length."""
        if len(key) > 200:
            return hashlib.sha256(key.encode()).hexdigest()[:32]
        return key
    
    def _is_expired(self, expiry: float) -> bool:
        return time.time() > expiry
    
    def _evict_if_needed(self):
        """Evict expired entries and enforce size limit."""
        now = time.time()
        # Remove expired
        expired_keys = [k for k, (_, exp) in self._local_cache.items() if exp <= now]
        for k in expired_keys:
            del self._local_cache[k]
        
        # Enforce max size (remove oldest)
        if len(self._local_cache) >= self._local_max_size:
            # Sort by expiry and remove oldest 10%
            sorted_items = sorted(self._local_cache.items(), key=lambda x: x[1][1])
            to_remove = len(sorted_items) // 10
            for k, _ in sorted_items[:to_remove]:
                del self._local_cache[k]
    
    async def get(self, *key_parts: str) -> Optional[Any]:
        """Get value from cache (Redis first, then local)."""
        key = self._make_key(*key_parts)
        hashed_key = self._hash_key(key)
        
        # Try Redis first
        if settings.ENABLE_NLP_CACHE or settings.ENABLE_TRANSCRIPTION_CACHE:
            try:
                redis = await get_main_redis()
                value = await redis.get(hashed_key)
                if value:
                    logger.debug("Cache HIT (Redis): %s", key)
                    return json.loads(value)
            except Exception as e:
                logger.warning("Redis cache GET failed: %s", e)
        
        # Try local cache
        if hashed_key in self._local_cache:
            value, expiry = self._local_cache[hashed_key]
            if not self._is_expired(expiry):
                logger.debug("Cache HIT (local): %s", key)
                return value
            else:
                del self._local_cache[hashed_key]
        
        logger.debug("Cache MISS: %s", key)
        return None
    
    async def set(self, *key_parts: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache (both Redis and local)."""
        if ttl is None:
            ttl = self.default_ttl
        
        key = self._make_key(*key_parts)
        hashed_key = self._hash_key(key)
        serialized = json.dumps(value, separators=(',', ':'))
        expiry = time.time() + ttl
        
        # Write to Redis
        if settings.ENABLE_NLP_CACHE or settings.ENABLE_TRANSCRIPTION_CACHE:
            try:
                redis = await get_main_redis()
                await redis.setex(hashed_key, ttl, serialized)
            except Exception as e:
                logger.warning("Redis cache SET failed: %s", e)
        
        # Write to local cache
        self._local_cache[hashed_key] = (value, expiry)
        self._evict_if_needed()
        
        logger.debug("Cache SET: %s (ttl=%ds)", key, ttl)
    
    async def delete(self, *key_parts: str) -> None:
        """Delete value from cache."""
        key = self._make_key(*key_parts)
        hashed_key = self._hash_key(key)
        
        if settings.ENABLE_NLP_CACHE or settings.ENABLE_TRANSCRIPTION_CACHE:
            try:
                redis = await get_main_redis()
                await redis.delete(hashed_key)
            except Exception as e:
                logger.warning("Redis cache DELETE failed: %s", e)
        
        if hashed_key in self._local_cache:
            del self._local_cache[hashed_key]
    
    async def clear_namespace(self) -> None:
        """Clear all keys in this namespace (local only)."""
        prefix = f"{self.namespace}:"
        keys_to_delete = [k for k in self._local_cache if k.startswith(prefix)]
        for k in keys_to_delete:
            del self._local_cache[k]


# Pre-configured cache instances
nlp_cache = CacheManager("nlp", default_ttl=settings.NLP_CACHE_TTL_SECONDS)
transcription_cache = CacheManager("transcribe", default_ttl=settings.TRANSCRIPTION_CACHE_TTL_SECONDS)


def cache_key_for_text(text: str) -> str:
    """Generate cache key from text content."""
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def cache_key_for_audio(audio_hash: str) -> str:
    """Generate cache key from audio hash."""
    return audio_hash[:16]


async def get_cached_nlp_result(expected_text: str, spoken_text: str) -> Optional[Dict]:
    """Get cached NLP evaluation result."""
    if not settings.ENABLE_NLP_CACHE:
        return None
    
    # Create deterministic key from both texts
    key = cache_key_for_text(f"{expected_text}|{spoken_text}")
    return await nlp_cache.get(key)


async def set_cached_nlp_result(expected_text: str, spoken_text: str, result: Dict) -> None:
    """Cache NLP evaluation result."""
    if not settings.ENABLE_NLP_CACHE:
        return
    
    key = cache_key_for_text(f"{expected_text}|{spoken_text}")
    await nlp_cache.set(key, value=result)


async def get_cached_transcription(audio_hash: str) -> Optional[Dict]:
    """Get cached transcription result."""
    if not settings.ENABLE_TRANSCRIPTION_CACHE:
        return None
    
    key = cache_key_for_audio(audio_hash)
    return await transcription_cache.get(key)


async def set_cached_transcription(audio_hash: str, result: Dict) -> None:
    """Cache transcription result."""
    if not settings.ENABLE_TRANSCRIPTION_CACHE:
        return
    
    key = cache_key_for_audio(audio_hash)
    await transcription_cache.set(key, value=result)


def hash_audio_content(audio_bytes: bytes) -> str:
    """Generate SHA256 hash of audio content for caching."""
    return hashlib.sha256(audio_bytes).hexdigest()


# Decorator for automatic caching
def cached(cache_manager: CacheManager, key_func, ttl: Optional[int] = None):
    """Decorator to automatically cache function results."""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            key = key_func(*args, **kwargs)
            cached_value = await cache_manager.get(key)
            if cached_value is not None:
                return cached_value
            
            result = await func(*args, **kwargs)
            await cache_manager.set(key, value=result, ttl=ttl)
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            key = key_func(*args, **kwargs)
            # For sync functions, we can't easily use async cache
            # This would need a sync Redis client
            return func(*args, **kwargs)
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator