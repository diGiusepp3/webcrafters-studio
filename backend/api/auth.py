# FILE: backend/api/auth.py
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.models.user import User
from backend.schemas.auth import UserCreate, UserLogin, TokenResponse, UserResponse
from backend.services.auth_service import hash_password, verify_password, create_token
from backend.api.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()

    return TokenResponse(
        token=create_token(user_id, data.email),  # ✅ changed
        user=UserResponse(
            id=user_id,
            email=data.email,
            name=data.name,
            created_at=user.created_at.replace(tzinfo=timezone.utc).isoformat(),
        ),
    )

@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(
        token=create_token(user.id, user.email),  # ✅ changed
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=user.created_at.replace(tzinfo=timezone.utc).isoformat(),
        ),
    )

@router.get("/me", response_model=UserResponse)
async def auth_me(user=Depends(get_current_user)):
    return UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user["created_at"])
