# /backend/api/modify.py
# API endpoints for project modifications

import time
import uuid
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    db: AsyncSession = Depends(get_db)
):
    """Start a modification job for a project."""
    
    # Verify project exists and belongs to user
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user["id"])
    )).scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get current files
    files = (await db.execute(
        select(ProjectFile).where(ProjectFile.project_id == project_id)
    )).scalars().all()
    
    current_files = [
        {"path": f.path, "content": f.content, "language": f.language or "text"}
        for f in files
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
        "created_at": time.time()
    }
    
    # Start background task
    background_tasks.add_task(run_modification_job, job_id)
    
    return ModifyResponse(job_id=job_id)


@router.get("/projects/modify/status/{job_id}", response_model=ModifyStatusResponse)
async def get_modification_status(
    job_id: str,
    user=Depends(get_current_user)
):
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
        error=job.get("error")
    )


async def run_modification_job(job_id: str):
    """Background task to run the modification."""
    
    job = MODIFY_JOBS.get(job_id)
    if not job:
        return
    
    try:
        # Update status
        job["status"] = "running"
        job["message"] = "Analyzing your request..."
        
        # Call AI service
        result = await apply_modifications(
            instruction=job["instruction"],
            current_files=job["current_files"],
            project_type=job["project_type"],
            context=job["context"]
        )
        
        # Check for errors
        if "error" in result:
            job["status"] = "error"
            job["error"] = result["error"]
            job["message"] = result.get("error", "Modification failed")
            return
        
        # Apply modifications to database
        modifications = result.get("modifications", [])
        if not modifications:
            job["status"] = "done"
            job["message"] = "No changes needed"
            job["updated_files"] = []
            return
        
        job["message"] = f"Applying {len(modifications)} changes..."
        
        # Update files in database
        async with SessionLocal() as db:
            updated_files = []
            
            for mod in modifications:
                action = mod.get("action", "modify")
                path = mod.get("path")
                content = mod.get("content", "")
                language = mod.get("language", "text")
                
                if not path:
                    continue
                
                if action == "delete":
                    # Delete file
                    existing = (await db.execute(
                        select(ProjectFile).where(
                            ProjectFile.project_id == job["project_id"],
                            ProjectFile.path == path
                        )
                    )).scalar_one_or_none()
                    
                    if existing:
                        await db.delete(existing)
                        updated_files.append({"path": path, "action": "deleted"})
                
                elif action in ["modify", "create"]:
                    # Check if file exists
                    existing = (await db.execute(
                        select(ProjectFile).where(
                            ProjectFile.project_id == job["project_id"],
                            ProjectFile.path == path
                        )
                    )).scalar_one_or_none()
                    
                    if existing:
                        # Update existing file
                        existing.content = content
                        existing.language = language
                        db.add(existing)
                    else:
                        # Create new file
                        new_file = ProjectFile(
                            id=str(uuid.uuid4()),
                            project_id=job["project_id"],
                            path=path,
                            content=content,
                            language=language
                        )
                        db.add(new_file)
                    
                    updated_files.append({
                        "path": path,
                        "content": content,
                        "language": language,
                        "action": action
                    })
            
            await db.commit()
        
        job["status"] = "done"
        job["message"] = result.get("summary", f"Successfully applied {len(updated_files)} modifications")
        job["updated_files"] = updated_files
        
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        job["message"] = f"Modification failed: {str(e)}"
    
    finally:
        # Cleanup old jobs (older than 1 hour)
        current_time = time.time()
        expired_jobs = [
            jid for jid, j in MODIFY_JOBS.items()
            if current_time - j.get("created_at", 0) > 3600
        ]
        for jid in expired_jobs:
            MODIFY_JOBS.pop(jid, None)
