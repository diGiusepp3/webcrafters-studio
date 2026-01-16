# /backend/api/projects_preview.py
"""
Project Preview API
Handles preview generation for all project types.
"""

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
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
    PREVIEW_PATH_PREFIX
)

router = APIRouter(prefix="/api/projects", tags=["preview"])

# Initialize mimetypes
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')


@router.post("/{project_id}/preview")
async def preview_project(
    project_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a preview for a project.
    Supports: React, Node.js, Python, PHP, Static HTML
    """
    # Check project ownership
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

    # Get project files
    files = (
        await db.execute(
            select(ProjectFile).where(ProjectFile.project_id == project_id)
        )
    ).scalars().all()

    if not files:
        raise HTTPException(status_code=400, detail="No files to preview")

    # Convert to list of dicts
    file_list = [{"path": f.path, "content": f.content} for f in files]

    # Create preview
    try:
        url = start_preview_container(
            project_id,
            file_list,
            project_type=project.project_type
        )
    except PreviewError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "url": url,
        "project_type": project.project_type,
        "file_count": len(files)
    }


# Static file serving for previews
@router.get("/preview/{preview_id}")
@router.get("/preview/{preview_id}/")
@router.get("/preview/{preview_id}/{file_path:path}")
async def serve_preview_file(
    preview_id: str,
    file_path: str = ""
):
    """
    Serve static files from preview directory.
    Handles: HTML, CSS, JS, images, fonts, etc.
    """
    # Default to index.html
    if not file_path or file_path == "":
        file_path = "index.html"
    
    preview_dir = PREVIEW_ROOT / preview_id
    
    # Check if preview exists
    if not preview_dir.exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    
    target_file = preview_dir / file_path
    
    # Security: ensure path is within preview directory
    try:
        target_file = target_file.resolve()
        preview_dir_resolved = preview_dir.resolve()
        if not str(target_file).startswith(str(preview_dir_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")
    
    # If directory, try index files
    if target_file.is_dir():
        for index in ["index.html", "index.php", "index.htm"]:
            index_file = target_file / index
            if index_file.exists():
                target_file = index_file
                break
        else:
            raise HTTPException(status_code=404, detail="No index file found")
    
    # Check if file exists
    if not target_file.exists() or not target_file.is_file():
        # Try adding .html extension
        html_file = Path(str(target_file) + ".html")
        if html_file.exists():
            target_file = html_file
        else:
            raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type
    suffix = target_file.suffix.lower()
    content_type = mimetypes.guess_type(str(target_file))[0] or "application/octet-stream"
    
    # Special handling for common types
    type_overrides = {
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".htm": "text/html",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".eot": "application/vnd.ms-fontobject",
        ".php": "text/html",  # Serve PHP as HTML for now
    }
    
    if suffix in type_overrides:
        content_type = type_overrides[suffix]
    
    return FileResponse(
        target_file,
        media_type=content_type,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )
