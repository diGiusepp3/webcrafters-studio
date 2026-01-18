# FILE: backend/services/preview_service.py
"""
Preview Service (production-friendly)
- Writes project files into PREVIEW_ROOT/<preview_id>/
- Starts a background build job (thread) when needed
- Persists status + logs to disk so frontend can poll safely
- Publishes built output into PREVIEW_ROOT/<preview_id>/.serve/
- Live "agent_events" + analysis logging for transparency
"""

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PREVIEW_PATH_PREFIX = "/api/projects/preview"

PREVIEW_ROOT = Path(os.environ.get("PREVIEW_ROOT", "/tmp/previews"))
PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)

STATUS_FILE = "status.json"
LOG_FILE = "build.log"
SERVE_DIRNAME = ".serve"
META_FILE = ".preview_meta.json"

MAX_LOG_BYTES_DEFAULT = 12000


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
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_status(
        preview_dir: Path,
        status: str,
        detected_type: str,
        error: Optional[str] = None,
        serve_root: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "status": status,  # queued | building | ready | failed
        "detected_type": detected_type,  # js:... | python:... | php | static | unknown
        "error": error,
        "serve_root": serve_root,  # ".serve" when built/published, else None
        "updated_at": int(time.time()),
    }
    if analysis is not None:
        payload["analysis"] = analysis
    _write_json(_status_path(preview_dir), payload)


def read_status(preview_id: str) -> Dict[str, Any]:
    preview_dir = PREVIEW_ROOT / preview_id
    sp = _status_path(preview_dir)
    if not preview_dir.exists():
        return {"status": "missing", "error": "Preview not found"}
    data = _read_json(sp)
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


def _append_log(preview_dir: Path, line: str) -> None:
    lp = _log_path(preview_dir)
    lp.parent.mkdir(parents=True, exist_ok=True)
    with lp.open("a", encoding="utf-8", errors="replace") as f:
        f.write(line)
        if not line.endswith("\n"):
            f.write("\n")


def _meta_add_event(meta: Dict[str, Any], s: str) -> None:
    meta.setdefault("agent_events", [])
    meta["agent_events"].append(s)


def _persist_meta(preview_dir: Path, meta: Dict[str, Any]) -> None:
    _write_json(_meta_path(preview_dir), meta)


def _log_section(preview_dir: Path, title: str, lines: List[str]) -> None:
    _append_log(preview_dir, "")
    _append_log(preview_dir, f"== {title} ==")
    for l in lines:
        _append_log(preview_dir, l)


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


def _get_file_map(files: List[Dict[str, Any]]) -> Dict[str, str]:
    # original paths (case-sensitive) -> content
    out: Dict[str, str] = {}
    for f in files:
        p = f.get("path")
        if not p:
            continue
        out[str(p).replace("\\", "/")] = f.get("content") or ""
    return out


def _read_pkg_from_preview(preview_dir: Path) -> Optional[Dict[str, Any]]:
    pkg_path = preview_dir / "package.json"
    if not pkg_path.exists():
        return None
    return _read_json(pkg_path)


