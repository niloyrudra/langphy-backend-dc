"""
Tests for NLP Service Authentication Middleware
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import jwt

from app.middlewares.auth import (
    get_current_user,
    get_current_user_optional,
    require_auth,
    require_auth_or_internal_token,
)


class TestAuthMiddleware:
    """Test JWT authentication middleware for NLP service."""
    
    @pytest.fixture
    def valid_token(self):
        payload = {
            "sub": "user-456",
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def expired_token(self):
        payload = {
            "sub": "user-456",
            "exp": 1,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def wrong_key_token(self):
        payload = {
            "sub": "user-456",
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "wrong-secret", algorithm="HS256")
    
    @pytest.fixture
    def token_without_sub(self):
        payload = {
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def mock_request(self):
        request = MagicMock()
        request.client.host = "127.0.0.1"
        request.state = MagicMock()
        return request
    
    @pytest.mark.asyncio
    async def test_valid_token(self, mock_request, valid_token):
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=valid_token)
        user = await get_current_user(mock_request, credentials)
        
        assert user["user_id"] == "user-456"
        assert mock_request.state.user_id == "user-456"
    
    @pytest.mark.asyncio
    async def test_missing_credentials(self, mock_request):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, None)
        assert exc_info.value.status_code == 401
    
    @pytest.mark.asyncio
    async def test_expired_token(self, mock_request, expired_token):
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=expired_token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()
    
    @pytest.mark.asyncio
    async def test_wrong_key(self, mock_request, wrong_key_token):
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=wrong_key_token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        assert exc_info.value.status_code == 401
    
    @pytest.mark.asyncio
    async def test_missing_sub(self, mock_request, token_without_sub):
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_without_sub)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        assert exc_info.value.status_code == 401
    
    @pytest.mark.asyncio
    async def test_optional_auth_none_when_missing(self, mock_request):
        user = await get_current_user_optional(mock_request, None)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_optional_auth_none_when_invalid(self, mock_request, wrong_key_token):
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=wrong_key_token)
        user = await get_current_user_optional(mock_request, credentials)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_optional_auth_user_when_valid(self, mock_request, valid_token):
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=valid_token)
        user = await get_current_user_optional(mock_request, credentials)
        assert user is not None
        assert user["user_id"] == "user-456"


class TestInternalTokenAuth:
    """Tests for require_auth_or_internal_token (speech-worker -> NLP auth)."""

    @pytest.fixture
    def mock_request(self):
        request = MagicMock()
        request.client.host = "127.0.0.1"
        request.state = MagicMock()
        request.headers = {}
        return request

    @pytest.mark.asyncio
    async def test_internal_token_accepted(self, mock_request):
        """A matching X-Internal-Token bypasses JWT (service-to-service call)."""
        mock_request.headers = {"X-Internal-Token": "s3cret-shared-token"}
        with patch("app.middlewares.auth.get_settings") as mock_get_settings:
            mock_get_settings.return_value.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"
            result = await require_auth_or_internal_token(mock_request, None)
        assert result == {"internal": True}

    @pytest.mark.asyncio
    async def test_wrong_internal_token_rejected(self, mock_request):
        """A wrong internal token must not authenticate."""
        mock_request.headers = {"X-Internal-Token": "wrong-token"}
        with patch("app.middlewares.auth.get_settings") as mock_get_settings:
            mock_get_settings.return_value.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"
            with pytest.raises(HTTPException) as exc_info:
                await require_auth_or_internal_token(mock_request, None)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_header_requires_jwt(self, mock_request):
        """Without the internal header, a valid JWT is still accepted."""
        payload = {
            "sub": "user-456",
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        token = jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        from app.config import Settings
        settings = Settings()
        settings.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"

        with patch("app.middlewares.auth.get_settings", return_value=settings):
            result = await require_auth_or_internal_token(mock_request, credentials)
        assert result["user_id"] == "user-456"

    @pytest.mark.asyncio
    async def test_missing_header_and_jwt_rejected(self, mock_request):
        """No header and no credentials -> 401."""
        with patch("app.middlewares.auth.get_settings") as mock_get_settings:
            mock_get_settings.return_value.INTERNAL_SERVICE_TOKEN = "s3cret-shared-token"
            with pytest.raises(HTTPException) as exc_info:
                await require_auth_or_internal_token(mock_request, None)
        assert exc_info.value.status_code == 401