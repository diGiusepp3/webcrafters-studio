# FILE: backend/services/preview_service.py
"""
Multi-type Preview Service
Supports: React/Node, Python (Flask/FastAPI), PHP, Static HTML
"""

import os
import uuid
import json
import shutil
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any

# Preview URL prefix - must match the API route
PREVIEW_PATH_PREFIX = "/api/projects/preview"

# Root directory for previews
PREVIEW_ROOT = Path(os.environ.get("PREVIEW_ROOT", "/tmp/previews"))
PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)


class PreviewError(Exception):
    pass


def _read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def detect_project_type(files: List[Dict]) -> str:
    """
    Detect project type based on files.
    Returns: 'react', 'node', 'python', 'php', 'static'
    """
    file_paths = [f.get("path", "").lower() for f in files]
    file_contents = {f.get("path", ""): f.get("content", "") for f in files}

    for path, content in file_contents.items():
        if path.endswith("package.json"):
            try:
                pkg = json.loads(content)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react" in deps or "react-dom" in deps:
                    return "react"
                if "express" in deps or "fastify" in deps:
                    return "node"
            except Exception:
                pass

    if any(p.endswith("requirements.txt") or p.endswith(".py") for p in file_paths):
        for path, content in file_contents.items():
            if path.endswith(".py"):
                if "flask" in content.lower() or "fastapi" in content.lower():
                    return "python"
        if any(p.endswith(".py") for p in file_paths):
            return "python"

    if any(p.endswith(".php") for p in file_paths):
        return "php"

    if any(p.endswith("package.json") for p in file_paths):
        return "node"

    return "static"


def write_files(preview_dir: Path, files: List[Dict]) -> None:
    """Write all project files to preview directory."""
    for f in files:
        rel_path = (f.get("path") or "").lstrip("/")
        if not rel_path:
            continue
        target = preview_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f.get("content", ""), encoding="utf-8")


