from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.services.preview_service import start_preview_container, PreviewError, PREVIEW_ROOT

router = APIRouter(prefix="/api/projects", tags=["preview"])


@router.post("/{project_id}/preview")
async def preview_project(
        project_id: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    # Project ownership check
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

    # Supported project types for preview (including 'any')
    supported_types = ["web", "frontend", "fullstack", "any"]
    if project.project_type and project.project_type not in supported_types:
        raise HTTPException(
            status_code=400,
            detail=f"Project type '{project.project_type}' doesn't support preview. Supported: {supported_types}",
        )

    # Files ophalen
    files = (
        await db.execute(
            select(ProjectFile).where(ProjectFile.project_id == project_id)
        )
    ).scalars().all()

    if not files:
        raise HTTPException(status_code=400, detail="No files to preview")

    # Preview aanmaken
    try:
        url = start_preview_container(
            project_id,
            [{"path": f.path, "content": f.content} for f in files],
        )
    except PreviewError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"url": url}


# Static file serving for previews
@router.get("/preview/{preview_id}/{file_path:path}")
async def serve_preview_file(preview_id: str, file_path: str):
    """Serve static files from preview directory."""
    # Default to index.html if no file specified
    if not file_path or file_path == "":
        file_path = "index.html"
    
    preview_dir = PREVIEW_ROOT / preview_id
    target_file = preview_dir / file_path
    
    # Security check: ensure the file is within preview directory
    try:
        target_file = target_file.resolve()
        preview_dir = preview_dir.resolve()
        if not str(target_file).startswith(str(preview_dir)):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")
    
    # Check if file exists
    if not target_file.exists() or not target_file.is_file():
        # Try index.html if directory
        if (preview_dir / file_path).is_dir():
            target_file = preview_dir / file_path / "index.html"
            if not target_file.exists():
                raise HTTPException(status_code=404, detail="File not found")
        else:
            raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    suffix = target_file.suffix.lower()
    media_types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
    }
    media_type = media_types.get(suffix, "application/octet-stream")
    
    return FileResponse(target_file, media_type=media_type)
