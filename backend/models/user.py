from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String
from sqlalchemy.dialects.mysql import DATETIME

from backend.core.database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)
