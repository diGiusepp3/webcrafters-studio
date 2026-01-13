# backend/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from backend.core.config import get_database_url

db_url = get_database_url()

# Configure engine based on database type
if "sqlite" in db_url:
    engine = create_async_engine(
        db_url,
        echo=False,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_async_engine(
        db_url,
        pool_pre_ping=True,
        pool_recycle=3600
    )

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as session:
        yield session
