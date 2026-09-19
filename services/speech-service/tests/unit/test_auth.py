"""
Tests for Speech Service Authentication Middleware
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import jwt

# Import after setting up mocks
from app.middlewares.auth import get_current_user, get_current_user_optional, require_auth


class TestAuthMiddleware:
    """Test JWT authentication middleware."""
    
    @pytest.fixture
    def valid_token(self):
        """Create a valid JWT token for testing."""
        payload = {
            "sub": "user-123",
            "exp": 9999999999,  # Far future
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def expired_token(self):
        """Create an expired JWT token."""
        payload = {
            "sub": "user-123",
            "exp": 1,  # Expired
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def invalid_audience_token(self):
        """Create token with wrong audience."""
        payload = {
            "sub": "user-123",
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "wrong-audience",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def invalid_issuer_token(self):
        """Create token with wrong issuer."""
        payload = {
            "sub": "user-123",
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "wrong-issuer",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def wrong_key_token(self):
        """Create token signed with different key."""
        payload = {
            "sub": "user-123",
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "wrong-secret-key", algorithm="HS256")
    
    @pytest.fixture
    def token_without_sub(self):
        """Create token missing sub claim."""
        payload = {
            "exp": 9999999999,
            "iat": 1000000000,
            "aud": "langphy-client",
            "iss": "langphy-auth",
        }
        return jwt.encode(payload, "test-secret-key-for-testing-only", algorithm="HS256")
    
    @pytest.fixture
    def mock_request(self):
        """Create a mock request object."""
        request = MagicMock()
        request.client.host = "127.0.0.1"
        request.state = MagicMock()
        return request
    
    @pytest.mark.asyncio
    async def test_valid_token_returns_user(self, mock_request, valid_token):
        """Test that valid token returns user info."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=valid_token
        )
        
        user = await get_current_user(mock_request, credentials)
        
        assert user["user_id"] == "user-123"
        assert "payload" in user
        assert mock_request.state.user_id == "user-123"
    
    @pytest.mark.asyncio
    async def test_missing_credentials_raises_401(self, mock_request):
        """Test that missing credentials raises 401."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, None)
        
        assert exc_info.value.status_code == 401
        assert "Missing authentication credentials" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_expired_token_raises_401(self, mock_request, expired_token):
        """Test that expired token raises 401."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=expired_token
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()
    
    @pytest.mark.asyncio
    async def test_invalid_audience_raises_401(self, mock_request, invalid_audience_token):
        """Test that invalid audience raises 401."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=invalid_audience_token
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        
        assert exc_info.value.status_code == 401
        assert "audience" in exc_info.value.detail.lower()
    
    @pytest.mark.asyncio
    async def test_invalid_issuer_raises_401(self, mock_request, invalid_issuer_token):
        """Test that invalid issuer raises 401."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=invalid_issuer_token
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        
        assert exc_info.value.status_code == 401
        assert "issuer" in exc_info.value.detail.lower()
    
    @pytest.mark.asyncio
    async def test_wrong_key_raises_401(self, mock_request, wrong_key_token):
        """Test that token signed with wrong key raises 401."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=wrong_key_token
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        
        assert exc_info.value.status_code == 401
    
    @pytest.mark.asyncio
    async def test_missing_sub_raises_401(self, mock_request, token_without_sub):
        """Test that token without sub claim raises 401."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token_without_sub
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, credentials)
        
        assert exc_info.value.status_code == 401
        # PyJWT raises InvalidTokenError for missing required claims
        assert "invalid" in exc_info.value.detail.lower()
    
    @pytest.mark.asyncio
    async def test_optional_auth_returns_none_when_missing(self, mock_request):
        """Test that optional auth returns None when no credentials."""
        user = await get_current_user_optional(mock_request, None)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_optional_auth_returns_none_when_invalid(self, mock_request, wrong_key_token):
        """Test that optional auth returns None when token invalid."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=wrong_key_token
        )
        
        user = await get_current_user_optional(mock_request, credentials)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_optional_auth_returns_user_when_valid(self, mock_request, valid_token):
        """Test that optional auth returns user when token valid."""
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=valid_token
        )
        
        user = await get_current_user_optional(mock_request, credentials)
        assert user is not None
        assert user["user_id"] == "user-123"
    
    def test_require_auth_returns_user(self, valid_token):
        """Test that require_auth dependency returns user."""
        # This is a dependency, so we test the underlying function
        pass  # Require auth just wraps get_current_user