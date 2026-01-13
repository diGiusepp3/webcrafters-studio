# =========================
# /backend/services/ai_service.py
# =========================

import asyncio
import json
from typing import Any, Dict, Optional

from fastapi import HTTPException
from backend.core.config import get_openai_client
from backend.schemas.generate import ClarifyResponse

openai_client = get_openai_client()

# =========================
# UNIVERSAL SYSTEM PROMPT
# =========================
SYSTEM_PROMPT = """
You are an expert software architect, systems engineer, and platform specialist.

You MUST generate a COMPLETE, REAL, RUNNABLE software project.
This is NOT a demo, NOT a mock, NOT a sketch.

HARD RULES (ABSOLUTE):
- Output ONLY valid JSON. No markdown. No explanations.
- The project MUST run if the user follows the README.
- ALL required source files MUST be included.
- NEVER output placeholders like "TODO", "example", or "later".
- NEVER omit platform-critical files.
- NEVER guess the platform incorrectly.
- If the user requests Android → output a FULL Android Studio project.
- If the user requests iOS → output a FULL Xcode project.
- If the user requests desktop → choose a real desktop stack.
- If the user requests CLI → output a working CLI app.
- If the user requests backend → output a runnable backend.
- If the user requests fullstack → output frontend + backend.

SECURITY RULES:
- NO hardcoded secrets.
- Secrets MUST be read from environment variables.
- App MUST crash if required secrets are missing.
- NO default users, passwords, or tokens.
- ALL data MUST be user-scoped.

FAILURE POLICY:
- If requirements cannot be met → ask clarification questions.
- NEVER silently downgrade the project scope.

OUTPUT FORMAT:
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

Decide if clarification is required to produce a COMPLETE, RUNNABLE project.

Ask questions ONLY if:
- Target platform is ambiguous
- Distribution method is unclear
- Required hardware / OS is unclear

Ask MAXIMUM 3 questions.

Output:
{
  "needs_clarification": true/false,
  "questions": ["..."],
  "derived": {"notes":"optional"}
}
"""


def extract_last_user_text(conversation: str) -> str:
    if not conversation:
        return ""
    if "User:" in conversation:
        return conversation.split("User:")[-1].strip()
    return conversation.strip()


# =========================
# CLARIFY (FIXED & SAFE)
# =========================
async def clarify_with_ai(prompt: str, project_type: str) -> ClarifyResponse:
    last_user = extract_last_user_text(prompt)

    # Genoeg detail → geen clarificatie
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

Determine if clarification is REQUIRED to build a REAL runnable project.
"""

    def _call():
        return openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": CLARIFY_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
        )

    resp = await asyncio.to_thread(_call)
    content = resp.choices[0].message.content.strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
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

MANDATORY INTERPRETATION RULES:
- Determine the EXACT application type (mobile, desktop, cli, backend, firmware, web).
- Determine the TARGET PLATFORM (Android, iOS, Windows, Linux, macOS, cross-platform).
- Choose ONE correct language and framework.
- Output a FULL project for that platform.

FORBIDDEN:
- README-only projects
- Partial projects
- Backend without frontend if frontend is requested
- Web app when native app is requested

REQUIREMENTS:
- Include ALL build files
- Include ALL source files
- Include README.md with exact run/build steps

PROJECT TYPE HINT:
{pt}
"""


# =========================
# GENERATION
# =========================
async def generate_code_with_ai(
        prompt: str,
        project_type: str,
        preferences: Optional[Dict[str, Any]] = None,
) -> dict:

    user_msg = build_generation_user_message(prompt, project_type, preferences)

    def _call():
        return openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
        )

    response = await asyncio.to_thread(_call)
    content = response.choices[0].message.content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="AI output invalid JSON — generation rejected",
        )
