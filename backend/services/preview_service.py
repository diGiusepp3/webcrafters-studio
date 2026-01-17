# FILE: backend/services/preview_service.py
"""
Preview Service (production-friendly)
- Writes project files into PREVIEW_ROOT/<preview_id>/
- Starts a background build job (thread) when needed
- Persists status + logs to disk so frontend can poll safely
- Publishes built output into PREVIEW_ROOT/<preview_id>/.serve/
"""

import json
import os
import shutil
import subprocess
import threading
import time
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


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_status(preview_dir: Path, status: str, detected_type: str, error: Optional[str] = None, serve_root: Optional[str] = None) -> None:
    _write_json(_status_path(preview_dir), {
        "status": status,               # queued | building | ready | failed
        "detected_type": detected_type, # react | node | python | php | static
        "error": error,
        "serve_root": serve_root,       # ".serve" when built, else None
        "updated_at": int(time.time()),
    })


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


def detect_project_type(files: List[Dict[str, Any]]) -> str:
    file_paths = [str((f.get("path") or "")).lower() for f in files]
    file_contents = {f.get("path") or "": f.get("content") or "" for f in files}

    # JS: check package.json deps
    for path, content in file_contents.items():
        if path.lower().endswith("package.json"):
            try:
                pkg = json.loads(content)
                deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
                if "react" in deps or "react-dom" in deps:
                    return "react"
                if "express" in deps or "fastify" in deps:
                    return "node"
            except Exception:
                pass

    # Python
    if any(p.endswith("requirements.txt") or p.endswith(".py") for p in file_paths):
        return "python"

    # PHP
    if any(p.endswith(".php") for p in file_paths):
        return "php"

    # Node fallback
    if any(p.endswith("package.json") for p in file_paths):
        return "node"

    return "static"


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
  </style>
</head>
<body>
  <h1>Project Files</h1>
  <ul>{file_list}</ul>
