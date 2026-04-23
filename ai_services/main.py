"""
FastAPI AI Service for Civic Issue Classification.

Endpoints:
    POST /ai/classify-image  → Roboflow image classification
    POST /ai/analyze-text    → NLP text analysis
    GET  /ai/health          → Health check

No local ML models — image classification uses the Roboflow hosted API.
NLP analysis uses HuggingFace Transformers (loaded lazily).
"""

import os
import base64
import json
import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from dotenv import load_dotenv

from services.roboflow_service import classify_image
from services.mapping_service import get_department
from nlp_analyzer.analyzer import analyze_text
from routes.ai import router as ai_router

logger = logging.getLogger("ai_service.main")

CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

# Load backend env values from ai_services/.env (if present) and root .env.
load_dotenv(os.path.join(CURRENT_DIR, ".env"), override=False)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=False)


# ── Request / Response schemas ───────────────────────────────────────────────
# (AI-specific schemas are in routes/ai.py)


class AssignIssueRequest(BaseModel):
    worker_id: str
    status: str = "assigned"


class ReportIssueRequest(BaseModel):
    title: str | None = None
    image_url: str
    description: str
    latitude: float
    longitude: float


class AuthenticatedUser(BaseModel):
    id: UUID
    email: str | None = None
    name: str | None = None


class AuthProfileResponse(BaseModel):
    user_id: UUID
    role: str
    profile_exists: bool


class WorkerUpdateStatusRequest(BaseModel):
    issue_id: str
    worker_status: str
    after_image_url: str | None = None


class AdminUpdateStatusRequest(BaseModel):
    issue_id: str
    status: str


# ── Application lifecycle ────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize AI service. Roboflow client and NLP models load lazily on first use."""
    print("=" * 60)
    print("  Civic Issue AI Service — Initializing")
    print("=" * 60)

    # ── Startup env validation ──────────────────────────────────
    required_env = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    }
    missing = [k for k, v in required_env.items() if not v]
    if missing:
        print(f"  ⚠  MISSING ENV VARS: {', '.join(missing)}")
        print("  ⚠  Backend will start but Supabase-dependent endpoints will fail.")
    else:
        print("  ✓  All required environment variables present")

    roboflow_key = os.getenv("ROBOFLOW_API_KEY")
    if not roboflow_key:
        print("  ⚠  ROBOFLOW_API_KEY not set — image classification will use hardcoded key")
    else:
        print("  ✓  Roboflow API key present")

    # NLP and Roboflow clients load lazily, no action needed here

    print("=" * 60)
    print("  AI Service ready (models will load on first use)")
    print("=" * 60)

    yield


# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Civic Issue AI Service",
    description="Roboflow image classification and NLP text analysis for civic issue reports",
    version="2.0.0",
    lifespan=lifespan,
)

# ── Mount AI routes ──────────────────────────────────────────────────────────
app.include_router(ai_router)

