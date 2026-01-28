# FILE: backend/services/openai_model_service.py
#
# Central place for model routing by stage. This keeps "plan vs code" decisions
# consistent across agents/services and avoids scattered env parsing.

from __future__ import annotations

import os


def normalize_model_name(value: str) -> str:
    v = (value or "").strip()
    # Accept common shorthand used in team chat/config.
    if v == "4o":
        return "gpt-4o"
    return v


def model_from_env(env_name: str, default: str) -> str:
    value = os.getenv(env_name, "").strip()
    if not value:
        return default
    return normalize_model_name(value)


DEFAULT_MODEL = normalize_model_name(os.getenv("OPENAI_DEFAULT_MODEL", "gpt-4.1-mini"))

# Stage routing used by /api/generate.
CLARIFY_MODEL = model_from_env("OPENAI_CLARIFY_MODEL", DEFAULT_MODEL)
PLAN_MODEL = model_from_env("OPENAI_PLAN_MODEL", DEFAULT_MODEL)
CODE_MODEL = model_from_env("OPENAI_CODE_MODEL", DEFAULT_MODEL)
FINAL_MODEL = model_from_env("OPENAI_FINAL_MODEL", PLAN_MODEL)

# Other AI-assisted subsystems.
REPAIR_MODEL = model_from_env("OPENAI_REPAIR_MODEL", CODE_MODEL)
MODIFY_MODEL = model_from_env("OPENAI_MODIFY_MODEL", CODE_MODEL)
DEV_ASSISTANT_MODEL = model_from_env("DEV_ASSISTANT_MODEL", DEFAULT_MODEL)

