# /backend/api/credits.py
"""Credits and billing API endpoints."""

import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func

from backend.api.deps import get_current_user
from backend.core.database import SessionLocal
from backend.models.credit_ledger import CreditLedger
from backend.models.subscription_plan import SubscriptionPlan
from backend.models.payment import Payment
import stripe
import logging
import os

LOG_DIR = os.getenv("LOG_DIR", "logs")
os.makedirs(LOG_DIR, exist_ok=True)
stripe_logger = logging.getLogger("stripe_webcrafters")
if not stripe_logger.handlers:
    handler = logging.FileHandler(os.path.join(LOG_DIR, "stripe.log"))
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    stripe_logger.setLevel(logging.INFO)
    stripe_logger.addHandler(handler)

AUTO_COMPLETE_PURCHASES = os.getenv("AUTO_COMPLETE_CREDIT_PURCHASES", "true").lower() in {"1", "true", "yes"}
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://studio.webcrafters.be").rstrip("/")
TEST_MODE = os.getenv("TEST_MODE", "false").lower() in {"1", "true", "yes"}

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

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
    package_id: str | int
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
        # Backfill missing purchase ledger entries from completed payments
        payments = await db.execute(
            select(Payment).where(Payment.user_id == user["id"], Payment.status == "completed")
        )
        for pay in payments.scalars().all():
            existing = await db.execute(
                select(CreditLedger).where(
                    CreditLedger.ref_id == pay.id,
                    CreditLedger.user_id == user["id"],
                    CreditLedger.kind == "purchase",
                )
            )
            if existing.scalar_one_or_none():
                continue
            credits = int((pay.raw or {}).get("package_credits") or pay.amount_cents or 0)
            if credits <= 0:
                continue
            db.add(CreditLedger(
                user_id=user["id"],
                kind="purchase",
                amount_cents=credits,
                ref_id=pay.id,
                created_at=datetime.utcnow(),
            ))
        await db.commit()

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
    default_plans = [
        SubscriptionPlanResponse(
            id=1,
            slug="starter",
            name="Starter / Builder",
            price_monthly=9.99,
            credits_monthly=10000,
            max_output_tokens=16000,
            allowed_models=["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-5-mini"],
            max_generations_per_day=30,
        ),
        SubscriptionPlanResponse(
            id=2,
            slug="pro",
            name="Pro",
            price_monthly=24.99,
            credits_monthly=35000,
            max_output_tokens=32000,
            allowed_models=["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-5-mini", "gpt-5", "codex"],
            max_generations_per_day=60,
        ),
        SubscriptionPlanResponse(
            id=3,
            slug="power",
            name="Power / Studio",
            price_monthly=49.99,
            credits_monthly=100000,
            max_output_tokens=64000,
            allowed_models=["all"],
            max_generations_per_day=120,
        ),
    ]

    try:
        async with SessionLocal() as db:
            result = await db.execute(
                select(SubscriptionPlan)
                .where(SubscriptionPlan.is_active == True)
                .order_by(SubscriptionPlan.price_monthly)
            )
            plans = result.scalars().all()
            if not plans:
                return default_plans

            return [
                SubscriptionPlanResponse(
                    id=p.id,
                    slug=p.slug,
                    name=p.name,
                    price_monthly=p.price_monthly,
                    credits_monthly=p.credits_monthly,
                    max_output_tokens=p.max_output_tokens,
                    allowed_models=p.allowed_models or [],
                    max_generations_per_day=p.max_generations_per_day,
                )
                for p in plans
            ]
    except Exception as exc:  # pragma: no cover - defensive fallback for prod
        # On any DB/schema error, fall back to hardcoded plans so UI keeps working.
        # (Optionally log exc in real telemetry)
        return default_plans