</body>
</html>
"""
    index_file.write_text(html, encoding="utf-8")


# ----------------------------
# React build (Vite / CRA) -> publish to .serve
# ----------------------------
def _detect_js_tooling(preview_dir: Path) -> Tuple[str, str]:
    """
    Returns (flavor, out_dir_name)
    flavor: vite | cra | unknown
    out_dir_name: dist | build | ""
    """
    pkg_path = preview_dir / "package.json"
    pkg = _read_json(pkg_path) if pkg_path.exists() else None
    if not pkg:
        return "unknown", ""

    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    scripts = pkg.get("scripts") or {}
    build_script = (scripts.get("build") or "").lower()

    if "vite" in deps or "vite build" in build_script:
        return "vite", "dist"
    if "react-scripts" in deps or "react-scripts build" in build_script:
        return "cra", "build"

    # heuristic
    if "dist" in build_script:
        return "unknown", "dist"
    if "build" in build_script:
        return "unknown", "build"

    return "unknown", ""


def _pick_package_manager(preview_dir: Path) -> str:
    if (preview_dir / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (preview_dir / "yarn.lock").exists():
        return "yarn"
    if (preview_dir / "package-lock.json").exists():
        return "npm"
    return "npm"


def _run_stream(preview_dir: Path, cmd: List[str], timeout: int, env: Optional[Dict[str, str]] = None) -> int:
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


def _publish_output(preview_dir: Path, out_dir_name: str) -> Tuple[bool, str]:
    out_dir = preview_dir / out_dir_name
    if not out_dir.exists() or not (out_dir / "index.html").exists():
        return False, f"Build output missing ({out_dir_name}/index.html not found)"

    serve_dir = _serve_dir(preview_dir)
    if serve_dir.exists():
        shutil.rmtree(serve_dir)
    shutil.copytree(out_dir, serve_dir)
    return True, f"Published {out_dir_name} -> {SERVE_DIRNAME}"


def _build_react(preview_dir: Path) -> Tuple[bool, str, Dict[str, Any]]:
    meta: Dict[str, Any] = {"agent_events": [], "logs_hint": "use build.log", "output_dir": None}
    pkg_path = preview_dir / "package.json"
    if not pkg_path.exists():
        return False, "React detected but package.json missing", meta

    flavor, out_dir_name = _detect_js_tooling(preview_dir)
    pm = _pick_package_manager(preview_dir)

    meta["agent_events"].append("Detected React project")
    meta["agent_events"].append(f"Tooling: {flavor}; expected output: {out_dir_name or 'unknown'}")
    meta["agent_events"].append(f"Package manager: {pm}")

    env = os.environ.copy()
    env["CI"] = "false"

    # install
    meta["agent_events"].append("Installing dependencies…")
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

    if rc != 0:
        return False, "Install failed", meta

    # build
    meta["agent_events"].append("Building…")
    if pm == "pnpm":
        rc = _run_stream(preview_dir, ["pnpm", "build"], timeout=900, env=env)
    elif pm == "yarn":
        rc = _run_stream(preview_dir, ["yarn", "build"], timeout=900, env=env)
    else:
        rc = _run_stream(preview_dir, ["npm", "run", "build"], timeout=900, env=env)

    if rc != 0:
        return False, "Build failed", meta

    # publish
    if not out_dir_name:
        # last resort guess
        out_dir_name = "dist" if (preview_dir / "dist").exists() else ("build" if (preview_dir / "build").exists() else "")

    ok, msg = _publish_output(preview_dir, out_dir_name) if out_dir_name else (False, "Unknown build output directory")
    if not ok:
        return False, msg, meta

    meta["output_dir"] = out_dir_name
    meta["agent_events"].append("Build OK")
    return True, "Build OK", meta


# ----------------------------
# Background job
# ----------------------------
def _run_preview_job(preview_id: str, detected_type: str) -> None:
    preview_dir = PREVIEW_ROOT / preview_id
    try:
        _write_status(preview_dir, "building", detected_type)
        _append_log(preview_dir, f"== preview job {preview_id} type={detected_type} ==")

        meta: Dict[str, Any] = {"status": "skipped", "agent_events": [], "output_dir": None}

        if detected_type == "react":
            ok, msg, meta = _build_react(preview_dir)
            if not ok:
                _append_log(preview_dir, f"!! {msg}")
                _write_json(preview_dir / META_FILE, {"status": "failed", **meta})
                _write_status(preview_dir, "failed", detected_type, error=msg, serve_root=None)
                return

            _write_json(preview_dir / META_FILE, {"status": "success", **meta})
            _write_status(preview_dir, "ready", detected_type, error=None, serve_root=SERVE_DIRNAME)
            return

        # Non-react: just make sure root index exists (static listing / helper page)
        if detected_type == "php":
            if not (preview_dir / "index.php").exists() and not (preview_dir / "index.html").exists():
                create_static_index(preview_dir, [])
        elif detected_type in ("python", "node"):
            if not (preview_dir / "index.html").exists():
                create_static_index(preview_dir, [])
        else:
            if not (preview_dir / "index.html").exists():
                create_static_index(preview_dir, [])

        _write_json(preview_dir / META_FILE, {"status": "ready", "agent_events": [], "output_dir": None})
        _write_status(preview_dir, "ready", detected_type, error=None, serve_root=None)

    except Exception as e:
        _append_log(preview_dir, f"!! JOB CRASH: {e}")
        _write_status(preview_dir, "failed", detected_type, error=str(e), serve_root=None)


def start_preview_job(project_id: str, files: List[Dict[str, Any]], project_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Creates preview folder, writes files, starts background job.
    Returns {preview_id, url, status_url, log_url, detected_type}
    """
    preview_id = str(uuid.uuid4())
    preview_dir = PREVIEW_ROOT / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    # reset files
    if _log_path(preview_dir).exists():
        _log_path(preview_dir).unlink()

    detected_type = (project_type or detect_project_type(files) or "static").lower().strip()
    write_files(preview_dir, files)
    _write_status(preview_dir, "queued", detected_type)

    t = threading.Thread(target=_run_preview_job, args=(preview_id, detected_type), daemon=True)
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