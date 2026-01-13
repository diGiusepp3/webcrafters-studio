from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.services.preview_service import start_preview_container, PreviewError

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

    if project.type != "web":
        raise HTTPException(
            status_code=400,
            detail="This project doesn't support web type",
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