def _pick_package_manager(preview_dir: Path) -> str:
    if (preview_dir / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (preview_dir / "yarn.lock").exists():
        return "yarn"
    if (preview_dir / "package-lock.json").exists():
        return "npm"
    return "npm"


def _detect_js_flavor(preview_dir: Path, pkg: Dict[str, Any]) -> Tuple[str, List[str]]:
    """
    Returns (flavor, hints)
    flavor: vite | cra | next | nuxt | sveltekit | astro | angular | vue | node | unknown
    """
    hints: List[str] = []
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    scripts = pkg.get("scripts") or {}
    build_script = str(scripts.get("build") or "").lower()
    start_script = str(scripts.get("start") or "").lower()

    def has(name: str) -> bool:
        return name in deps

    # Framework/deps detection
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
    if has("express") or has("fastify") or has("koa"):
        hints.append("node server deps detected (express/fastify/koa)")
        return "node", hints

    # Heuristics by config files
    if (preview_dir / "vite.config.js").exists() or (preview_dir / "vite.config.ts").exists():
        hints.append("vite config file detected")
        return "vite", hints
    if (preview_dir / "next.config.js").exists() or (preview_dir / "next.config.mjs").exists():
        hints.append("next config file detected")
        return "next", hints
    if (preview_dir / "nuxt.config.ts").exists() or (preview_dir / "nuxt.config.js").exists():
        hints.append("nuxt config file detected")
        return "nuxt", hints
    if (preview_dir / "angular.json").exists():
        hints.append("angular.json detected")
        return "angular", hints

    if "build" in scripts:
        hints.append("package.json has build script (unknown framework)")
        return "unknown", hints

    return "unknown", hints


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


def _detect_entry_candidates(paths_lower: List[str]) -> Dict[str, List[str]]:
    # ordered preferred entries
    js_entries = []
    css_entries = []

    for c in [
        "src/main.tsx",
        "src/main.jsx",
        "src/main.ts",
        "src/main.js",
        "src/index.tsx",
        "src/index.jsx",
        "src/index.ts",
        "src/index.js",
        "main.tsx",
        "main.jsx",
        "main.ts",
        "main.js",
        "index.js",
    ]:
        if c in paths_lower:
            js_entries.append(c)

    for c in [
        "src/index.css",
        "src/main.css",
        "src/style.css",
        "index.css",
        "style.css",
    ]:
        if c in paths_lower:
            css_entries.append(c)

    return {"js": js_entries, "css": css_entries}


def analyze_project(preview_dir: Path, original_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    paths_lower = _list_lower_paths(original_files)
    pkg = _read_pkg_from_preview(preview_dir)

    analysis: Dict[str, Any] = {
        "kind": "unknown",         # js | python | php | static | unknown
        "flavor": "unknown",       # vite/cra/next/... for js
        "buildable": False,        # has an actual build path to publish static output
        "why": [],
        "package_manager": None,
        "has_package_json": bool(pkg),
        "build_script": None,
        "out_dir_candidates": [],
        "entry_candidates": _detect_entry_candidates(paths_lower),
    }

    # JS path
    if pkg:
        analysis["kind"] = "js"
        scripts = pkg.get("scripts") or {}
        analysis["build_script"] = scripts.get("build")
        pm = _pick_package_manager(preview_dir)
        analysis["package_manager"] = pm

        flavor, hints = _detect_js_flavor(preview_dir, pkg)
        analysis["flavor"] = flavor
        analysis["why"].extend(hints)

        if "build" in scripts and str(scripts.get("build") or "").strip():
            analysis["buildable"] = True
            analysis["why"].append("will run package.json scripts.build")
        else:
            analysis["buildable"] = False
            analysis["why"].append("no scripts.build found; will fallback to static preview index")

        # output candidates (best-effort)
        if flavor == "vite":
            analysis["out_dir_candidates"] = ["dist", "build", "out", ".output/public"]
        elif flavor == "cra":
            analysis["out_dir_candidates"] = ["build", "dist"]
        elif flavor == "next":
            # next build is not static by default; try 'out' if export exists
            analysis["out_dir_candidates"] = ["out", "build", "dist"]
            if "export" in scripts:
                analysis["why"].append("next export script present; may produce /out")
        elif flavor == "nuxt":
            analysis["out_dir_candidates"] = [".output/public", "dist"]
        elif flavor == "sveltekit":
            analysis["out_dir_candidates"] = ["build", "dist"]
        elif flavor == "astro":
            analysis["out_dir_candidates"] = ["dist"]
        elif flavor == "angular":
            analysis["out_dir_candidates"] = ["dist"]
        elif flavor == "vue":
            analysis["out_dir_candidates"] = ["dist", "build"]
        else:
            analysis["out_dir_candidates"] = ["dist", "build", "out", "public"]

        return analysis

    # Python
    py = _detect_python_flavor(paths_lower)
    if py:
        analysis["kind"] = "python"
        analysis["why"].append("python files detected; no safe static build; will generate helper index")
        return analysis

    # PHP
    if _detect_php(paths_lower):
        analysis["kind"] = "php"
        analysis["why"].append("php files detected; no build; will generate helper index")
        return analysis

    # Static
    if _detect_static(paths_lower):
        analysis["kind"] = "static"
        analysis["why"].append("html detected; will serve as static")
        return analysis

    # Unknown: try JS/CSS fallback
    if any(p.endswith((".js", ".css")) for p in paths_lower):
        analysis["kind"] = "static"
        analysis["why"].append("js/css detected; will generate best-effort index.html")
        return analysis

    analysis["why"].append("no recognizable buildable signals; will generate file listing index")
    return analysis


def detect_project_type(files: List[Dict[str, Any]], preview_dir: Optional[Path] = None) -> str:
    """
    Backwards-compatible wrapper.
    Returns a single string like:
      - js:vite, js:cra, js:unknown
      - python, php, static, unknown
    """
    if preview_dir is None:
        # legacy minimal detection (not used in our new flow)
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


def create_static_index(preview_dir: Path, files: List[Dict[str, Any]]) -> None:
    index_file = preview_dir / "index.html"
    if index_file.exists():
        return

    file_list = "\n".join(
        [
            f'<li><a href="{(f.get("path") or "").lstrip("/")}">{f.get("path")}</a></li>'
            for f in files
            if f.get("path")
        ]
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
    """
    Best-effort: make index.html that tries to load likely JS/CSS entrypoints.
    Works only for browser-ready JS/ESM (no JSX without bundler).
    """
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
        cmd: List[str],
        timeout: int,
        env: Optional[Dict[str, str]] = None,
) -> int:
    _append_log(preview_dir, f"$ {' '.join(cmd)}")
    start = time.time()
    try:
        p = subprocess.Popen(
            cmd,
            cwd=str(preview_dir),
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
    return True, f"Published {out_dir.name} -> {SERVE_DIRNAME}"


def _find_build_output_dir(preview_dir: Path, candidates: List[str]) -> Optional[Path]:
    # First pass: direct candidates
    for name in candidates:
        p = preview_dir / name
        if p.is_dir() and (p / "index.html").exists():
            return p

    # Second pass: scan a bit (safe-ish)
    for name in ["dist", "build", "out", "public", ".output/public"]:
        p = preview_dir / name
        if p.is_dir() and (p / "index.html").exists():
            return p

    return None


def _install_deps(preview_dir: Path, pm: str, env: Dict[str, str], meta: Dict[str, Any]) -> bool:
    _meta_add_event(meta, "Installing dependencies…")
    if pm == "pnpm":
        rc = _run_stream(preview_dir, ["pnpm", "install", "--frozen-lockfile"], timeout=600, env=env)
        if rc != 0:
            rc = _run_stream(preview_dir, ["pnpm", "install"], timeout=600, env=env)
    elif pm == "yarn":
        rc = _run_stream(preview_dir, ["yarn", "install", "--frozen-lockfile"], timeout=600, env=env)
        if rc != 0:
            rc = _run_stream(preview_dir, ["yarn", "install"], timeout=600, env=env)
    else:
        if (preview_dir / "package-lock.json").exists():
            rc = _run_stream(preview_dir, ["npm", "ci"], timeout=600, env=env)
        else:
            rc = _run_stream(preview_dir, ["npm", "install"], timeout=600, env=env)
    return rc == 0


def _run_build(preview_dir: Path, pm: str, flavor: str, env: Dict[str, str], meta: Dict[str, Any]) -> bool:
    _meta_add_event(meta, "Building…")

    # PREVIEW-ONLY: Vite needs relative base so assets resolve under /api/projects/preview/<id>/
    vite_base_args = ["--", "--base=./"] if flavor == "vite" else []

    if pm == "pnpm":
        rc = _run_stream(preview_dir, ["pnpm", "build", *vite_base_args], timeout=900, env=env)
    elif pm == "yarn":
        rc = _run_stream(preview_dir, ["yarn", "build", *vite_base_args], timeout=900, env=env)
    else:
        rc = _run_stream(preview_dir, ["npm", "run", "build", *vite_base_args], timeout=900, env=env)

    return rc == 0


def _build_js_project(preview_dir: Path, analysis: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    meta: Dict[str, Any] = {
        "status": "building",
        "agent_events": [],
        "analysis": analysis,
        "output_dir": None,
        "logs_hint": "use build.log",
    }

    pm = analysis.get("package_manager") or _pick_package_manager(preview_dir)
    flavor = analysis.get("flavor") or "unknown"
    candidates = analysis.get("out_dir_candidates") or ["dist", "build", "out", "public"]

    _meta_add_event(meta, f"Detected JS project ({flavor})")
    _meta_add_event(meta, f"Package manager: {pm}")
    _meta_add_event(meta, f"Build output candidates: {', '.join(candidates)}")

    env = os.environ.copy()
    env["CI"] = "false"

    if not _install_deps(preview_dir, pm, env, meta):
        return False, "Install failed", meta

    # Special-case: NextJS without export is not static previewable in this pipeline
    pkg = _read_pkg_from_preview(preview_dir) or {}
    scripts = pkg.get("scripts") or {}
    if flavor == "next" and "export" in scripts:
        _meta_add_event(meta, "Next.js export script found; running export…")
        # run export (may require build first)
        if not _run_build(preview_dir, pm, flavor, env, meta):
            return False, "Build failed", meta
        if pm == "pnpm":
            rc = _run_stream(preview_dir, ["pnpm", "export"], timeout=900, env=env)
        elif pm == "yarn":
            rc = _run_stream(preview_dir, ["yarn", "export"], timeout=900, env=env)
        else:
            rc = _run_stream(preview_dir, ["npm", "run", "export"], timeout=900, env=env)
        if rc != 0:
            return False, "Export failed", meta
    else:
        if not _run_build(preview_dir, pm, flavor, env, meta):
            return False, "Build failed", meta

    out_dir = _find_build_output_dir(preview_dir, candidates)
    if not out_dir:
        return False, "Build succeeded but no static output directory with index.html found", meta

    ok, msg = _publish_output(preview_dir, out_dir)
    if not ok:
        return False, msg, meta

    meta["output_dir"] = out_dir.name
    _meta_add_event(meta, "Build OK")
    return True, "Build OK", meta


# ----------------------------
# Background job
# ----------------------------
def _run_preview_job(preview_id: str, detected_type: str, original_files: List[Dict[str, Any]]) -> None:
    preview_dir = PREVIEW_ROOT / preview_id
    meta: Dict[str, Any] = {"status": "building", "agent_events": [], "analysis": None, "output_dir": None}

    try:
        analysis = analyze_project(preview_dir, original_files)
        meta["analysis"] = analysis

        # write initial status + analysis
        _write_status(preview_dir, "building", detected_type, analysis=analysis)

        _append_log(preview_dir, f"== preview job {preview_id} detected_type={detected_type} ==")
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
                f"why={'; '.join(analysis.get('why') or [])}",
                f"entry_candidates={analysis.get('entry_candidates')}",
            ],
        )
        _meta_add_event(meta, "Analyzing project files…")
        _meta_add_event(meta, f"Analysis: {analysis.get('kind')} / {analysis.get('flavor')} (buildable={analysis.get('buildable')})")
        _persist_meta(preview_dir, meta)

        # JS build path
        if analysis.get("kind") == "js" and analysis.get("buildable"):
            ok, msg, meta2 = _build_js_project(preview_dir, analysis)
            meta.update(meta2)
            _persist_meta(preview_dir, meta)

            if not ok:
                _append_log(preview_dir, f"!! {msg}")
                _write_status(preview_dir, "failed", detected_type, error=msg, serve_root=None, analysis=analysis)
                meta["status"] = "failed"
                _persist_meta(preview_dir, meta)
                return

            _write_status(preview_dir, "ready", detected_type, error=None, serve_root=SERVE_DIRNAME, analysis=analysis)
            meta["status"] = "success"
            _persist_meta(preview_dir, meta)
            return

        # Non-buildable (or non-js): create best-effort index
        if analysis.get("kind") in ("static", "php", "python", "unknown") or (analysis.get("kind") == "js" and not analysis.get("buildable")):
            _meta_add_event(meta, "No safe static build path. Creating fallback preview index…")
            _persist_meta(preview_dir, meta)

            # If project already has index.html, keep it
            if not (preview_dir / "index.html").exists() and not (preview_dir / "index.php").exists():
                # best-effort web index if JS/CSS entries exist; else listing
                entries = analysis.get("entry_candidates") or {}
                if (entries.get("js") or entries.get("css")):
                    create_best_effort_web_index(preview_dir, analysis)
                else:
                    create_static_index(preview_dir, original_files)

            _write_status(preview_dir, "ready", detected_type, error=None, serve_root=None, analysis=analysis)
            meta["status"] = "ready"
            _persist_meta(preview_dir, meta)
            return

        # default fallback
        create_static_index(preview_dir, original_files)
        _write_status(preview_dir, "ready", detected_type, error=None, serve_root=None, analysis=analysis)
        meta["status"] = "ready"
        _persist_meta(preview_dir, meta)

    except Exception as e:
        _append_log(preview_dir, f"!! JOB CRASH: {e}")
        _write_status(preview_dir, "failed", detected_type, error=str(e), serve_root=None, analysis=meta.get("analysis") or None)
        meta["status"] = "failed"
        _meta_add_event(meta, f"Job crash: {e}")
        _persist_meta(preview_dir, meta)


# ----------------------------
# Public API used by FastAPI layer
# ----------------------------
def start_preview_job(project_id: str, files: List[Dict[str, Any]], project_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Creates preview folder, writes files, starts background job.
    Returns {preview_id, url, status_url, log_url, detected_type}
    """
    preview_id = str(uuid.uuid4())
    preview_dir = PREVIEW_ROOT / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    # reset old logs for safety
    lp = _log_path(preview_dir)
    if lp.exists():
        lp.unlink()

    # Write files first so analyzer can inspect package.json/scripts/configs from disk
    write_files(preview_dir, files)

    # Normalize/ignore user-supplied project_type (we analyze from files)
    analysis = analyze_project(preview_dir, files)
    detected_type = detect_project_type(files, preview_dir=preview_dir)

    _write_status(preview_dir, "queued", detected_type, analysis=analysis)
    _append_log(preview_dir, f"queued preview (project_id={project_id})")
    _append_log(preview_dir, f"detected_type={detected_type} (project_type={project_type})")

    meta = {"status": "queued", "agent_events": ["Queued preview job"], "analysis": analysis, "output_dir": None}
    _persist_meta(preview_dir, meta)

    t = threading.Thread(target=_run_preview_job, args=(preview_id, detected_type, files), daemon=True)
    t.start()

    return {
        "preview_id": preview_id,
        "detected_type": detected_type,
        "url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/",
        "status_url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/status",
        "log_url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/logs",
    }


def get_preview_serve_root(preview_id: str) -> Path:
    """
    Prefer .serve if present (built output), else preview root.
    """
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
