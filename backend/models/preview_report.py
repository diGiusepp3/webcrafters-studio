# /backend/models/preview_report.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey, JSON, DateTime

from backend.core.database import Base


class PreviewReport(Base):
    """Full report for a generation job including logs, screenshots, fixes, findings."""
    __tablename__ = "preview_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(String(36), index=True, unique=True)
    project_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), index=True)

    # Timeline steps (structured list)
    timeline_steps: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Agent chat messages
    chat_messages: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Build logs (stdout/stderr from build process)
    build_logs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Runtime logs (from preview execution)
    runtime_logs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Screenshots list
    screenshots: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Applied fixes (file diffs/patch summaries)
    applied_fixes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Security findings
    security_findings: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Preview URL (if deployed)
    preview_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Final status: success, failed, partial
    final_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Error summary if failed
    error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
