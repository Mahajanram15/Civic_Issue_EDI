"""
Department Mapping Service.

Maps predicted issue types to responsible government departments.
Single source of truth for all department routing logic.
"""

import logging

logger = logging.getLogger("ai_service.mapping")

# ── Issue Categories ─────────────────────────────────────────────────────────

ISSUE_CATEGORIES = [
    "pothole",
    "garbage",
    "broken_streetlight",
    "water_leak",
    "road_damage",
    "others",
]

# ── Department Mapping ───────────────────────────────────────────────────────

DEPARTMENT_MAP = {
    "pothole": "Roads Department",
    "road_damage": "Roads Department",
    "garbage": "Sanitation Department",
    "broken_streetlight": "Electricity Department",
    "water_leak": "Water Supply Department",
    "others": "General Municipal Department",
}

# ── Confidence Threshold ─────────────────────────────────────────────────────

CONFIDENCE_THRESHOLD = 0.5


def get_department(issue_type: str) -> str:
    """Map an issue type to its responsible department."""
    dept = DEPARTMENT_MAP.get(issue_type, "General Municipal Department")
    logger.debug("Mapped issue_type=%s → department=%s", issue_type, dept)
    return dept


def normalize_issue_type(raw_class: str) -> str:
    """
    Normalize a raw predicted class name to a known issue category.

    Handles common aliases and unknown classes gracefully.
    """
    cleaned = raw_class.lower().strip().replace(" ", "_").replace("-", "_")

    # Direct match
    if cleaned in ISSUE_CATEGORIES:
        return cleaned

    # Common aliases
    aliases = {
        "other": "others",
        "street_light": "broken_streetlight",
        "streetlight": "broken_streetlight",
        "broken_street_light": "broken_streetlight",
        "road": "road_damage",
        "pot_hole": "pothole",
        "trash": "garbage",
        "waste": "garbage",
        "litter": "garbage",
        "leak": "water_leak",
        "water": "water_leak",
    }

    if cleaned in aliases:
        return aliases[cleaned]

    logger.warning("Unknown class '%s' — mapping to 'others'", raw_class)
    return "others"
