"""
Speech Service Utilities

Shared utility functions for text normalization, audio processing helpers, etc.
"""
import unicodedata


def normalize_text(s: str) -> str:
    """Normalize text using NFC and strip whitespace."""
    return unicodedata.normalize("NFC", s.strip())