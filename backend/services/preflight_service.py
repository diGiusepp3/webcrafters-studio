from typing import Any, Dict, Optional
from backend.schemas.generate import ClarifyResponse

FRONTEND_HINTS = {"react", "vue", "svelte", "angular", "next", "nuxt", "html", "css", "tailwind", "vite", "browser", "frontend", "ui"}
BACKEND_HINTS = {"api", "fastapi", "flask", "django", "express", "node", "backend", "server", "db", "database", "mongodb", "mysql", "postgres", "auth"}
MOBILE_HINTS = {"android", "ios", "flutter", "react native", "expo", "maui"}
DESKTOP_HINTS = {"desktop", "electron", "tauri", "wpf", "winforms", "qt"}

DEFAULT_INDEX_HTML_CRA = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
"""

DEFAULT_INDEX_HTML_VITE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
"""

def _has_any(text: str, words: set) -> bool:
    t = (text or "").lower()
    return any(w in t for w in words)

def _safe_prefs(prefs: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return dict(prefs or {})

def preflight_analyze(prompt: str, project_type: str, preferences: Optional[Dict[str, Any]] = None) -> ClarifyResponse:
    prompt_l = (prompt or "").strip().lower()
    prefs = _safe_prefs(preferences)

    pt = (project_type or "any").lower().strip()
    if pt not in {"frontend", "backend", "fullstack", "any"}:
        pt = "any"

    mentions_front = _has_any(prompt_l, FRONTEND_HINTS)
    mentions_back = _has_any(prompt_l, BACKEND_HINTS)
    mentions_mobile = _has_any(prompt_l, MOBILE_HINTS)
    mentions_desktop = _has_any(prompt_l, DESKTOP_HINTS)

    platform_guess = prefs.get("platform")
    if not platform_guess:
        if mentions_mobile:
            platform_guess = "mobile"
        elif mentions_desktop:
            platform_guess = "desktop"
        else:
            platform_guess = "web"

    wants_ai = any(k in prompt_l for k in ["openai", "chatgpt", "gpt", "ai"])

    effective_project_type = pt
    effective_preferences = dict(prefs)

    if pt == "frontend":
        effective_preferences.setdefault("frontend_stack", "react-cra")
        if wants_ai:
            effective_project_type = "fullstack"
            effective_preferences.setdefault("backend_stack", "fastapi")
            effective_preferences.setdefault("database", "mysql")

    if pt == "backend":
        effective_preferences.setdefault("backend_stack", "fastapi")
        if effective_preferences.get("database") is None:
            effective_preferences["database"] = "mysql"

    if pt == "fullstack":
        effective_preferences.setdefault("frontend_stack", "react-cra")
        effective_preferences.setdefault("backend_stack", "fastapi")
        effective_preferences.setdefault("database", "mysql")

    if effective_project_type in {"backend", "fullstack"}:
        effective_preferences.setdefault("backend_port", 8000)

    if platform_guess == "web" and effective_project_type in {"frontend", "fullstack"}:
        frontend_stack = (effective_preferences.get("frontend_stack") or "").lower()
        required_files = effective_preferences.setdefault("required_files", {})
        if "vite" in frontend_stack:
            required_files.setdefault("frontend/index.html", DEFAULT_INDEX_HTML_VITE)
        else:
            required_files.setdefault("frontend/public/index.html", DEFAULT_INDEX_HTML_CRA)

    derived = {
        "project_type": pt,
        "platform_guess": platform_guess,
        "mentions_frontend": mentions_front,
        "mentions_backend": mentions_back,
        "mentions_mobile": mentions_mobile,
        "mentions_desktop": mentions_desktop,
        "wants_ai": wants_ai,
        "effective_project_type": effective_project_type,
        "effective_preferences": effective_preferences,
    }
    return ClarifyResponse(needs_clarification=False, questions=[], derived=derived)