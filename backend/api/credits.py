# /backend/api/credits.py
"""Credits and billing API endpoints."""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func

from backend.api.deps import get_current_user
from backend.core.database import SessionLocal
from backend.models.credit_ledger import CreditLedger
from backend.models.subscription_plan import SubscriptionPlan
from backend.models.payment import Payment

router = APIRouter(prefix="/api/credits", tags=["credits"])


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────

class CreditBalance(BaseModel):
    balance_cents: int
    balance_display: str  # e.g., "69.81"


class CreditTransaction(BaseModel):
    id: int
    kind: str
    amount_cents: int
    amount_display: str
    ref_id: Optional[str]
    created_at: datetime


class SubscriptionPlanResponse(BaseModel):
    id: int
    slug: str
    name: str
    price_monthly: float
    credits_monthly: int
    max_output_tokens: int
    allowed_models: List[str]
    max_generations_per_day: int


class CreditPackage(BaseModel):
    id: str
    name: str
    credits: int
    price_cents: int
    price_display: str
    popular: bool = False
    bonus_percent: int = 0


class PurchaseRequest(BaseModel):
    package_id: str
    payment_method: str = "stripe"  # stripe, paypal


class PurchaseResponse(BaseModel):
    payment_id: str
    checkout_url: Optional[str] = None
    status: str


# ─────────────────────────────────────────────
# CREDIT PACKAGES (Static for now)
# ─────────────────────────────────────────────

CREDIT_PACKAGES = [
    CreditPackage(
        id="starter",
        name="Starter Pack",
        credits=1000,
        price_cents=499,
        price_display="€4.99",
        popular=False,
        bonus_percent=0
    ),
    CreditPackage(
        id="basic",
        name="Basic Pack",
        credits=5000,
        price_cents=1999,
        price_display="€19.99",
        popular=False,
        bonus_percent=5
    ),
    CreditPackage(
        id="pro",
        name="Pro Pack",
        credits=15000,
        price_cents=4999,
        price_display="€49.99",
        popular=True,
        bonus_percent=10
    ),
    CreditPackage(
        id="power",
        name="Power Pack",
        credits=50000,
        price_cents=14999,
        price_display="€149.99",
        popular=False,
        bonus_percent=20
    ),
]


# ─────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────

@router.get("/balance", response_model=CreditBalance)
async def get_credit_balance(user=Depends(get_current_user)):
    """Get current credit balance for the authenticated user."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(func.coalesce(func.sum(CreditLedger.amount_cents), 0))
            .where(CreditLedger.user_id == user["id"])
        )
        balance_cents = result.scalar() or 0
        
        return CreditBalance(
            balance_cents=balance_cents,
            balance_display=f"{balance_cents / 100:.2f}"
        )


@router.get("/history", response_model=List[CreditTransaction])
async def get_credit_history(user=Depends(get_current_user), limit: int = 50):
    """Get credit transaction history."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(CreditLedger)
            .where(CreditLedger.user_id == user["id"])
            .order_by(CreditLedger.created_at.desc())
            .limit(limit)
        )
        transactions = result.scalars().all()
        
        return [
            CreditTransaction(
                id=t.id,
                kind=t.kind,
                amount_cents=t.amount_cents,
                amount_display=f"{'+' if t.amount_cents > 0 else ''}{t.amount_cents / 100:.2f}",
                ref_id=t.ref_id,
                created_at=t.created_at
            )
            for t in transactions
        ]


@router.get("/packages", response_model=List[CreditPackage])
async def get_credit_packages():
    """Get available credit packages."""
    return CREDIT_PACKAGES


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def get_subscription_plans():
    """Get available subscription plans."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(SubscriptionPlan)
            .where(SubscriptionPlan.is_active == True)
            .order_by(SubscriptionPlan.price_monthly)
        )
        plans = result.scalars().all()
        
        if not plans:
            # Return default plans if none in DB
            return [
                SubscriptionPlanResponse(
                    id=1,
                    slug="starter",
                    name="Starter / Builder",
                    price_monthly=9.99,
                    credits_monthly=10000,
                    max_output_tokens=16000,
                    allowed_models=["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-5-mini"],
                    max_generations_per_day=30
                ),
                SubscriptionPlanResponse(
                    id=2,
                    slug="pro",
                    name="Pro",
                    price_monthly=24.99,
                    credits_monthly=35000,
                    max_output_tokens=32000,
                    allowed_models=["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-5-mini", "gpt-5", "codex"],
                    max_generations_per_day=60
                ),
                SubscriptionPlanResponse(
                    id=3,
                    slug="power",
                    name="Power / Studio",
                    price_monthly=49.99,
                    credits_monthly=100000,
                    max_output_tokens=64000,
                    allowed_models=["all"],
                    max_generations_per_day=120
                ),
            ]
        
        return [
            SubscriptionPlanResponse(
                id=p.id,
                slug=p.slug,
                name=p.name,
                price_monthly=p.price_monthly,
                credits_monthly=p.credits_monthly,
                max_output_tokens=p.max_output_tokens,
                allowed_models=p.allowed_models or [],
                max_generations_per_day=p.max_generations_per_day
            )
            for p in plans
        ]


@router.post("/purchase", response_model=PurchaseResponse)
async def purchase_credits(req: PurchaseRequest, user=Depends(get_current_user)):
    """Initiate a credit purchase."""
    # Find package
    package = next((p for p in CREDIT_PACKAGES if p.id == req.package_id), None)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid package")
    
    payment_id = str(uuid.uuid4())
    
    async with SessionLocal() as db:
        # Create payment record
        payment = Payment(
            id=payment_id,
            user_id=user["id"],
            provider=req.payment_method,
            amount_cents=package.price_cents,
            currency="EUR",
            credits_amount=package.credits,
            status="pending",
            description=f"Purchase: {package.name}",
            created_at=datetime.utcnow()
        )
        db.add(payment)
        await db.commit()
        
        # In production, this would redirect to Stripe/PayPal
        # For now, we'll return a mock checkout URL
        return PurchaseResponse(
            payment_id=payment_id,
            checkout_url=f"/checkout/{payment_id}",
            status="pending"
        )


@router.post("/purchase/{payment_id}/complete")
async def complete_purchase(payment_id: str, user=Depends(get_current_user)):
    """Complete a credit purchase (mock for demo, would be webhook in production)."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(Payment)
            .where(Payment.id == payment_id)
            .where(Payment.user_id == user["id"])
        )
        payment = result.scalar_one_or_none()
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        if payment.status == "completed":
            raise HTTPException(status_code=400, detail="Payment already completed")
        
        # Update payment status
        payment.status = "completed"
        payment.completed_at = datetime.utcnow()
        
        # Add credits to ledger
        credit_entry = CreditLedger(
            user_id=user["id"],
            kind="purchase",
            amount_cents=payment.credits_amount,
            ref_id=payment_id,
            created_at=datetime.utcnow()
        )
        db.add(credit_entry)
        await db.commit()
        
        return {
            "status": "completed",
            "credits_added": payment.credits_amount,
            "message": f"Successfully added {payment.credits_amount} credits!"
        }


@router.post("/add-demo-credits")
async def add_demo_credits(user=Depends(get_current_user)):
    """Add demo credits for testing (remove in production)."""
    async with SessionLocal() as db:
        credit_entry = CreditLedger(
            user_id=user["id"],
            kind="bonus",
            amount_cents=10000,  # 100.00 credits
            ref_id="demo",
            created_at=datetime.utcnow()
        )
        db.add(credit_entry)
        await db.commit()
        
        return {"message": "Added 100.00 demo credits", "credits_added": 10000}
