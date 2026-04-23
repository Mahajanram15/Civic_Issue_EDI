"""
AI Routes — Image Classification & Text Analysis endpoints.

POST /ai/classify-image  → Roboflow image classification
POST /ai/analyze-text    → NLP text analysis
GET  /ai/health          → Health check
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from services.roboflow_service import classify_image
from nlp_analyzer.analyzer import analyze_text


router = APIRouter(prefix="/ai", tags=["AI"])


# ── Response Schemas ─────────────────────────────────────────────────────────

class ClassificationResponse(BaseModel):
    issue_type: str
    confidence: float
    department: str


class TextAnalysisRequest(BaseModel):
    description: str


class TextAnalysisResponse(BaseModel):
    urgency: str
    sentiment: str
    keywords: list[str]


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the AI service is running."""
    return HealthResponse(status="healthy", models_loaded=True)


@router.post("/classify-image", response_model=ClassificationResponse)
async def classify_image_endpoint(file: UploadFile = File(...)):
    """
    Classify an uploaded image into a civic issue category using Roboflow.

    Accepts: multipart/form-data with a file field.
    Returns: { "issue_type": "pothole", "confidence": 0.92, "department": "Roads Department" }
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        result = await classify_image(image_bytes)
        return ClassificationResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image classification failed: {str(e)}")


@router.post("/analyze-text", response_model=TextAnalysisResponse)
async def analyze_text_endpoint(request: TextAnalysisRequest):
    """
    Analyze an issue description using NLP.

    Accepts: JSON { "description": "..." }
    Returns: { "urgency": "high", "sentiment": "negative", "keywords": [...] }
    """
    if not request.description or not request.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty")

    try:
        result = analyze_text(request.description)
        return TextAnalysisResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text analysis failed: {str(e)}")
