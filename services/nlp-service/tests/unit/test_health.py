"""
Tests for the NLP service health endpoints.

The spaCy model is mocked via app.nlp.nlp, and TestClient drives the real
FastAPI app (lifespan included — settings.validate() + warm-up).
"""
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


def _client():
    from app.main import app
    return TestClient(app)


class TestHealth:
    def test_liveness(self):
        with patch("app.nlp.nlp") as mock_nlp:
            mock_nlp.return_value = MagicMock()
            with _client() as client:
                response = client.get("/health/live")
            assert response.status_code == 200
            assert response.json()["status"] == "alive"
            assert response.json()["service"] == "nlp-service"

    def test_readiness(self):
        with patch("app.nlp.nlp") as mock_nlp:
            mock_nlp.return_value = MagicMock()
            with _client() as client:
                response = client.get("/health/ready")
            assert response.status_code == 200
            body = response.json()
            assert body["status"] == "ready"
            assert body["checks"]["spacy_model"]["status"] == "healthy"

    def test_health(self):
        with patch("app.nlp.nlp") as mock_nlp:
            mock_nlp.return_value = MagicMock()
            with _client() as client:
                response = client.get("/health")
            assert response.status_code == 200
            assert response.json()["status"] == "ok"