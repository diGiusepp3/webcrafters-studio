# FILE: backend/api/modify.py
# API endpoints for project modifications

import time
import uuid
import traceback
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.sqltypes import String as SAString, Text as SAText

from backend.api.deps import get_current_user
from backend.core.database import get_db, SessionLocal
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.services.modify_service import apply_modifications

router = APIRouter(prefix="/api", tags=["modify"])

# In-memory job state for modifications
MODIFY_JOBS: Dict[str, Dict[str, Any]] = {}


class ModifyRequest(BaseModel):
    instruction: str
    context: Optional[Dict[str, Any]] = None


class ModifyResponse(BaseModel):
    job_id: str


class ModifyStatusResponse(BaseModel):
    status: str  # queued | running | done | error
    message: Optional[str] = None
    updated_files: Optional[list] = None
    error: Optional[str] = None


@router.post("/projects/{project_id}/modify", response_model=ModifyResponse)
async def start_modification(
        project_id: str,
        request: ModifyRequest,
        background_tasks: BackgroundTasks,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    """Start a modification job for a project."""

    # Verify project exists and belongs to user
    project = (
        await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user["id"])
        )
    ).scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # IMPORTANT: only fetch the columns we need (avoid loading huge ProjectFile.id)
    rows = (
        await db.execute(
            select(ProjectFile.path, ProjectFile.content, ProjectFile.language).where(
                ProjectFile.project_id == project_id
            )
        )
    ).all()

    current_files = [
        {"path": path, "content": content, "language": (language or "text")}
        for (path, content, language) in rows
    ]

    # Create job
    job_id = str(uuid.uuid4())
    MODIFY_JOBS[job_id] = {
        "status": "queued",
        "message": "Queued for processing...",
        "project_id": project_id,
        "user_id": user["id"],
        "instruction": request.instruction,
        "context": request.context,
        "current_files": current_files,
        "project_type": project.project_type,
        "project_name": project.name,
        "updated_files": [],
        "error": None,
        "created_at": time.time(),
    }

    # Start background task
    background_tasks.add_task(run_modification_job, job_id)

    return ModifyResponse(job_id=job_id)


@router.get("/projects/modify/status/{job_id}", response_model=ModifyStatusResponse)
async def get_modification_status(job_id: str, user=Depends(get_current_user)):
    """Get the status of a modification job."""

    job = MODIFY_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    return ModifyStatusResponse(
        status=job["status"],
        message=job.get("message"),
        updated_files=job.get("updated_files"),
        error=job.get("error"),
    )


async def run_modification_job(job_id: str):
    """Background task to run the modification."""

    job = MODIFY_JOBS.get(job_id)
    if not job:
        return

    try:
        job["status"] = "running"
        job["message"] = "Analyzing your request..."

        # Call AI service
        result = await apply_modifications(
            instruction=job["instruction"],
            current_files=job["current_files"],
            project_type=job["project_type"],
            context=job["context"],
        )

        if "error" in result:
            job["status"] = "error"
            job["error"] = result["error"]
            job["message"] = result.get("error", "Modification failed")
            return

        modifications = result.get("modifications", [])
        if not modifications:
            job["status"] = "done"
            job["message"] = "No changes needed"
            job["updated_files"] = []
            return

        job["message"] = f"Applying {len(modifications)} changes..."

        # Apply modifications to database WITHOUT loading ORM rows (avoid huge id conversion)
        async with SessionLocal() as db:
            updated_files = []

            id_col_type = ProjectFile.__table__.c.id.type if "id" in ProjectFile.__table__.c else None
            id_is_text = isinstance(id_col_type, (SAString, SAText))

            for mod in modifications:
                action = (mod.get("action") or "modify").lower()
                path = mod.get("path")
                content = mod.get("content", "")
                language = mod.get("language", "text")

                if not path:
                    continue

                if action == "delete":
                    res = await db.execute(
                        delete(ProjectFile).where(
                            ProjectFile.project_id == job["project_id"],
                            ProjectFile.path == path,
                            )
                    )
                    if res.rowcount and res.rowcount > 0:
                        updated_files.append({"path": path, "action": "deleted"})

                elif action in ("modify", "create"):
                    res = await db.execute(
                        update(ProjectFile)
                        .where(
                            ProjectFile.project_id == job["project_id"],
                            ProjectFile.path == path,
                            )
                        .values(content=content, language=language)
                    )

                    if not res.rowcount:
                        # Insert without selecting existing row (still avoids touching huge ids)
                        kwargs = {
                            "project_id": job["project_id"],
                            "path": path,
                            "content": content,
                            "language": language,
                        }
                        # If id column is text-based UUID, set it. If it's autoinc int, leave it out.
                        if id_is_text:
                            kwargs["id"] = str(uuid.uuid4())

                        db.add(ProjectFile(**kwargs))

                    updated_files.append(
                        {
                            "path": path,
                            "content": content,
                            "language": language,
                            "action": action,
                        }
                    )

            await db.commit()

        job["status"] = "done"
        job["message"] = result.get(
            "summary", f"Successfully applied {len(updated_files)} modifications"
        )
        job["updated_files"] = updated_files

    except Exception as e:
        tb = traceback.format_exc()
        job["status"] = "error"
        job["error"] = tb
        job["message"] = f"Modification failed: {str(e)}"
        print(tb)  # komt in journalctl

    finally:
        # Cleanup old jobs (older than 1 hour)
        current_time = time.time()
        expired_jobs = [
            jid
            for jid, j in MODIFY_JOBS.items()
            if current_time - j.get("created_at", 0) > 3600
        ]
        for jid in expired_jobs:
            MODIFY_JOBS.pop(jid, None)