"""
Roboflow Inference Service.

Calls the Roboflow hosted classification API directly via HTTP (httpx).
No local ML models — all inference happens on Roboflow's servers.

Uses httpx instead of inference-sdk to avoid Python version constraints.
"""

import base64
import logging
import os
from typing import Any, Dict

import httpx

from services.mapping_service import (
    CONFIDENCE_THRESHOLD,
    get_department,
    normalize_issue_type,
)

logger = logging.getLogger("ai_service.roboflow")

# ── Roboflow Configuration ───────────────────────────────────────────────────

ROBOFLOW_API_URL = "https://classify.roboflow.com"
ROBOFLOW_MODEL_ID = "civic-issue-classifier-m4mjk/1"


def _get_api_key() -> str:
    """Read Roboflow API key from env, falling back to hardcoded default."""
    return os.getenv("ROBOFLOW_API_KEY", "tE6EfB7noVrgu9DRjuEv")


# ── Public API ───────────────────────────────────────────────────────────────

async def classify_image(image_bytes: bytes) -> Dict[str, Any]:
    """
    Classify an image by sending it to the Roboflow hosted model.

    Args:
        image_bytes: Raw bytes of the uploaded image.

    Returns:
        Dict with keys:
            - issue_type (str): predicted category or "uncertain"
            - confidence (float): model confidence score
            - department (str): mapped government department
    """
    api_key = _get_api_key()
    url = f"{ROBOFLOW_API_URL}/{ROBOFLOW_MODEL_ID}"

    # Encode image as base64 for the Roboflow REST API
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    logger.info("Sending image to Roboflow (%d bytes, model=%s) ...", len(image_bytes), ROBOFLOW_MODEL_ID)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            params={"api_key": api_key},
            content=image_b64,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        logger.error(
            "Roboflow API error: status=%d body=%s",
            response.status_code,
            response.text[:500],
        )
        raise RuntimeError(f"Roboflow API returned status {response.status_code}: {response.text[:200]}")

    result = response.json()
    logger.info("Roboflow raw response: %s", result)

    return _parse_response(result)


# ── Response Parsing ─────────────────────────────────────────────────────────

def _parse_response(result: Any) -> Dict[str, Any]:
    """
    Extract predicted class and confidence from the Roboflow API response.

    Supports:
      - Classification: {"top": "pothole", "confidence": 0.91, ...}
      - Detection: {"predictions": [{"class": "pothole", "confidence": 0.9}, ...]}
    """
    predicted_class: str | None = None
    confidence: float = 0.0

    if isinstance(result, dict):
        # ── Classification-style: {"top": "...", "confidence": ...} ───
        if "top" in result:
            predicted_class = str(result["top"])
            confidence = float(result.get("confidence", 0.0))

        # ── Predictions list (detection or multi-class) ──────────────
        elif "predictions" in result and isinstance(result["predictions"], list):
            preds = result["predictions"]
            if preds:
                # For classification, predictions is a dict-like mapping
                if isinstance(preds[0], dict) and "class" in preds[0]:
                    best = max(preds, key=lambda p: float(p.get("confidence", 0)))
                    predicted_class = str(best["class"])
                    confidence = float(best.get("confidence", 0.0))

        # ── predicted_classes style ──────────────────────────────────
        elif "predicted_classes" in result:
            classes = result["predicted_classes"]
            if classes:
                predicted_class = str(classes[0])
                confidence = float(result.get("confidence", 0.0))

    # ── Confidence threshold & normalization ─────────────────────────
    if not predicted_class or confidence < CONFIDENCE_THRESHOLD:
        logger.warning(
            "Low confidence (%.2f) or no prediction — marking as uncertain",
            confidence,
        )
        issue_type = "uncertain"
        department = "General Municipal Department"
    else:
        issue_type = normalize_issue_type(predicted_class)
        department = get_department(issue_type)

    confidence = round(confidence, 4)

    logger.info(
        "Classification result: type=%s  conf=%.4f  dept=%s",
        issue_type, confidence, department,
    )

    return {
        "issue_type": issue_type,
        "confidence": confidence,
        "department": department,
    }
