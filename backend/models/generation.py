# /backend/models/generation.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey, Integer
from sqlalchemy.dialects.mysql import LONGTEXT, JSON as MYSQL_JSON
from sqlalchemy.dialects.mysql import DATETIME

from backend.core.database import Base

class Generation(Base):
    __tablename__ = "generations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )

    prompt: Mapped[str] = mapped_column(LONGTEXT)
    project_type: Mapped[str] = mapped_column(String(40))

    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ok")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tokens_in: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    ai_request: Mapped[Optional[dict]] = mapped_column(MYSQL_JSON, nullable=True)
    ai_response: Mapped[Optional[dict]] = mapped_column(MYSQL_JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

