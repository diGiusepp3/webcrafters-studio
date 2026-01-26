# FILE: backend/services/modify_service.py
# AI-powered code modification service (PROPOSE + WHAT/WHERE/WHY metadata)

import asyncio
import json
from typing import Dict, Any, List, Optional

from backend.core.config import get_openai_client

# Lazy initialization
_openai_client = None


def _get_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = get_openai_client()
    return _openai_client


MODIFY_SYSTEM_PROMPT = """
You are an expert code modification assistant. Your job is to PROPOSE changes to an existing codebase based on user instructions.

CRITICAL OUTPUT RULES:
1) Output ONLY valid JSON. No explanations, no markdown.
2) Only include files that need to change.
3) For modify/create: include the COMPLETE new file content.
4) Preserve existing functionality unless explicitly asked to remove it.
5) Follow existing code style/patterns.
6) Provide clear WHAT/WHERE/WHY metadata for each change so a UI can show it to the user.

IMPORTANT:
- You do NOT apply anything. You only propose modifications.
- The UI will show an editor, so include enough structured info for a "change summary" panel.

OUTPUT FORMAT (must match exactly):
{
  "modifications": [
    {
      "action": "modify" | "create" | "delete",
      "path": "relative/path/to/file",
      "language": "javascript" | "python" | "html" | "css" | "json" | "text" | etc,

      "content": "FULL NEW FILE CONTENT (required for modify/create, omitted for delete)",

      "explanation": {
        "what": "What changed (1-2 sentences).",
        "where": "Where in the file (functions/components/sections).",
        "why": "Why this fixes the issue / matches the request."
      },

      "change_list": [
        "Bullet 1 (very specific, mention identifiers/lines/sections if possible)",
        "Bullet 2"
      ]
    }
  ],
  "summary": "One-paragraph summary across all files",
  "notes": [
    "Optional: important caveats or follow-ups"
  ]
}

If you cannot fulfill the request or need more information, return:
{
  "error": "Explanation of why the request cannot be fulfilled",
  "needs": [
    "Exact info you need from the user"
  ],
  "suggestions": [
    "Alternative approaches"
  ]
}
"""


def _infer_language_from_path(path: str) -> str:
    p = (path or "").lower()
    if p.endswith(".py"):
        return "python"
    if p.endswith(".js"):
        return "javascript"
    if p.endswith(".jsx"):
        return "javascript"
    if p.endswith(".ts"):
        return "typescript"
    if p.endswith(".tsx"):
        return "typescript"
    if p.endswith(".html"):
        return "html"
    if p.endswith(".css"):
        return "css"
    if p.endswith(".json"):
        return "json"
    if p.endswith(".md"):
        return "markdown"
    if p.endswith(".yml") or p.endswith(".yaml"):
        return "yaml"
    if p.endswith(".sh"):
        return "bash"
    return "text"


async def apply_modifications(
        instruction: str,
        current_files: List[Dict[str, str]],
        project_type: str,
        context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate AI-powered modification proposals for existing project files.

    Returns:
        Dict with "modifications" (proposal) OR "error"
    """

    # Build context about current files
    files_context = "\n\nCURRENT PROJECT FILES:\n"
    for f in current_files[:20]:  # Limit to 20 files to avoid token limits
        path = f.get("path") or ""
        lang = f.get("language") or _infer_language_from_path(path)
        files_context += f"\n--- {path} ({lang}) ---\n"
        # Include content preview (first 100 lines)
        content = f.get("content", "")
        lines = content.split("\n")[:100]
        files_context += "\n".join(lines)
        if len(content.split("\n")) > 100:
            files_context += "\n... (truncated)\n"

    current_file_hint = ""
    if context and context.get("current_file"):
        current_file_hint = f"\nCONTEXT: User is currently viewing file: {context.get('current_file')}\n"

    # Build user message
    user_msg = f"""
PROJECT TYPE: {project_type}

USER REQUEST:
{instruction}

{files_context}
{current_file_hint}

Task:
- Propose modifications as JSON only (no markdown).
- For each modification include explanation.what / explanation.where / explanation.why and a change_list.
"""

    def _call():
        return _get_client().chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": MODIFY_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=8000,
        )

    response = await asyncio.to_thread(_call)
    content = (response.choices[0].message.content or "").strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response", "raw_response": content[:500]}

    # Light normalization/guardrails so UI always has fields
    mods = data.get("modifications") or []
    for m in mods:
        if not m.get("language") and m.get("path"):
            m["language"] = _infer_language_from_path(m["path"])
        if "explanation" not in m or not isinstance(m["explanation"], dict):
            m["explanation"] = {"what": "", "where": "", "why": ""}
        else:
            m["explanation"].setdefault("what", "")
            m["explanation"].setdefault("where", "")
            m["explanation"].setdefault("why", "")
        if "change_list" not in m or not isinstance(m["change_list"], list):
            m["change_list"] = []

        action = (m.get("action") or "modify").lower()
        m["action"] = action

        # Ensure delete doesn't carry content; ensure modify/create has content
        if action == "delete":
            m.pop("content", None)
        elif action in ("modify", "create"):
            m.setdefault("content", "")

    data["modifications"] = mods
    data.setdefault("summary", "")
    if "notes" not in data or not isinstance(data["notes"], list):
        data["notes"] = []

    return data


async def generate_modification_chat(instruction: str, project_name: str) -> str:
    return f"Proposing modifications to {project_name}: {instruction[:100]}{'...' if len(instruction) > 100 else ''}"