import spacy
import os
import json
import re
from app.utils import default_article, pronunciation_difficulty, pronunciation_score, generate_speaking_feedback

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DICT_PATH = os.path.join(BASE_DIR, "de_en_dict.json")

with open(DICT_PATH, "r", encoding="utf-8") as f:
    DE_EN_DICT = json.load(f)

nlp = spacy.load("de_core_news_lg")

# ─── colour maps ──────────────────────────────────────────────────────────────
CASE_COLORS = {
    "Nom": "#4CAF50",
    "Acc": "#FF9800",
    "Dat": "#2196F3",
    "Gen": "#9C27B0",
}

POS_COLORS = {
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
_SEP_PREFIXES = [
    "ab", "an", "auf", "aus", "bei", "durch", "ein", "emp", "ent", "er",
    "fest", "frei", "her", "hin", "hoch", "los", "mit", "nach", "nieder",
    "über", "um", "unter", "ver", "vor", "weg", "weiter", "zer", "zu",
    "zurück", "be", "ge", "miss", "wider",
]


def _dict_lookup(word: str) -> list[str]:
    """
    Robust dictionary lookup with a 4-level fallback chain.

    Level 1 — SpaCy lemma (already lowercased by caller via token.lemma_)
    Level 2 — surface form lowercased
    Level 3 — surface form with umlaut reversed  (läuft → lauft → laufen)
    Level 4 — morphological decomposition
               • PREFIX+ge+STEM+t/en  (past participles of separable verbs)
               • MODIFIER+ge+STEM+t  (compound adjectives: handgefertigt)
               • PREFIX+STEM+sfx     (prefixed conjugated verbs: abonniert)
               • hyphenated compound  (abenteuer-spiel → spiel)
    """
    # levels 1-2 are tried by the caller; this function is called with the
    # surface form when lemma and surface both miss.
    w = word.lower().strip()

    # ── Level 3: umlaut reversal ──────────────────────────────────────────────
    umap = str.maketrans("äöü", "aou")
    deuml = w.translate(umap)
    if deuml != w:
        entry = DE_EN_DICT.get(deuml) or DE_EN_DICT.get(deuml + "en")
        if entry:
            return entry

    # ── Level 4a: hyphenated compound — use last meaningful part ──────────────
    if "-" in w:
        parts = [p for p in w.split("-") if len(p) > 2]
        for part in reversed(parts):          # head noun is usually last
            entry = DE_EN_DICT.get(part)
            if entry:
                return entry

    # ── Level 4b: PREFIX+ge+STEM+t/en  (separable past participles) ──────────
    for pfx in _SEP_PREFIXES:
        tag = pfx + "ge"
        if w.startswith(tag) and len(w) > len(tag) + 3:
            stem = w[len(tag):]
            for sfx in ("t", "en", "et"):
                if stem.endswith(sfx):
                    # try with prefix: abgesagt → absagen
                    inf = pfx + stem[: -len(sfx)] + "en"
                    entry = DE_EN_DICT.get(inf)
                    if entry:
                        return entry
                    # try without prefix: gesagt → sagen
                    inf2 = stem[: -len(sfx)] + "en"
                    entry = DE_EN_DICT.get(inf2)
                    if entry:
                        return entry
            break

    # ── Level 4c: MODIFIER+ge+STEM+t  (compound adj: handgefertigt) ──────────
    ge_pos = w.find("ge")
    if ge_pos >= 2:
        stem = w[ge_pos + 2:]
        for sfx in ("t", "en", "igt"):
            if stem.endswith(sfx):
                base = stem[: -len(sfx)] + "en"
                entry = DE_EN_DICT.get(base)
                if entry:
                    return entry

    # ── Level 4d: PREFIX+VERB conjugation (no ge: abonniert, akzeptiere) ─────
    for pfx in _SEP_PREFIXES:
        if w.startswith(pfx) and len(w) > len(pfx) + 3:
            stem = w[len(pfx):]
            for sfx in ("iert", "iere", "ieren", "t", "te", "st", "et", "e", "en"):
                if stem.endswith(sfx):
                    suffix_repl = "ieren" if "ier" in sfx else "en"
                    inf = pfx + stem[: -len(sfx)] + suffix_repl
                    entry = DE_EN_DICT.get(inf)
                    if entry:
                        return entry
                    inf2 = stem[: -len(sfx)] + "en"
                    entry = DE_EN_DICT.get(inf2)
                    if entry:
                        return entry
            break

    return []


def _get_meaning(token) -> str | None:
    """
    Try to find an English meaning for a SpaCy token using the fallback chain.
    Returns a comma-joined string or None.
    """
    lemma   = token.lemma_.lower()
    surface = token.text.lower()

    # Level 1: lemma
    entry = DE_EN_DICT.get(lemma)
    # Level 2: surface form
    if not entry:
        entry = DE_EN_DICT.get(surface)
    # Level 3-4: morphological fallback (only if lemma == surface, i.e. SpaCy
    # already couldn't lemmatise further, OR surface differs from lemma and both miss)
    if not entry:
        entry = _dict_lookup(surface)
    if not entry and surface != lemma:
        entry = _dict_lookup(lemma)

    if entry:
        # Return first 3 meanings at most to keep the tooltip clean
        return ", ".join(entry[:3])
    return None


# ─── endpoints ────────────────────────────────────────────────────────────────

def analyze_text(text: str):
    doc    = nlp(text)
    tokens = []

    for token in doc:
        morph  = token.morph.to_dict()
        case   = morph.get("Case")
        gender = morph.get("Gender")
        number = morph.get("Number")

        article = None
        if token.pos_ == "NOUN":
            for left in token.lefts:
                if left.pos_ == "DET":
                    article = left.text.lower()
                    break

        tokens.append({
            "text":    token.text,
            "lemma":   token.lemma_,
            "pos":     token.pos_,
            "tag":     token.tag_,
            "dep":     token.dep_,
            "is_stop": token.is_stop,
            "case":    case,
            "gender":  gender,
            "number":  number,
            "article": article,
            "display": f"{article} {token.text}" if article else token.text,
            "color":   CASE_COLORS.get(case) or POS_COLORS.get(token.pos_),
        })

    return {"text": text, "tokens": tokens}


def analyze_lesson(text: str):
    doc    = nlp(text)
    tokens = []

    for token in doc:
        morph  = token.morph.to_dict()
        gender = morph.get("Gender")
        number = morph.get("Number")
        case   = morph.get("Case")

        meaning_en   = _get_meaning(token)          # ← uses full fallback chain
        base_article = default_article(gender, number)
        difficulty   = pronunciation_difficulty(token.text.lower())

        tokens.append({
            "text":           token.text,
            "lemma":          token.lemma_.lower(),
            "pos":            token.pos_,
            "tag":            token.tag_,
            "dep":            token.dep_,
            "is_stop":        token.is_stop,
            "case":           case,
            "gender":         gender,
            "number":         number,
            "default_article": base_article,
            "meaning_en":     meaning_en,
            "pronunciation": {
                "difficulty": difficulty["score"],
                "flags":      difficulty["flags"],
            },
            "display": f"{base_article} {token.text}" if base_article else token.text,
            "color":   CASE_COLORS.get(case) or POS_COLORS.get(token.pos_),
        })

    return {"language": "de", "tokens": tokens}


def analyze_answer(expected: str, user_answer: str):
    expected_doc = nlp(expected)
    ans_doc      = nlp(user_answer)
    similarity   = expected_doc.similarity(ans_doc)

    return {
        "similarity": round(similarity, 2),
        "feedback": (
            "Perfect!"                          if similarity > 0.90 else
            "Very good!"                        if similarity > 0.80 else
            "Good, but check word order."       if similarity > 0.65 else
            "Needs improvement"
        ),
    }


def analyze_speaking(expected_text: str, spoken_text: str):
    expected_doc = nlp(expected_text)
    spoken_doc   = nlp(spoken_text)
    similarity   = expected_doc.similarity(spoken_doc)
    issues       = []

    spoken_tokens = {t.lemma_: t for t in spoken_doc if not t.is_punct}

    for token in expected_doc:
        if token.is_punct:
            continue

        if token.pos_ == "NOUN":
            expected_article = next(
                (t for t in token.lefts if t.pos_ == "DET"), None
            )
            spoken_match = spoken_tokens.get(token.lemma_)

            if expected_article and spoken_match:
                spoken_article = next(
                    (t for t in spoken_match.lefts if t.pos_ == "DET"), None
                )
                if not spoken_article:
                    issues.append(
                        f"Missing article for '{expected_article.text} {token.text}'"
                    )

    return {
        "spoken_text":        spoken_text,
        "similarity":         round(similarity, 2),
        "issues":             issues,
        "pronunciation_score": pronunciation_score(similarity),
        "feedback":           generate_speaking_feedback(similarity, issues),
    }



# import spacy
# import os
# import json
# from app.utils import default_article, pronunciation_difficulty, pronunciation_score, generate_speaking_feedback

# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# DICT_PATH = os.path.join(BASE_DIR, "de_en_dict.json")

# with open( DICT_PATH, "r", encoding="utf-8" ) as f:
#     DE_EN_DICT = json.load(f)

# nlp = spacy.load("de_core_news_lg")

# CASE_COLORS = {
#     "Nom": "#4CAF50",
#     "Acc": "#FF9800",
#     "Dat": "#2196F3",
#     "Gen": "#9C27B0"
# }

# POS_COLORS = {
#     "NOUN": "#FF9800",   # nouns
#     "PROPN": "#FF9800",
#     "VERB": "#2196F3",   # verbs
#     "AUX": "#64B5F6",
#     "ADJ": "#8BC34A",    # adjectives
#     "ADV": "#AED581",
#     "DET": "#F06292",    # articles
#     "ADP": "#BA68C8",    # prepositions
#     "PRON": "#4CAF50",   # pronouns
#     "SCONJ": "#90A4AE",
#     "CCONJ": "#90A4AE",
#     "NUM": "#FFD54F",
#     "PART": "#B0BEC5",
# }


# GERMAN_ARTICLES = {
#     "Masc": ["der", "den", "dem", "des", "ein", "einen", "einem"],
#     "Fem": ["die", "der", "eine", "einer"],
#     "Neut": ["das", "dem", "des", "ein", "eines"],
# }

# def analyze_text(text: str):
#     doc = nlp(text)
#     tokens = []

#     for token in doc:
#         morph = token.morph.to_dict()

#         case = morph.get("Case")
#         gender = morph.get("Gender")
#         number = morph.get("Number")

#         # Detect article
#         article = None
#         if token.pos_ == "NOUN":
#             for left in token.lefts:
#                 if left.pos_ == "DET":
#                     article = left.text.lower()
#                     break

#         tokens.append({
#             "text": token.text,
#             "lemma": token.lemma_,
#             "pos": token.pos_,
#             "tag": token.tag_,
#             "dep": token.dep_,
#             "is_stop": token.is_stop,
#             "case": case,
#             "gender": gender,
#             "number": number,
#             "article": article,
#             "display": f"{article} {token.text}" if article else token.text,
#             "color": CASE_COLORS.get(case) or POS_COLORS.get(token.pos_)
#         })

#     return {
#         "text": text,
#         "tokens": tokens
#     }


# def analyze_lesson(text: str):
#     doc = nlp(text)
#     tokens = []

#     for token in doc:
#         # if token.is_punct:
#         #     continue

#         morph = token.morph.to_dict()
#         gender = morph.get("Gender")
#         number = morph.get("Number")
#         case = morph.get("Case")

#         lemma = token.lemma_.lower()

#         # dictionary lookup
#         # dict_entry = DE_EN_DICT.get(lemma, {})
#         dict_entry = DE_EN_DICT.get(lemma, [])

#         meaning_en = ", ".join(dict_entry) if dict_entry else None # dict_entry[0] if dict_entry else None # dict_entry.get("meaning")
#         # base_article = dict_entry.get("article") or default_article(gender, number)
#         base_article = default_article(gender, number)

#         difficulty = pronunciation_difficulty(token.text.lower())


#         tokens.append({
#             "text": token.text,
#             "lemma": lemma,
#             "pos": token.pos_,
#             "tag": token.tag_,
#             "dep": token.dep_,
#             "is_stop": token.is_stop,
#             "case": case,
#             "gender": gender,
#             "number": number,
#             "default_article": base_article,
#             "meaning_en": meaning_en,
#             "pronunciation": {
#                 "difficulty": difficulty["score"],
#                 "flags": difficulty["flags"]
#             },
#             "display": f"{base_article} {token.text}" if base_article else token.text,
#             "color": CASE_COLORS.get(case) or POS_COLORS.get(token.pos_)
#         })

#     return {
#         "language": "de",
#         "tokens": tokens
#     }


# def analyze_answer(expected: str, user_answer: str):
#     expected_ans = nlp(expected)
#     ans = nlp(user_answer)

#     similarity = expected_ans.similarity(ans)

#     return {
#         "similarity": round(similarity, 2),
#         "feedback": (
#             "Perfect!" if similarity > 0.9 else
#             "Very good!" if similarity > 0.8 else
#             "Good, but check word order." if similarity > 0.65 else
#             "Needs improvement"
#         )
#     }

# def analyze_speaking(expected_text: str, spoken_text: str):
#     expected_doc = nlp(expected_text)
#     spoken_doc = nlp(spoken_text)

#     similarity = expected_doc.similarity(spoken_doc)

#     issues = []

#     # Index spoken tokens by lemma (faster + safer)
#     spoken_tokens = {
#         t.lemma_: t for t in spoken_doc if not t.is_punct
#     }

#     # Article & case issues
#     for token in expected_doc:
#         if token.is_punct:
#             continue

#         # Article & noun agreement
#         if token.pos_ == "NOUN":
#             expected_article = next((t for t in token.lefts if t.pos_ == "DET"), None)
#             # spoken_match = next((t for t in spoken_doc if t.lemma_ == token.lemma_), None)
#             spoken_match = spoken_tokens.get(token.lemma_)

#             if expected_article and spoken_match:
#                 spoken_article = next((t for t in spoken_match.lefts if t.pos_ == "DET"), None)
#                 if not spoken_article:
#                     # issues.append(f"Missing article for '{token.text}'")
#                     issues.append(f"Missing article for '{expected_article.text} {token.text}'")

#     return {
#         "spoken_text": spoken_text,
#         "similarity": round(similarity, 2),
#         "issues": issues,
#         "pronunciation_score": pronunciation_score(similarity),
#         "feedback": generate_speaking_feedback(similarity, issues)
#     }