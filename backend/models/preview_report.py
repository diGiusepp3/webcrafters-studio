# /backend/models/preview_report.py
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.mysql import DATETIME, JSON as MYSQL_JSON, LONGTEXT

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
    # [{"step": "generating", "status": "success", "started_at": ..., "completed_at": ..., "duration_ms": ...}]
    timeline_steps: Mapped[Optional[list]] = mapped_column(MYSQL_JSON, nullable=True)

    # Agent chat messages
    # [{"role": "agent", "message": "...", "timestamp": ...}]
    chat_messages: Mapped[Optional[list]] = mapped_column(MYSQL_JSON, nullable=True)

    # Build logs (stdout/stderr from build process)
    build_logs: Mapped[Optional[str]] = mapped_column(LONGTEXT, nullable=True)

    # Runtime logs (from preview execution)
    runtime_logs: Mapped[Optional[str]] = mapped_column(LONGTEXT, nullable=True)

    # Screenshots list
    # [{"url": "/previews/xxx/screenshot.png", "label": "Homepage", "timestamp": ...}]
    screenshots: Mapped[Optional[list]] = mapped_column(MYSQL_JSON, nullable=True)

    # Applied fixes (file diffs/patch summaries)
    # [{"file": "src/App.js", "diff": "...", "reason": "Fixed import error"}]
    applied_fixes: Mapped[Optional[list]] = mapped_column(MYSQL_JSON, nullable=True)

    # Security findings
    # [{"severity": "high", "type": "hardcoded_secret", "file": "...", "line": 42, "message": "...", "fixed": true}]
    security_findings: Mapped[Optional[list]] = mapped_column(MYSQL_JSON, nullable=True)

    # Preview URL (if deployed)
    preview_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Final status: success, failed, partial
    final_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Error summary if failed
    error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow, onupdate=datetime.utcnow)
