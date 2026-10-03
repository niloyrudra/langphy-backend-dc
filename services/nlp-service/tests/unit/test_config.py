"""
Tests for NLP Service Configuration
"""
import os
import pytest
from app.config import Settings, get_settings


class TestSettings:
    """Test NLP service configuration."""
    
    def test_default_values(self):
        """Test default configuration values."""
        settings = Settings()
        assert settings.SERVICE_NAME == "nlp-service"
        assert settings.PORT == 8000
        assert settings.SPACY_MODEL == "de_core_news_sm"
        assert settings.MAX_TEXT_LENGTH == 10000
        assert settings.MAX_LESSON_TEXT_LENGTH == 50000
    
    def test_env_override(self, monkeypatch):
        """Test environment variable overrides."""
        monkeypatch.setenv("PORT", "9000")
        monkeypatch.setenv("MAX_TEXT_LENGTH", "5000")
        monkeypatch.setenv("RATE_LIMIT_REQUESTS", "200")
        
        settings = Settings()
        assert settings.PORT == 9000
        assert settings.MAX_TEXT_LENGTH == 5000
        assert settings.RATE_LIMIT_REQUESTS == 200
    
    def test_cors_origins_parsing(self, monkeypatch):
        """Test CORS origins parsing."""
        monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com, https://web.example.com")
        settings = Settings()
        assert "https://app.example.com" in settings.CORS_ALLOWED_ORIGINS
        assert "https://web.example.com" in settings.CORS_ALLOWED_ORIGINS
    
    def test_validate_missing_jwt_key(self, monkeypatch):
        """Test validation fails without JWT_KEY."""
        monkeypatch.delenv("JWT_KEY", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        
        settings = Settings()
        with pytest.raises(ValueError, match="JWT_KEY must be set"):
            settings.validate()
    
    def test_get_settings_cached(self):
        """Test settings caching."""
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2


class TestBackwardCompatibility:
    """Test backward compatibility constants."""
    
    def test_constants_exist(self):
        from app.config import SERVICE_NAME, SPACY_MODEL
        assert SERVICE_NAME == "nlp-service"
        assert SPACY_MODEL == "de_core_news_sm"