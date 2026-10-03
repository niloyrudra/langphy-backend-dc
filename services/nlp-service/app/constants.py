"""
NLP Service Constants

Centralized constants for colors, prefixes, and configuration.
"""
import os
import json
from typing import Final

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DICT_PATH = os.path.join(BASE_DIR, "de_en_dict.json")

with open(DICT_PATH, "r", encoding="utf-8") as f:
    DE_EN_DICT: Final[dict] = json.load(f)

# ─── colour maps ──────────────────────────────────────────────────────────────
CASE_COLORS: Final[dict[str, str]] = {
    "Nom": "#4CAF50",
    "Acc": "#FF9800",
    "Dat": "#2196F3",
    "Gen": "#9C27B0",
}

POS_COLORS: Final[dict[str, str]] = {
    "NOUN":  "#FF9800",
    "PROPN": "#FF9800",
    "VERB":  "#2196F3",
    "AUX":   "#64B5F6",
    "ADJ":   "#8BC34A",
    "ADV":   "#AED581",
    "DET":   "#F06292",
    "ADP":   "#BA68C8",
    "PRON":  "#4CAF50",
    "SCONJ": "#90A4AE",
    "CCONJ": "#90A4AE",
    "NUM":   "#FFD54F",
    "PART":  "#B0BEC5",
}

# ─── separable-verb prefix list (for morphological fallback) ──────────────────
SEP_PREFIXES: Final[list[str]] = [
    "ab", "an", "auf", "aus", "bei", "durch", "ein", "emp", "ent", "er",
    "fest", "frei", "her", "hin", "hoch", "los", "mit", "nach", "nieder",
    "über", "um", "unter", "ver", "vor", "weg", "weiter", "zer", "zu",
    "zurück", "be", "ge", "miss", "wider",
]


def default_article(gender: str | None, number: str | None) -> str | None:
    """Return default German article for given gender/number."""
    if number == "Plur":
        return "die"
    if gender == "Masc":
        return "der"
    if gender == "Fem":
        return "die"
    if gender == "Neut":
        return "das"
    return None


def get_token_color(case: str | None, pos: str) -> str | None:
    """Get display color for token based on case or POS."""
    if case and case in CASE_COLORS:
        return CASE_COLORS[case]
    return POS_COLORS.get(pos)