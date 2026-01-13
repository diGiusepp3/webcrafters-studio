# backend/core/config.py
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from openai import OpenAI

# ================== ENV ==================

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / "backend/.env", override=True)

def env(*names: str, default: Optional[str] = None) -> str:
    for n in names:
        v = os.environ.get(n)
        if v is not None and str(v).strip() != "":
            return v
    if default is not None:
        return default
    raise KeyError(f"Missing required env var. Tried: {', '.join(names)}")

# ================== JWT ==================

JWT_SECRET = os.environ.get("JWT_SECRET", "default_secret_key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", "24"))

# ================== OPENAI ==================

def get_openai_client() -> OpenAI:
    """
    Lazy init: server mag starten zonder key.
    Alleen generation endpoints vereisen OPENAI_API_KEY.
    """
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not configured (.env).")
    return OpenAI(api_key=key)

# ================== DATABASE ==================
# Using SQLite for local development/preview environment

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_database_url() -> str:
    """Get database URL - supports SQLite or MySQL."""
    if DATABASE_URL:
        return DATABASE_URL
    
    # Check if MySQL is configured
    mysql_host = os.environ.get("MYSQL_HOST")
    if mysql_host and mysql_host != "127.0.0.1":
        mysql_port = int(os.environ.get("MYSQL_PORT", "3306"))
        mysql_user = os.environ.get("MYSQL_USER", "root")
        mysql_password = os.environ.get("MYSQL_PASSWORD", "")
        mysql_db = os.environ.get("MYSQL_DB", "webcrafters")
        return f"mysql+aiomysql://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_db}?charset=utf8mb4"
    
    # Default to SQLite
    db_path = ROOT_DIR / "backend" / "webcrafters.db"
    return f"sqlite+aiosqlite:///{db_path}"

# Legacy MySQL vars (for backward compatibility)
MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DB = os.environ.get("MYSQL_DB", "webcrafters")

def mysql_url() -> str:
    """Legacy function - now delegates to get_database_url()."""
    return get_database_url()
