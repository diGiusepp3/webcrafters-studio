# /backend/services/preview_service.py
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
from typing import List, Dict, Optional, Tuple

# Preview URL prefix - must match the API route
PREVIEW_PATH_PREFIX = "/api/projects/preview"

# Root directory for previews
# For Emergent: /tmp/previews
# For production: /home/webcrafters/subdomains/studio/previews
PREVIEW_ROOT = Path(os.environ.get("PREVIEW_ROOT", "/tmp/previews"))
PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)


class PreviewError(Exception):
    pass


def detect_project_type(files: List[Dict]) -> str:
    """
    Detect project type based on files.
    Returns: 'react', 'node', 'python', 'php', 'static'
    """
    file_paths = [f.get("path", "").lower() for f in files]
    file_contents = {f.get("path", ""): f.get("content", "") for f in files}
    
    # Check for React (package.json with react)
    for path, content in file_contents.items():
        if path.endswith("package.json"):
            try:
                pkg = json.loads(content)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react" in deps or "react-dom" in deps:
                    return "react"
                if "express" in deps or "fastify" in deps:
                    return "node"
            except:
                pass
    
    # Check for Python
    if any(p.endswith("requirements.txt") or p.endswith(".py") for p in file_paths):
        for path, content in file_contents.items():
            if path.endswith(".py"):
                if "flask" in content.lower() or "fastapi" in content.lower():
                    return "python"
        if any(p.endswith(".py") for p in file_paths):
            return "python"
    
    # Check for PHP
    if any(p.endswith(".php") for p in file_paths):
        return "php"
    
    # Check for Node.js
    if any(p.endswith("package.json") for p in file_paths):
        return "node"
    
    # Default to static HTML
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
    
    # Find main files to show
    file_list = "\n".join([
        f'<li><a href="{f.get("path", "")}">{f.get("path", "")}</a></li>'
        for f in files if f.get("path")
    ])
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Preview</title>
    <style>
        body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 1rem; }}
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
</html>'''
    
    index_file.write_text(html, encoding="utf-8")


def build_react_preview(preview_dir: Path) -> Tuple[bool, str]:
    """
    Build React project for preview.
    Returns: (success, message)
    """
    try:
        # Install dependencies
        result = subprocess.run(
            ["yarn", "install", "--frozen-lockfile"],
            cwd=preview_dir,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode != 0:
            # Try without frozen lockfile
            result = subprocess.run(
                ["yarn", "install"],
                cwd=preview_dir,
                capture_output=True,
                text=True,
                timeout=120
            )
        
        # Build
        result = subprocess.run(
            ["yarn", "build"],
            cwd=preview_dir,
            capture_output=True,
            text=True,
            timeout=180,
            env={**os.environ, "CI": "false"}
        )
        
        if result.returncode != 0:
            return False, f"Build failed: {result.stderr}"
        
        # Move build output to root
        build_dir = preview_dir / "build"
        if build_dir.exists():
            for item in build_dir.iterdir():
                shutil.move(str(item), str(preview_dir / item.name))
            shutil.rmtree(build_dir)
        
        return True, "React build successful"
        
    except subprocess.TimeoutExpired:
        return False, "Build timed out"
    except Exception as e:
        return False, str(e)


def build_python_preview(preview_dir: Path) -> Tuple[bool, str]:
    """
    Setup Python project for preview.
    For static preview, just create a simple HTML page.
    """
    # Find main Python file
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
    
    # Create info page
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Python Project</title>
    <style>
        body {{ font-family: system-ui; max-width: 800px; margin: 2rem auto; padding: 1rem; background: #1a1a2e; color: #eee; }}
        h1 {{ color: #00d4ff; }}
        pre {{ background: #16213e; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
        code {{ color: #00ff88; }}
        .info {{ background: #0f3460; padding: 1rem; border-radius: 8px; margin: 1rem 0; }}
    </style>
</head>
<body>
    <h1>🐍 Python Project</h1>
    <div class="info">
        <p><strong>Main file:</strong> {main_file or 'Not detected'}</p>
        <p><strong>To run locally:</strong></p>
        <pre><code>pip install -r requirements.txt
python {main_file or 'app.py'}</code></pre>
    </div>
</body>
</html>'''
    
    (preview_dir / "index.html").write_text(html, encoding="utf-8")
    return True, "Python project ready"


def build_php_preview(preview_dir: Path) -> Tuple[bool, str]:
    """
    Setup PHP project for preview.
    Apache will serve PHP files directly.
    """
    # Ensure index.php or index.html exists
    if not (preview_dir / "index.php").exists() and not (preview_dir / "index.html").exists():
        php_files = list(preview_dir.glob("*.php"))
        if php_files:
            # Create index that redirects to first PHP file
            html = f'''<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url={php_files[0].name}">
</head>
<body>
    <p>Redirecting to <a href="{php_files[0].name}">{php_files[0].name}</a>...</p>
</body>
</html>'''
            (preview_dir / "index.html").write_text(html, encoding="utf-8")
    
    return True, "PHP project ready"


def start_preview_container(project_id: str, files: List[Dict], project_type: Optional[str] = None) -> str:
    """
    Create preview for a project.
    
    Args:
        project_id: The project ID
        files: List of {path, content} dicts
        project_type: Optional type hint ('react', 'node', 'python', 'php', 'static')
    
    Returns:
        Preview URL path
    """
    preview_id = str(uuid.uuid4())
    preview_dir = PREVIEW_ROOT / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)
    
    # Write all files
    write_files(preview_dir, files)
    
    # Detect or use provided project type
    detected_type = project_type or detect_project_type(files)
    
    # Build based on type
    success = True
    message = ""
    
    if detected_type == "react":
        # For now, serve static - React builds need more setup
        create_static_index(preview_dir, files)
        success, message = True, "React project ready (static preview)"
    elif detected_type == "python":
        success, message = build_python_preview(preview_dir)
    elif detected_type == "php":
        success, message = build_php_preview(preview_dir)
    else:
        # Static HTML
        create_static_index(preview_dir, files)
        success, message = True, "Static preview ready"
    
    if not success:
        raise PreviewError(message)
    
    # Ensure index.html exists
    if not (preview_dir / "index.html").exists() and not (preview_dir / "index.php").exists():
        create_static_index(preview_dir, files)
    
    return f"{PREVIEW_PATH_PREFIX}/{preview_id}/"


def cleanup_old_previews(max_age_hours: int = 24) -> int:
    """Remove previews older than max_age_hours. Returns count removed."""
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
            except:
                pass
    
    return removed
