"""
Audio File Validation Utilities

Validates uploaded audio files for type, size, and format.
Uses python-magic when available, falls back to built-in detection.
"""
import logging
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

# Try to import python-magic for MIME type detection
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    HAS_MAGIC = False
    logger.warning("python-magic not available, MIME detection limited")

# MIME type to extension mapping for validation
MIME_TO_EXT = {
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mp4": ".m4a",  # Android often sends m4a as audio/mp4
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/aac": ".aac",
    "audio/x-aac": ".aac",
}

# Magic bytes for audio format detection
MAGIC_BYTES = {
    b"RIFF": "wav",  # WAV files start with RIFF
    b"ID3": "mp3",   # MP3 with ID3 tag
    b"\xff\xfb": "mp3",  # MP3 without ID3 (MPEG frame sync)
    b"\xff\xf3": "mp3",
    b"\xff\xf2": "mp3",
    b"OggS": "ogg",  # OGG
    b"\x1aE\xdf\xa3": "webm",  # WebM/Matroska
    b"ftypM4A": "m4a",  # M4A
    b"ftypisom": "m4a",  # MP4/M4A
    b"ftypiso2": "m4a",
}


class AudioValidationError(Exception):
    """Raised when audio file validation fails."""
    def __init__(self, message: str, code: str = "AUDIO_VALIDATION_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


def validate_audio_file(
    filename: str,
    content_type: str,
    file_size: int,
    file_bytes: Optional[bytes] = None,
) -> str:
    """
    Validate an uploaded audio file.
    
    Args:
        filename: Original filename
        content_type: MIME type from upload
        file_size: File size in bytes
        file_bytes: Optional file bytes for magic byte detection
        
    Returns:
        str: Detected/validated file extension (with leading dot)
        
    Raises:
        AudioValidationError: If validation fails
    """
    settings = get_settings()
    
    # 1. Check file size
    if file_size > settings.MAX_AUDIO_FILE_SIZE:
        raise AudioValidationError(
            f"File too large: {file_size} bytes (max {settings.MAX_AUDIO_FILE_SIZE})",
            "FILE_TOO_LARGE"
        )
    
    if file_size < 100:  # Minimum reasonable audio file
        raise AudioValidationError(
            f"File too small: {file_size} bytes (min 100)",
            "FILE_TOO_SMALL"
        )
    
    # 2. Validate extension from filename
    ext = ""
    ext_no_dot = ""
    if filename:
        parts = filename.rsplit(".", 1)
        if len(parts) == 2:
            ext = "." + parts[1].lower()
            ext_no_dot = parts[1].lower()
    
    if ext_no_dot and ext_no_dot not in settings.ALLOWED_AUDIO_EXTENSIONS:
        raise AudioValidationError(
            f"File extension '{ext}' not allowed. Allowed: {', '.join(sorted(settings.ALLOWED_AUDIO_EXTENSIONS))}",
            "INVALID_EXTENSION"
        )
    
    # 3. Validate MIME type
    content_type_lower = content_type.lower() if content_type else ""
    if content_type_lower and content_type_lower not in settings.ALLOWED_AUDIO_MIME_TYPES:
        # Some clients send generic types, allow if extension is valid
        if not ext_no_dot or ext_no_dot not in settings.ALLOWED_AUDIO_EXTENSIONS:
            raise AudioValidationError(
                f"MIME type '{content_type}' not allowed",
                "INVALID_MIME_TYPE"
            )
    
    # 4. Magic byte detection (if file bytes provided)
    if file_bytes and len(file_bytes) >= 12:
        detected_ext = detect_format_from_magic(file_bytes)
        if detected_ext:
            detected_ext = "." + detected_ext
            # If we have an extension from filename, verify consistency
            if ext and ext != detected_ext:
                logger.warning(
                    "Extension mismatch: filename=%s, detected=%s", ext, detected_ext
                )
                # Trust magic bytes over filename
            ext = detected_ext
    
    # 5. Final extension check
    # Compare without dot since ALLOWED_AUDIO_EXTENSIONS doesn't have dots
    ext_no_dot_final = ext[1:] if ext.startswith(".") else ext
    if not ext_no_dot_final or ext_no_dot_final not in settings.ALLOWED_AUDIO_EXTENSIONS:
        # Try to infer from MIME type
        if content_type_lower in MIME_TO_EXT:
            ext = MIME_TO_EXT[content_type_lower]
        else:
            raise AudioValidationError(
                "Could not determine valid audio format",
                "UNKNOWN_FORMAT"
            )
    
    return ext


def detect_format_from_magic(file_bytes: bytes) -> Optional[str]:
    """
    Detect audio format from magic bytes.
    
    Returns:
        Extension without dot (e.g., 'wav', 'mp3') or None
    """
    # Check first 12 bytes for magic signatures
    header = file_bytes[:12]
    
    for magic_bytes, fmt in MAGIC_BYTES.items():
        if header.startswith(magic_bytes):
            return fmt
    
    # Check for MP3 frame sync at offset 0 (0xFFE)
    if len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
        return "mp3"
    
    # Check for M4A/MP4 ftyp box (usually at offset 4)
    if len(header) >= 12:
        # ftyp box: size(4) + 'ftyp'(4) + brand(4)
        if header[4:8] == b"ftyp":
            brand = header[8:12]
            if brand in (b"M4A ", b"isom", b"iso2", b"mp41", b"mp42"):
                return "m4a"
    
    return None


async def validate_upload_file(file) -> tuple[str, bytes]:
    """
    Validate an UploadFile from FastAPI.
    
    Returns:
        tuple: (validated_extension, file_bytes)
    """
    # Read file content
    content = await file.read()
    
    # Validate
    ext = validate_audio_file(
        filename=file.filename or "",
        content_type=file.content_type or "",
        file_size=len(content),
        file_bytes=content,
    )
    
    return ext, content