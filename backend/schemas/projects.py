from typing import Any, Dict, List
from pydantic import BaseModel, ConfigDict, Field

class ProjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    prompt: str
    project_type: str
    name: str
    description: str
    files: List[Dict[str, str]]
    created_at: str
    validation_errors: List[Any] = Field(default_factory=list)

class ProjectHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    project_type: str
    created_at: str
    file_count: int
    has_validation_errors: bool = False