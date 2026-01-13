# /backend/models/project_file.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, Text, DateTime

from backend.core.database import Base

class ProjectFile(Base):
    __tablename__ = "project_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(500))
    language: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
