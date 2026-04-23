"""
Image Classification Inference Module (Roboflow API).

Sends uploaded images to the Roboflow hosted model for classification
and returns the predicted civic issue type, confidence, and department.
"""

import io
import logging
import os
import tempfile
from typing import Any, Dict

from inference_sdk import InferenceHTTPClient

from .model import CONFIDENCE_THRESHOLD, DEPARTMENT_MAP, ISSUE_CATEGORIES

logger = logging.getLogger("ai_service.image_classifier")

# ── Roboflow client (lazy singleton) ─────────────────────────────────────────

_client: InferenceHTTPClient | None = None

ROBOFLOW_API_URL = "https://serverless.roboflow.com"
ROBOFLOW_MODEL_ID = "civic-issue-classifier-m4mjk/1"


def _get_client() -> InferenceHTTPClient:
    """Return (and cache) the Roboflow inference client."""
    global _client
    if _client is None:
        api_key = os.getenv("ROBOFLOW_API_KEY", "tE6EfB7noVrgu9DRjuEv")
        _client = InferenceHTTPClient(
            api_url=ROBOFLOW_API_URL,
            api_key=api_key,
        )
        logger.info("Roboflow InferenceHTTPClient initialized (model: %s)", ROBOFLOW_MODEL_ID)
    return _client


# ── Public helpers (kept for backwards compat with main.py) ──────────────────

def load_model(model_path: str | None = None) -> None:
    """No-op. Retained so main.py lifespan doesn't break on import."""
    pass


def classify_image(image_bytes: bytes) -> Dict[str, Any]:
    """
    Classify an uploaded image via the Roboflow hosted model.

    Args:
        image_bytes: Raw bytes of the uploaded image file.

    Returns:
        Dict with keys:
            - issue_type (str): predicted category or "uncertain"
            - confidence (float): model confidence score
            - department (str): mapped government department
    """
    client = _get_client()

    # Write bytes to a temp file since inference-sdk expects a file path
    suffix = ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(image_bytes)
        tmp.flush()
        tmp.close()

        logger.info("Sending image to Roboflow (%d bytes) ...", len(image_bytes))
        result = client.infer(tmp.name, model_id=ROBOFLOW_MODEL_ID)
        logger.info("Roboflow raw response: %s", result)
    finally:
        # Clean up temp file
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    # ── Parse the response ───────────────────────────────────────────────
    return _parse_roboflow_response(result)


def _parse_roboflow_response(result: Any) -> Dict[str, Any]:
    """
    Extract predicted class and confidence from the Roboflow API response.

    Supports both classification responses (top/predicted_classes)
    and object-detection style responses (predictions list).
    """
    predicted_class: str | None = None
    confidence: float = 0.0

    # ── Classification-style response ────────────────────────────────
    if isinstance(result, dict):
        # Roboflow classification: {"top": "pothole", "confidence": 0.91, ...}
        if "top" in result:
            predicted_class = str(result["top"]).lower().strip()
            confidence = float(result.get("confidence", 0.0))

        # Alternative: {"predicted_classes" : ["pothole"], ...}
        elif "predicted_classes" in result:
            classes = result["predicted_classes"]
            if classes:
                predicted_class = str(classes[0]).lower().strip()
                confidence = float(result.get("confidence", 0.0))

        # Object-detection style: {"predictions": [{"class": "pothole", "confidence": 0.9}, ...]}
        elif "predictions" in result and isinstance(result["predictions"], list):
            preds = result["predictions"]
            if preds:
                best = max(preds, key=lambda p: float(p.get("confidence", 0)))
                predicted_class = str(best.get("class", "others")).lower().strip()
                confidence = float(best.get("confidence", 0.0))

    # ── List response (some Roboflow endpoints) ──────────────────────
    elif isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            predicted_class = str(first.get("class", first.get("top", "others"))).lower().strip()
            confidence = float(first.get("confidence", 0.0))

    # ── Confidence threshold & fallback ──────────────────────────────
    if not predicted_class or confidence < CONFIDENCE_THRESHOLD:
        logger.warning(
            "Low confidence (%.2f) or no prediction — marking as uncertain",
            confidence,
        )
        predicted_class = "uncertain"

    # Normalise to known categories
    if predicted_class not in ISSUE_CATEGORIES and predicted_class != "uncertain":
        logger.warning("Unknown class '%s' from Roboflow, mapping to 'others'", predicted_class)
        predicted_class = "others"

    department = DEPARTMENT_MAP.get(predicted_class, "General Municipal Department")
    confidence = round(confidence, 4)

    logger.info(
        "Classification result: type=%s  conf=%.4f  dept=%s",
        predicted_class, confidence, department,
    )

    return {
        "issue_type": predicted_class,
        "confidence": confidence,
        "department": department,
    }
