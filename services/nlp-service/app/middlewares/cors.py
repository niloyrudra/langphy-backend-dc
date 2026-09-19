"""
CORS Configuration for NLP Service

Centralized CORS middleware setup matching other Langphy services.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings


def setup_cors(app: FastAPI) -> None:
    """Configure CORS middleware for the FastAPI app."""
    settings = get_settings()
    
    if not settings.CORS_ENABLED:
        return
    
    allowed_origins = []
    for origin in settings.CORS_ALLOWED_ORIGINS:
        origin = origin.strip()
        if not origin:
            continue
        try:
            from urllib.parse import urlparse
            parsed = urlparse(origin)
            if parsed.scheme and parsed.netloc:
                allowed_origins.append(origin)
        except Exception:
            continue
    
    if not allowed_origins:
        allowed_origins = ["https://play.google.com"]
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        expose_headers=[
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After",
        ],
        max_age=86400,
    )