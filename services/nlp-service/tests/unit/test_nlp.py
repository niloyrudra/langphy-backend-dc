"""
Tests for the NLP analysis functions (app/nlp.py).

Uses the mock_spacy_model fixture from conftest (patches app.nlp.nlp), so no
real spaCy inference is required.
"""
from app.nlp import analyze_text, analyze_lesson, analyze_answer, analyze_speaking


class TestAnalyzeText:
    """Test the tokenize/POS/lemmatize endpoint logic."""

    def test_returns_tokens(self, mock_spacy_model):
        result = analyze_text("Das ist ein Test.")

        assert result["text"] == "Das ist ein Test."
        assert len(result["tokens"]) == 1

        token = result["tokens"][0]
        assert token["text"] == "Haus"
        assert token["lemma"] == "Haus"
        assert token["pos"] == "NOUN"
        assert token["tag"] == "NN"
        assert token["dep"] == "ROOT"
        assert token["is_stop"] is False
        assert token["case"] == "Nom"
        assert token["gender"] == "Neut"
        assert token["number"] == "Sing"
        assert "color" in token
        assert token["display"] == "Haus"  # no article in mock token.lefts


class TestAnalyzeLesson:
    """Test the lesson analysis endpoint logic."""

    def test_returns_lesson_tokens(self, mock_spacy_model):
        result = analyze_lesson("Das ist ein Test.")

        assert result["language"] == "de"
        assert len(result["tokens"]) == 1

        token = result["tokens"][0]
        assert token["text"] == "Haus"
        assert token["lemma"] == "haus"
        assert token["default_article"] == "das"  # Neut -> das
        assert "meaning_en" in token
        assert "pronunciation" in token
        assert token["pronunciation"]["difficulty"] >= 0
        assert "flags" in token["pronunciation"]


class TestAnalyzeAnswer:
    """Test the expected-vs-answer comparison endpoint logic."""

    def test_returns_similarity(self, mock_spacy_model):
        result = analyze_answer("Guten Morgen", "Guten Morgen")

        assert result["similarity"] == 0.95
        assert "feedback" in result
        assert result["feedback"] != ""


class TestAnalyzeSpeaking:
    """Test the speaking evaluation endpoint logic."""

    def test_returns_score_and_feedback(self, mock_spacy_model):
        result = analyze_speaking("Guten Morgen", "Guten Morgen")

        assert result["spoken_text"] == "Guten Morgen"
        assert result["similarity"] == 0.95
        assert result["pronunciation_score"] == 95
        assert result["issues"] == []
        assert "feedback" in result
        assert result["feedback"] != ""