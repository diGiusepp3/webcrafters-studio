from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.mysql import LONGTEXT, JSON as MYSQL_JSON
from sqlalchemy.dialects.mysql import DATETIME

from backend.core.database import Base

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # behoud je API-shape: prompt zit ook op project
    prompt: Mapped[str] = mapped_column(LONGTEXT)
    project_type: Mapped[str] = mapped_column(String(40))

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)

    validation_errors: Mapped[dict] = mapped_column(MYSQL_JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

