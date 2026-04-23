"""
Constants and Configuration for Civic Issue Image Classification.

Defines issue categories, department mapping, and confidence thresholds
used by the Roboflow-powered inference pipeline.
"""

# The issue categories the classifier predicts
ISSUE_CATEGORIES = [
    "pothole",
    "garbage",
    "broken_streetlight",
    "water_leak",
    "road_damage",
    "others",
]

# Map predicted class → responsible government department
DEPARTMENT_MAP = {
    "pothole": "Roads Department",
    "road_damage": "Roads Department",
    "garbage": "Sanitation Department",
    "broken_streetlight": "Electricity Department",
    "water_leak": "Water Supply Department",
    "others": "General Municipal Department",
}

# Below this confidence the prediction is marked "uncertain"
CONFIDENCE_THRESHOLD = 0.5
