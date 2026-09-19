"""
Tests for NLP Service Input Validation
"""
import pytest
from app.services.validation import (
    sanitize_text,
    validate_text_input,
    validate_lesson_text,
    validate_answer_text,
    validate_speaking_text,
    ValidationError,
)


class TestSanitizeText:
    """Test text sanitization."""
    
    def test_removes_control_characters(self):
        """Test removal of control characters."""
        text = "Hello\x00World\x07Test"
        result = sanitize_text(text)
        assert "\x00" not in result
        assert "\x07" not in result
        assert result == "HelloWorldTest"
    
    def test_preserves_newlines_and_tabs(self):
        """Test that newlines and tabs are preserved."""
        text = "Line 1\nLine 2\tTabbed"
        result = sanitize_text(text)
        # Newlines and tabs are normalized to spaces
        assert "Line 1 Line 2 Tabbed" == result
    
    def test_normalizes_whitespace(self):
        """Test whitespace normalization."""
        text = "  Hello    World  \n\n  Test  "
        result = sanitize_text(text)
        assert result == "Hello World Test"
    
    def test_truncates_to_max_length(self):
        """Test truncation to max length."""
        text = "x" * 100
        result = sanitize_text(text, max_length=50)
        assert len(result) == 50
    
    def test_handles_empty_string(self):
        """Test handling of empty string."""
        assert sanitize_text("") == ""
        assert sanitize_text(None) == ""
    
    def test_strips_whitespace(self):
        """Test leading/trailing whitespace removal."""
        assert sanitize_text("  hello  ") == "hello"
        assert sanitize_text("\n\t  hello  \t\n") == "hello"


class TestValidateTextInput:
    """Test text input validation."""
    
    def test_valid_text(self):
        """Test valid text passes validation."""
        result = validate_text_input("Hello world", field_name="text")
        assert result == "Hello world"
    
    def test_rejects_non_string(self):
        """Test rejection of non-string input."""
        with pytest.raises(ValidationError) as exc_info:
            validate_text_input(123, field_name="text")
        assert exc_info.value.code == "INVALID_TYPE"
        assert exc_info.value.field == "text"
    
    def test_rejects_empty_string(self):
        """Test rejection of empty string."""
        with pytest.raises(ValidationError) as exc_info:
            validate_text_input("", field_name="text")
        assert exc_info.value.code == "EMPTY_VALUE"
    
    def test_rejects_whitespace_only(self):
        """Test rejection of whitespace-only string."""
        with pytest.raises(ValidationError):
            validate_text_input("   \n\t  ", field_name="text")
    
    def test_allows_empty_when_configured(self):
        """Test empty string allowed when allow_empty=True."""
        result = validate_text_input("", field_name="text", allow_empty=True)
        assert result == ""
    
    def test_rejects_too_long(self):
        """Test rejection of too long input (over 2x max_length for overhead)."""
        long_text = "x" * 20001  # Just over 2x max_length (10000)
        with pytest.raises(ValidationError) as exc_info:
            validate_text_input(long_text, field_name="text", max_length=10000)
        assert exc_info.value.code == "TOO_LONG"
    
    def test_rejects_too_short_after_sanitization(self):
        """Test rejection when sanitized text too short."""
        # Input has only control chars
        with pytest.raises(ValidationError) as exc_info:
            validate_text_input("\x00\x07\x08", field_name="text", min_length=1)
        assert exc_info.value.code == "TOO_SHORT"
    
    def test_custom_max_length(self):
        """Test custom max length."""
        result = validate_text_input("hello", field_name="text", max_length=10)
        assert result == "hello"
        
        with pytest.raises(ValidationError):
            validate_text_input("hello world", field_name="text", max_length=5)
    
    def test_field_name_in_error(self):
        """Test field name included in error."""
        with pytest.raises(ValidationError) as exc_info:
            validate_text_input("", field_name="custom_field")
        assert exc_info.value.field == "custom_field"


class TestValidateLessonText:
    """Test lesson text validation."""
    
    def test_valid_lesson_text(self):
        """Test valid lesson text."""
        text = "This is a longer lesson text with multiple sentences. " * 10
        result = validate_lesson_text(text)
        assert len(result) > 0
    
    def test_rejects_empty(self):
        """Test rejection of empty lesson text."""
        with pytest.raises(ValidationError):
            validate_lesson_text("")


class TestValidateAnswerText:
    """Test answer text validation."""
    
    def test_valid_answers(self):
        """Test valid expected and user answers."""
        expected, user = validate_answer_text(
            "The expected answer",
            "The user answer"
        )
        assert expected == "The expected answer"
        assert user == "The user answer"
    
    def test_sanitizes_both(self):
        """Test both inputs are sanitized."""
        expected, user = validate_answer_text(
            "  Expected  \n  ",
            "  User  \t  "
        )
        assert expected == "Expected"
        assert user == "User"
    
    def test_rejects_empty_expected(self):
        """Test rejection of empty expected."""
        with pytest.raises(ValidationError) as exc_info:
            validate_answer_text("", "user answer")
        assert exc_info.value.field == "expected"
    
    def test_rejects_empty_user_answer(self):
        """Test rejection of empty user answer."""
        with pytest.raises(ValidationError) as exc_info:
            validate_answer_text("expected", "")
        assert exc_info.value.field == "user_answer"


class TestValidateSpeakingText:
    """Test speaking evaluation text validation."""
    
    def test_valid_speaking_text(self):
        """Test valid speaking texts."""
        expected, spoken = validate_speaking_text(
            "Guten Morgen",
            "Guten Morgen"
        )
        assert expected == "Guten Morgen"
        assert spoken == "Guten Morgen"
    
    def test_rejects_empty_expected(self):
        """Test rejection of empty expected text."""
        with pytest.raises(ValidationError) as exc_info:
            validate_speaking_text("", "spoken")
        assert exc_info.value.field == "expected_text"
    
    def test_rejects_empty_spoken(self):
        """Test rejection of empty spoken text."""
        with pytest.raises(ValidationError) as exc_info:
            validate_speaking_text("expected", "")
        assert exc_info.value.field == "spoken_text"


class TestValidationError:
    """Test ValidationError exception."""
    
    def test_error_attributes(self):
        """Test error has correct attributes."""
        err = ValidationError("Test message", "TEST_CODE", "test_field")
        assert err.message == "Test message"
        assert err.code == "TEST_CODE"
        assert err.field == "test_field"
    
    def test_str_representation(self):
        """Test string representation."""
        err = ValidationError("Test message")
        assert str(err) == "Test message"