# /backend/models/credit_ledger.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, DateTime

from backend.core.database import Base


class CreditLedger(Base):
    """Credit transactions ledger - tracks all credit movements."""
    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    
    # Kind: purchase, usage, bonus, refund, subscription
    kind: Mapped[str] = mapped_column(String(30))
    
    # Amount in cents (positive for credit, negative for debit)
    amount_cents: Mapped[int] = mapped_column(Integer)
    
    # Reference ID (payment_id, generation_id, etc.)
    ref_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