@router.post("/purchase", response_model=PurchaseResponse)
async def purchase_credits(req: PurchaseRequest, user=Depends(get_current_user)):
    """Initiate a credit purchase."""
    # Find package by slug or numeric id
    req_id = str(req.package_id)
    package = next((p for p in CREDIT_PACKAGES if str(p.id) == req_id or getattr(p, "slug", None) == req_id), None)
    # If not found in static list, try DB subscription plans as a dynamic package.
    if not package:
        async with SessionLocal() as db:
            result = await db.execute(
                select(SubscriptionPlan).where(
                    (SubscriptionPlan.slug == req_id) | (SubscriptionPlan.id == req.package_id)
                )
            )
            sp = result.scalar_one_or_none()
            if sp:
                package = CreditPackage(
                    id=sp.slug or str(sp.id),
                    name=sp.name,
                    credits=sp.credits_monthly,
                    price_cents=int(sp.price_monthly * 100),
                    price_display=f"€{sp.price_monthly}",
                    popular=False,
                    bonus_percent=0,
                )
    if not package:
        raise HTTPException(status_code=400, detail="Invalid package")
    
    payment_id = str(uuid.uuid4())
    
    # TEST MODE: allow instant completion without Stripe, for local development (127.0.0.1).
    if TEST_MODE:
        async with SessionLocal() as db:
            payment = Payment(
                id=payment_id,
                user_id=user["id"],
                provider="mock",
                amount_cents=package.credits,
                currency="EUR",
                status="completed",
                provider_ref="mock",
                raw={
                    "package_id": package.id,
                    "package_credits": package.credits,
                    "test_mode": True,
                },
                created_at=datetime.utcnow(),
                paid_at=datetime.utcnow(),
            )
            db.add(payment)
            db.add(CreditLedger(
                user_id=user["id"],
                kind="purchase",
                amount_cents=package.credits,
                ref_id=payment_id,
                created_at=datetime.utcnow(),
            ))
            await db.commit()

        return PurchaseResponse(
            payment_id=payment_id,
            checkout_url=None,
            status="completed",
        )

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    async with SessionLocal() as db:
        # Create payment record (pending)
        payment = Payment(
            id=payment_id,
            user_id=user["id"],
            provider="stripe",
            amount_cents=package.credits,
            currency="EUR",
            status="pending",
            provider_ref=None,
            raw={
                "package_id": package.id,
                "package_credits": package.credits,
                "package_name": package.name,
            },
            created_at=datetime.utcnow(),
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)

        try:
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                mode="payment",
                line_items=[
                    {
                        "price_data": {
                            "currency": "eur",
                            "product_data": {"name": package.name},
                            "unit_amount": package.price_cents,
                        },
                        "quantity": 1,
                    }
                ],
                success_url=f"{FRONTEND_URL}/credits?success=1&payment_id={payment_id}",
                cancel_url=f"{FRONTEND_URL}/credits?canceled=1",
                metadata={
                    "payment_id": payment_id,
                    "user_id": user["id"],
                    "package_id": package.id,
                    "package_credits": package.credits,
                },
            )
        except Exception as exc:
            stripe_logger.error("Stripe session creation failed", exc_info=exc)
            raise HTTPException(status_code=502, detail="Stripe session creation failed; see logs/stripe.log")

        payment.provider_ref = session.id
        await db.commit()

        return PurchaseResponse(
            payment_id=payment_id,
            checkout_url=session.url,
            status="pending",
        )


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Stripe webhook to finalize credit purchases."""
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=400, detail="Stripe webhook not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig_header, secret=STRIPE_WEBHOOK_SECRET
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {exc}")

    if event["type"] != "checkout.session.completed":
        return {"received": True}

    session = event["data"]["object"]
    provider_payment_id = session.get("id")
    metadata = session.get("metadata") or {}
    payment_id = metadata.get("payment_id")
    user_id = metadata.get("user_id")

    async with SessionLocal() as db:
        result = await db.execute(
            select(Payment).where(Payment.id == payment_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            # Create payment if missing to avoid losing credit.
            payment = Payment(
                id=payment_id or provider_payment_id,
                user_id=user_id or "unknown",
                provider="stripe",
                provider_ref=provider_payment_id,
                amount_cents=int(metadata.get("package_credits") or 0),
                currency=(session.get("currency") or "eur").upper(),
                status="completed",
                description="Stripe checkout (backfilled)",
                created_at=datetime.utcnow(),
                paid_at=datetime.utcnow(),
                raw=metadata,
            )
            db.add(payment)
        else:
            payment.status = "completed"
            payment.paid_at = datetime.utcnow()
            payment.provider_ref = provider_payment_id
            # merge metadata into raw
            merged = dict(payment.raw or {})
            merged.update(metadata or {})
            payment.raw = merged

        credits_to_add = int((payment.raw or {}).get("package_credits") or metadata.get("package_credits") or 0)
        if credits_to_add > 0:
            credit_entry = CreditLedger(
                user_id=payment.user_id,
                kind="purchase",
                amount_cents=credits_to_add,
                ref_id=payment.id,
                created_at=datetime.utcnow(),
            )
            db.add(credit_entry)

        await db.commit()

    return {"received": True}


@router.post("/purchase/{payment_id}/complete")
async def complete_purchase(payment_id: str, user=Depends(get_current_user)):
    """Complete a credit purchase (mock for demo, would be webhook in production)."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(Payment)
            .where(Payment.id == payment_id)
        )
        payment = result.scalar_one_or_none()

        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")

        credits_to_add = int((payment.raw or {}).get("package_credits") or 0)

        if payment.provider != "stripe" and payment.provider not in {"stripe", "mock"}:
            raise HTTPException(status_code=400, detail="Payment provider mismatch")

        if credits_to_add <= 0:
            raise HTTPException(status_code=400, detail="No credits to add for this payment")

        if payment.status != "completed":
            payment.status = "completed"
            payment.paid_at = datetime.utcnow()
            await db.commit()

        # Ensure credits exist in ledger (idempotent)
        existing = await db.execute(
            select(CreditLedger).where(
                CreditLedger.ref_id == payment_id,
                CreditLedger.user_id == payment.user_id,
                CreditLedger.kind == "purchase",
            )
        )
        entry = existing.scalar_one_or_none()
        if not entry:
            credit_entry = CreditLedger(
                user_id=payment.user_id,
                kind="purchase",
                amount_cents=credits_to_add,
                ref_id=payment_id,
                created_at=datetime.utcnow(),
            )
            db.add(credit_entry)
            await db.commit()

        return {
            "status": "completed",
            "credits_added": credits_to_add,
            "message": f"Successfully added {credits_to_add} credits!"
        }


@router.post("/add-demo-credits")
async def add_demo_credits(user=Depends(get_current_user)):
    """Add demo credits for testing (remove in production)."""
    if not TEST_MODE:
        raise HTTPException(status_code=403, detail="Demo credits only available in TEST_MODE")
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
