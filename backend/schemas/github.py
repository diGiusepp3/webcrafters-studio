# FILE: backend/schemas/github.py
from typing import Optional, List
from pydantic import BaseModel, Field


class GitHubImportPublicRequest(BaseModel):
    url: str = Field(..., description="GitHub repository URL (e.g., https://github.com/owner/repo)")
    ref: Optional[str] = Field(None, description="Branch, tag, or commit (defaults to default branch)")
    subdir: Optional[str] = Field(None, description="Subdirectory to import")
    project_name: Optional[str] = Field(None, description="Custom project name (defaults to repo name)")


class GitHubImportPrivateRequest(BaseModel):
    owner: str
    repo: str
    ref: Optional[str] = None
    subdir: Optional[str] = None
    project_name: Optional[str] = None


class GitHubRepoInfo(BaseModel):
    id: int
    name: str
    full_name: str
    description: Optional[str]
    private: bool
    default_branch: str
    html_url: str
    updated_at: str
    language: Optional[str]
    stargazers_count: int


class GitHubReposResponse(BaseModel):
    repos: List[GitHubRepoInfo]
    page: int
    has_more: bool


class GitHubConnectionStatus(BaseModel):
    connected: bool
    github_username: Optional[str] = None
    connected_at: Optional[str] = None


class GitHubOAuthStartResponse(BaseModel):
    auth_url: str
    state: str


class GitHubImportResponse(BaseModel):
    project_id: str
    name: str
    file_count: int
    warnings: List[str] = []
    source_type: str
    owner: str
    repo: str
    ref: str
    commit_sha: Optional[str]


class GitHubSyncRequest(BaseModel):
    force: bool = Field(False, description="Force sync even if local changes detected")


class GitHubSyncResponse(BaseModel):
    success: bool
    message: str
    files_updated: int = 0
    warnings: List[str] = []
    has_local_changes: bool = False


class GitHubRefreshFileUpdate(BaseModel):
    path: str
    action: str


class GitHubRefreshResponse(BaseModel):
    success: bool
    status: str  # ok | error
    message: str
    updated_files: List[GitHubRefreshFileUpdate] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
