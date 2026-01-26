from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SecurityScanResponse(BaseModel):
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class SecurityFixProposalResponse(BaseModel):
    proposal_id: Optional[str] = None
    proposal: Dict[str, Any] = Field(default_factory=dict)
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class SecurityFixApplyResponse(BaseModel):
    status: str
    message: str
    updated_files: List[Dict[str, Any]] = Field(default_factory=list)
