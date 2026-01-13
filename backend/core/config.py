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

# ================== MYSQL ==================

MYSQL_HOST = env("MYSQL_HOST")
MYSQL_PORT = int(env("MYSQL_PORT"))
MYSQL_USER = env("MYSQL_USER")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD")
MYSQL_DB = env("MYSQL_DB")

def mysql_url() -> str:
    return (
        f"mysql+aiomysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
        f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}?charset=utf8mb4"
    )
