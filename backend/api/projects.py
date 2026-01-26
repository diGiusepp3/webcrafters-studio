# =========================================================
# FILE: backend/api/projects.py
# =========================================================

import io
import zipfile
import logging
from typing import List
from datetime import timezone, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.models.project_source import ProjectSource
from backend.models.github_connection import GitHubConnection
from backend.schemas.projects import ProjectHistoryItem, ProjectResponse
from backend.schemas.github import GitHubRefreshResponse, GitHubRefreshFileUpdate
from backend.services.encryption_service import decrypt_token
from backend.services import github_service

router = APIRouter(prefix="/api", tags=["projects"])
logger = logging.getLogger("webcrafters-studio.projects")


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


@router.post("/projects/{pid}/github/refresh", response_model=GitHubRefreshResponse)
async def refresh_github_project(
        pid: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    project = (
        await db.execute(
            select(Project)
            .where(
                Project.id == pid,
                Project.user_id == user["id"],
            )
        )
    ).scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    source = (
        await db.execute(
            select(ProjectSource)
            .where(ProjectSource.project_id == pid)
        )
    ).scalar_one_or_none()

    if not source or not (source.source_type or "").startswith("github"):
        raise HTTPException(status_code=400, detail="This project is not linked to GitHub")

    current_files = (
        await db.execute(
            select(ProjectFile)
            .where(ProjectFile.project_id == pid)
        )
    ).scalars().all()

    current_snapshot = github_service.compute_snapshot_hash(
        [{"path": f.path, "content": f.content} for f in current_files]
    ) if current_files else None

    if source.snapshot_hash and current_snapshot and current_snapshot != source.snapshot_hash:
        return GitHubRefreshResponse(
            success=False,
            status="error",
            message="Local changes detected. Please commit/export your edits before refreshing from GitHub.",
            updated_files=[],
            warnings=[],
        )

    token = None
    if source.source_type == "github_private":
        conn = (
            await db.execute(
                select(GitHubConnection)
                .where(GitHubConnection.user_id == user["id"])
            )
        ).scalar_one_or_none()

        if not conn:
            raise HTTPException(status_code=400, detail="GitHub account no longer connected")

        try:
            token = decrypt_token(conn.access_token_encrypted)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt GitHub token")

    try:
        remote_files, commit_sha, warnings = await github_service.download_repo_archive(
            source.owner, source.repo, source.ref, token, source.subdir
        )
    except Exception as e:
        logger.error(f"GitHub refresh download failed for {pid}: {e}")
        raise HTTPException(status_code=500, detail="Failed to download repository from GitHub")

    if not remote_files:
        return GitHubRefreshResponse(
            success=False,
            status="error",
            message="No files found in the linked GitHub repository.",
            updated_files=[],
            warnings=[],
        )

    path_map = {f.path: f for f in current_files}
    remote_paths = set()
    updated_files: List[GitHubRefreshFileUpdate] = []
    usable_remote_files = []
    now = datetime.utcnow()

    for rf in remote_files:
        if not github_service.check_safe_path(rf["path"]):
            continue

        usable_remote_files.append(rf)
        remote_paths.add(rf["path"])

        existing = path_map.get(rf["path"])
        if existing is None:
            pf = ProjectFile(
                project_id=pid,
                path=rf["path"],
                language=rf.get("language"),
                content=rf["content"],
                created_at=now,
            )
            db.add(pf)
            updated_files.append(
                GitHubRefreshFileUpdate(path=rf["path"], action="added")
            )
        elif existing.content != rf["content"]:
            existing.content = rf["content"]
            existing.language = rf.get("language") or existing.language
            updated_files.append(
                GitHubRefreshFileUpdate(path=rf["path"], action="updated")
            )

    for path, file_obj in path_map.items():
        if path not in remote_paths:
            await db.delete(file_obj)
            updated_files.append(
                GitHubRefreshFileUpdate(path=path, action="deleted")
            )

    source.last_commit_sha = commit_sha
    source.snapshot_hash = github_service.compute_snapshot_hash(usable_remote_files)
    source.last_sync_at = now

    await db.commit()

    added = len([f for f in updated_files if f.action == "added"])
    updated = len([f for f in updated_files if f.action == "updated"])
    deleted = len([f for f in updated_files if f.action == "deleted"])

    if not updated_files:
        message = "Already up to date with GitHub."
    else:
        message = f"Refreshed from GitHub: {added} added, {updated} updated, {deleted} deleted."

    if warnings:
        first_warning = warnings[0]
        if first_warning:
            message = f"{message} Warning: {first_warning}"

    return GitHubRefreshResponse(
        success=True,
        status="ok",
        message=message,
        updated_files=updated_files,
        warnings=warnings or [],
    )


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
