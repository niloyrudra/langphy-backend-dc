"""
Input Validation Utilities for NLP Service

Validates and sanitizes text inputs for NLP endpoints.
"""
import re
import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Raised when input validation fails."""
    def __init__(self, message: str, code: str = "VALIDATION_ERROR", field: str = ""):
        self.message = message
        self.code = code
        self.field = field
        super().__init__(message)


# Control characters to strip (except newlines and tabs)
CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")

# Excessive whitespace
WHITESPACE_RE = re.compile(r"\s+")


def sanitize_text(text: str, max_length: Optional[int] = None) -> str:
    """
    Sanitize text input.
    
    - Removes control characters
    - Normalizes whitespace
    - Truncates to max_length if specified
    """
    if not text:
        return ""
    
    # Remove control characters
    text = CONTROL_CHARS_RE.sub("", text)
    
    # Normalize whitespace (replace multiple spaces/newlines with single space)
    text = WHITESPACE_RE.sub(" ", text)
    
    # Strip leading/trailing
    text = text.strip()
    
    # Truncate if needed
    if max_length and len(text) > max_length:
        text = text[:max_length].rstrip()
    
    return text


def validate_text_input(
    text: str,
    field_name: str = "text",
    max_length: Optional[int] = None,
    min_length: int = 1,
    allow_empty: bool = False,
) -> str:
    """
    Validate and sanitize text input.
    
    Returns sanitized text.
    
    Raises:
        ValidationError: If validation fails
    """
    settings = get_settings()
    
    if max_length is None:
        max_length = settings.MAX_TEXT_LENGTH
    
    if not isinstance(text, str):
        raise ValidationError(
            f"{field_name} must be a string",
            "INVALID_TYPE",
            field_name,
        )
    
    # Check for empty
    if not text or not text.strip():
        if allow_empty:
            return ""
        raise ValidationError(
            f"{field_name} cannot be empty",
            "EMPTY_VALUE",
            field_name,
        )
    
    # Check length before sanitization (raw input)
    if len(text) > max_length * 2:  # Allow some overhead for whitespace
        raise ValidationError(
            f"{field_name} too long (max {max_length} characters)",
            "TOO_LONG",
            field_name,
        )
    
    # Sanitize
    sanitized = sanitize_text(text, max_length)
    
    # Check length after sanitization
    if len(sanitized) < min_length:
        raise ValidationError(
            f"{field_name} too short after sanitization (min {min_length} characters)",
            "TOO_SHORT",
            field_name,
        )
    
    if len(sanitized) > max_length:
        raise ValidationError(
            f"{field_name} too long after sanitization (max {max_length} characters)",
            "TOO_LONG",
            field_name,
        )
    
    return sanitized


def validate_lesson_text(text: str) -> str:
    """Validate lesson text input (allows longer text)."""
    return validate_text_input(
        text,
        field_name="text",
        max_length=get_settings().MAX_LESSON_TEXT_LENGTH,
        min_length=1,
    )


def validate_answer_text(expected: str, user_answer: str) -> tuple[str, str]:
    """Validate expected and user answer texts."""
    settings = get_settings()
    expected_clean = validate_text_input(
        expected,
        field_name="expected",
        max_length=settings.MAX_TEXT_LENGTH,
        min_length=1,
    )
    user_clean = validate_text_input(
        user_answer,
        field_name="user_answer",
        max_length=settings.MAX_TEXT_LENGTH,
        min_length=1,
    )
    return expected_clean, user_clean


def validate_speaking_text(expected_text: str, spoken_text: str) -> tuple[str, str]:
    """Validate speaking evaluation texts."""
    settings = get_settings()
    expected_clean = validate_text_input(
        expected_text,
        field_name="expected_text",
        max_length=settings.MAX_TEXT_LENGTH,
        min_length=1,
    )
    spoken_clean = validate_text_input(
        spoken_text,
        field_name="spoken_text",
        max_length=settings.MAX_TEXT_LENGTH,
        min_length=1,
    )
    return expected_clean, spoken_clean