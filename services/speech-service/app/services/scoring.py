from typing import TypedDict

class WordConfidence( TypedDict ):
    key: str
    score: str
    label: str
    color: str

def word_confidence( prob: float ) -> WordConfidence:
    """
    Convert Whisper word probability into UI-friendly confidence.
    prob is expected to be between 0.0 and 1.0
    """
    if prob >= 0.95:
        return {
            "key": "excellent",
            "score": 95,
            "label": "Excellent",
            "color": "#16a34a"   # green
        }
    
    if prob >= 0.85:
        return {
            "key": "very_good",
            "score": 85,
            "label": "Very good",
            "color": "#22c55e"
        }

    if prob >= 0.75:
        return {
            "key": "good",
            "score": 75,
            "label": "Good",
            "color": "#84cc16"
        }

    if prob >= 0.65:
        return {
            "key": "fair",
            "score": 65,
            "label": "Needs work",
            "color": "#facc15"
        }

    if prob >= 0.50:
        return {
            "key": "weak",
            "score": 50,
            "label": "Hard to understand",
            "color": "#fb923c"
        }

    return {
        "key": "very_weak",
        "score": 30,
        "label": "Unclear",
        "color": "#ef4444"
    }