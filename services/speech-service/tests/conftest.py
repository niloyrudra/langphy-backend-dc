"""
Pytest configuration and shared fixtures for speech-service tests.
"""
import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fakeredis import FakeAsyncRedis

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

# Set test environment variables before importing app modules
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")
os.environ.setdefault("NLP_SERVICE_URL", "http://nlp:8000")
os.environ.setdefault("JWT_KEY", "test-secret-key-for-testing-only")
os.environ.setdefault("WHISPER_MODEL_SIZE", "tiny")
os.environ.setdefault("WHISPER_DEVICE", "cpu")
os.environ.setdefault("WHISPER_COMPUTE_TYPE", "int8")


@pytest.fixture
def mock_redis():
    """Provide a fake Redis instance for testing."""
    redis = FakeAsyncRedis(decode_responses=True)
    yield redis
    # Cleanup is automatic with fakeredis


@pytest.fixture
def mock_redis_sync():
    """Provide a synchronous fake Redis instance for testing."""
    from fakeredis import FakeRedis
    redis = FakeRedis(decode_responses=True)
    yield redis


@pytest.fixture
def mock_whisper_model():
    """Mock the Whisper model for testing."""
    with patch("app.model.get_model") as mock_get_model:
        mock_model = MagicMock()
        mock_model.transcribe.return_value = (
            iter([
                MagicMock(
                    start=0.0,
                    end=1.0,
                    text="Hello world",
                    words=[
                        MagicMock(word="Hello", start=0.0, end=0.5, probability=0.95),
                        MagicMock(word="world", start=0.5, end=1.0, probability=0.90),
                    ],
                )
            ]),
            MagicMock(language="en", language_probability=0.99),
        )
        mock_get_model.return_value = mock_model
        yield mock_model


@pytest.fixture
def mock_nlp_client():
    """Mock the NLP client for testing."""
    with patch("app.services.nlp_client.evaluate_text_sync") as mock_sync, \
         patch("app.services.nlp_client.evaluate_text") as mock_async:
        mock_sync.return_value = {
            "spoken_text": "hello world",
            "similarity": 0.95,
            "pronunciation_score": 95,
            "feedback": "Excellent!",
            "issues": [],
        }
        mock_async.return_value = {
            "spoken_text": "hello world",
            "similarity": 0.95,
            "pronunciation_score": 95,
            "feedback": "Excellent!",
            "issues": [],
        }
        yield mock_sync, mock_async


@pytest.fixture
def sample_audio_bytes():
    """Sample audio bytes for testing."""
    # Minimal valid WAV header + 1 second of silence at 16kHz
    import struct
    sample_rate = 16000
    duration = 1  # seconds
    num_samples = sample_rate * duration
    data = struct.pack('<' + 'h' * num_samples, *([0] * num_samples))
    
    # WAV header
    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + len(data), b'WAVE', b'fmt ', 16, 1, 1,
        sample_rate, sample_rate * 2, 2, 16, b'data', len(data)
    )
    return header + data


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset module-level singletons between tests."""
    # Reset speech service state
    import app.state as state
    state._ready = False
    
    # Reset model singleton
    import app.model as model
    model._model = None
    
    yield
    
    # Cleanup after test
    state._ready = False
    model._model = None


# Configure pytest-asyncio
pytest_plugins = ("pytest_asyncio",)