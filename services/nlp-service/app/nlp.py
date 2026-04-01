import spacy
import os
import json
from app.utils import default_article, pronunciation_difficulty, pronunciation_score, generate_speaking_feedback

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DICT_PATH = os.path.join(BASE_DIR, "de_en_dict.json")

with open( DICT_PATH, "r", encoding="utf-8" ) as f:
    DE_EN_DICT = json.load(f)

nlp = spacy.load("de_core_news_lg")

CASE_COLORS = {
    "Nom": "#4CAF50",
    "Acc": "#FF9800",
    "Dat": "#2196F3",
    "Gen": "#9C27B0"
}

POS_COLORS = {
    "NOUN": "#FF9800",   # nouns
    "PROPN": "#FF9800",
    "VERB": "#2196F3",   # verbs
    "AUX": "#64B5F6",
    "ADJ": "#8BC34A",    # adjectives
    "ADV": "#AED581",
    "DET": "#F06292",    # articles
    "ADP": "#BA68C8",    # prepositions
    "PRON": "#4CAF50",   # pronouns
    "SCONJ": "#90A4AE",
    "CCONJ": "#90A4AE",
    "NUM": "#FFD54F",
    "PART": "#B0BEC5",
}


GERMAN_ARTICLES = {
    "Masc": ["der", "den", "dem", "des", "ein", "einen", "einem"],
    "Fem": ["die", "der", "eine", "einer"],
    "Neut": ["das", "dem", "des", "ein", "eines"],
}

def analyze_text(text: str):
    doc = nlp(text)
    tokens = []

    for token in doc:
        morph = token.morph.to_dict()

        case = morph.get("Case")
        gender = morph.get("Gender")
        number = morph.get("Number")

        # Detect article
        article = None
        if token.pos_ == "NOUN":
            for left in token.lefts:
                if left.pos_ == "DET":
                    article = left.text.lower()
                    break

        tokens.append({
            "text": token.text,
            "lemma": token.lemma_,
            "pos": token.pos_,
            "tag": token.tag_,
            "dep": token.dep_,
            "is_stop": token.is_stop,
            "case": case,
            "gender": gender,
            "number": number,
            "article": article,
            "display": f"{article} {token.text}" if article else token.text,
            "color": CASE_COLORS.get(case) or POS_COLORS.get(token.pos_)
        })

    return {
        "text": text,
        "tokens": tokens
    }


def analyze_lesson(text: str):
    doc = nlp(text)
    tokens = []

    for token in doc:
        # if token.is_punct:
        #     continue

        morph = token.morph.to_dict()
        gender = morph.get("Gender")
        number = morph.get("Number")
        case = morph.get("Case")

        lemma = token.lemma_.lower()

        # dictionary lookup
        # dict_entry = DE_EN_DICT.get(lemma, {})
        dict_entry = DE_EN_DICT.get(lemma, [])

        meaning_en = ", ".join(dict_entry) if dict_entry else None # dict_entry[0] if dict_entry else None # dict_entry.get("meaning")
        # base_article = dict_entry.get("article") or default_article(gender, number)
        base_article = default_article(gender, number)

        difficulty = pronunciation_difficulty(token.text.lower())


        tokens.append({
            "text": token.text,
            "lemma": lemma,
            "pos": token.pos_,
            "tag": token.tag_,
            "dep": token.dep_,
            "is_stop": token.is_stop,
            "case": case,
            "gender": gender,
            "number": number,
            "default_article": base_article,
            "meaning_en": meaning_en,
            "pronunciation": {
                "difficulty": difficulty["score"],
                "flags": difficulty["flags"]
            },
            "display": f"{base_article} {token.text}" if base_article else token.text,
            "color": CASE_COLORS.get(case) or POS_COLORS.get(token.pos_)
        })

    return {
        "language": "de",
        "tokens": tokens
    }


def analyze_answer(expected: str, user_answer: str):
    expected_ans = nlp(expected)
    ans = nlp(user_answer)

    similarity = expected_ans.similarity(ans)

    return {
        "similarity": round(similarity, 2),
        "feedback": (
            "Perfect!" if similarity > 0.9 else
            "Very good!" if similarity > 0.8 else
            "Good, but check word order." if similarity > 0.65 else
            "Needs improvement"
        )
    }

def analyze_speaking(expected_text: str, spoken_text: str):
    expected_doc = nlp(expected_text)
    spoken_doc = nlp(spoken_text)

    similarity = expected_doc.similarity(spoken_doc)

    issues = []

    # Index spoken tokens by lemma (faster + safer)
    spoken_tokens = {
        t.lemma_: t for t in spoken_doc if not t.is_punct
    }

    # Article & case issues
    for token in expected_doc:
        if token.is_punct:
            continue

        # Article & noun agreement
        if token.pos_ == "NOUN":
            expected_article = next((t for t in token.lefts if t.pos_ == "DET"), None)
            # spoken_match = next((t for t in spoken_doc if t.lemma_ == token.lemma_), None)
            spoken_match = spoken_tokens.get(token.lemma_)

            if expected_article and spoken_match:
                spoken_article = next((t for t in spoken_match.lefts if t.pos_ == "DET"), None)
                if not spoken_article:
                    # issues.append(f"Missing article for '{token.text}'")
                    issues.append(f"Missing article for '{expected_article.text} {token.text}'")

    return {
        "spoken_text": spoken_text,
        "similarity": round(similarity, 2),
        "issues": issues,
        "pronunciation_score": pronunciation_score(similarity),
        "feedback": generate_speaking_feedback(similarity, issues)
    }