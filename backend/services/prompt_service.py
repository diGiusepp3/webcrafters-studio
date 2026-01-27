# FILE: backend/services/prompt_service.py

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

from backend.services.claude_rule_service import build_claude_rules_summary

REPO_ROOT = Path(__file__).resolve().parents[2]
PROMPTS_DIR = REPO_ROOT / "backend" / "prompts"
DESIGN_GUIDELINES_PATH = REPO_ROOT / "design_guidelines.json"


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _safe_get(d: Dict[str, Any], *keys: str, default: Any = "") -> Any:
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
    return cur if cur not in (None, "") else default


@lru_cache(maxsize=1)
def load_design_guidelines() -> Dict[str, Any]:
    if not DESIGN_GUIDELINES_PATH.exists():
        return {}
    try:
        return json.loads(DESIGN_GUIDELINES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _format_design_guidelines_summary(guidelines: Dict[str, Any]) -> str:
    ds = guidelines.get("design_system") or {}

    identity_name = _safe_get(ds, "identity", "name", default="Webcrafters Studio")
    vibe = _safe_get(ds, "identity", "vibe", default="High-end, modern, developer-focused")

    headings_font = _safe_get(ds, "typography", "fonts", "headings", "family", default="Outfit, sans-serif")
    body_font = _safe_get(ds, "typography", "fonts", "body", "family", default="Manrope, sans-serif")
    code_font = _safe_get(ds, "typography", "fonts", "code", "family", default="JetBrains Mono, monospace")

    bg_default = _safe_get(ds, "colors", "palette", "background", "default", default="#030712")
    bg_paper = _safe_get(ds, "colors", "palette", "background", "paper", default="#0f172a")
    primary_main = _safe_get(ds, "colors", "palette", "primary", "main", default="#06b6d4")
    secondary_main = _safe_get(ds, "colors", "palette", "secondary", "main", default="#8b5cf6")
    text_primary = _safe_get(ds, "colors", "palette", "text", "primary", default="#f8fafc")
    text_secondary = _safe_get(ds, "colors", "palette", "text", "secondary", default="#94a3b8")

    hero_gradient = _safe_get(ds, "colors", "gradients", "hero", default="linear-gradient(to right, #06b6d4, #8b5cf6)")

    containers_marketing = _safe_get(ds, "layout", "containers", "marketing", default="max-w-7xl mx-auto px-6")

    cards_classes = _safe_get(ds, "components", "cards", "classes", default="bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl")
    buttons_primary = _safe_get(ds, "components", "buttons", "primary", default="bg-primary text-black font-bold")

    universal_guidelines = ds.get("universal_guidelines") or []
    universal_lines = "\n".join(f"- {line}" for line in universal_guidelines[:12])

    assets = ds.get("assets") or {}
    images = assets.get("images") or {}
    hero_image = _safe_get(images, "hero_background", "url", default="")
    dev_image = _safe_get(images, "developer_working", "url", default="")
    code_image = _safe_get(images, "code_screen", "url", default="")

    return f"""
DESIGN SYSTEM: {identity_name}
VIBE: {vibe}

TYPOGRAPHY:
- Headings font: {headings_font}
- Body font: {body_font}
- Code font: {code_font}

COLORS (Tailwind theme or CSS variables):
- Background default: {bg_default}
- Background paper: {bg_paper}
- Primary: {primary_main}
- Secondary: {secondary_main}
- Text primary: {text_primary}
- Text secondary: {text_secondary}
- Hero gradient: {hero_gradient}

LAYOUT:
- Marketing container: {containers_marketing}

COMPONENT STYLING HINTS:
- Cards: {cards_classes}
- Primary buttons: {buttons_primary}

PREFERRED ASSET URLS (use as hero/section imagery when appropriate):
- Hero background: {hero_image}
- Developer working: {dev_image}
- Code screen: {code_image}

UNIVERSAL GUIDELINES:
{universal_lines}
""".strip()


@lru_cache(maxsize=1)
def get_design_guidelines_summary() -> str:
    guidelines = load_design_guidelines()
    if not guidelines:
        return "Design guidelines unavailable. Default to a high-end dark theme with neon accents."
    return _format_design_guidelines_summary(guidelines)


def _get_claude_rules_summary() -> str:
    rules = build_claude_rules_summary()
    if not rules:
        return "Claude helper rules unavailable. Default to our internal guardrails."
    return rules


def _load_prompt_template(filename: str) -> str:
    path = PROMPTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Prompt template not found: {path}")
    return _read_text(path)


def _render_template(template: str, values: Dict[str, str]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", value)
    return rendered


@lru_cache(maxsize=1)
def build_generator_system_prompt() -> str:
    template = _load_prompt_template("generator_system_prompt.txt")
    return _render_template(
        template,
        {
            "DESIGN_GUIDELINES_SUMMARY": get_design_guidelines_summary(),
            "CLAUDE_RULES_SUMMARY": _get_claude_rules_summary(),
        },
    )


@lru_cache(maxsize=1)
def build_reasoning_system_prompt() -> str:
    template = _load_prompt_template("reasoning_system_prompt.txt")
    return _render_template(
        template,
        {
            "DESIGN_GUIDELINES_SUMMARY": get_design_guidelines_summary(),
            "CLAUDE_RULES_SUMMARY": _get_claude_rules_summary(),
        },
    )


def build_reasoning_user_prompt(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
) -> str:
    template = _load_prompt_template("reasoning_user_prompt.txt")
    prefs_text = json.dumps(preferences or {}, indent=2, ensure_ascii=False)
    return _render_template(
        template,
        {
            "USER_PROMPT": (prompt or "").strip(),
            "PROJECT_TYPE": (project_type or "").strip().lower(),
            "PREFERENCES_JSON": prefs_text,
            "CLAUDE_RULES_SUMMARY": _get_claude_rules_summary(),
        },
    )


@lru_cache(maxsize=1)
def build_clarify_system_prompt() -> str:
    return _load_prompt_template("clarify_system_prompt.txt")


def build_generator_user_prompt(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_text: str = "",
) -> str:
    template = _load_prompt_template("generator_user_prompt.txt")
    prefs_text = json.dumps(preferences or {}, indent=2, ensure_ascii=False)

    return _render_template(
        template,
        {
            "USER_PROMPT": (prompt or "").strip(),
            "PROJECT_TYPE": (project_type or "").strip().lower(),
            "PREFERENCES_JSON": prefs_text,
            "PLAN_TEXT": (plan_text or "").strip(),
        },
    )


@lru_cache(maxsize=1)
def build_final_reasoning_system_prompt() -> str:
    template = _load_prompt_template("final_reasoning_system_prompt.txt")
    return _render_template(
        template,
        {
            "DESIGN_GUIDELINES_SUMMARY": get_design_guidelines_summary(),
            "CLAUDE_RULES_SUMMARY": _get_claude_rules_summary(),
        },
    )


def build_final_reasoning_user_prompt(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_summary: Optional[str] = "",
    plan_message: Optional[str] = "",
    files_count: Optional[int] = 0,
    test_report: Optional[Dict[str, Any]] = None,
    security_stats: Optional[Dict[str, Any]] = None,
    preview_summary: Optional[Dict[str, Any]] = None,
    build_result: Optional[Dict[str, Any]] = None,
) -> str:
    template = _load_prompt_template("final_reasoning_user_prompt.txt")
    prefs_text = json.dumps(preferences or {}, indent=2, ensure_ascii=False)
    test_text = json.dumps(test_report or {}, indent=2, ensure_ascii=False)
    security_text = json.dumps(security_stats or {}, indent=2, ensure_ascii=False)
    preview_text = json.dumps(preview_summary or {}, indent=2, ensure_ascii=False)
    build_text = json.dumps(build_result or {}, indent=2, ensure_ascii=False)

    return _render_template(
        template,
        {
            "USER_PROMPT": (prompt or "").strip(),
            "PROJECT_TYPE": (project_type or "").strip().lower(),
            "PREFERENCES_JSON": prefs_text,
            "PLAN_SUMMARY": (plan_summary or "").strip(),
            "PLAN_MESSAGE": (plan_message or "").strip(),
            "FILES_COUNT": str(files_count or 0),
            "TEST_JSON": test_text,
            "SECURITY_JSON": security_text,
            "PREVIEW_JSON": preview_text,
            "BUILD_RESULT_JSON": build_text,
            "DESIGN_GUIDELINES_SUMMARY": get_design_guidelines_summary(),
            "CLAUDE_RULES_SUMMARY": _get_claude_rules_summary(),
        },
    )
