# /backend/models/subscription_plan.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Float, JSON, DateTime, Boolean

from backend.core.database import Base


class SubscriptionPlan(Base):
    """Subscription plans available for users."""
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Plan slug: starter, pro, power
    slug: Mapped[str] = mapped_column(String(30), unique=True)
    
    # Display name
    name: Mapped[str] = mapped_column(String(100))
    
    # Monthly price
    price_monthly: Mapped[float] = mapped_column(Float)
    
    # Credits included per month
    credits_monthly: Mapped[int] = mapped_column(Integer)
    
    # Max output tokens per generation
    max_output_tokens: Mapped[int] = mapped_column(Integer)
    
    # Allowed models (JSON array)
    allowed_models: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    
    # Max generations per day
    max_generations_per_day: Mapped[int] = mapped_column(Integer, default=30)
    
    # Is active
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
