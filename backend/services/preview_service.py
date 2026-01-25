# FILE: backend/services/preview_service.py
"""
Preview Service (production-friendly)
- Writes project files into PREVIEW_ROOT/<preview_id>/
- DOES NOT build automatically after create (build only on explicit click)
- Prefers AI/Generator build-manifest (framework/root/out_dir) over guessing
- Verifies manifest against filesystem; falls back to detection if invalid
- Publishes built output into PREVIEW_ROOT/<preview_id>/.serve/
- After ready -> render -> screenshots (desktop+mobile) via Playwright
"""

import asyncio
import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.services.screenshot_service import generate_screenshots

PREVIEW_PATH_PREFIX = "/api/projects/preview"

PREVIEW_ROOT = Path(os.environ.get("PREVIEW_ROOT", "/tmp/previews"))
PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)

STATUS_FILE = "status.json"
LOG_FILE = "build.log"
SERVE_DIRNAME = ".serve"
META_FILE = ".preview_meta.json"

# AI/Generator can drop one of these files in the project root
BUILD_MANIFEST_CANDIDATES = [
    "webcrafters.build.json",
    ".webcrafters.build.json",
    "build.manifest.json",
]

MAX_LOG_BYTES_DEFAULT = int(os.environ.get("PREVIEW_MAX_LOG_BYTES", "12000"))

INSTALL_TIMEOUT_SECONDS = int(os.environ.get("PREVIEW_INSTALL_TIMEOUT_SECONDS", "900"))  # 15 min
BUILD_TIMEOUT_SECONDS = int(os.environ.get("PREVIEW_BUILD_TIMEOUT_SECONDS", "1200"))     # 20 min

# Prevent multiple simultaneous builds per preview_id
_BUILD_LOCKS: Dict[str, threading.Lock] = {}


class PreviewError(Exception):
    pass


# ----------------------------
# Disk helpers
# ----------------------------
def _status_path(preview_dir: Path) -> Path:
    return preview_dir / STATUS_FILE


def _log_path(preview_dir: Path) -> Path:
    return preview_dir / LOG_FILE


def _serve_dir(preview_dir: Path) -> Path:
    return preview_dir / SERVE_DIRNAME


def _meta_path(preview_dir: Path) -> Path:
    return preview_dir / META_FILE


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _append_log(preview_dir: Path, line: str) -> None:
    lp = _log_path(preview_dir)
    lp.parent.mkdir(parents=True, exist_ok=True)
    with lp.open("a", encoding="utf-8", errors="replace") as f:
        f.write(line)
        if not line.endswith("\n"):
            f.write("\n")

    # truncate log
    try:
        b = lp.read_bytes()
        if len(b) > MAX_LOG_BYTES_DEFAULT:
            lp.write_bytes(b[-MAX_LOG_BYTES_DEFAULT :])
    except Exception:
        pass


def _log_section(preview_dir: Path, title: str, lines: List[str]) -> None:
    _append_log(preview_dir, "")
    _append_log(preview_dir, f"== {title} ==")
    for l in lines:
        _append_log(preview_dir, l)


