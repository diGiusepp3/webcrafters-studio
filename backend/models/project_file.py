from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, BigInteger, ForeignKey
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.dialects.mysql import DATETIME

from backend.core.database import Base

class ProjectFile(Base):
    __tablename__ = "project_files"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(500))
    language: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    content: Mapped[str] = mapped_column(LONGTEXT)
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

