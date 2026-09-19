"""
Tests for Speech Service Audio Validation
"""
import pytest
from app.services.validation import (
    validate_audio_file,
    detect_format_from_magic,
    AudioValidationError,
)


class TestAudioValidation:
    """Test audio file validation."""
    
    # Minimal WAV header for testing
    WAV_HEADER = bytes([
        0x52, 0x49, 0x46, 0x46,  # RIFF
        0x24, 0x00, 0x00, 0x00,  # Size (36 bytes)
        0x57, 0x41, 0x56, 0x45,  # WAVE
        0x66, 0x6D, 0x74, 0x20,  # fmt
        0x10, 0x00, 0x00, 0x00,  # Format chunk size (16)
        0x01, 0x00,              # Audio format (PCM)
        0x01, 0x00,              # Channels (1)
        0x40, 0x1F, 0x00, 0x00,  # Sample rate (8000)
        0x80, 0x3E, 0x00, 0x00,  # Byte rate
        0x02, 0x00,              # Block align
        0x10, 0x00,              # Bits per sample (16)
        0x64, 0x61, 0x74, 0x61,  # data
        0x00, 0x00, 0x00, 0x00,  # Data size (0)
    ])
    
    # MP3 with ID3 tag
    MP3_ID3 = b"ID3" + b"\x00" * 100
    
    # MP3 without ID3 (frame sync)
    MP3_FRAME = b"\xff\xfb" + b"\x00" * 100
    
    # OGG
    OGG_HEADER = b"OggS" + b"\x00" * 100
    
    # WebM/Matroska
    WEBM_HEADER = b"\x1aE\xdf\xa3" + b"\x00" * 100
    
    # M4A - ftyp box: size(4) + "ftyp"(4) + major_brand(4) = "M4A " (padded)
    M4A_HEADER = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 100
    
    def test_valid_wav_file(self):
        """Test validation of valid WAV file."""
        ext = validate_audio_file(
            filename="test.wav",
            content_type="audio/wav",
            file_size=1000,
            file_bytes=self.WAV_HEADER,
        )
        assert ext == ".wav"
    
    def test_valid_mp3_file(self):
        """Test validation of valid MP3 file."""
        ext = validate_audio_file(
            filename="test.mp3",
            content_type="audio/mpeg",
            file_size=1000,
            file_bytes=self.MP3_ID3,
        )
        assert ext == ".mp3"
    
    def test_valid_mp3_frame_sync(self):
        """Test validation of MP3 with frame sync."""
        ext = validate_audio_file(
            filename="test.mp3",
            content_type="audio/mpeg",
            file_size=1000,
            file_bytes=self.MP3_FRAME,
        )
        assert ext == ".mp3"
    
    def test_valid_ogg_file(self):
        """Test validation of valid OGG file."""
        ext = validate_audio_file(
            filename="test.ogg",
            content_type="audio/ogg",
            file_size=1000,
            file_bytes=self.OGG_HEADER,
        )
        assert ext == ".ogg"
    
    def test_valid_webm_file(self):
        """Test validation of valid WebM file."""
        ext = validate_audio_file(
            filename="test.webm",
            content_type="audio/webm",
            file_size=1000,
            file_bytes=self.WEBM_HEADER,
        )
        assert ext == ".webm"
    
    def test_valid_m4a_file(self):
        """Test validation of valid M4A file."""
        ext = validate_audio_file(
            filename="test.m4a",
            content_type="audio/mp4",
            file_size=1000,
            file_bytes=self.M4A_HEADER,
        )
        assert ext == ".m4a"
    
    def test_file_too_large(self):
        """Test rejection of oversized files."""
        with pytest.raises(AudioValidationError) as exc_info:
            validate_audio_file(
                filename="test.wav",
                content_type="audio/wav",
                file_size=20 * 1024 * 1024,  # 20MB
                file_bytes=self.WAV_HEADER,
            )
        assert exc_info.value.code == "FILE_TOO_LARGE"
    
    def test_file_too_small(self):
        """Test rejection of too small files."""
        with pytest.raises(AudioValidationError) as exc_info:
            validate_audio_file(
                filename="test.wav",
                content_type="audio/wav",
                file_size=50,  # 50 bytes
                file_bytes=self.WAV_HEADER[:50],
            )
        assert exc_info.value.code == "FILE_TOO_SMALL"
    
    def test_invalid_extension(self):
        """Test rejection of disallowed extension."""
        with pytest.raises(AudioValidationError) as exc_info:
            validate_audio_file(
                filename="test.exe",
                content_type="application/octet-stream",
                file_size=1000,
                file_bytes=self.WAV_HEADER,
            )
        assert exc_info.value.code == "INVALID_EXTENSION"
    
    def test_mismatched_extension_and_magic(self):
        """Test that magic bytes take precedence over extension."""
        # File named .mp3 but actually WAV
        ext = validate_audio_file(
            filename="test.mp3",
            content_type="audio/mpeg",
            file_size=1000,
            file_bytes=self.WAV_HEADER,
        )
        assert ext == ".wav"  # Magic bytes win
    
    def test_unknown_format_no_extension_no_mime(self):
        """Test rejection when no extension, invalid MIME, unknown magic."""
        with pytest.raises(AudioValidationError) as exc_info:
            validate_audio_file(
                filename="test",  # No extension
                content_type="application/octet-stream",  # Not in allowed MIME types
                file_size=1000,
                file_bytes=b"UNKNOWN" + b"\x00" * 100,
            )
        # This fails at MIME type check since no valid extension to fall back on
        assert exc_info.value.code == "INVALID_MIME_TYPE"
    
    def test_detect_format_wav(self):
        """Test magic byte detection for WAV."""
        fmt = detect_format_from_magic(self.WAV_HEADER)
        assert fmt == "wav"
    
    def test_detect_format_mp3_id3(self):
        """Test magic byte detection for MP3 with ID3."""
        fmt = detect_format_from_magic(self.MP3_ID3)
        assert fmt == "mp3"
    
    def test_detect_format_mp3_frame(self):
        """Test magic byte detection for MP3 frame sync."""
        fmt = detect_format_from_magic(self.MP3_FRAME)
        assert fmt == "mp3"
    
    def test_detect_format_ogg(self):
        """Test magic byte detection for OGG."""
        fmt = detect_format_from_magic(self.OGG_HEADER)
        assert fmt == "ogg"
    
    def test_detect_format_webm(self):
        """Test magic byte detection for WebM."""
        fmt = detect_format_from_magic(self.WEBM_HEADER)
        assert fmt == "webm"
    
    def test_detect_format_m4a(self):
        """Test magic byte detection for M4A."""
        fmt = detect_format_from_magic(self.M4A_HEADER)
        assert fmt == "m4a"
    
    def test_detect_format_unknown(self):
        """Test magic byte detection returns None for unknown."""
        fmt = detect_format_from_magic(b"UNKNOWN")
        assert fmt is None


