# =========================================================
# FILE: /backend/schemas/agent_events.py
# =========================================================

from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field, validator


AgentEventType = Literal[
    "repo_search",
    "file_read",
    "plan",
    "propose_patch",
    "needs_approval",
    "apply_patch",
    "verify",
    "security_scan",
    "preview_build",
]


class AgentEvent(BaseModel):
    id: str = Field(..., min_length=1)
    ts: str = Field(..., min_length=1)
    type: AgentEventType
    title: str = Field(..., min_length=1)
    detail: str = Field(..., min_length=1)
    command: Optional[str] = None
    files_read: Optional[List[str]] = None
    files_changed: Optional[List[str]] = None
    result: Optional[Dict[str, Any]] = None
    rationale: str = Field(..., min_length=1)
    severity: Optional[str] = None

    @validator("files_read", "files_changed", pre=True)
    def _normalize_list(cls, value):
        if value is None:
            return None
        if isinstance(value, list):
            return value
        return [value]

    @validator("rationale")
    def _require_rationale(cls, value):
        if not str(value or "").strip():
            raise ValueError("rationale is required")
        return value
