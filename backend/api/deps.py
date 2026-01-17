# FILE: backend/api/deps.py

import jwt
from datetime import timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.config import JWT_SECRET, JWT_ALGORITHM
from backend.models.user import User

security = HTTPBearer(auto_error=False)

async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: AsyncSession = Depends(get_db),
):
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(
            credentials.credentials.strip(),
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        # ✅ FIX: jouw JWT gebruikt user_id (maar support ook sub)
        user_id = payload.get("user_id") or payload.get("sub") or payload.get("id")
        if not user_id or not isinstance(user_id, str):
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "created_at": user.created_at.replace(tzinfo=timezone.utc).isoformat(),
        }

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
