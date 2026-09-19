"""
Tests for Health Checks
"""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))


class TestHealthEndpoints:
    """Test health check endpoints."""
    
    @pytest.fixture(autouse=True)
    def setup_settings(self):
        """Ensure settings are loaded for tests."""
        from app.config import get_settings
        get_settings.cache_clear()
    
    @pytest.mark.asyncio
    async def test_liveness(self):
        """Test liveness endpoint logic."""
        from app.main import liveness
        result = liveness()
        assert result == {"status": "alive", "service": "speech-service"}
    
    @pytest.mark.asyncio
    async def test_health_simple(self):
        """Test simple health endpoint logic."""
        from app.main import health
        result = health()
        assert result == {"status": "ok", "service": "speech-service"}
    
    @pytest.mark.asyncio
    @patch("app.main.state.is_ready")
    @patch("app.main.redis_async.Redis")
    @patch("app.main.httpx.AsyncClient")
    async def test_readiness_all_healthy(self, mock_httpx_class, mock_redis_class, mock_is_ready):
        """Test readiness when all dependencies healthy."""
        mock_is_ready.return_value = True
        
        # Mock Redis
        mock_redis_instance = AsyncMock()
        mock_redis_instance.ping = AsyncMock(return_value=True)
        mock_redis_instance.close = AsyncMock()
        mock_redis_class.return_value = mock_redis_instance
        
        # Mock NLP service - use side_effect to capture the AsyncClient call
        mock_nlp_response = MagicMock()
        mock_nlp_response.status_code = 200
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_instance.get = AsyncMock(return_value=mock_nlp_response)
        
        # Capture the call to AsyncClient and return our mock
        def create_client(*args, **kwargs):
            return mock_httpx_instance
        mock_httpx_class.side_effect = create_client
        
        # Import inside the test to ensure patches are applied
        from app.main import readiness
        response = await readiness()
        
        assert response.status_code == 200
        data = json.loads(response.body.decode())
        assert data["status"] == "ready"
        assert data["service"] == "speech-service"
        assert data["checks"]["model"]["status"] == "ready"
        assert data["checks"]["redis"]["status"] == "healthy"
        assert data["checks"]["nlp_service"]["status"] == "healthy"
    
    @pytest.mark.asyncio
    @patch("app.main.state.is_ready")
    async def test_readiness_model_not_ready(self, mock_is_ready):
        """Test readiness when model not loaded."""
        mock_is_ready.return_value = False
        
        from app.main import readiness
        response = await readiness()
        
        assert response.status_code == 503
        data = json.loads(response.body.decode())
        assert data["status"] == "not_ready"
        assert data["checks"]["model"]["status"] == "loading"
    
    @pytest.mark.asyncio
    @patch("app.main.state.is_ready")
    @patch("app.main.redis_async.Redis")
    async def test_readiness_redis_fails(self, mock_redis_class, mock_is_ready):
        """Test readiness when Redis fails."""
        mock_is_ready.return_value = True
        
        mock_redis_instance = AsyncMock()
        mock_redis_instance.ping = AsyncMock(side_effect=Exception("Connection refused"))
        mock_redis_instance.close = AsyncMock()
        mock_redis_class.return_value = mock_redis_instance
        
        from app.main import readiness
        response = await readiness()
        
        assert response.status_code == 503
        data = json.loads(response.body.decode())
        assert data["status"] == "not_ready"
        assert data["checks"]["redis"]["status"] == "unhealthy"
    
    @pytest.mark.asyncio
    @patch("app.main.state.is_ready")
    @patch("app.main.redis_async.Redis")
    @patch("app.main.httpx.AsyncClient")
    async def test_readiness_nlp_fails(self, mock_httpx_class, mock_redis_class, mock_is_ready):
        """Test readiness when NLP service fails."""
        mock_is_ready.return_value = True
        
        # Mock Redis success
        mock_redis_instance = AsyncMock()
        mock_redis_instance.ping = AsyncMock(return_value=True)
        mock_redis_instance.close = AsyncMock()
        mock_redis_class.return_value = mock_redis_instance
        
        # Mock NLP failure
        mock_httpx_instance = AsyncMock()
        mock_httpx_instance.__aenter__ = AsyncMock(return_value=mock_httpx_instance)
        mock_httpx_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_instance.get = AsyncMock(side_effect=Exception("Connection refused"))
        
        def create_client(*args, **kwargs):
            return mock_httpx_instance
        mock_httpx_class.side_effect = create_client
        
        from app.main import readiness
        response = await readiness()
        
        assert response.status_code == 503
        data = json.loads(response.body.decode())
        assert data["status"] == "not_ready"
        assert data["checks"]["nlp_service"]["status"] == "unhealthy"