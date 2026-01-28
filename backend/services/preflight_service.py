# FILE: backend/services/preflight_service.py

from typing import Any, Dict, Optional

from backend.schemas.generate import ClarifyResponse

FRONTEND_HINTS = {"react", "vue", "svelte", "angular", "next", "nuxt", "html", "css", "tailwind", "vite", "browser", "frontend", "ui"}
BACKEND_HINTS = {"api", "fastapi", "flask", "django", "express", "node", "backend", "server", "db", "database", "mongodb", "mysql", "postgres", "auth"}
MOBILE_HINTS = {"android", "ios", "flutter", "react native", "expo", "maui"}
CLI_HINTS = {"cli", "command line", "terminal", "argparse", "click", "typer", "commander"}
DESKTOP_HINTS = {"desktop", "electron", "tauri", "wpf", "winforms", "qt"}

# Website structure and "WOW in 5 seconds" requirements passed to the generator
SITE_REQUIREMENTS: Dict[str, Any] = {
    "wow_in_first_viewport": True,
    "dark_mode_default": True,
    "tailwind_required": True,
    "minimum_external_images": 3,
    "required_sections": [
        "header",
        "hero",
        "features",
        "social_proof",
        "cta",
        "footer",
    ],
    "quality_checks": [
        "navigation_links_target_real_sections",
        "clear_primary_cta_visible_above_fold",
        "consistent_spacing_and_alignment",
        "hover_and_focus_states_on_interactive_elements",
    ],
}

DEFAULT_INDEX_HTML_SEO = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>{{APP_NAME}}</title>
    <meta name="description" content="{{APP_DESCRIPTION}}" />
    <meta name="theme-color" content="#0ea5e9" />

    <!-- Canonical -->
    <link rel="canonical" href="{{APP_URL}}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{{APP_NAME}}" />
    <meta property="og:description" content="{{APP_DESCRIPTION}}" />
    <meta property="og:url" content="{{APP_URL}}" />
    <meta property="og:image" content="https://images.unsplash.com/photo-1522202176988-66273c2fd55f" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{{APP_NAME}}" />
    <meta name="twitter:description" content="{{APP_DESCRIPTION}}" />
    <meta name="twitter:image" content="https://images.unsplash.com/photo-1522202176988-66273c2fd55f" />
  </head>
  <body>
    <noscript>This application requires JavaScript.</noscript>
    <div id="root"></div>
  </body>
</html>
"""

DEFAULT_VITE_INDEX_HTML_SEO = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>{{APP_NAME}}</title>
    <meta name="description" content="{{APP_DESCRIPTION}}" />
    <meta name="theme-color" content="#0ea5e9" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{{APP_NAME}}" />
    <meta property="og:description" content="{{APP_DESCRIPTION}}" />
    <meta property="og:image" content="https://images.unsplash.com/photo-1522202176988-66273c2fd55f" />
  </head>
  <body>
    <noscript>This application requires JavaScript.</noscript>
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
    if pt not in {"frontend", "backend", "fullstack", "mobile", "cli", "any"}:
        pt = "any"

    mentions_front = _has_any(prompt_l, FRONTEND_HINTS)
    mentions_back = _has_any(prompt_l, BACKEND_HINTS)
    mentions_mobile = _has_any(prompt_l, MOBILE_HINTS)
    mentions_cli = _has_any(prompt_l, CLI_HINTS)
    mentions_desktop = _has_any(prompt_l, DESKTOP_HINTS)

    # Platform guess is used for UI hints and defaults. Do not force web for non-web projects.
    platform_guess = "web"
    if pt == "mobile" or mentions_mobile:
        platform_guess = "mobile"
    elif pt == "cli" or mentions_cli:
        platform_guess = "cli"
    elif mentions_desktop:
        platform_guess = "desktop"

    wants_ai = any(k in prompt_l for k in ["openai", "chatgpt", "gpt", "ai"])

    effective_project_type = pt
    effective_preferences = dict(prefs)

    # Defaults tuned for preview reliability and strong frontend results
    effective_preferences.setdefault("frontend_stack", "react-vite")
    effective_preferences.setdefault("backend_stack", "fastapi")
    # Default to sqlite for local reliability; generator can still add mysql/postgres wiring if requested.
    effective_preferences.setdefault("database", "sqlite")
    effective_preferences.setdefault("backend_port", 8000)
    effective_preferences.setdefault("site_requirements", dict(SITE_REQUIREMENTS))

    # If user asked for AI features in a frontend-only request, we usually need a backend too.
    if pt == "frontend":
        if wants_ai:
            effective_project_type = "fullstack"

    # Enforce a valid web entrypoint only for web builds.
    if effective_project_type in {"frontend", "fullstack"}:
        required_files = effective_preferences.setdefault("required_files", {})
        # Prefer Vite-friendly index.html at frontend/ root. If the generator chooses CRA, it can still add public/index.html.
        required_files.setdefault(
            "frontend/index.html",
            DEFAULT_VITE_INDEX_HTML_SEO,
        )

    derived = {
        "project_type": pt,
        "platform_guess": platform_guess,
        "mentions_frontend": mentions_front,
        "mentions_backend": mentions_back,
        "mentions_mobile": mentions_mobile,
        "mentions_cli": mentions_cli,
        "mentions_desktop": mentions_desktop,
        "wants_ai": wants_ai,
        "effective_project_type": effective_project_type,
        "effective_preferences": effective_preferences,
        "seo_enforced": effective_project_type in {"frontend", "fullstack"},
    }

    return ClarifyResponse(needs_clarification=False, questions=[], derived=derived)
