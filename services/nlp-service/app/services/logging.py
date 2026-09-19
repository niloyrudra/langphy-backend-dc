"""
Structured JSON Logging for NLP Service

Provides consistent structured logging with correlation IDs for request tracing.
"""
import json
import logging
import sys
import uuid
import time
from contextvars import ContextVar
from typing import Optional, Any, Dict
from datetime import datetime
from pythonjsonlogger import jsonlogger

# Context variable for correlation ID
correlation_id_var: ContextVar[Optional[str]] = ContextVar('correlation_id', default=None)

# Context variable for request context
request_context_var: ContextVar[Dict[str, Any]] = ContextVar('request_context', default={})


class StructuredFormatter(jsonlogger.JsonFormatter):
    """JSON log formatter with standard fields."""
    
    def __init__(self, *args, **kwargs):
        # Pop service_name before passing to parent
        self._service_name = kwargs.pop('service_name', 'unknown')
        super().__init__(*args, **kwargs)
    
    def add_fields(self, log_record: Dict, record: logging.LogRecord, message_dict: Dict):
        super().add_fields(log_record, record, message_dict)
        
        # Standard fields
        log_record['timestamp'] = datetime.utcnow().isoformat() + 'Z'
        log_record['level'] = record.levelname
        log_record['logger'] = record.name
        log_record['service'] = self._service_name
        
        # Correlation ID for tracing
        corr_id = correlation_id_var.get()
        if corr_id:
            log_record['correlation_id'] = corr_id
        
        # Request context (user_id, endpoint, etc.)
        req_ctx = request_context_var.get()
        if req_ctx:
            log_record.update(req_ctx)
        
        # Exception info
        if record.exc_info:
            log_record['exception'] = self.formatException(record.exc_info)


class TextFormatter(logging.Formatter):
    """Human-readable text formatter with correlation ID."""
    
    def __init__(self, service_name: str = 'unknown', *args, **kwargs):
        fmt = (
            "%(asctime)s  %(levelname)-8s  %(name)s  "
            "[service=%(service)s"
            "%(correlation_id_str)s] "
            "%(message)s"
        )
        super().__init__(fmt=fmt, *args, **kwargs)
        self._service_name = service_name
    
    def format(self, record: logging.LogRecord) -> str:
        corr_id = correlation_id_var.get()
        record.correlation_id_str = f", correlation_id={corr_id}" if corr_id else ""
        record.service = self._service_name
        return super().format(record)


def setup_logging(
    service_name: str,
    level: str = "INFO",
    format_type: str = "json",
    stream = None,
) -> logging.Logger:
    """
    Configure structured logging for the service.
    
    Args:
        service_name: Name of the service (e.g., 'nlp-service')
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        format_type: 'json' or 'text'
        stream: Output stream (default: sys.stdout)
    
    Returns:
        Configured root logger
    """
    if stream is None:
        stream = sys.stdout
    
    # Clear existing handlers
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    
    # Create handler
    handler = logging.StreamHandler(stream)
    handler.setLevel(getattr(logging, level.upper()))
    
    # Create formatter
    if format_type == "json":
        formatter = StructuredFormatter(
            service_name=service_name,
        )
    else:
        formatter = TextFormatter(
            service_name=service_name,
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    
    logger = logging.getLogger(__name__)
    logger.info("Structured logging initialized", extra={"service": service_name, "format": format_type})
    
    return root_logger


def set_correlation_id(correlation_id: Optional[str] = None) -> str:
    """Set correlation ID for current context. Generates new if not provided."""
    if correlation_id is None:
        correlation_id = str(uuid.uuid4())[:8]
    correlation_id_var.set(correlation_id)
    return correlation_id


def get_correlation_id() -> Optional[str]:
    """Get current correlation ID."""
    return correlation_id_var.get()


def clear_correlation_id():
    """Clear correlation ID from current context."""
    correlation_id_var.set(None)


def set_request_context(**kwargs):
    """Set request context (user_id, endpoint, method, etc.)."""
    current = request_context_var.get()
    current.update(kwargs)
    request_context_var.set(current)


def clear_request_context():
    """Clear request context."""
    request_context_var.set({})


# Middleware helper for FastAPI
async def logging_middleware(request, call_next):
    """FastAPI middleware to add correlation ID and request context."""
    # Get or generate correlation ID
    corr_id = request.headers.get('X-Correlation-ID') or str(uuid.uuid4())[:8]
    set_correlation_id(corr_id)
    
    # Set request context
    set_request_context(
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host if request.client else None,
    )
    
    start_time = time.time()
    
    try:
        response = await call_next(request)
        
        # Add correlation ID to response headers
        response.headers['X-Correlation-ID'] = corr_id
        
        # Log request completion
        duration = time.time() - start_time
        logger = logging.getLogger("http.request")
        logger.info(
            "Request completed",
            extra={
                "duration_ms": round(duration * 1000, 2),
                "status_code": response.status_code,
            }
        )
        
        return response
    except Exception as e:
        duration = time.time() - start_time
        logger = logging.getLogger("http.request")
        logger.exception(
            "Request failed",
            extra={
                "duration_ms": round(duration * 1000, 2),
                "error": str(e),
            }
        )
        raise
    finally:
        clear_correlation_id()
        clear_request_context()