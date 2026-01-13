# /backend/models/job_event.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.dialects.mysql import DATETIME, JSON as MYSQL_JSON

from backend.core.database import Base


class JobEvent(Base):
    """Timeline events for a generation job."""
    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(String(36), index=True)
    
    # Event type: step_start, step_complete, step_error, chat_message
    event_type: Mapped[str] = mapped_column(String(30))
    
    # Step name: preflight, generating, validating, building, deploying, screenshotting, testing, fixing, done
    step: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Status: pending, running, success, error, skipped
    status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    # Message for chat or step description
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Extra metadata (duration_ms, error details, etc.)
    metadata: Mapped[Optional[dict]] = mapped_column(MYSQL_JSON, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)