def create_static_index(preview_dir: Path, files: List[Dict]) -> None:
    """Create index.html for static preview if not exists."""
    index_file = preview_dir / "index.html"
    if index_file.exists():
        return

    file_list = "\n".join(
        [f'<li><a href="{f.get("path", "")}">{f.get("path", "")}</a></li>' for f in files if f.get("path")]
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


def _write_build_error_page(preview_dir: Path, agent_events: List[str], logs: str) -> None:
    safe_logs = (logs or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    events_html = "".join([f"<li>{e}</li>" for e in agent_events])

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Preview build failed</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 16px; }}
    h1 {{ color: #ef4444; }}
    .box {{ background: #0b1020; color: #e5e7eb; border-radius: 12px; padding: 16px; overflow: auto; }}
    code, pre {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }}
    .events {{ margin: 12px 0 18px; }}
    .events li {{ margin: 6px 0; }}
  </style>
</head>
<body>
  <h1>❌ Preview build failed</h1>
  <p>Agent events:</p>
  <ul class="events">{events_html}</ul>
  <p>Build logs:</p>
  <div class="box"><pre>{safe_logs}</pre></div>
</body>
</html>
"""
    (preview_dir / "index.html").write_text(html, encoding="utf-8")


def _detect_js_tooling(preview_dir: Path) -> Tuple[str, str]:
    """
    Returns: (project_flavor, output_dir_name)
    project_flavor: 'vite' | 'cra' | 'unknown'
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
    # CRA usually outputs build/
    if "react-scripts" in deps or "react-scripts build" in build_script:
        return "cra", "build"

    # Fallback: if script mentions dist/build
    if "dist" in build_script:
        return "unknown", "dist"
    if "build" in build_script:
        return "unknown", "build"

    return "unknown", ""


def _pick_package_manager(preview_dir: Path) -> str:
    """
    Returns: 'pnpm' | 'yarn' | 'npm'
    Deterministic based on lockfiles.
    """
    if (preview_dir / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (preview_dir / "yarn.lock").exists():
        return "yarn"
    if (preview_dir / "package-lock.json").exists():
        return "npm"
    return "npm"


def _run(cmd: List[str], cwd: Path, timeout: int, env: Optional[dict] = None) -> Tuple[int, str]:
    p = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env or os.environ.copy(),
    )
    out = (p.stdout or "") + ("\n" + p.stderr if p.stderr else "")
    return p.returncode, out


def build_react_preview(preview_dir: Path) -> Dict[str, Any]:
    """
    Build React project for preview.
    - Detect Vite (dist/) or CRA (build/)
    - Run install + build
    - Keep output folder in place (dist/ or build/)
    Returns build_meta dict
    """
    agent_events: List[str] = ["Detected React project"]
    pkg_path = preview_dir / "package.json"
    if not pkg_path.exists():
        raise PreviewError("React detected but package.json missing")

    flavor, out_dir_name = _detect_js_tooling(preview_dir)
    agent_events.append(f"Tooling: {flavor or 'unknown'}; expected output: {out_dir_name or 'unknown'}")

    pm = _pick_package_manager(preview_dir)
    agent_events.append(f"Package manager: {pm}")

    env = os.environ.copy()
    env["CI"] = "false"

    logs = ""

    # Install
    agent_events.append("Installing dependencies…")
    try:
        if pm == "pnpm":
            rc, out = _run(["pnpm", "install", "--frozen-lockfile"], preview_dir, timeout=240, env=env)
            if rc != 0:
                rc, out = _run(["pnpm", "install"], preview_dir, timeout=240, env=env)
        elif pm == "yarn":
            rc, out = _run(["yarn", "install", "--frozen-lockfile"], preview_dir, timeout=240, env=env)
            if rc != 0:
                rc, out = _run(["yarn", "install"], preview_dir, timeout=240, env=env)
        else:
            # npm
            if (preview_dir / "package-lock.json").exists():
                rc, out = _run(["npm", "ci"], preview_dir, timeout=240, env=env)
            else:
                rc, out = _run(["npm", "install"], preview_dir, timeout=240, env=env)

        logs += "\n\n=== INSTALL ===\n" + out
        if rc != 0:
            agent_events.append("Install failed")
            _write_build_error_page(preview_dir, agent_events, logs)
            return {"status": "failed", "agent_events": agent_events, "logs": logs, "output_dir": None}

    except subprocess.TimeoutExpired:
        agent_events.append("Install timed out")
        logs += "\n\n=== INSTALL ===\nTIMEOUT"
        _write_build_error_page(preview_dir, agent_events, logs)
        return {"status": "failed", "agent_events": agent_events, "logs": logs, "output_dir": None}

    # Build
    agent_events.append("Building…")
    try:
        if pm == "pnpm":
            rc, out = _run(["pnpm", "build"], preview_dir, timeout=360, env=env)
        elif pm == "yarn":
            rc, out = _run(["yarn", "build"], preview_dir, timeout=360, env=env)
        else:
            rc, out = _run(["npm", "run", "build"], preview_dir, timeout=360, env=env)

        logs += "\n\n=== BUILD ===\n" + out
        if rc != 0:
            agent_events.append("Build failed")
            _write_build_error_page(preview_dir, agent_events, logs)
            return {"status": "failed", "agent_events": agent_events, "logs": logs, "output_dir": None}

    except subprocess.TimeoutExpired:
        agent_events.append("Build timed out")
        logs += "\n\n=== BUILD ===\nTIMEOUT"
        _write_build_error_page(preview_dir, agent_events, logs)
        return {"status": "failed", "agent_events": agent_events, "logs": logs, "output_dir": None}

    # Verify output
    output_dir = (preview_dir / out_dir_name) if out_dir_name else None
    if not output_dir or not output_dir.exists() or not (output_dir / "index.html").exists():
        agent_events.append("Build output missing index.html")
        _write_build_error_page(preview_dir, agent_events, logs)
        return {"status": "failed", "agent_events": agent_events, "logs": logs, "output_dir": None}

    agent_events.append(f"Build OK → serving {out_dir_name}/")
    # Store meta so the API can show “thinking” (events) and logs without leaking chain-of-thought
    meta = {
        "status": "success",
        "agent_events": agent_events,
        "logs": logs,
        "output_dir": out_dir_name,
        "flavor": flavor,
        "package_manager": pm,
    }
    (preview_dir / ".preview_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def build_python_preview(preview_dir: Path) -> Tuple[bool, str]:
    main_files = ["app.py", "main.py", "server.py", "index.py"]
    main_file = None
    for mf in main_files:
        if (preview_dir / mf).exists():
            main_file = mf
            break
    if not main_file:
        py_files = list(preview_dir.glob("*.py"))
        if py_files:
            main_file = py_files[0].name

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Python Project</title>
  <style>
    body {{ font-family: system-ui; max-width: 900px; margin: 2rem auto; padding: 1rem; background: #0b1020; color: #e5e7eb; }}
    h1 {{ color: #22c55e; }}
    pre {{ background: #111827; padding: 1rem; border-radius: 12px; overflow-x: auto; }}
  </style>
</head>
<body>
  <h1>🐍 Python Project</h1>
  <p><strong>Main file:</strong> {main_file or 'Not detected'}</p>
  <pre><code>pip install -r requirements.txt
python {main_file or 'app.py'}</code></pre>
</body>
</html>
"""
    (preview_dir / "index.html").write_text(html, encoding="utf-8")
    return True, "Python project ready"


def build_php_preview(preview_dir: Path) -> Tuple[bool, str]:
    if not (preview_dir / "index.php").exists() and not (preview_dir / "index.html").exists():
        php_files = list(preview_dir.glob("*.php"))
        if php_files:
            html = f"""<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0; url={php_files[0].name}"></head>
<body><p>Redirecting to <a href="{php_files[0].name}">{php_files[0].name}</a>...</p></body>
</html>"""
            (preview_dir / "index.html").write_text(html, encoding="utf-8")
    return True, "PHP project ready"


def start_preview_container(project_id: str, files: List[Dict], project_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Create preview for a project. Writes files, builds when needed.
    Returns dict: {url, preview_id, detected_type, build:{...}}
    """
    preview_id = str(uuid.uuid4())
    preview_dir = PREVIEW_ROOT / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    write_files(preview_dir, files)

    detected_type = (project_type or detect_project_type(files) or "static").lower().strip()

    build_meta: Dict[str, Any] = {"status": "skipped", "agent_events": [], "logs": "", "output_dir": None}

    if detected_type == "react":
        build_meta = build_react_preview(preview_dir)
        # If build failed, an index.html with logs is created at preview root.

    elif detected_type == "python":
        ok, msg = build_python_preview(preview_dir)
        if not ok:
            raise PreviewError(msg)

    elif detected_type == "php":
        ok, msg = build_php_preview(preview_dir)
        if not ok:
            raise PreviewError(msg)

    else:
        create_static_index(preview_dir, files)

    if not (preview_dir / "index.html").exists() and not (preview_dir / "index.php").exists():
        create_static_index(preview_dir, files)

    return {
        "url": f"{PREVIEW_PATH_PREFIX}/{preview_id}/",
        "preview_id": preview_id,
        "detected_type": detected_type,
        "build": build_meta,
    }


def cleanup_old_previews(max_age_hours: int = 24) -> int:
    import time
    removed = 0
    now = time.time()
    max_age_seconds = max_age_hours * 3600

    for preview_dir in PREVIEW_ROOT.iterdir():
        if preview_dir.is_dir():
            try:
                age = now - preview_dir.stat().st_mtime
                if age > max_age_seconds:
                    shutil.rmtree(preview_dir)
                    removed += 1
            except Exception:
                pass
    return removed


# FILE: backend/api/projects_preview.py
"""
Project Preview API
Handles preview generation for all project types.
"""

from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import mimetypes

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.services.preview_service import (
    start_preview_container,
    PreviewError,
    PREVIEW_ROOT,
)

router = APIRouter(prefix="/api/projects", tags=["preview"])

mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/javascript", ".jsx")
mimetypes.add_type("application/javascript", ".ts")
mimetypes.add_type("application/javascript", ".tsx")
mimetypes.add_type("application/json", ".map")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


@router.post("/{project_id}/preview")
async def preview_project(
        project_id: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    project = (
        await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == user["id"],
                )
        )
    ).scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files = (
        await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id))
    ).scalars().all()

    if not files:
        raise HTTPException(status_code=400, detail="No files to preview")

    file_list = [{"path": f.path, "content": f.content} for f in files]

    try:
        result = start_preview_container(project_id, file_list, project_type=project.project_type)
    except PreviewError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Frontend kan hiermee “trying to build…” + agent events/logs tonen
    return {
        "url": result["url"],
        "preview_id": result["preview_id"],
        "project_type": project.project_type,
        "detected_type": result.get("detected_type"),
        "build": result.get("build"),
        "file_count": len(files),
    }


@router.get("/preview/{preview_id}")
@router.get("/preview/{preview_id}/")
@router.get("/preview/{preview_id}/{file_path:path}")
async def serve_preview_file(preview_id: str, file_path: str = ""):
    if not file_path:
        file_path = "index.html"

    preview_root = PREVIEW_ROOT / preview_id
    if not preview_root.exists():
        raise HTTPException(status_code=404, detail="Preview not found")

    # ✅ serve build output if present
    if (preview_root / "dist").is_dir():
        preview_dir = preview_root / "dist"
    elif (preview_root / "build").is_dir():
        preview_dir = preview_root / "build"
    else:
        preview_dir = preview_root

    target_file = preview_dir / file_path

    try:
        target_file = target_file.resolve()
        preview_dir_resolved = preview_dir.resolve()
        if not str(target_file).startswith(str(preview_dir_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")

    if target_file.is_dir():
        for index in ["index.html", "index.htm"]:
            idx = (target_file / index)
            if idx.exists():
                target_file = idx.resolve()
                break
        else:
            raise HTTPException(status_code=404, detail="No index file found")

    if not target_file.exists() or not target_file.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    suffix = target_file.suffix.lower()
    if suffix in {".js", ".mjs", ".jsx", ".ts", ".tsx"}:
        content_type = "application/javascript"
    else:
        content_type = mimetypes.guess_type(str(target_file))[0] or "application/octet-stream"

    if suffix == ".css":
        content_type = "text/css"
    elif suffix in {".html", ".htm"}:
        content_type = "text/html"
    elif suffix in {".json", ".map"}:
        content_type = "application/json"
    elif suffix == ".svg":
        content_type = "image/svg+xml"

    return FileResponse(
        str(target_file),
        media_type=content_type,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
