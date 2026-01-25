# FILE: backend/models/project_source.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey, DateTime

from backend.core.database import Base


class ProjectSource(Base):
    """Tracks GitHub source info for imported projects."""
    __tablename__ = "project_sources"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True)
    source_type: Mapped[str] = mapped_column(String(30))  # github_public, github_private
    owner: Mapped[str] = mapped_column(String(100))
    repo: Mapped[str] = mapped_column(String(100))
    ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # branch/tag
    subdir: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_commit_sha: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    snapshot_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # SHA256 of all file contents
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
