# FILE: backend/services/ai_service.py

import asyncio
import json
import re
from typing import Any, Dict, Optional

from fastapi import HTTPException
from backend.core.config import get_openai_client
from backend.schemas.generate import ClarifyResponse

# Lazy initialization - only create client when needed
_openai_client = None

def get_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = get_openai_client()
    return _openai_client

# =========================
# UNIVERSAL SYSTEM PROMPT
# =========================
SYSTEM_PROMPT = """
You are an expert software architect, with a degree in website UI/UX, systems engineer AND senior product designer.

You MUST generate a COMPLETE, REAL, RUNNABLE AND CLIENT-READY software project.
This is NOT a demo, NOT a mock, NOT a sketch.

CORE RULE:
- Output ONLY valid JSON. No markdown. No explanations.
- Visual quality is one of the most important growing-points.
- Result should be "client-ready" without manual changes
- Use websites like Pexels, unsplash, gettyimages, or even openai to integrate images in the UI for nicer looks.
- Use consistent typography
- First impression must convince in <5 seconds

HARD UI REQUIREMENTS (FAIL IF MISSING):
- Tailwind CSS MUST be used
- A Hero section with IMAGE is REQUIRED
- A Feature Grid with ICONS or IMAGES is REQUIRED
- A Call-To-Action section is REQUIRED
- At least 3 external image URLs (Unsplash/Pexels) MUST be present
- No text-only pages allowed
- No base64 images allowed

HARD RULES
Every project MUST include a web-based UI that can be rendered in a browser.
If the core application is not web-based, a WebView wrapper MUST be provided.
Failure to include a web-renderable UI = invalid output.

OUTPUT FORMAT (STRICT):
{
  "name": "project-name",
  "description": "short description",
  "files": [
    {
      "path": "relative/path/to/file",
      "language": "kotlin | swift | python | javascript | rust | csharp | go | html | json | text | markdown",
      "content": "FULL FILE CONTENT"
    }
  ]
}
"""

# =========================
# CLARIFICATION PROMPT
# =========================
CLARIFY_SYSTEM_PROMPT = """
Return ONLY valid JSON.

Output:
{
  "needs_clarification": true/false,
  "questions": ["..."],
  "derived": {"notes":"optional"}
}
"""


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

    def _call():
        return get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": CLARIFY_SYSTEM_PROMPT},
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


# =========================
# USER MESSAGE BUILDER
# =========================
def build_generation_user_message(
        prompt: str,
        project_type: str,
        preferences: Optional[Dict[str, Any]] = None,
) -> str:
    pt = (project_type or "").lower().strip()

    return f"""
USER REQUEST:
{prompt}

PROJECT TYPE HINT:
{pt}

RULES:
- Output FULL runnable project
- Include ALL files
- Include README.md
"""


# =========================
# GENERATION (FIXED)
# =========================
async def generate_code_with_ai(
        prompt: str,
        project_type: str,
        preferences: Optional[Dict[str, Any]] = None,
) -> dict:

    user_msg = build_generation_user_message(prompt, project_type, preferences)

    def _call():
        return get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
        )

    response = await asyncio.to_thread(_call)
    raw = response.choices[0].message.content.strip()

    try:
        data = _extract_json(raw)
        _validate_generation_payload(data)
        return data
    except InvalidAIJson as e:
        # IMPORTANT: log raw output for debugging
        raise HTTPException(
            status_code=500,
            detail=f"AI output invalid JSON — generation rejected\n\nRAW OUTPUT:\n{raw[:8000]}",
        ) from e
