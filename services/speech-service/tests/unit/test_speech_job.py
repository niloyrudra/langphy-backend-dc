"""
Tests for the RQ worker job pipeline (speech_job.py).

Covers the regressions that matter in production:
- error/fallback NLP results are NEVER cached (cache-poisoning fix)
- genuine analysis results ARE cached
- cache hits skip the NLP call entirely
- the sync worker cache keys match the async CacheManager key scheme
"""
import json
from unittest.mock import MagicMock, patch

from app.jobs import speech_job
from app.services.cache import cache_key_for_text


class TestNlpCache:
    """Regression tests for the NLP result cache in the worker."""

    def test_error_fallback_is_never_cached(self):
        """A 401/5xx/fallback payload must not be stored in the cache (poisoning fix)."""
        error_result = {
            "spoken_text": "hallo",
            "similarity": None,
            "pronunciation_score": None,
            "feedback": "",
            "issues": ["nlp_client_error"],
            "error": "NLP service client error: 401",
        }
        with patch.object(speech_job, "_get_cached_nlp_result_sync", return_value=None), \
             patch.object(speech_job, "_call_nlp_on_text", return_value=error_result) as mock_call, \
             patch.object(speech_job, "_set_cached_nlp_result_sync") as mock_set:
            result = speech_job._call_nlp_with_cache("Guten Morgen", "Guten Morgen")

        assert result == error_result
        mock_call.assert_called_once_with("Guten Morgen", "Guten Morgen")
        mock_set.assert_not_called()

    def test_genuine_result_is_cached(self):
        """A real analysis (with similarity + pronunciation_score) IS cached."""
        good_result = {
            "spoken_text": "hallo",
            "similarity": 0.95,
            "pronunciation_score": 91,
            "feedback": "Sehr gut!",
            "issues": [],
        }
        with patch.object(speech_job, "_get_cached_nlp_result_sync", return_value=None), \
             patch.object(speech_job, "_call_nlp_on_text", return_value=good_result), \
             patch.object(speech_job, "_set_cached_nlp_result_sync") as mock_set:
            result = speech_job._call_nlp_with_cache("Guten Morgen", "Guten Morgen")

        assert result == good_result
        mock_set.assert_called_once_with("Guten Morgen", "Guten Morgen", good_result)

    def test_cache_hit_skips_nlp_call(self):
        """A cache HIT must not call the NLP service or write the cache again."""
        cached = {
            "spoken_text": "hallo",
            "similarity": 0.9,
            "pronunciation_score": 88,
            "feedback": "",
            "issues": [],
        }
        with patch.object(speech_job, "_get_cached_nlp_result_sync", return_value=cached), \
             patch.object(speech_job, "_call_nlp_on_text") as mock_call, \
             patch.object(speech_job, "_set_cached_nlp_result_sync") as mock_set:
            result = speech_job._call_nlp_with_cache("Guten Morgen", "Guten Morgen")

        assert result == cached
        mock_call.assert_not_called()
        mock_set.assert_not_called()

    def test_sync_cache_key_matches_namespaced_scheme(self):
        """The worker's sync Redis key is nlp:<sha256[:16]> — same as the async CacheManager."""
        fake_redis = MagicMock()
        fake_redis.get.return_value = json.dumps({"similarity": 1.0})

        expected = "Guten Morgen"
        spoken = "Guten Morgen"

        with patch.object(speech_job, "_get_redis", return_value=fake_redis):
            result = speech_job._get_cached_nlp_result_sync(expected, spoken)

        assert result == {"similarity": 1.0}
        key = fake_redis.get.call_args[0][0]
        expected_key = f"nlp:{cache_key_for_text(f'{expected}|{spoken}')}"
        assert key == expected_key
        assert key.startswith("nlp:")
        assert len(key) == 4 + 16