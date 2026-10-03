"""
JWT Authentication Middleware for Speech Service

Validates JWT tokens from Authorization header using shared secret.
Integrates with the same JWT_KEY used by other Langphy services.
"""
import logging
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Extract and validate JWT token from Authorization header.
    
    Returns:
        dict: User payload with at minimum 'user_id' (UUID string)
        
    Raises:
        HTTPException: 401 if token missing, invalid, or expired
    """
    settings = get_settings()
    
    if not credentials:
        logger.warning("Missing Authorization header from %s", request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        logger.warning("Expired token from %s", request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer error=\"token_expired\""},
        )
    except jwt.InvalidAudienceError:
        logger.warning("Invalid audience in token from %s", request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_audience\""},
        )
    except jwt.InvalidIssuerError:
        logger.warning("Invalid issuer in token from %s", request.client.host if request.client else "unknown")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_issuer\""},
        )
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token from %s: %s", request.client.host if request.client else "unknown", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )
    
    # Extract user_id from 'sub' claim (standard JWT subject)
    user_id = payload.get("sub")
    if not user_id:
        logger.error("Token missing 'sub' claim")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user identifier",
        )
    
    # Attach user info to request state for downstream use
    request.state.user_id = user_id
    request.state.user_payload = payload
    
    return {
        "user_id": user_id,
        "payload": payload,
    }


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """
    Optional authentication - returns None if no valid token.
    Useful for endpoints that support both authenticated and anonymous access.
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None


def require_auth(user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency that requires authentication.
    Use this for endpoints that must have a valid user.
    """
    return user