# Allow requests from the Vite frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _supabase_config() -> tuple[str, dict[str, str]]:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_service_key:
        missing: list[str] = []
        if not supabase_url:
            missing.append("SUPABASE_URL")
        if not supabase_service_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")

        print(f"[Supabase Backend Config] Missing: {', '.join(missing)}")
        raise HTTPException(
            status_code=503,
            detail=(
                "Supabase server configuration missing. "
                f"Missing: {', '.join(missing)}"
            ),
        )

    url_project_ref = ""
    try:
        # Example: https://<project_ref>.supabase.co
        url_project_ref = supabase_url.split("//", 1)[1].split(".", 1)[0]
    except Exception:
        url_project_ref = ""

    key_project_ref = ""
    try:
        payload_part = supabase_service_key.split(".")[1]
        padding = "=" * ((4 - len(payload_part) % 4) % 4)
        decoded = base64.urlsafe_b64decode(payload_part + padding).decode("utf-8")
        key_payload = json.loads(decoded)
        key_project_ref = str(key_payload.get("ref", ""))
    except Exception:
        key_project_ref = ""

    print(
        "[Supabase Backend Config]",
        {
            "has_url": bool(supabase_url),
            "has_service_role_key": bool(supabase_service_key),
            "url_project_ref": url_project_ref,
            "key_project_ref": key_project_ref,
        },
    )

    if url_project_ref and key_project_ref and url_project_ref != key_project_ref:
        raise HTTPException(
            status_code=503,
            detail=(
                "Configuration error: Supabase API key missing or invalid. "
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY belong to different projects."
            ),
        )

    return (
        supabase_url,
        {
            "apikey": supabase_service_key,
            "Authorization": f"Bearer {supabase_service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )


def _route_issue_to_department(issue_type: str) -> str:
    """Map issue type to responsible department using the mapping service."""
    return get_department(issue_type)


def _calculate_priority_score(urgency: str, confidence: float) -> int:
    urgency_scores = {
        "critical": 90,
        "high": 70,
        "medium": 50,
        "low": 30,
    }
    base = urgency_scores.get(urgency, 50)
    return max(1, min(100, round(base * confidence)))


async def _user_has_role(user_id: str, role: str) -> bool:
    """Check if user has the given role using profiles.role (single source of truth)."""
    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/profiles"
    params = {
        "user_id": f"eq.{user_id}",
        "role": f"eq.{role}",
        "select": "id",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(endpoint, headers=headers, params=params)

    if response.status_code >= 400:
        return False

    return len(response.json()) > 0


async def _get_issue(issue_id: str) -> dict[str, Any]:
    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/issues"
    params = {"id": f"eq.{issue_id}", "select": "*", "limit": "1"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(endpoint, headers=headers, params=params)

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Failed to fetch issue")

    data = response.json()
    if not data:
        raise HTTPException(status_code=404, detail="Issue not found")

    return data[0]


async def _user_exists(user_id: UUID) -> bool:
    """Check if the user exists in profiles table to avoid FK insert errors."""
    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/profiles"
    params = {
        "id": f"eq.{str(user_id)}",
        "select": "id",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(endpoint, headers=headers, params=params)

    if response.status_code >= 400:
        return False

    return len(response.json()) > 0


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    token = authorization[len(prefix):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    return token


async def _get_authenticated_user(authorization: str | None = Header(default=None)) -> AuthenticatedUser:
    """Validate Supabase JWT and return authenticated user identity."""
    token = _extract_bearer_token(authorization)
    supabase_url, headers = _supabase_config()
    verify_headers = {
        "apikey": headers["apikey"],
        "Authorization": f"Bearer {token}",
    }

    endpoint = f"{supabase_url}/auth/v1/user"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(endpoint, headers=verify_headers)

    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    if response.status_code >= 400:
        raise HTTPException(status_code=503, detail="Unable to validate Supabase access token")

    user = response.json()
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id not found in token")

    try:
        parsed_user_id = UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=401, detail="Authenticated user id is not a valid UUID")

    metadata = user.get("user_metadata") or {}
    return AuthenticatedUser(
        id=parsed_user_id,
        email=user.get("email"),
        name=metadata.get("name"),
    )


async def _get_auth_user(user_id: UUID) -> dict[str, Any] | None:
    """Read user from Supabase Auth admin API using service role key."""
    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/auth/v1/admin/users/{str(user_id)}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(endpoint, headers=headers)

    if response.status_code == 404:
        return None

    if response.status_code >= 400:
        print("[profiles] Failed to read auth user", response.status_code, response.text)
        return None

    data = response.json()
    if isinstance(data, dict) and "user" in data and isinstance(data["user"], dict):
        return data["user"]
    if isinstance(data, dict):
        return data
    return None


async def _ensure_profile_for_user(user_id: UUID, email: str | None = None, name: str | None = None) -> bool:
    """Ensure profiles row exists for auth user. Keeps profiles.id == auth.users.id."""
    if await _user_exists(user_id):
        return True

    auth_user = await _get_auth_user(user_id)
    if auth_user:
        email = auth_user.get("email") or email
        metadata = auth_user.get("user_metadata") or auth_user.get("raw_user_meta_data") or {}
        name = metadata.get("name") or name

    if not email:
        return False

    resolved_name = name or email or "Citizen User"

    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/profiles"
    payload = {
        "id": str(user_id),
        "user_id": str(user_id),
        "name": resolved_name,
        "email": email or f"{str(user_id)}@placeholder.local",
        "role": "user",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(endpoint, headers=headers, json=payload)

    if response.status_code in (200, 201):
        print("[profiles] Created missing profile", str(user_id))
        return True

    if response.status_code == 409:
        # Concurrent insert; treat as success.
        return True

    print("[profiles] Failed to create profile", response.status_code, response.text)
    return False


async def _get_or_set_profile_role(user_id: UUID) -> str:
    """Read role from profiles.role using user UUID and default it to user if missing."""
    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/profiles"
    params = {
        "id": f"eq.{str(user_id)}",
        "select": "role",
        "limit": "1",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        read_response = await client.get(endpoint, headers=headers, params=params)

    if read_response.status_code >= 400:
        raise HTTPException(status_code=503, detail="Unable to load user role from profile")

    rows = read_response.json()
    if not rows:
        raise HTTPException(status_code=400, detail="Profile not found for authenticated user")

    profile_role = str(rows[0].get("role") or "").lower().strip()
    if profile_role in {"admin", "worker", "user"}:
        return profile_role
    if profile_role == "citizen":
        return "user"

    update_payload = {"role": "user"}
    update_params = {
        "id": f"eq.{str(user_id)}",
        "select": "role",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        update_response = await client.patch(endpoint, headers=headers, params=update_params, json=update_payload)

    if update_response.status_code >= 400:
        raise HTTPException(status_code=503, detail="Unable to assign default user role in profile")

    return "user"


async def _fetch_all_issues() -> list[dict[str, Any]]:
    """Fetch all issues for admin views using service-role credentials."""
    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/issues"
    params = {
        "select": "*",
        "order": "created_at.desc",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(endpoint, headers=headers, params=params)

    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("message") or response.json().get("error") or response.text
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"Failed to fetch issues: {detail}")

    data = response.json()
    return data if isinstance(data, list) else []


async def _process_issue_ai(issue_id: str, image_url: str, description: str):
    supabase_url, headers = _supabase_config()

    issue_type = "other"
    confidence = 0.5
    department = "General Municipal Department"
    urgency = "medium"
    sentiment = "neutral"
    keywords: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            image_response = await http_client.get(image_url)
            image_response.raise_for_status()
            classification = await classify_image(image_response.content)
            issue_type = classification.get("issue_type", "other")
            confidence = float(classification.get("confidence", 0.5))
            department = classification.get("department", "General Municipal Department")
    except Exception as exc:
        logger.error("Image classification failed for issue %s: %s", issue_id, exc)
        # Keep defaults if image classification fails.

    try:
        analysis = analyze_text(description)
        urgency = analysis.get("urgency", "medium")
        sentiment = analysis.get("sentiment", "neutral")
        raw_keywords = analysis.get("keywords", [])
        keywords = raw_keywords if isinstance(raw_keywords, list) else []
    except Exception:
        # Keep defaults if NLP analysis fails.
        pass

    update_payload: dict[str, Any] = {
        "issue_type": issue_type,
        "urgency": urgency,
        "department": department,
        "priority_score": _calculate_priority_score(urgency, confidence),
        "ai_confidence": confidence,
        "ai_keywords": keywords,
        "ai_sentiment": sentiment,
    }

    endpoint = f"{supabase_url}/rest/v1/issues"
    params = {"id": f"eq.{issue_id}", "select": "id"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.patch(endpoint, headers=headers, params=params, json=update_payload)


# ── Endpoints ────────────────────────────────────────────────────────────────
# AI endpoints (classify-image, analyze-text, health) are in routes/ai.py


@app.post("/issues/report")
async def report_issue(
    request: ReportIssueRequest,
    background_tasks: BackgroundTasks,
    auth_user: AuthenticatedUser = Depends(_get_authenticated_user),
):
    """Create issue immediately, then enrich AI fields in the background."""
    print("[issues/report] Request received")
    print(
        "[issues/report] Payload summary:",
        {
            "user_id": str(auth_user.id),
            "title": request.title,
            "has_image_url": bool(request.image_url),
            "description_length": len(request.description or ""),
            "latitude": request.latitude,
            "longitude": request.longitude,
        },
    )

    if not request.description.strip():
        raise HTTPException(status_code=400, detail="description is required")

    resolved_user_id = auth_user.id
    if not await _ensure_profile_for_user(resolved_user_id, email=auth_user.email, name=auth_user.name):
        raise HTTPException(
            status_code=400,
            detail="Invalid user identity: no matching Supabase auth user/profile found",
        )

    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/issues"

    # Insert quickly with safe defaults so UI can update immediately.
    insert_payload: dict[str, Any] = {
        "user_id": str(resolved_user_id),
        "title": request.title or request.description[:80] or "Issue Report",
        "image_url": request.image_url,
        "description": request.description,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "status": "pending",
        "worker_status": None,
        "issue_type": None,
        "urgency": None,
        "department": None,
        "priority_score": None,
        "ai_confidence": None,
        "ai_keywords": None,
        "ai_sentiment": None,
    }

    print("[issues/report] Inserting issue into Supabase...")
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(endpoint, headers=headers, json=insert_payload)
    print("[issues/report] Supabase insert response status:", response.status_code)

    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("message") or response.json().get("error") or response.text
        except Exception:
            pass
        if response.status_code in (401, 403) or "Invalid API key" in str(detail):
            raise HTTPException(
                status_code=503,
                detail="Configuration error: Supabase API key missing or invalid",
            )
        raise HTTPException(status_code=502, detail=f"Failed to create issue: {detail}")

    data = response.json()
    if not data:
        raise HTTPException(status_code=502, detail="Issue creation returned no data")

    issue = data[0]
    print("[issues/report] Issue created:", issue.get("id"))
    print("[issues/report] Scheduling background AI processing...")
    background_tasks.add_task(_process_issue_ai, issue["id"], request.image_url, request.description)
    print("[issues/report] Returning response immediately")
    return issue


@app.get("/auth/profile", response_model=AuthProfileResponse)
async def get_auth_profile(auth_user: AuthenticatedUser = Depends(_get_authenticated_user)):
    """Safe endpoint for frontend to hydrate profile/role state after login."""
    profile_exists = await _ensure_profile_for_user(auth_user.id, email=auth_user.email, name=auth_user.name)
    if not profile_exists:
        raise HTTPException(status_code=400, detail="Unable to create or load user profile")

    role = await _get_or_set_profile_role(auth_user.id)
    return AuthProfileResponse(user_id=auth_user.id, role=role, profile_exists=True)


@app.get("/admin/issues")
async def get_admin_issues(auth_user: AuthenticatedUser = Depends(_get_authenticated_user)):
    """Return all issues for admin dashboards only."""
    role = await _get_or_set_profile_role(auth_user.id)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view all issues")

    issues = await _fetch_all_issues()
    print("[admin/issues] Admin fetched issues", {"admin_id": str(auth_user.id), "count": len(issues)})
    return issues


@app.post("/worker/update-status")
async def worker_update_status(
    request: WorkerUpdateStatusRequest,
    auth_user: AuthenticatedUser = Depends(_get_authenticated_user),
):
    """Worker can update only worker_status for assigned issues."""
    worker_id = str(auth_user.id)

    allowed_worker_status = {"in_progress", "work_done"}
    if request.worker_status not in allowed_worker_status:
        raise HTTPException(status_code=400, detail="worker_status must be in_progress or work_done")

    is_worker = await _user_has_role(worker_id, "worker")
    if not is_worker:
        raise HTTPException(status_code=403, detail="Only workers can update worker status")

    issue = await _get_issue(request.issue_id)
    if issue.get("assigned_worker_id") != worker_id:
        raise HTTPException(status_code=403, detail="Worker is not assigned to this issue")

    if issue.get("worker_status") == request.worker_status:
        # Idempotent success for repeated clicks.
        return issue

    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/issues"
    params = {"id": f"eq.{request.issue_id}", "select": "*"}
    payload: dict[str, Any] = {"worker_status": request.worker_status}

    # If marking as work_done, require after_image_url and store it
    if request.worker_status == "work_done":
        if not request.after_image_url:
            raise HTTPException(status_code=400, detail="after_image_url is required when marking work as done")
        payload["resolution_image_url"] = request.after_image_url

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(endpoint, headers=headers, params=params, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Failed to update worker status")

    data = response.json()
    if not data:
        raise HTTPException(status_code=404, detail="Issue not found")

    return data[0]


@app.post("/admin/update-status")
async def admin_update_status(
    request: AdminUpdateStatusRequest,
    auth_user: AuthenticatedUser = Depends(_get_authenticated_user),
):
    """Admin verifies worker stage and applies final status transitions."""
    admin_id = str(auth_user.id)

    allowed_admin_status = {"pending", "assigned", "in_progress", "resolved", "rejected"}
    if request.status not in allowed_admin_status:
        raise HTTPException(status_code=400, detail="Invalid status")

    is_admin = await _user_has_role(admin_id, "admin")
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can update final status")

    issue = await _get_issue(request.issue_id)

    if request.status == "resolved" and issue.get("worker_status") != "work_done":
        raise HTTPException(status_code=400, detail="Cannot resolve before worker marks work_done")

    payload: dict[str, Any] = {"status": request.status}

    # When resolving, also set verification fields
    if request.status == "resolved":
        from datetime import datetime, timezone
        payload["verified_by_admin"] = True
        payload["verified_at"] = datetime.now(timezone.utc).isoformat()

    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/issues"
    params = {"id": f"eq.{request.issue_id}", "select": "*"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(endpoint, headers=headers, params=params, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Failed to update admin status")

    data = response.json()
    if not data:
        raise HTTPException(status_code=404, detail="Issue not found")

    return data[0]


@app.patch("/admin/issues/{issue_id}/assign")
async def assign_issue(
    issue_id: str,
    request: AssignIssueRequest,
    auth_user: AuthenticatedUser = Depends(_get_authenticated_user),
):
    """Assign a worker and force issue status to assigned in one operation."""
    admin_id = str(auth_user.id)

    is_admin = await _user_has_role(admin_id, "admin")
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can assign workers")

    if not request.worker_id.strip():
        raise HTTPException(status_code=400, detail="worker_id is required")

    supabase_url, headers = _supabase_config()
    endpoint = f"{supabase_url}/rest/v1/issues"
    params = {"id": f"eq.{issue_id}", "select": "*"}

    payload: dict[str, Any] = {
        "assigned_worker_id": request.worker_id,
        "status": "assigned",
        "worker_status": None,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(endpoint, headers=headers, params=params, json=payload)

    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("message") or response.json().get("error") or response.text
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to assign issue: {detail}")

    data = response.json()
    if not data:
        raise HTTPException(status_code=404, detail="Issue not found")

    return data[0]
