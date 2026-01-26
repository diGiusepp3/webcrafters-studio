import os
from typing import Set


DEV_USER_ENV_KEYS = [
    "DEV_USER_ID",
    "DEV_USER_CODEX",
    "DEV_USER_IDS",
]


def _parse_env_ids(raw: str) -> Set[str]:
    if not raw:
        return set()
    normalized = set()
    for token in raw.split(","):
        candidate = token.strip()
        if candidate:
            normalized.add(candidate)
    return normalized


def _load_dev_user_ids() -> Set[str]:
    tokens: Set[str] = set()
    for key in DEV_USER_ENV_KEYS:
        value = os.getenv(key, "")
        tokens.update(_parse_env_ids(value))
    return tokens


DEV_USER_IDS = _load_dev_user_ids()


def get_dev_user_ids() -> Set[str]:
    return set(DEV_USER_IDS)


def is_dev_user_id(user_id: str) -> bool:
    if not user_id:
        return False
    if not DEV_USER_IDS:
        return False
    return str(user_id).strip() in DEV_USER_IDS
