# FILE: backend/services/encryption_service.py
import os
from cryptography.fernet import Fernet

_ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")


def _get_fernet() -> Fernet:
    if not _ENCRYPTION_KEY:
        raise RuntimeError("ENCRYPTION_KEY not configured in environment")
    return Fernet(_ENCRYPTION_KEY.encode())


def encrypt_token(token: str) -> str:
    """Encrypt a token for storage."""
    f = _get_fernet()
    return f.encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    """Decrypt a stored token."""
    f = _get_fernet()
    return f.decrypt(encrypted.encode()).decode()
