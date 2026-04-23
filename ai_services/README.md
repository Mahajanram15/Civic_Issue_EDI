# Civic Issue AI Service

Local FastAPI backend that provides CNN image classification and NLP text analysis for civic issue reports.

## Setup

### 1. Create virtual environment

```bash
cd ai_services
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

> **Note:** PyTorch installation may vary by platform. Visit [pytorch.org](https://pytorch.org/get-started/locally/) for platform-specific instructions if needed.

### 3. Generate initial model weights

```bash
python models/generate_model.py
```

This creates `models/civic_issue_cnn.pt` with randomly initialized weights. For production accuracy, train the CNN on a labeled dataset of civic issue images and replace this file.

### 4. Start the server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The first startup will download HuggingFace models (~1.5 GB) for NLP analysis. Subsequent startups will use the cached models.

## API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `POST` | `/ai/classify-image` | `multipart/form-data` with `file` | `{ "issue_type": "pothole", "confidence": 0.92 }` |
| `POST` | `/ai/analyze-text` | `{ "description": "..." }` | `{ "urgency": "high", "sentiment": "negative", "keywords": [...] }` |
| `GET` | `/ai/health` | — | `{ "status": "healthy", "models_loaded": true }` |

## Architecture

```
ai_services/
├── main.py                     # FastAPI app + model loading
├── requirements.txt
├── image_classifier/
│   ├── model.py                # CivicIssueCNN (PyTorch)
│   └── inference.py            # Image preprocessing + prediction
├── nlp_analyzer/
│   └── analyzer.py             # Urgency, sentiment, keyword extraction
└── models/
    ├── generate_model.py       # Create initial weights
    └── civic_issue_cnn.pt      # Model weights (generated)
```

## Performance

- **Image classification:** ~50–200ms per image (CPU)
- **Text analysis:** ~200–500ms per text (CPU, first call may be slower)
- **Non-blocking:** FastAPI handles requests asynchronously
