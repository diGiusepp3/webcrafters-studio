# =========================================================
# FILE: /backend/schemas/generate.py
# =========================================================

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, validator


class GenerateRequest(BaseModel):
    prompt: str
    project_type: str  # fullstack | frontend | backend | any (+ legacy: web/android/kotlin)
    preferences: Optional[Dict[str, Any]] = None

    @validator("project_type")
    def validate_project_type(cls, v: str):
        v = (v or "").lower().strip()
        allowed = {"fullstack", "frontend", "backend", "any", "web", "android", "kotlin"}
        if v not in allowed:
            raise ValueError(f"project_type must be one of {sorted(allowed)}")
        return v


class ClarifyRequest(BaseModel):
    prompt: str
    project_type: str
    preferences: Optional[Dict[str, Any]] = None

    @validator("project_type")
    def validate_project_type(cls, v: str):
        v = (v or "").lower().strip()
        allowed = {"fullstack", "frontend", "backend", "any", "web", "android", "kotlin"}
        if v not in allowed:
            raise ValueError(f"project_type must be one of {sorted(allowed)}")
        return v


class ClarifyResponse(BaseModel):
    needs_clarification: bool
    questions: List[str] = Field(default_factory=list)
    derived: Dict[str, Any] = Field(default_factory=dict)


class PlanFeedbackRequest(BaseModel):
    message: str

    @validator("message")
    def validate_message(cls, value: str):
        if not value or not value.strip():
            raise ValueError("Feedback message cannot be empty")
        return value.strip()
