# /backend/models/payment.py
from datetime import datetime
from typing import Optional, Any
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, DateTime, JSON

from backend.core.database import Base


class Payment(Base):
    """Payment records aligned with existing DB schema."""
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # Payment provider: stripe, paypal, mock, etc.
    provider: Mapped[str] = mapped_column(String(40))

    # Provider reference / checkout session id
    provider_ref: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)

    # Amount in cents
    amount_cents: Mapped[int] = mapped_column(Integer)

    # Currency
    currency: Mapped[str] = mapped_column(String(3), default="EUR")

    # Status: pending, completed, failed, refunded
    status: Mapped[str] = mapped_column(String(20), default="pending")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Raw metadata (e.g., package_credits, package_id, stripe event ids)
    raw: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
