# FILE: backend/services/ai_service.py

import asyncio
import json
import re
from typing import Any, Dict, Optional

from fastapi import HTTPException

from backend.core.config import get_openai_client
from backend.repair.ai_repair import AIJSONError, _parse_ai_json as parse_ai_json
from backend.schemas.generate import ClarifyResponse
from backend.services.prompt_service import (
    build_clarify_system_prompt,
    build_generator_system_prompt,
    build_generator_user_prompt,
    build_reasoning_system_prompt,
    build_reasoning_user_prompt,
    build_final_reasoning_system_prompt,
    build_final_reasoning_user_prompt,
)

# Lazy initialization - only create client when needed
_openai_client = None


def get_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = get_openai_client()
    return _openai_client


# =========================
# JSON EXTRACTION (CRITICAL FIX)
# =========================
class InvalidAIJson(Exception):
    pass


def _extract_json(text: str) -> dict:
    if not text:
        raise InvalidAIJson("Empty AI response")

    t = text.strip()

    # 1) direct JSON
    try:
        return json.loads(t)
    except Exception:
        pass

    # 2) ```json fenced
    fence = re.search(r"```json\s*(\{.*?\})\s*```", t, re.S)
    if fence:
        try:
            return json.loads(fence.group(1))
        except Exception:
            pass

    # 3) first {...} block
    brace = re.search(r"(\{.*\})", t, re.S)
    if brace:
        try:
            return json.loads(brace.group(1))
        except Exception:
            pass

    raise InvalidAIJson("Could not extract valid JSON")


def _validate_generation_payload(data: dict):
    if not isinstance(data, dict):
        raise InvalidAIJson("Root is not object")

    if "files" not in data or not isinstance(data["files"], list):
        raise InvalidAIJson("Missing or invalid 'files' array")

    for f in data["files"]:
        if not isinstance(f, dict):
            raise InvalidAIJson("File entry is not object")
        for k in ("path", "content"):
            if k not in f or not isinstance(f[k], str) or not f[k].strip():
                raise InvalidAIJson(f"Invalid file field: {k}")


# =========================
# HELPERS
# =========================
def extract_last_user_text(conversation: str) -> str:
    if not conversation:
        return ""
    if "User:" in conversation:
        return conversation.split("User:")[-1].strip()
    return conversation.strip()


def build_generation_user_message(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_text: str = "",
) -> str:
    """Build the user prompt from a dedicated template file."""
    return build_generator_user_prompt(prompt, project_type, preferences, plan_text)


# =========================
# CLARIFY
# =========================
async def clarify_with_ai(prompt: str, project_type: str) -> ClarifyResponse:
    last_user = extract_last_user_text(prompt)

    if len(last_user.split()) >= 20:
        return ClarifyResponse(
            needs_clarification=False,
            questions=[],
            derived={"reason": "enough_detail"},
        )

    user_msg = f"""
Project type hint: {project_type}

Conversation:
{prompt}
"""

    clarify_system_prompt = build_clarify_system_prompt()

    def _call():
        return get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": clarify_system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
        )

    resp = await asyncio.to_thread(_call)
    raw = resp.choices[0].message.content.strip()

    try:
        data = _extract_json(raw)
    except InvalidAIJson:
        return ClarifyResponse(
            needs_clarification=False,
            questions=[],
            derived={"reason": "invalid_json"},
        )

    return ClarifyResponse(
        needs_clarification=bool(data.get("needs_clarification", False)),
        questions=list(data.get("questions") or []),
        derived=dict(data.get("derived") or {}),
    )


async def run_reasoning_agent(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    system_prompt = build_reasoning_system_prompt()
    user_msg = build_reasoning_user_prompt(prompt, project_type, preferences)

    def _call():
        return get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
        )

    response = await asyncio.to_thread(_call)
    raw = response.choices[0].message.content.strip()

    try:
        return _extract_json(raw)
    except InvalidAIJson as e:
        raise HTTPException(
            status_code=500,
            detail=f"Reasoning agent failed to return valid JSON.\n\nRAW OUTPUT:\n{raw[:4000]}",
        ) from e


async def run_final_reasoning_agent(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_summary: Optional[str] = "",
    plan_message: Optional[str] = "",
    files_count: int = 0,
    test_report: Optional[Dict[str, Any]] = None,
    security_stats: Optional[Dict[str, Any]] = None,
    preview_summary: Optional[Dict[str, Any]] = None,
    build_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    system_prompt = build_final_reasoning_system_prompt()
    user_msg = build_final_reasoning_user_prompt(
        prompt,
        project_type,
        preferences,
        plan_summary=plan_summary,
        plan_message=plan_message,
        files_count=files_count,
        test_report=test_report,
        security_stats=security_stats,
        preview_summary=preview_summary,
        build_result=build_result,
    )

    def _call():
        return get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
        )

    response = await asyncio.to_thread(_call)
    raw = response.choices[0].message.content.strip()

    try:
        return _extract_json(raw)
    except InvalidAIJson as e:
        raise HTTPException(
            status_code=500,
            detail=f"Final reasoning agent failed to return valid JSON.\n\nRAW OUTPUT:\n{raw[:4000]}",
        ) from e


# =========================
# GENERATION
# =========================
async def generate_code_with_ai(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_text: str = "",
) -> dict:
    generator_system_prompt = build_generator_system_prompt()
    user_msg = build_generation_user_message(prompt, project_type, preferences, plan_text)

    def _call():
        return get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": generator_system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
        )

    response = await asyncio.to_thread(_call)
    raw = response.choices[0].message.content.strip()

    try:
        return parse_ai_json(raw)
    except AIJSONError as e:
        # IMPORTANT: log raw output for debugging
        raise HTTPException(
            status_code=500,
            detail=f"AI output invalid JSON - generation rejected\n\nRAW OUTPUT:\n{raw[:8000]}",
        ) from e