def _write_status(
        preview_dir: Path,
        status: str,
        detected_type: str,
        error: Optional[str] = None,
        serve_root: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
        screenshots: Optional[Dict[str, Any]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "status": status,  # created | queued | building | ready | failed
        "detected_type": detected_type,  # js:... | python | php | static | unknown | manifest:...
        "error": error,
        "serve_root": serve_root,  # ".serve" when built/published, else None
        "updated_at": int(time.time()),
    }
    if analysis is not None:
        payload["analysis"] = analysis
    if screenshots is not None:
        payload["screenshots"] = screenshots
    _write_json(_status_path(preview_dir), payload)


def read_status(preview_id: str) -> Dict[str, Any]:
    preview_dir = PREVIEW_ROOT / preview_id
    if not preview_dir.exists():
        return {"status": "missing", "error": "Preview not found"}
    data = _read_json(_status_path(preview_dir))
    if not data:
        return {"status": "unknown", "error": "Status not available"}
    return data


def tail_logs(preview_id: str, max_bytes: int = MAX_LOG_BYTES_DEFAULT) -> str:
    preview_dir = PREVIEW_ROOT / preview_id
    lp = _log_path(preview_dir)
    if not preview_dir.exists() or not lp.exists():
        return ""
    b = lp.read_bytes()
    if len(b) > max_bytes:
        b = b[-max_bytes:]
    return b.decode("utf-8", errors="replace")


def _meta_add_event(meta: Dict[str, Any], s: str) -> None:
    meta.setdefault("agent_events", [])
    meta["agent_events"].append(s)


def _persist_meta(preview_dir: Path, meta: Dict[str, Any]) -> None:
    _write_json(_meta_path(preview_dir), meta)


def _ensure_lock(preview_id: str) -> threading.Lock:
    if preview_id not in _BUILD_LOCKS:
        _BUILD_LOCKS[preview_id] = threading.Lock()
    return _BUILD_LOCKS[preview_id]


# ----------------------------
# Screenshot helpers
# ----------------------------
def _render_base_url() -> str:
    base = (os.environ.get("PREVIEW_RENDER_BASE_URL") or "").strip().rstrip("/")
    return base if base else "http://127.0.0.1:8000"


def _preview_public_url(preview_id: str) -> str:
    # NOTE: keep trailing slash for client-side routers
    return f"{_render_base_url()}{PREVIEW_PATH_PREFIX}/{preview_id}/"


def _run_screenshots(preview_id: str, detected_type: str, analysis: Dict[str, Any]) -> None:
    preview_dir = PREVIEW_ROOT / preview_id
    meta = _read_json(_meta_path(preview_dir)) or {"status": "ready", "agent_events": [], "analysis": analysis}

    try:
        url = _preview_public_url(preview_id)
        _meta_add_event(meta, "Rendering preview in headless browser…")
        _persist_meta(preview_dir, meta)

        _append_log(preview_dir, "== screenshots ==")
        _append_log(preview_dir, f"render_url={url}")

        shots = asyncio.run(generate_screenshots(url, preview_dir))

        meta["screenshots"] = {"desktop": shots.get("desktop"), "mobile": shots.get("mobile")}
        meta["runtime"] = {
            "page_errors": shots.get("page_errors") or [],
            "console": shots.get("console") or [],
            "request_failed": shots.get("request_failed") or [],
        }

        runtime_errors = []
        if meta["runtime"]["page_errors"]:
            runtime_errors.append(f"page_errors={len(meta['runtime']['page_errors'])}")
        if meta["runtime"]["request_failed"]:
            runtime_errors.append(f"request_failed={len(meta['runtime']['request_failed'])}")

        if runtime_errors:
            _meta_add_event(meta, "Runtime errors detected in preview render: " + ", ".join(runtime_errors))
        else:
            _meta_add_event(meta, "Screenshots captured (desktop + mobile).")

        _persist_meta(preview_dir, meta)

        current = _read_json(_status_path(preview_dir)) or {}
        _write_status(
            preview_dir,
            "ready",
            detected_type,
            error=None if not runtime_errors else ("runtime_errors: " + ", ".join(runtime_errors)),
            serve_root=current.get("serve_root"),
            analysis=analysis,
            screenshots={
                "desktop": shots.get("desktop"),
                "mobile": shots.get("mobile"),
                "page_errors": meta["runtime"]["page_errors"],
                "console": meta["runtime"]["console"],
                "request_failed": meta["runtime"]["request_failed"],
            },
        )

    except Exception as e:
        _meta_add_event(meta, f"Screenshot job failed: {e}")
        meta["screenshot_error"] = str(e)
        _persist_meta(preview_dir, meta)
        _append_log(preview_dir, f"!! SCREENSHOTS FAILED: {e}")

        current = _read_json(_status_path(preview_dir)) or {}
        _write_status(
            preview_dir,
            "ready",
            detected_type,
            error=f"screenshots_failed: {e}",
            serve_root=current.get("serve_root"),
            analysis=analysis,
            screenshots=meta.get("screenshots"),
        )


# ----------------------------
# Manifest helpers (AI tells server) + verification
# ----------------------------
def _find_manifest_path(preview_dir: Path) -> Optional[Path]:
    for name in BUILD_MANIFEST_CANDIDATES:
        p = preview_dir / name
        if p.exists():
            return p
    return None


def _read_build_manifest(preview_dir: Path) -> Optional[Dict[str, Any]]:
    mp = _find_manifest_path(preview_dir)
    if not mp:
        return None
    data = _read_json(mp)
    if not isinstance(data, dict):
        return None
    data["_manifest_path"] = str(mp.relative_to(preview_dir))
    return data


def _verify_manifest(preview_dir: Path, m: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Expected example:
      {
        "kind": "js",
        "web_root": "frontend",
        "framework": "vite" | "cra" | "next" | ...,
        "package_manager": "npm" | "pnpm" | "yarn",
        "out_dir": "dist"
      }
    """
    kind = str(m.get("kind") or "").strip().lower()
    if kind and kind not in ("js", "python", "php", "static", "unknown"):
        return False, f"manifest kind invalid: {kind}"

    if kind == "js":
        web_root = str(m.get("web_root") or "").strip().strip("/")
        if not web_root:
            return False, "manifest.web_root missing"
        wr = preview_dir / web_root
        if not wr.exists():
            return False, f"manifest web_root not found: {web_root}"
        if not (wr / "package.json").exists():
            return False, f"manifest web_root has no package.json: {web_root}"
        out_dir = str(m.get("out_dir") or "").strip().strip("/")
        if out_dir:
            od = wr / out_dir
            # not required at create-time, only after build, so don't hard-fail here
            if od.exists() and not od.is_dir():
                return False, f"manifest out_dir invalid (not dir): {out_dir}"

    return True, "ok"


def _apply_manifest_to_analysis(preview_dir: Path, analysis: Dict[str, Any]) -> Dict[str, Any]:
    m = _read_build_manifest(preview_dir)
    if not m:
        analysis["manifest_used"] = False
        return analysis

    ok, reason = _verify_manifest(preview_dir, m)
    analysis["manifest_found"] = True
    analysis["manifest_path"] = m.get("_manifest_path")
    analysis["manifest_ok"] = ok
    analysis["manifest_reason"] = reason

    if not ok:
        analysis["manifest_used"] = False
        return analysis

    kind = str(m.get("kind") or "").strip().lower() or (analysis.get("kind") or "unknown")

    if kind == "js":
        analysis["kind"] = "js"
        analysis["web_root"] = str(m.get("web_root") or "").strip().strip("/")
        analysis["flavor"] = (str(m.get("framework") or "").strip().lower() or "unknown")
        analysis["package_manager"] = (str(m.get("package_manager") or "").strip().lower() or analysis.get("package_manager"))
        out_dir = str(m.get("out_dir") or "").strip().strip("/") or None

        analysis["has_package_json"] = True
        analysis["buildable"] = True
        analysis["out_dir_candidates"] = ([out_dir] if out_dir else []) + (analysis.get("out_dir_candidates") or [])
        analysis.setdefault("why", [])
        analysis["why"].append("manifest override: js build forced")
        analysis["manifest_used"] = True
        return analysis

    # Other kinds: hint only
    analysis["manifest_used"] = True
    analysis.setdefault("why", [])
    analysis["why"].append(f"manifest present: kind={kind}")
    return analysis


# ----------------------------
# File writing + detection
# ----------------------------
def write_files(preview_dir: Path, files: List[Dict[str, Any]]) -> None:
    for f in files:
        rel_path = (f.get("path") or "").lstrip("/")
        if not rel_path:
            continue
        target = preview_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f.get("content", "") or "", encoding="utf-8")


def _list_lower_paths(files: List[Dict[str, Any]]) -> List[str]:
    return [str((f.get("path") or "")).replace("\\", "/").lower() for f in files if f.get("path")]


def _detect_entry_candidates(paths_lower: List[str]) -> Dict[str, List[str]]:
    js_entries: List[str] = []
    css_entries: List[str] = []

    for c in [
        "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
        "src/index.tsx", "src/index.jsx", "src/index.ts", "src/index.js",
        "main.tsx", "main.jsx", "main.ts", "main.js",
        "index.js",
    ]:
        if c in paths_lower:
            js_entries.append(c)

    for c in ["src/index.css", "src/main.css", "src/style.css", "index.css", "style.css"]:
        if c in paths_lower:
            css_entries.append(c)

    return {"js": js_entries, "css": css_entries}


def _detect_python_flavor(paths_lower: List[str]) -> Optional[str]:
    if any(p.endswith("pyproject.toml") for p in paths_lower):
        return "python"
    if any(p.endswith("requirements.txt") for p in paths_lower):
        return "python"
    if any(p.endswith(".py") for p in paths_lower):
        return "python"
    return None


def _detect_php(paths_lower: List[str]) -> bool:
    return any(p.endswith(".php") for p in paths_lower)


def _detect_static(paths_lower: List[str]) -> bool:
    return any(p.endswith("index.html") for p in paths_lower) or any(p.endswith(".html") for p in paths_lower)


def _find_web_root(preview_dir: Path) -> Path:
    for name in ("web", "frontend", "client", "app"):
        p = preview_dir / name
        if (p / "package.json").exists():
            return p
    return preview_dir


def _read_pkg_from_preview(preview_dir: Path) -> Optional[Dict[str, Any]]:
    web_root = _find_web_root(preview_dir)
    pkg_path = web_root / "package.json"
    if not pkg_path.exists():
        return None
    return _read_json(pkg_path)


def _pick_package_manager(web_root: Path) -> str:
    if (web_root / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (web_root / "yarn.lock").exists():
        return "yarn"
    if (web_root / "package-lock.json").exists():
        return "npm"
    return "npm"


def _detect_js_flavor(web_root: Path, pkg: Dict[str, Any]) -> Tuple[str, List[str]]:
    hints: List[str] = []
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    scripts = pkg.get("scripts") or {}
    build_script = str(scripts.get("build") or "").lower()
    start_script = str(scripts.get("start") or "").lower()

    def has(name: str) -> bool:
        return name in deps

    if has("vite") or "vite" in build_script:
        hints.append("vite detected (deps/scripts)")
        return "vite", hints
    if has("react-scripts") or "react-scripts" in build_script:
        hints.append("create-react-app detected (react-scripts)")
        return "cra", hints
    if has("next") or "next" in build_script or "next" in start_script:
        hints.append("next.js detected")
        return "next", hints
    if has("nuxt") or "nuxt" in build_script or "nuxt" in start_script:
        hints.append("nuxt detected")
        return "nuxt", hints
    if has("@sveltejs/kit") or "svelte-kit" in build_script:
        hints.append("sveltekit detected")
        return "sveltekit", hints
    if has("astro") or "astro" in build_script:
        hints.append("astro detected")
        return "astro", hints
    if has("@angular/cli") or "ng build" in build_script:
        hints.append("angular detected")
        return "angular", hints
    if has("@vue/cli-service") or "vue-cli-service" in build_script:
        hints.append("vue-cli detected")
        return "vue", hints

    if (web_root / "vite.config.js").exists() or (web_root / "vite.config.ts").exists():
        hints.append("vite config file detected")
        return "vite", hints
    if (web_root / "next.config.js").exists() or (web_root / "next.config.mjs").exists():
        hints.append("next config file detected")
        return "next", hints
    if (web_root / "nuxt.config.ts").exists() or (web_root / "nuxt.config.js").exists():
        hints.append("nuxt config file detected")
        return "nuxt", hints
    if (web_root / "angular.json").exists():
        hints.append("angular.json detected")
        return "angular", hints

    if "build" in scripts:
        hints.append("package.json has build script (unknown framework)")
        return "unknown", hints

    return "unknown", hints


def analyze_project(preview_dir: Path, original_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    paths_lower = _list_lower_paths(original_files)
    web_root = _find_web_root(preview_dir)
    pkg = _read_pkg_from_preview(preview_dir)

    analysis: Dict[str, Any] = {
        "kind": "unknown",
        "flavor": "unknown",
        "buildable": False,
        "why": [],
        "package_manager": None,
        "has_package_json": bool(pkg),
        "build_script": None,
        "out_dir_candidates": [],
        "entry_candidates": _detect_entry_candidates(paths_lower),
        "web_root": str(web_root.relative_to(preview_dir)) if web_root != preview_dir else "",
        "manifest_found": False,
        "manifest_ok": False,
        "manifest_used": False,
        "manifest_path": None,
        "manifest_reason": None,
    }

    if pkg:
        analysis["kind"] = "js"
        scripts = pkg.get("scripts") or {}
        analysis["build_script"] = scripts.get("build")
        analysis["package_manager"] = _pick_package_manager(web_root)

        flavor, hints = _detect_js_flavor(web_root, pkg)
        analysis["flavor"] = flavor
        analysis["why"].extend(hints)

        if "build" in scripts and str(scripts.get("build") or "").strip():
            analysis["buildable"] = True
            analysis["why"].append("will run package.json scripts.build")
        else:
            analysis["buildable"] = False
            analysis["why"].append("no scripts.build found; will fallback to static preview index")

        # defaults
        if flavor == "vite":
            analysis["out_dir_candidates"] = ["dist"]
        elif flavor == "cra":
            analysis["out_dir_candidates"] = ["build"]
        elif flavor == "next":
            analysis["out_dir_candidates"] = ["out"]
        else:
            analysis["out_dir_candidates"] = ["dist", "build", "out", "public"]

    else:
        py = _detect_python_flavor(paths_lower)
        if py:
            analysis["kind"] = "python"
            analysis["why"].append("python files detected; no safe static build; will generate helper index")
        elif _detect_php(paths_lower):
            analysis["kind"] = "php"
            analysis["why"].append("php files detected; no build; will generate helper index")
        elif _detect_static(paths_lower):
            analysis["kind"] = "static"
            analysis["why"].append("html detected; will serve as static")
        elif any(p.endswith((".js", ".css")) for p in paths_lower):
            analysis["kind"] = "static"
            analysis["why"].append("js/css detected; will generate best-effort index.html")
        else:
            analysis["why"].append("no recognizable buildable signals; will generate file listing index")

    # ✅ manifest overrides after baseline detection
    return _apply_manifest_to_analysis(preview_dir, analysis)


def detect_project_type(files: List[Dict[str, Any]], preview_dir: Optional[Path] = None) -> str:
    if preview_dir is None:
        file_paths = _list_lower_paths(files)
        if any(p.endswith("requirements.txt") or p.endswith(".py") for p in file_paths):
            return "python"
        if any(p.endswith(".php") for p in file_paths):
            return "php"
        if any(p.endswith("package.json") for p in file_paths):
            return "js:unknown"
        return "static"

    a = analyze_project(preview_dir, files)
    if a["kind"] == "js":
        return f"js:{a['flavor']}"
    return str(a["kind"])


# ----------------------------
# Fallback preview HTML
# ----------------------------
def create_static_index(preview_dir: Path, files: List[Dict[str, Any]]) -> None:
    index_file = preview_dir / "index.html"
    if index_file.exists():
        return

    file_list = "\n".join(
        [f'<li><a href="{(f.get("path") or "").lstrip("/")}">{f.get("path")}</a></li>' for f in files if f.get("path")]
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Preview</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 1rem; }}
    h1 {{ color: #0ea5e9; }}
    ul {{ list-style: none; padding: 0; }}
    li {{ padding: 0.5rem; border-bottom: 1px solid #eee; }}
    a {{ color: #0ea5e9; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    code {{ background: #f4f4f4; padding: 0.1rem 0.25rem; border-radius: 4px; }}
  </style>
</head>
<body>
  <h1>Project Files</h1>
  <p>This is a fallback preview index (no build output detected).</p>
  <ul>{file_list}</ul>
</body>
</html>
"""
    index_file.write_text(html, encoding="utf-8")


def create_best_effort_web_index(preview_dir: Path, analysis: Dict[str, Any]) -> None:
    index_file = preview_dir / "index.html"
    if index_file.exists():
        return

    entries = analysis.get("entry_candidates") or {}
    js_candidates: List[str] = entries.get("js") or []
    css_candidates: List[str] = entries.get("css") or []

    js_src = js_candidates[0] if js_candidates else ""
    css_href = css_candidates[0] if css_candidates else ""

    warnings: List[str] = []
    if js_src.endswith((".jsx", ".tsx")):
        warnings.append("Entry looks like JSX/TSX; without a bundler this will NOT run. Add Vite/CRA or build output.")
    if not js_src:
        warnings.append("No obvious JS entrypoint found; showing file listing instead.")

    warn_html = ""
    if warnings:
        warn_items = "".join([f"<li>{w}</li>" for w in warnings])
        warn_html = f"""
        <div class="warn">
          <strong>Warnings</strong>
          <ul>{warn_items}</ul>
        </div>
        """

    if not js_src:
        create_static_index(preview_dir, [])
        return

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 0; padding: 0; }}
    .bar {{ padding: 12px 16px; background: #0b1220; color: #e5e7eb; font-size: 13px; }}
    .bar code {{ background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 6px; }}
    .warn {{ margin: 16px; padding: 12px; border: 1px solid #f59e0b; border-radius: 10px; background: #fffbeb; }}
    #root {{ padding: 16px; }}
  </style>
  {f'<link rel="stylesheet" href="./{css_href}">' if css_href else ''}
</head>
<body>
  <div class="bar">
    Fallback preview (no build output). Loading <code>{js_src}</code>{f' + <code>{css_href}</code>' if css_href else ''}.
  </div>
  {warn_html}
  <div id="root"></div>
  <script type="module" src="./{js_src}"></script>
</body>
</html>
"""
    index_file.write_text(html, encoding="utf-8")


# ----------------------------
# Build helpers
# ----------------------------
def _run_stream(
        preview_dir: Path,
        cwd: Path,
        cmd: List[str],
        timeout: int,
        env: Optional[Dict[str, str]] = None,
) -> int:
    _append_log(preview_dir, f"$ (cwd={cwd}) {' '.join(cmd)}")
    start = time.time()
    try:
        p = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env or os.environ.copy(),
        )
        assert p.stdout is not None
        for line in p.stdout:
            _append_log(preview_dir, line.rstrip("\n"))
            if time.time() - start > timeout:
                p.kill()
                _append_log(preview_dir, "!! TIMEOUT")
                return 124
        return p.wait()
    except Exception as e:
        _append_log(preview_dir, f"!! EXCEPTION: {e}")
        return 1


def _publish_output(preview_dir: Path, out_dir: Path) -> Tuple[bool, str]:
    if not out_dir.exists() or not out_dir.is_dir():
        return False, f"Build output missing ({out_dir} not found)"
    if not (out_dir / "index.html").exists():
        return False, f"Build output missing ({out_dir}/index.html not found)"

    serve_dir = _serve_dir(preview_dir)
    if serve_dir.exists():
        shutil.rmtree(serve_dir)
    shutil.copytree(out_dir, serve_dir)
    return True, f"Published {out_dir} -> {SERVE_DIRNAME}"


def _find_build_output_dir(base_dir: Path, candidates: List[str]) -> Optional[Path]:
    for name in candidates:
        p = base_dir / name
        if p.is_dir() and (p / "index.html").exists():
            return p
    for name in ["dist", "build", "out", "public", ".output/public"]:
        p = base_dir / name
        if p.is_dir() and (p / "index.html").exists():
            return p
    return None


def _base_url_for_preview(preview_id: str) -> str:
    # IMPORTANT: absolute prefix (fixes CRA /static root + preview subpath)
    return f"{PREVIEW_PATH_PREFIX}/{preview_id}"


def _install_deps(preview_dir: Path, web_root: Path, pm: str, env: Dict[str, str], meta: Dict[str, Any]) -> bool:
    _meta_add_event(meta, "Installing dependencies…")
    if pm == "pnpm":
        rc = _run_stream(preview_dir, web_root, ["pnpm", "install", "--frozen-lockfile"], timeout=INSTALL_TIMEOUT_SECONDS, env=env)
        if rc != 0:
            rc = _run_stream(preview_dir, web_root, ["pnpm", "install"], timeout=INSTALL_TIMEOUT_SECONDS, env=env)
    elif pm == "yarn":
        rc = _run_stream(preview_dir, web_root, ["yarn", "install", "--frozen-lockfile"], timeout=INSTALL_TIMEOUT_SECONDS, env=env)
        if rc != 0:
            rc = _run_stream(preview_dir, web_root, ["yarn", "install"], timeout=INSTALL_TIMEOUT_SECONDS, env=env)
    else:
        if (web_root / "package-lock.json").exists():
            rc = _run_stream(preview_dir, web_root, ["npm", "ci"], timeout=INSTALL_TIMEOUT_SECONDS, env=env)
        else:
            rc = _run_stream(preview_dir, web_root, ["npm", "install"], timeout=INSTALL_TIMEOUT_SECONDS, env=env)
    return rc == 0


def _run_build(preview_dir: Path, web_root: Path, pm: str, flavor: str, env: Dict[str, str], meta: Dict[str, Any], preview_id: str) -> bool:
    _meta_add_event(meta, "Building…")

    base_url = _base_url_for_preview(preview_id)

    # Vite: enforce base path (NOT ./) so assets resolve under /api/projects/preview/<id>/
    vite_base_args: List[str] = []
    if flavor == "vite":
        vite_base_args = ["--", f"--base={base_url}/"]

    if pm == "pnpm":
        rc = _run_stream(preview_dir, web_root, ["pnpm", "build", *vite_base_args], timeout=BUILD_TIMEOUT_SECONDS, env=env)
    elif pm == "yarn":
        rc = _run_stream(preview_dir, web_root, ["yarn", "build", *vite_base_args], timeout=BUILD_TIMEOUT_SECONDS, env=env)
    else:
        rc = _run_stream(preview_dir, web_root, ["npm", "run", "build", *vite_base_args], timeout=BUILD_TIMEOUT_SECONDS, env=env)

    return rc == 0


def _build_js_project(preview_id: str, preview_dir: Path, analysis: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    meta: Dict[str, Any] = {
        "status": "building",
        "agent_events": [],
        "analysis": analysis,
        "output_dir": None,
        "logs_hint": "use build.log",
    }

    web_root_rel = (analysis.get("web_root") or "").strip().strip("/")
    web_root = preview_dir / web_root_rel if web_root_rel else preview_dir

    pm = analysis.get("package_manager") or _pick_package_manager(web_root)
    flavor = analysis.get("flavor") or "unknown"
    candidates = analysis.get("out_dir_candidates") or ["dist", "build", "out", "public"]

    _meta_add_event(meta, f"Detected JS project ({flavor})")
    _meta_add_event(meta, f"Web root: {web_root_rel or '.'}")
    _meta_add_event(meta, f"Package manager: {pm}")
    _meta_add_event(meta, f"Build output candidates: {', '.join(candidates)}")

    env = os.environ.copy()
    env["CI"] = "false"

    # Framework-specific base path handling (web-first under subpath)
    base_url = _base_url_for_preview(preview_id)

    if flavor == "cra":
        env["PUBLIC_URL"] = base_url  # fixes /static root issue in CRA
    elif flavor == "vite":
        env["VITE_BASE"] = f"{base_url}/"
    elif flavor == "next":
        # Only works if your generator uses these in next.config (best practice)
        env["NEXT_PUBLIC_BASE_PATH"] = base_url
        env["NEXT_PUBLIC_ASSET_PREFIX"] = base_url

    if not _install_deps(preview_dir, web_root, pm, env, meta):
        return False, "Install failed", meta

    pkg = _read_json(web_root / "package.json") or {}
    scripts = pkg.get("scripts") or {}

    if "build" not in scripts or not str(scripts.get("build") or "").strip():
        return False, "No scripts.build in package.json", meta

    # Next static export (only if export exists)
    if flavor == "next" and "export" in scripts:
        _meta_add_event(meta, "Next.js export script found; running build + export…")
        if not _run_build(preview_dir, web_root, pm, flavor, env, meta, preview_id):
            return False, "Build failed", meta

        if pm == "pnpm":
            rc = _run_stream(preview_dir, web_root, ["pnpm", "export"], timeout=BUILD_TIMEOUT_SECONDS, env=env)
        elif pm == "yarn":
            rc = _run_stream(preview_dir, web_root, ["yarn", "export"], timeout=BUILD_TIMEOUT_SECONDS, env=env)
        else:
            rc = _run_stream(preview_dir, web_root, ["npm", "run", "export"], timeout=BUILD_TIMEOUT_SECONDS, env=env)

        if rc != 0:
            return False, "Export failed", meta
    else:
        if not _run_build(preview_dir, web_root, pm, flavor, env, meta, preview_id):
            return False, "Build failed", meta

    out_dir = _find_build_output_dir(web_root, candidates)
    if not out_dir:
        return False, "Build succeeded but no static output directory with index.html found", meta

    ok, msg = _publish_output(preview_dir, out_dir)
    if not ok:
        return False, msg, meta

    meta["output_dir"] = str(out_dir.relative_to(web_root))
    _meta_add_event(meta, "Build OK")
    return True, "Build OK", meta


# ----------------------------
# Background build job (explicit click)
# ----------------------------
def _run_build_job(preview_id: str, detected_type: str, original_files: List[Dict[str, Any]]) -> None:
    preview_dir = PREVIEW_ROOT / preview_id
    meta: Dict[str, Any] = _read_json(_meta_path(preview_dir)) or {"status": "building", "agent_events": [], "analysis": None, "output_dir": None}

    try:
        analysis = analyze_project(preview_dir, original_files)
        meta["analysis"] = analysis

        _write_status(preview_dir, "building", detected_type, analysis=analysis)
        _append_log(preview_dir, f"== build job {preview_id} detected_type={detected_type} ==")

        _log_section(
            preview_dir,
            "agent:analysis",
            [
                f"kind={analysis.get('kind')}",
                f"flavor={analysis.get('flavor')}",
                f"buildable={analysis.get('buildable')}",
                f"package_manager={analysis.get('package_manager')}",
                f"has_package_json={analysis.get('has_package_json')}",
                f"build_script={analysis.get('build_script')}",
                f"web_root={analysis.get('web_root') or '.'}",
                f"manifest_used={analysis.get('manifest_used')}",
                f"manifest_ok={analysis.get('manifest_ok')}",
                f"manifest_path={analysis.get('manifest_path')}",
                f"manifest_reason={analysis.get('manifest_reason')}",
                f"why={'; '.join(analysis.get('why') or [])}",
            ],
        )

        _meta_add_event(meta, "Building preview (explicit click)…")
        _persist_meta(preview_dir, meta)

        # JS build
        if analysis.get("kind") == "js" and analysis.get("buildable"):
            ok, msg, meta2 = _build_js_project(preview_id, preview_dir, analysis)
            meta.update(meta2)
            _persist_meta(preview_dir, meta)

            if not ok:
                _append_log(preview_dir, f"!! {msg}")
                _write_status(preview_dir, "failed", detected_type, error=msg, serve_root=None, analysis=analysis)
                meta["status"] = "failed"
                _persist_meta(preview_dir, meta)
                return

            _write_status(preview_dir, "ready", detected_type, error=None, serve_root=SERVE_DIRNAME, analysis=analysis)
            meta["status"] = "ready"
            _meta_add_event(meta, "Preview ready. Starting render → screenshots…")
            _persist_meta(preview_dir, meta)

            threading.Thread(target=_run_screenshots, args=(preview_id, detected_type, analysis), daemon=True).start()
            return

        # Fallback (no build)
        _meta_add_event(meta, "No safe static build path. Creating fallback preview index…")
        _persist_meta(preview_dir, meta)

        if not (preview_dir / "index.html").exists() and not (preview_dir / "index.php").exists():
            entries = analysis.get("entry_candidates") or {}
            if (entries.get("js") or entries.get("css")):
                create_best_effort_web_index(preview_dir, analysis)
            else:
                create_static_index(preview_dir, original_files)

        _write_status(preview_dir, "ready", detected_type, error=None, serve_root=None, analysis=analysis)
        meta["status"] = "ready"
        _meta_add_event(meta, "Preview ready. Starting render → screenshots…")
        _persist_meta(preview_dir, meta)

        threading.Thread(target=_run_screenshots, args=(preview_id, detected_type, analysis), daemon=True).start()

    except Exception as e:
        _append_log(preview_dir, f"!! BUILD JOB CRASH: {e}")
        _write_status(preview_dir, "failed", detected_type, error=str(e), serve_root=None, analysis=meta.get("analysis") or None)
        meta["status"] = "failed"
        _meta_add_event(meta, f"Build job crash: {e}")
        _persist_meta(preview_dir, meta)


# ----------------------------
# Public API used by FastAPI layer
# ----------------------------
def start_preview_job(project_id: str, files: List[Dict[str, Any]], project_type: Optional[str] = None) -> Dict[str, Any]:
    """
    CREATE ONLY (no build).
    Frontend must call `start_build(preview_id)` on preview click.
    """
    preview_id = str(uuid.uuid4())
    preview_dir = PREVIEW_ROOT / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    # reset log
    lp = _log_path(preview_dir)
    if lp.exists():
        lp.unlink()

    # write files
    write_files(preview_dir, files)

    analysis = analyze_project(preview_dir, files)
    detected_type = detect_project_type(files, preview_dir=preview_dir)

    _write_status(preview_dir, "created", detected_type, analysis=analysis)
    _append_log(preview_dir, f"created preview (project_id={project_id})")
    _append_log(preview_dir, f"detected_type={detected_type} (project_type={project_type})")

    if analysis.get("manifest_found"):
        _append_log(
            preview_dir,
            f"manifest_path={analysis.get('manifest_path')} ok={analysis.get('manifest_ok')} used={analysis.get('manifest_used')} reason={analysis.get('manifest_reason')}",
        )

    meta = {
        "status": "created",
        "agent_events": ["Created preview (no build yet)"],
        "analysis": analysis,
        "output_dir": None,
        "project_id": project_id,
    }
    _persist_meta(preview_dir, meta)

    return {
        "preview_id": preview_id,
        "detected_type": detected_type,
        "url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/",
        "status_url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/status",
        "log_url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/logs",
        "build_url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/build",
    }


def start_build(preview_id: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    BUILD ONLY (explicit click).
    We require `files` because your current system reconstructs from DB payload; we don't assume disk persistence elsewhere.
    """
    preview_dir = PREVIEW_ROOT / preview_id
    if not preview_dir.exists():
        return {"ok": False, "error": "Preview not found"}

    lock = _ensure_lock(preview_id)
    if not lock.acquire(blocking=False):
        return {"ok": True, "status": "building"}

    try:
        current = _read_json(_status_path(preview_dir)) or {}
        if current.get("status") in ("building", "ready"):
            return {"ok": True, "status": current.get("status")}

        detected_type = detect_project_type(files, preview_dir=preview_dir)

        _write_status(preview_dir, "queued", detected_type, analysis=current.get("analysis"))
        _append_log(preview_dir, "queued build (explicit click)")

        t = threading.Thread(target=_run_build_job, args=(preview_id, detected_type, files), daemon=True)
        t.start()

        return {"ok": True, "status": "queued"}
    finally:
        lock.release()


def get_preview_serve_root(preview_id: str) -> Path:
    preview_root = PREVIEW_ROOT / preview_id
    serve_dir = _serve_dir(preview_root)
    return serve_dir if serve_dir.is_dir() else preview_root


def cleanup_old_previews(max_age_hours: int = 24) -> int:
    removed = 0
    now = time.time()
    max_age_seconds = max_age_hours * 3600
    for d in PREVIEW_ROOT.iterdir():
        if not d.is_dir():
            continue
        try:
            age = now - d.stat().st_mtime
            if age > max_age_seconds:
                shutil.rmtree(d)
                removed += 1
        except Exception:
            pass
    return removed
