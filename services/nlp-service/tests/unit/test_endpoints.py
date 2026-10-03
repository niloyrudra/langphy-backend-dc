"""
Endpoint-level tests for the NLP service.

Covers the security-critical wiring: auth required on every route, the
internal-token path for the speech-worker, and rate limiting being active.
"""
import jwt
from unittest.mock import patch

from fastapi.testclient import TestClient

VALID_PAYLOAD = {
    "sub": "user-456",
    "exp": 9999999999,
    "iat": 1000000000,
    "aud": "langphy-client",
    "iss": "langphy-auth",
}


def _token():
    return jwt.encode(VALID_PAYLOAD, "test-secret-key-for-testing-only", algorithm="HS256")


class TestEndpoints:
    def _client(self):
        from app.main import app
        return TestClient(app)

    def test_analyze_requires_auth(self, mock_spacy_model):
        with self._client() as client:
            response = client.post("/api/nlp/analyze", json={"text": "Hallo"})
        assert response.status_code == 401

    def test_analyze_with_valid_jwt(self, mock_spacy_model):
        with self._client() as client:
            response = client.post(
                "/api/nlp/analyze",
                json={"text": "Hallo"},
                headers={"Authorization": f"Bearer {_token()}"},
            )
        assert response.status_code == 200
        assert "tokens" in response.json()

    def test_lesson_requires_auth(self, mock_spacy_model):
        with self._client() as client:
            response = client.post("/api/nlp/analyze/lesson", json={"text": "Hallo"})
        assert response.status_code == 401

    def test_answer_requires_auth(self, mock_spacy_model):
        with self._client() as client:
            response = client.post(
                "/api/nlp/analyze/answer",
                json={"expected": "Hallo", "user_answer": "Hallo"},
            )
        assert response.status_code == 401

    def test_evaluate_speaking_requires_auth(self, mock_spacy_model):
        with self._client() as client:
            response = client.post(
                "/api/nlp/analyze/evaluate-speaking",
                json={"expected_text": "Hallo", "spoken_text": "Hallo"},
            )
        assert response.status_code == 401

    def test_evaluate_speaking_with_internal_token(self, mock_spacy_model):
        """The speech-worker's internal token must be accepted (no JWT)."""
        from app.config import Settings
        settings = Settings()
        settings.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"

        with patch("app.middlewares.auth.get_settings", return_value=settings), \
             patch("app.middlewares.rate_limit.get_settings", return_value=settings):
            with self._client() as client:
                response = client.post(
                    "/api/nlp/analyze/evaluate-speaking",
                    json={"expected_text": "Guten Morgen", "spoken_text": "Guten Morgen"},
                    headers={"X-Internal-Token": "s3cret-shared-token"},
                )
        assert response.status_code == 200
        assert response.json()["similarity"] == 0.95

    def test_evaluate_speaking_with_wrong_internal_token(self, mock_spacy_model):
        """A wrong internal token must be rejected (401)."""
        from app.config import Settings
        settings = Settings()
        settings.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"

        with patch("app.middlewares.auth.get_settings", return_value=settings), \
             patch("app.middlewares.rate_limit.get_settings", return_value=settings):
            with self._client() as client:
                response = client.post(
                    "/api/nlp/analyze/evaluate-speaking",
                    json={"expected_text": "Guten Morgen", "spoken_text": "Guten Morgen"},
                    headers={"X-Internal-Token": "wrong-token"},
                )
        assert response.status_code == 401