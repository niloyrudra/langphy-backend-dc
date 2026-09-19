"""
Tests for Speech Service Configuration
"""
import os
import pytest
from app.config import Settings, get_settings


class TestSettings:
    """Test configuration loading and validation."""
    
    def test_default_values(self):
        """Test that default values are set correctly."""
        settings = Settings()
        assert settings.SERVICE_NAME == "speech-service"
        assert settings.PORT == 8001
        assert settings.REDIS_HOST == "localhost"  # Set by conftest
        assert settings.REDIS_PORT == 6379
        assert settings.WHISPER_MODEL_SIZE == "tiny"  # Set by conftest
        assert settings.JOB_TTL_SECONDS == 600
        assert settings.JOB_TIMEOUT_SECONDS == 120
    
    def test_env_override(self, monkeypatch):
        """Test that environment variables override defaults."""
        monkeypatch.setenv("PORT", "9000")
        monkeypatch.setenv("WHISPER_MODEL_SIZE", "medium")
        monkeypatch.setenv("JOB_TTL_SECONDS", "300")
        
        settings = Settings()
        assert settings.PORT == 9000
        assert settings.WHISPER_MODEL_SIZE == "medium"
        assert settings.JOB_TTL_SECONDS == 300
    
    def test_allowed_extensions_parsing(self, monkeypatch):
        """Test parsing of comma-separated extensions."""
        monkeypatch.setenv("ALLOWED_AUDIO_EXTENSIONS", "wav, mp3, ogg")
        settings = Settings()
        assert settings.ALLOWED_AUDIO_EXTENSIONS == {"wav", "mp3", "ogg"}
    
    def test_validate_missing_jwt_key(self, monkeypatch):
        """Test validation fails when JWT_KEY is missing."""
        monkeypatch.delenv("JWT_KEY", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
        
        settings = Settings()
        with pytest.raises(ValueError, match="JWT_KEY must be set"):
            settings.validate()
    
    def test_validate_test_jwt_key_allowed_in_tests(self, monkeypatch):
        """Test that test JWT key is allowed during pytest."""
        monkeypatch.setenv("JWT_KEY", "test-secret-key-for-testing-only")
        # PYTEST_CURRENT_TEST is set by pytest automatically
        
        settings = Settings()
        # Should not raise
        settings.validate()
    
    def test_get_settings_cached(self):
        """Test that get_settings returns cached instance."""
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2


class TestBackwardCompatibility:
    """Test backward compatibility constants."""
    
    def test_constants_exist(self):
        """Test that backward compatibility constants exist."""
        from app.config import (
            SERVICE_NAME, REDIS_HOST, REDIS_PORT, NLP_SERVICE_URL,
            WHISPER_MODEL_SIZE, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE,
            WHISPER_NUM_WORKERS, HF_HOME, JOB_TTL_SECONDS, JOB_TIMEOUT_SECONDS
        )
        assert SERVICE_NAME == "speech-service"
        assert REDIS_HOST == "localhost"  # Set by conftest
        assert REDIS_PORT == 6379