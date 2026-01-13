# /backend/models/project.py
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey, JSON, DateTime

from backend.core.database import Base

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    prompt: Mapped[str] = mapped_column(Text)
    project_type: Mapped[str] = mapped_column(String(40))

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)

    validation_errors: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
