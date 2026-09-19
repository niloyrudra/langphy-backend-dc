"""
Tests for Structured Logging
"""
import pytest
import logging
import json
import time
from io import StringIO
from unittest.mock import patch

from app.services.logging import (
    setup_logging,
    set_correlation_id,
    get_correlation_id,
    clear_correlation_id,
    set_request_context,
    clear_request_context,
    StructuredFormatter,
    TextFormatter,
    logging_middleware,
)


class TestLoggingSetup:
    """Test logging configuration."""
    
    def test_setup_logging_json(self):
        """Test JSON logging setup."""
        stream = StringIO()
        logger = setup_logging("test-service", level="INFO", format_type="json", stream=stream)
        
        test_logger = logging.getLogger("test.module")
        test_logger.info("Test message")
        
        output = stream.getvalue()
        # Get the last line (the test log, not the init log)
        lines = output.strip().split('\n')
        test_log_line = lines[-1]
        
        # Parse JSON
        log_entry = json.loads(test_log_line)
        assert log_entry["message"] == "Test message"
        assert log_entry["level"] == "INFO"
        assert log_entry["service"] == "test-service"
        assert "timestamp" in log_entry
        assert "logger" in log_entry
    
    def test_setup_logging_text(self):
        """Test text logging setup."""
        stream = StringIO()
        logger = setup_logging("test-service", level="INFO", format_type="text", stream=stream)
        
        test_logger = logging.getLogger("test.module")
        test_logger.info("Test message")
        
        output = stream.getvalue()
        # Get the last line
        lines = output.strip().split('\n')
        test_log_line = lines[-1]
        
        assert "Test message" in test_log_line
        assert "test-service" in test_log_line
        assert "INFO" in test_log_line
    
    def test_correlation_id_in_logs(self):
        """Test correlation ID appears in logs."""
        stream = StringIO()
        setup_logging("test-service", level="INFO", format_type="json", stream=stream)
        
        set_correlation_id("abc123")
        
        test_logger = logging.getLogger("test.module")
        test_logger.info("Test with correlation")
        
        output = stream.getvalue()
        lines = output.strip().split('\n')
        test_log_line = lines[-1]
        log_entry = json.loads(test_log_line)
        assert log_entry["correlation_id"] == "abc123"
        
        clear_correlation_id()
    
    def test_request_context_in_logs(self):
        """Test request context appears in logs."""
        stream = StringIO()
        setup_logging("test-service", level="INFO", format_type="json", stream=stream)
        
        set_request_context(user_id="user-123", endpoint="/api/test")
        
        test_logger = logging.getLogger("test.module")
        test_logger.info("Test with context")
        
        output = stream.getvalue()
        lines = output.strip().split('\n')
        test_log_line = lines[-1]
        log_entry = json.loads(test_log_line)
        assert log_entry["user_id"] == "user-123"
        assert log_entry["endpoint"] == "/api/test"
        
        clear_request_context()
    
    def test_exception_logging(self):
        """Test exception info in logs."""
        stream = StringIO()
        setup_logging("test-service", level="INFO", format_type="json", stream=stream)
        
        test_logger = logging.getLogger("test.module")
        try:
            raise ValueError("Test error")
        except ValueError:
            test_logger.exception("Error occurred")
        
        output = stream.getvalue()
        lines = output.strip().split('\n')
        test_log_line = lines[-1]
        log_entry = json.loads(test_log_line)
        assert log_entry["message"] == "Error occurred"
        assert "exception" in log_entry
        assert "ValueError" in log_entry["exception"]
        assert "Test error" in log_entry["exception"]


class TestCorrelationId:
    """Test correlation ID management."""
    
    def test_set_and_get(self):
        """Test setting and getting correlation ID."""
        cid = set_correlation_id("test-123")
        assert cid == "test-123"
        assert get_correlation_id() == "test-123"
        clear_correlation_id()
    
    def test_generate_if_none(self):
        """Test auto-generation when None provided."""
        cid = set_correlation_id(None)
        assert cid is not None
        assert len(cid) == 8
        assert get_correlation_id() == cid
        clear_correlation_id()
    
    def test_clear(self):
        """Test clearing correlation ID."""
        set_correlation_id("test-123")
        clear_correlation_id()
        assert get_correlation_id() is None


class TestRequestContext:
    """Test request context management."""
    
    def test_set_and_get(self):
        """Test setting and getting request context."""
        set_request_context(user_id="user-123", method="POST")
        ctx = request_context_var.get()
        assert ctx["user_id"] == "user-123"
        assert ctx["method"] == "POST"
        clear_request_context()
    
    def test_update_existing(self):
        """Test updating existing context."""
        set_request_context(user_id="user-123")
        set_request_context(endpoint="/api/test")
        ctx = request_context_var.get()
        assert ctx["user_id"] == "user-123"
        assert ctx["endpoint"] == "/api/test"
        clear_request_context()
    
    def test_clear(self):
        """Test clearing request context."""
        set_request_context(user_id="user-123")
        clear_request_context()
        ctx = request_context_var.get()
        assert ctx == {}


class TestStructuredFormatter:
    """Test StructuredFormatter class."""
    
    def test_add_fields(self):
        """Test add_fields adds required fields."""
        formatter = StructuredFormatter(service_name="test-service")
        
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        
        log_record = {}
        message_dict = {}
        formatter.add_fields(log_record, record, message_dict)
        
        assert log_record["service"] == "test-service"
        assert log_record["level"] == "INFO"
        assert log_record["logger"] == "test.logger"
        assert "timestamp" in log_record


class TestTextFormatter:
    """Test TextFormatter class."""
    
    def test_format_includes_service(self):
        """Test formatted output includes service name."""
        formatter = TextFormatter(service_name="test-service")
        
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        
        output = formatter.format(record)
        assert "test-service" in output
        assert "Test message" in output
        assert "INFO" in output
    
    def test_format_includes_correlation_id(self):
        """Test formatted output includes correlation ID when set."""
        formatter = TextFormatter(service_name="test-service")
        
        set_correlation_id("abc123")
        
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )
        
        output = formatter.format(record)
        assert "abc123" in output
        
        clear_correlation_id()


# Need to import request_context_var for tests
from app.services.logging import request_context_var