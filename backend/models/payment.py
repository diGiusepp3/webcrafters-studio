# /backend/models/payment.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, Text

from backend.core.database import Base


class Payment(Base):
    """Payment records."""
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    
    # Payment provider: stripe, paypal, etc.
    provider: Mapped[str] = mapped_column(String(30))
    
    # Provider's payment/transaction ID
    provider_payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Amount in cents
    amount_cents: Mapped[int] = mapped_column(Integer)
    
    # Currency
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    
    # Credits purchased
    credits_amount: Mapped[int] = mapped_column(Integer)
    
    # Status: pending, completed, failed, refunded
    status: Mapped[str] = mapped_column(String(20), default="pending")
    
    # Description
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
