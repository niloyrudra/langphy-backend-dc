def default_article(gender, number):
    if number == "Plur":
        return "die"
    if gender == "Masc":
        return "der"
    if gender == "Fem":
        return "die"
    if gender == "Neut":
        return "das"
    return None

def pronunciation_difficulty(word: str):
    score = 0
    flags = []

    if any(c in word for c in "äöüß"):
        score += 1
        flags.append("special_chars")

    if len(word) > 10:
        score += 1
        flags.append("long_word")

    if any(cluster in word for cluster in ["sch", "ch", "sp", "st"]):
        score += 1
        flags.append("consonant_cluster")

    return {
        "score": score,
        "flags": flags
    }

def pronunciation_score(similarity: float) -> int:
    if similarity >= 0.9:
        return 95
    if similarity >= 0.8:
        return 85
    if similarity >= 0.7:
        return 75
    if similarity >= 0.6:
        return 65
    return 50

def generate_speaking_feedback(similarity: float, issues: list[str]) -> str:
    if similarity >= 0.9 and not issues:
        return (
            "Excellent work! Your pronunciation is clear, natural, "
            "and grammatically accurate."
        )

    if similarity >= 0.85:
        return (
            "Very good pronunciation. Your sentence sounds natural, "
            "but there are small grammar details to improve."
        )

    if similarity >= 0.75:
        if issues:
            return (
                "Good attempt. Your pronunciation is understandable, "
                "but pay attention to articles and noun forms."
            )
        return (
            "Good pronunciation overall, but try to sound a bit more natural."
        )

    if similarity >= 0.65:
        return (
            "Fair attempt. Your message is understandable, "
            "but work on grammar and sentence structure."
        )

    return (
        "Keep practicing. Focus on clear pronunciation, correct grammar, "
        "and speaking more confidently."
    )