"""
Pytest configuration and shared fixtures for nlp-service tests.
"""
import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

# Set test environment variables before importing app modules
os.environ.setdefault("JWT_KEY", "test-secret-key-for-testing-only")


@pytest.fixture
def mock_spacy_model():
    """Mock the spaCy model for testing."""
    with patch("app.nlp.nlp") as mock_nlp:
        # Create mock tokens/doc
        mock_token = MagicMock()
        mock_token.text = "Haus"
        mock_token.lemma_ = "Haus"
        mock_token.pos_ = "NOUN"
        mock_token.tag_ = "NN"
        mock_token.dep_ = "ROOT"
        mock_token.is_stop = False
        mock_token.morph.to_dict.return_value = {"Gender": "Neut", "Number": "Sing", "Case": "Nom"}
        mock_token.lefts = []
        
        mock_doc = MagicMock()
        mock_doc.__iter__.return_value = [mock_token]
        mock_doc.similarity.return_value = 0.95
        
        mock_nlp.return_value = mock_doc
        yield mock_nlp


@pytest.fixture
def sample_german_text():
    """Sample German text for testing."""
    return "Das ist ein Test."


@pytest.fixture
def sample_expected_spoken():
    """Sample expected and spoken text pairs."""
    return {
        "expected": "Guten Morgen",
        "spoken": "Guten Morgen",
    }


# Configure pytest-asyncio
pytest_plugins = ("pytest_asyncio",)