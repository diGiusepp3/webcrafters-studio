# =========================================================
# FILE: backend/api/projects.py
# =========================================================

import io
import zipfile
from typing import List
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.schemas.projects import ProjectHistoryItem, ProjectResponse

router = APIRouter(prefix="/api", tags=["projects"])


async def _count_files(db: AsyncSession, project_id: str) -> int:
    n = (
        await db.execute(
            select(func.count(ProjectFile.id))
            .where(ProjectFile.project_id == project_id)
        )
    ).scalar_one()
    return int(n or 0)


@router.get("/projects", response_model=List[ProjectHistoryItem])
async def projects(
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Project)
            .where(Project.user_id == user["id"])
            .order_by(Project.created_at.desc())
        )
    ).scalars().all()

    items: List[ProjectHistoryItem] = []
    for p in rows:
        ve = (p.validation_errors or {}).get("items") or []
        items.append(
            ProjectHistoryItem(
                id=p.id,
                name=p.name or "Generated Project",
                description=p.description or "",
                project_type=p.project_type or "",
                created_at=p.created_at.replace(tzinfo=timezone.utc).isoformat(),
                file_count=await _count_files(db, p.id),
                has_validation_errors=len(ve) > 0,
            )
        )

    return items


@router.get("/projects/{pid}", response_model=ProjectResponse)
async def project(
        pid: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    p = (
        await db.execute(
            select(Project)
            .where(
                Project.id == pid,
                Project.user_id == user["id"],
                )
        )
    ).scalar_one_or_none()

    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    files = (
        await db.execute(
            select(ProjectFile)
            .where(ProjectFile.project_id == p.id)
            .order_by(ProjectFile.id.asc())
        )
    ).scalars().all()

    ve = (p.validation_errors or {}).get("items") or []

    return ProjectResponse(
        id=p.id,
        user_id=p.user_id,
        prompt=p.prompt,
        project_type=p.project_type,
        name=p.name,
        description=p.description,
        files=[
            {
                "path": f.path,
                "language": f.language or "text",
                "content": f.content,
            }
            for f in files
        ],
        created_at=p.created_at.replace(tzinfo=timezone.utc).isoformat(),
        validation_errors=ve,
    )


@router.delete("/projects/{pid}")
async def delete_project(
        pid: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        delete(Project)
        .where(
            Project.id == pid,
            Project.user_id == user["id"],
            )
    )

    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.commit()
    return {"ok": True}


@router.get("/projects/{pid}/download")
async def download(
        pid: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    p = (
        await db.execute(
            select(Project)
            .where(
                Project.id == pid,
                Project.user_id == user["id"],
                )
        )
    ).scalar_one_or_none()

    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    files = (
        await db.execute(
            select(ProjectFile)
            .where(ProjectFile.project_id == p.id)
        )
    ).scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.writestr(f.path, f.content)

    buf.seek(0)
    safe_name = (p.name or "project").replace(" ", "_")

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={safe_name}.zip"
        },
    )
