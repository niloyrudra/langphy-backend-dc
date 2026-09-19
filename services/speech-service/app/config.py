"""
Speech Service Configuration

Centralized configuration management with environment variable support.
All settings should be accessed through this module.
"""
import os
from functools import lru_cache
from typing import Optional, Set, List


def _get_env(key: str, default: str) -> str:
    """Get environment variable with default."""
    return os.getenv(key, default)


def _get_env_int(key: str, default: int) -> int:
    """Get environment variable as int with default."""
    return int(os.getenv(key, str(default)))


def _get_env_float(key: str, default: float) -> float:
    """Get environment variable as float with default."""
    return float(os.getenv(key, str(default)))


def _get_env_bool(key: str, default: bool) -> bool:
    """Get environment variable as bool with default."""
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in ("true", "1", "yes", "on")


def _get_env_set(key: str, default: str) -> Set[str]:
    """Get environment variable as set of strings."""
    val = os.getenv(key, default)
    return {item.strip().lower() for item in val.split(",") if item.strip()}


def _get_env_list(key: str, default: str) -> List[str]:
    """Get environment variable as list of strings."""
    val = os.getenv(key, default)
    return [item.strip() for item in val.split(",") if item.strip()]


class Settings:
    """Application settings loaded from environment variables."""
    
    def __init__(self):
        # Service identification
        self.SERVICE_NAME = _get_env("SERVICE_NAME", "speech-service")
        
        # Server
        self.HOST = _get_env("HOST", "0.0.0.0")
        self.PORT = _get_env_int("PORT", 8001)
        
        # Redis
        self.REDIS_HOST = _get_env("REDIS_HOST", "redis")
        self.REDIS_PORT = _get_env_int("REDIS_PORT", 6379)
        self.REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
        self.REDIS_DB = _get_env_int("REDIS_DB", 0)
        
        # Redis connection pool
        self.REDIS_MAX_CONNECTIONS = _get_env_int("REDIS_MAX_CONNECTIONS", 50)
        self.REDIS_SOCKET_TIMEOUT = _get_env_float("REDIS_SOCKET_TIMEOUT", 5.0)
        self.REDIS_SOCKET_CONNECT_TIMEOUT = _get_env_float("REDIS_SOCKET_CONNECT_TIMEOUT", 5.0)
        self.REDIS_RETRY_ON_TIMEOUT = _get_env_bool("REDIS_RETRY_ON_TIMEOUT", True)
        self.REDIS_HEALTH_CHECK_INTERVAL = _get_env_int("REDIS_HEALTH_CHECK_INTERVAL", 30)
        
        # NLP Service
        self.NLP_SERVICE_URL = _get_env("NLP_SERVICE_URL", "http://nlp:8000")
        self.NLP_TIMEOUT_CONNECT = _get_env_float("NLP_TIMEOUT_CONNECT", 5.0)
        self.NLP_TIMEOUT_READ = _get_env_float("NLP_TIMEOUT_READ", 30.0)
        self.NLP_TIMEOUT_WRITE = _get_env_float("NLP_TIMEOUT_WRITE", 30.0)
        
        # Whisper Model
        self.WHISPER_MODEL_SIZE = _get_env("WHISPER_MODEL_SIZE", "small")
        self.WHISPER_DEVICE = _get_env("WHISPER_DEVICE", "cpu")
        self.WHISPER_COMPUTE_TYPE = _get_env("WHISPER_COMPUTE_TYPE", "int8")
        self.WHISPER_NUM_WORKERS = _get_env_int("WHISPER_NUM_WORKERS", 2)
        self.HF_HOME = _get_env("HF_HOME", "/root/.cache/huggingface")
        
        # Audio processing
        self.MAX_AUDIO_FILE_SIZE = _get_env_int("MAX_AUDIO_FILE_SIZE", 10 * 1024 * 1024)
        self.ALLOWED_AUDIO_EXTENSIONS = _get_env_set(
            "ALLOWED_AUDIO_EXTENSIONS", "m4a,wav,mp3,webm,ogg,aac"
        )
        self.ALLOWED_AUDIO_MIME_TYPES = _get_env_set(
            "ALLOWED_AUDIO_MIME_TYPES",
            "audio/m4a,audio/wav,audio/mp3,audio/webm,audio/ogg,audio/aac,audio/x-m4a,audio/mp4"
        )
        self.AUDIO_TMP_DIR = _get_env("AUDIO_TMP_DIR", "/tmp")
        
        # Job processing
        self.JOB_TTL_SECONDS = _get_env_int("JOB_TTL_SECONDS", 600)
        self.JOB_TIMEOUT_SECONDS = _get_env_int("JOB_TIMEOUT_SECONDS", 120)
        self.AUDIO_REDIS_TTL_SECONDS = _get_env_int("AUDIO_REDIS_TTL_SECONDS", 600)
        
        # Performance: Caching
        self.ENABLE_NLP_CACHE = _get_env_bool("ENABLE_NLP_CACHE", True)
        self.NLP_CACHE_TTL_SECONDS = _get_env_int("NLP_CACHE_TTL_SECONDS", 3600)
        self.ENABLE_TRANSCRIPTION_CACHE = _get_env_bool("ENABLE_TRANSCRIPTION_CACHE", False)
        self.TRANSCRIPTION_CACHE_TTL_SECONDS = _get_env_int("TRANSCRIPTION_CACHE_TTL_SECONDS", 86400)
        
        # Performance: Streaming uploads
        self.ENABLE_STREAMING_UPLOAD = _get_env_bool("ENABLE_STREAMING_UPLOAD", False)
        self.STREAMING_CHUNK_SIZE = _get_env_int("STREAMING_CHUNK_SIZE", 8192)
        
        # Authentication
        self.JWT_KEY = _get_env("JWT_KEY", "")
        self.JWT_ALGORITHM = _get_env("JWT_ALGORITHM", "HS256")
        self.JWT_AUDIENCE = _get_env("JWT_AUDIENCE", "langphy-client")
        self.JWT_ISSUER = _get_env("JWT_ISSUER", "langphy-auth")
        
        # Rate limiting
        self.RATE_LIMIT_ENABLED = _get_env_bool("RATE_LIMIT_ENABLED", True)
        self.RATE_LIMIT_REQUESTS = _get_env_int("RATE_LIMIT_REQUESTS", 60)
        self.RATE_LIMIT_WINDOW_SECONDS = _get_env_int("RATE_LIMIT_WINDOW_SECONDS", 60)
        self.RATE_LIMIT_BURST = _get_env_int("RATE_LIMIT_BURST", 10)
        
        # CORS
        self.CORS_ENABLED = _get_env_bool("CORS_ENABLED", True)
        self.CORS_ALLOWED_ORIGINS = _get_env_list("CORS_ALLOWED_ORIGINS", "https://play.google.com")
        
        # Logging
        self.LOG_LEVEL = _get_env("LOG_LEVEL", "INFO")
        self.LOG_FORMAT = _get_env("LOG_FORMAT", "json")
        
        # Health checks
        self.HEALTH_CHECK_ENABLED = _get_env_bool("HEALTH_CHECK_ENABLED", True)
    
    def validate(self) -> None:
        """Validate critical settings."""
        if not self.JWT_KEY:
            raise ValueError("JWT_KEY must be set in environment")
        if self.JWT_KEY == "test-secret-key-for-testing-only" and not os.getenv("PYTEST_CURRENT_TEST"):
            raise ValueError("JWT_KEY appears to be a test value in production")


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Backward compatibility constants (deprecated - use get_settings())
# These are evaluated at import time, so they reflect the environment at startup
SERVICE_NAME = get_settings().SERVICE_NAME
REDIS_HOST = get_settings().REDIS_HOST
REDIS_PORT = get_settings().REDIS_PORT
NLP_SERVICE_URL = get_settings().NLP_SERVICE_URL
WHISPER_MODEL_SIZE = get_settings().WHISPER_MODEL_SIZE
WHISPER_DEVICE = get_settings().WHISPER_DEVICE
WHISPER_COMPUTE_TYPE = get_settings().WHISPER_COMPUTE_TYPE
WHISPER_NUM_WORKERS = get_settings().WHISPER_NUM_WORKERS
HF_HOME = get_settings().HF_HOME
JOB_TTL_SECONDS = get_settings().JOB_TTL_SECONDS
JOB_TIMEOUT_SECONDS = get_settings().JOB_TIMEOUT_SECONDS