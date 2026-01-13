# backend/db.py
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

def _mysql_url() -> str:
    host = os.getenv("MYSQL_HOST")
    port = int(os.getenv("MYSQL_PORT"))
    user = os.getenv("MYSQL_USER")
    pwd = os.getenv("MYSQL_PASSWORD")
    db = os.getenv("MYSQL_DB")
    return f"mysql+asyncmy://{user}:{pwd}@{host}:{port}/{db}?charset=utf8mb4"

engine = create_async_engine(
    _mysql_url(),
    pool_pre_ping=True,
    pool_recycle=3600,
)

SessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as session:
        yield session