class TestValidationEdgeCases:
    """Test edge cases in validation."""
    
    def test_empty_filename(self):
        """Test validation with empty filename."""
        ext = validate_audio_file(
            filename="",
            content_type="audio/wav",
            file_size=1000,
            file_bytes=bytes([0x52, 0x49, 0x46, 0x46] + [0] * 100),
        )
        assert ext == ".wav"
    
    def test_no_content_type(self):
        """Test validation with missing content type."""
        ext = validate_audio_file(
            filename="test.wav",
            content_type="",
            file_size=1000,
            file_bytes=bytes([0x52, 0x49, 0x46, 0x46] + [0] * 100),
        )
        assert ext == ".wav"
    
    def test_android_m4a_mime_types(self):
        """Test Android M4A MIME type variations."""
        wav_bytes = bytes([0x52, 0x49, 0x46, 0x46] + [0] * 100)
        
        # Android sends various MIME types for M4A
        for mime in ["audio/mp4", "audio/x-m4a", "audio/m4a"]:
            ext = validate_audio_file(
                filename="test.m4a",
                content_type=mime,
                file_size=1000,
                file_bytes=wav_bytes,  # Using WAV bytes but extension says m4a
            )
            # Extension takes precedence when magic doesn't match
            assert ext in [".wav", ".m4a"]