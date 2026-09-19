"""
NLP Service Configuration

Centralized configuration management with environment variable support.
"""
import os
from functools import lru_cache
from typing import Optional, List


def _get_env(key: str, default: str) -> str:
    return os.getenv(key, default)


def _get_env_int(key: str, default: int) -> int:
    return int(os.getenv(key, str(default)))


def _get_env_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in ("true", "1", "yes", "on")


def _get_env_list(key: str, default: str) -> List[str]:
    val = os.getenv(key, default)
    return [item.strip() for item in val.split(",") if item.strip()]


class Settings:
    """Application settings loaded from environment variables."""
    
    def __init__(self):
        # Service identification
        self.SERVICE_NAME = _get_env("SERVICE_NAME", "nlp-service")
        
        # Server
        self.HOST = _get_env("HOST", "0.0.0.0")
        self.PORT = _get_env_int("PORT", 8000)
        
        # spaCy Model
        self.SPACY_MODEL = _get_env("SPACY_MODEL", "de_core_news_lg")
        self.DICT_PATH = _get_env("DICT_PATH", "/app/app/de_en_dict.json")
        
        # Authentication
        self.JWT_KEY = _get_env("JWT_KEY", "")
        self.JWT_ALGORITHM = _get_env("JWT_ALGORITHM", "HS256")
        self.JWT_AUDIENCE = _get_env("JWT_AUDIENCE", "langphy-client")
        self.JWT_ISSUER = _get_env("JWT_ISSUER", "langphy-auth")
        
        # Rate limiting
        self.RATE_LIMIT_ENABLED = _get_env_bool("RATE_LIMIT_ENABLED", True)
        self.RATE_LIMIT_REQUESTS = _get_env_int("RATE_LIMIT_REQUESTS", 120)
        self.RATE_LIMIT_WINDOW_SECONDS = _get_env_int("RATE_LIMIT_WINDOW_SECONDS", 60)
        self.RATE_LIMIT_BURST = _get_env_int("RATE_LIMIT_BURST", 20)
        
        # CORS
        self.CORS_ENABLED = _get_env_bool("CORS_ENABLED", True)
        self.CORS_ALLOWED_ORIGINS = _get_env_list("CORS_ALLOWED_ORIGINS", "https://play.google.com")
        
        # Input validation
        self.MAX_TEXT_LENGTH = _get_env_int("MAX_TEXT_LENGTH", 10000)
        self.MAX_LESSON_TEXT_LENGTH = _get_env_int("MAX_LESSON_TEXT_LENGTH", 50000)
        
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


# Backward compatibility constants (deprecated)
SERVICE_NAME = get_settings().SERVICE_NAME
SPACY_MODEL = get_settings().SPACY_MODEL
DICT_PATH = get_settings().DICT_PATH