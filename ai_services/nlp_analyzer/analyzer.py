"""
NLP Text Analysis Module.

Analyzes civic issue descriptions using HuggingFace Transformers to determine:
  - Urgency level (critical / high / medium / low) via zero-shot classification
  - Sentiment (positive / negative / neutral) via DistilBERT sentiment model
  - Keywords extracted via TF-IDF
"""

from typing import Dict, Any

from transformers import pipeline
from sklearn.feature_extraction.text import TfidfVectorizer

# ── Global pipelines (loaded at startup) ─────────────────────────────────────

_sentiment_pipeline = None
_zero_shot_pipeline = None

# Urgency candidate labels for zero-shot classification
_URGENCY_LABELS = ["critical", "high", "medium", "low"]

# Civic-domain stop words to exclude from keyword extraction
_STOP_WORDS = {
    "the", "and", "for", "are", "was", "has", "been", "have", "this",
    "that", "with", "from", "not", "but", "they", "its", "our", "can",
    "will", "been", "more", "also", "very", "just", "than", "some",
    "issue", "problem", "please", "help", "need", "near", "area",
}


def load_models() -> None:
    """Load HuggingFace models into memory. Call once at startup (or it will load lazily)."""
    global _sentiment_pipeline, _zero_shot_pipeline

    if _sentiment_pipeline is not None and _zero_shot_pipeline is not None:
        return

    if _sentiment_pipeline is None:
        print("[NLP] Loading sentiment analysis model...")
        _sentiment_pipeline = pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
            device=-1,  # CPU
        )

    if _zero_shot_pipeline is None:
        print("[NLP] Loading zero-shot classification model...")
        _zero_shot_pipeline = pipeline(
            "zero-shot-classification",
            model="facebook/bart-large-mnli",
            device=-1,  # CPU
        )

    print("[NLP] All NLP models loaded successfully.")


def _extract_keywords(text: str, top_n: int = 5) -> list[str]:
    """Extract top-N keywords from text using TF-IDF scoring."""
    if not text or len(text.split()) < 2:
        words = text.split()
        return words[:top_n] if text else []

    vectorizer = TfidfVectorizer(
        max_features=50,
        stop_words="english",
        ngram_range=(1, 2),
    )

    try:
        tfidf_matrix = vectorizer.fit_transform([text])
        feature_names = vectorizer.get_feature_names_out()
        scores = tfidf_matrix.toarray()[0]

        # Sort by score descending and filter stop words
        scored = sorted(zip(feature_names, scores), key=lambda x: x[1], reverse=True)
        keywords = [
            word for word, score in scored
            if word.lower() not in _STOP_WORDS and score > 0
        ]
        return keywords[:top_n]
    except ValueError:
        # Fallback if TF-IDF can't process the text
        words = [w for w in text.lower().split() if len(w) > 3 and w not in _STOP_WORDS]
        return words[:top_n]


def _classify_urgency(text: str) -> str:
    """Determine urgency level using zero-shot classification."""
    load_models()  # Ensure model is loaded
    if _zero_shot_pipeline is None:
        return "medium"

    result = _zero_shot_pipeline(
        text,
        candidate_labels=_URGENCY_LABELS,
        hypothesis_template="This civic issue is {} priority.",
    )
    return result["labels"][0]  # Top predicted label


def _analyze_sentiment(text: str) -> str:
    """Determine sentiment using DistilBERT."""
    load_models()  # Ensure model is loaded
    if _sentiment_pipeline is None:
        return "neutral"

    result = _sentiment_pipeline(text[:512])  # Truncate to model max
    label = result[0]["label"].lower()

    # Map HuggingFace labels to our sentiment categories
    if label == "positive":
        return "positive"
    elif label == "negative":
        score = result[0]["score"]
        return "very_negative" if score > 0.9 else "negative"
    return "neutral"


def analyze_text(description: str) -> Dict[str, Any]:
    """
    Analyze an issue description using NLP models.

    Args:
        description: The issue description text.

    Returns:
        Dict with keys:
            - urgency (str): critical / high / medium / low
            - sentiment (str): positive / negative / very_negative / neutral
            - keywords (list[str]): top extracted keywords
    """
    urgency = _classify_urgency(description)
    sentiment = _analyze_sentiment(description)
    keywords = _extract_keywords(description)

    return {
        "urgency": urgency,
        "sentiment": sentiment,
        "keywords": keywords,
    }
