# FILE: backend/api/projects_preview.py
"""
Project Preview API
- POST /api/projects/{project_id}/preview  -> start preview job
- GET  /api/projects/preview/{preview_id}/status
- GET  /api/projects/preview/{preview_id}/logs
- GET  /api/projects/preview/{preview_id}/... -> serve built/static files
"""

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.services.preview_service import (
    PREVIEW_ROOT,
    PreviewError,
    get_preview_serve_root,
    read_status,
    start_preview_job,
    tail_logs,
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
        result = start_preview_job(project_id, file_list, project_type=project.project_type)
    except PreviewError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "url": result["url"],
        "preview_id": result["preview_id"],
        "status_url": result["status_url"],
        "log_url": result["log_url"],
        "project_type": project.project_type,
        "detected_type": result["detected_type"],
        "file_count": len(files),
    }


@router.get("/preview/{preview_id}/status")
async def preview_status(preview_id: str):
    st = read_status(preview_id)
    if st.get("status") == "missing":
        raise HTTPException(status_code=404, detail="Preview not found")
    return st


@router.get("/preview/{preview_id}/logs")
async def preview_logs(preview_id: str):
    if not (PREVIEW_ROOT / preview_id).exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    return PlainTextResponse(tail_logs(preview_id), media_type="text/plain; charset=utf-8")


@router.get("/preview/{preview_id}")
@router.get("/preview/{preview_id}/")
@router.get("/preview/{preview_id}/{file_path:path}")
async def serve_preview_file(preview_id: str, file_path: str = ""):
    preview_root = PREVIEW_ROOT / preview_id
    if not preview_root.exists():
        raise HTTPException(status_code=404, detail="Preview not found")

    serve_root = get_preview_serve_root(preview_id)

    if not file_path:
        file_path = "index.html"

    target_file = serve_root / file_path

    # Path traversal guard
    try:
        target_file = target_file.resolve()
        serve_root_resolved = serve_root.resolve()
        if not str(target_file).startswith(str(serve_root_resolved)):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")

    if target_file.is_dir():
        for index in ("index.html", "index.htm"):
            idx = target_file / index
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
