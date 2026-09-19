"""
Speech Service Utilities

Shared utility functions for text normalization, audio processing helpers, etc.
"""
import unicodedata


def normalize_text(s: str) -> str:
    """Normalize text using NFC and strip whitespace."""
    return unicodedata.normalize("NFC", s.strip())


def format_duration(seconds: float) -> str:
    """Format duration in human-readable form."""
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    if seconds < 60:
        return f"{seconds:.2f}s"
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes}m {secs:.1f}s"


def truncate_text(text: str, max_length: int = 50) -> str:
    """Truncate text for logging."""
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."


def safe_float(value: any, default: float = 0.0) -> float:
    """Safely convert value to float."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: any, default: int = 0) -> int:
    """Safely convert value to int."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default