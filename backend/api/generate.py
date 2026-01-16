# =========================================================
# FILE: /backend/api/generate.py
# Enhanced with Agent Timeline, Chat Messages, Security & Fix Loop
# =========================================================

import time
import uuid
import json
from datetime import datetime
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from backend.api.deps import get_current_user
from backend.core.database import SessionLocal
from backend.models.generation import Generation
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.models.preview_report import PreviewReport
from backend.schemas.generate import GenerateRequest, ClarifyRequest, ClarifyResponse
from backend.services.preflight_service import preflight_analyze
from backend.services.ai_service import clarify_with_ai, generate_code_with_ai
from backend.services.patch_service import patch_generated_project
from backend.services.agent_service import (
    get_step_info, create_chat_message, generate_step_chat_messages, ALL_STEPS
)
from backend.services.security_checker import check_project_security, apply_security_fixes
from backend.services.fix_loop_service import run_fix_loop, generate_fix_report
from backend.validators.node_openai_validator import validate_node_openai

router = APIRouter(prefix="/api", tags=["generate"])

# ⚠️ In-memory job state = 1 uvicorn worker
JOB_STATUS: Dict[str, Dict[str, Any]] = {}

JOB_TIMEOUT_SECONDS = 10 * 60
JOB_CLEANUP_AFTER_SECONDS = 60 * 60


def _now_ts() -> float:
    return time.time()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def init_job_state(job_id: str, payload: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """Initialize a new job with all required fields."""
    return {
        "job_id": job_id,
        "user_id": user_id,
        "status": "queued",          # queued | running | clarify | done | error
        "step": "queued",
        "message": "Queued…",
        "project_id": None,
        "questions": None,
        "error": None,
        "payload": payload,
        
        # Enhanced: Timeline and chat
        "timeline": [],              # List of step objects
        "chat_messages": [],         # List of chat messages
        "current_step_index": 0,
        
        # Enhanced: Preview & reporting
        "preview_url": None,
        "screenshots": [],
        "build_logs": "",
        "runtime_logs": "",
        
        # Enhanced: Security & fixes
        "security_findings": [],
        "applied_fixes": [],
        
        # Timestamps
        "started_at": _now_ts(),
        "updated_at": _now_ts(),
    }


def set_status(
    job_id: str,
    status: str,
    step: str,
    message: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None
):
    """Update job status and add timeline/chat entries."""
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    
    ctx = context or {}
    prev_step = job.get("step")
    
    # Update basic status
    job["status"] = status
    job["step"] = step
    if message is not None:
        job["message"] = message
    job["updated_at"] = _now_ts()
    
    # Update timeline
    step_info = get_step_info(step)
    timeline = job.get("timeline", [])
    
    # Find or create timeline entry for this step
    existing_entry = next((t for t in timeline if t.get("step") == step), None)
    
    if existing_entry:
        if status == "running":
            existing_entry["status"] = "running"
        elif status in ("done", "error"):
            existing_entry["status"] = "success" if status == "done" else "error"
            existing_entry["completed_at"] = _now_iso()
            if existing_entry.get("started_at"):
                start = datetime.fromisoformat(existing_entry["started_at"])
                existing_entry["duration_ms"] = int((datetime.utcnow() - start).total_seconds() * 1000)
    else:
        new_entry = {
            "step": step,
            "status": "running" if status == "running" else ("success" if status == "done" else "error"),
            "title": step_info.get("title", step),
            "description": step_info.get("description", ""),
            "icon": step_info.get("icon", "loader"),
            "started_at": _now_iso(),
            "completed_at": None,
            "duration_ms": None
        }
        timeline.append(new_entry)
    
    job["timeline"] = timeline
    
    # Generate and add chat messages
    chat_status = "running" if status == "running" else ("success" if status == "done" else "error")
    messages = generate_step_chat_messages(step, chat_status, ctx)
    if messages:
        job["chat_messages"] = job.get("chat_messages", []) + messages


def add_chat_message(job_id: str, message: str, metadata: Optional[Dict[str, Any]] = None):
    """Add a chat message to the job."""
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    
    chat_msg = create_chat_message(message, "agent", metadata)
    job["chat_messages"] = job.get("chat_messages", []) + [chat_msg]
    job["updated_at"] = _now_ts()


def mark_step_complete(job_id: str, step: str, success: bool = True, context: Optional[Dict[str, Any]] = None):
    """Mark a step as complete in the timeline."""
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    
    ctx = context or {}
    timeline = job.get("timeline", [])
    
    for entry in timeline:
        if entry.get("step") == step:
            entry["status"] = "success" if success else "error"
            entry["completed_at"] = _now_iso()
            if entry.get("started_at"):
                start = datetime.fromisoformat(entry["started_at"])
                entry["duration_ms"] = int((datetime.utcnow() - start).total_seconds() * 1000)
            break
    
    job["timeline"] = timeline
    
    # Generate completion chat messages
    chat_status = "success" if success else "error"
    messages = generate_step_chat_messages(step, chat_status, ctx)
    if messages:
        job["chat_messages"] = job.get("chat_messages", []) + messages
    
    job["updated_at"] = _now_ts()


def normalize_clarify(result: Any) -> ClarifyResponse:
    if isinstance(result, ClarifyResponse):
        return result

    if isinstance(result, dict):
        return ClarifyResponse(
            needs_clarification=bool(result.get("needs_clarification", False)),
            questions=list(result.get("questions") or []),
            derived=dict(result.get("derived") or {}),
        )

    raise ValueError("Invalid clarify_with_ai return type")


def cleanup_jobs():
    now = _now_ts()
    to_delete = []
    for job_id, job in JOB_STATUS.items():
        started = float(job.get("started_at") or 0)
        if started and (now - started) > JOB_CLEANUP_AFTER_SECONDS:
            to_delete.append(job_id)
    for job_id in to_delete:
        JOB_STATUS.pop(job_id, None)


# ─────────────────────────────────────────────
# CLARIFY (standalone, optioneel)
# ─────────────────────────────────────────────
@router.post("/generate/clarify", response_model=ClarifyResponse)
async def generate_clarify(req: ClarifyRequest, user=Depends(get_current_user)):
    if (req.project_type or "").lower().strip() != "any":
        return ClarifyResponse(
            needs_clarification=False,
            questions=[],
            derived={"reason": "not_any"},
        )
    return normalize_clarify(await clarify_with_ai(req.prompt, "any"))


# ─────────────────────────────────────────────
# START GENERATION
# ─────────────────────────────────────────────
@router.post("/generate")
async def start_generation(
    req: GenerateRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
):
    cleanup_jobs()

    job_id = str(uuid.uuid4())
    payload = {
        "prompt": req.prompt,
        "project_type": req.project_type,
        "preferences": req.preferences,
    }
    
    JOB_STATUS[job_id] = init_job_state(job_id, payload, user["id"])
    
    # Add initial chat message
    add_chat_message(job_id, "🚀 Starting your project generation...")

    background_tasks.add_task(_generation_worker, job_id, user)
    return {"job_id": job_id}


# ─────────────────────────────────────────────
# POLL STATUS (Enhanced response)
# ─────────────────────────────────────────────
@router.get("/generate/status/{job_id}")
async def get_generation_status(job_id: str, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] in {"queued", "running"}:
        if (_now_ts() - job["started_at"]) > JOB_TIMEOUT_SECONDS:
            job["status"] = "error"
            job["step"] = "failed"
            job["error"] = "Generation timed out."
            job["message"] = "Timed out."
            add_chat_message(job_id, "⏱️ Generation timed out. Please try again with a simpler request.")

    # Return enhanced status
    return {
        "job_id": job_id,
        "status": job["status"],
        "step": job["step"],
        "message": job.get("message"),
        "project_id": job.get("project_id"),
        "questions": job.get("questions"),
        "error": job.get("error"),
        
        # Enhanced fields
        "timeline": job.get("timeline", []),
        "chat_messages": job.get("chat_messages", []),
        "preview_url": job.get("preview_url"),
        "screenshots": job.get("screenshots", []),
        "security_findings": job.get("security_findings", []),
        "applied_fixes": job.get("applied_fixes", []),
        
        # Live file updates
        "files": job.get("files", []),
        
        "started_at": job.get("started_at"),
        "updated_at": job.get("updated_at"),
    }


# ─────────────────────────────────────────────
# CONTINUE AFTER CLARIFY
# ─────────────────────────────────────────────
@router.post("/generate/continue/{job_id}")
async def continue_generation(
    job_id: str,
    answers: Dict[str, Any],
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
):
    job = JOB_STATUS.get(job_id)
    if not job or job["status"] != "clarify":
        raise HTTPException(status_code=400, detail="Job is not awaiting clarification")

    original_prompt = job["payload"]["prompt"]

    merged_prompt = (
        original_prompt
        + "\n\nCLARIFICATION ANSWERS:\n"
        + json.dumps(answers, indent=2)
    )

    job["payload"]["prompt"] = merged_prompt
    job["status"] = "queued"
    job["step"] = "queued"
    job["message"] = "Resuming…"
    job["questions"] = None
    job["updated_at"] = _now_ts()
    
    add_chat_message(job_id, "📝 Got your answers! Resuming generation...")

    background_tasks.add_task(_generation_worker, job_id, user)
    return {"status": "resumed"}


# ─────────────────────────────────────────────
# BACKGROUND WORKER (Enhanced with new stages)
# ─────────────────────────────────────────────
async def _generation_worker(job_id: str, user: dict):
    job = JOB_STATUS[job_id]
    t0 = _now_ts()

    # Stage 1: Preflight
    set_status(job_id, "running", "preflight", "Analyzing prompt…")

    payload = job["payload"]
    prompt = payload["prompt"]
    project_type = payload["project_type"]
    preferences = payload.get("preferences")

    gen: Optional[Generation] = None
    files: List[Dict[str, str]] = []

    async with SessionLocal() as db:
        try:
            # ── Preflight analysis
            analysis = preflight_analyze(prompt, project_type, preferences)
            mark_step_complete(job_id, "preflight", True)

            effective_pt = (
                analysis.derived.get("effective_project_type")
                or project_type
                or "fullstack"
            ).lower().strip()

            effective_prefs = (
                analysis.derived.get("effective_preferences")
                or preferences
                or {}
            )

            # ── Clarify bij "any"
            if (project_type or "").lower().strip() == "any":
                set_status(job_id, "running", "clarifying", "Clarifying intent…", {"project_type": effective_pt})
                clar = normalize_clarify(await clarify_with_ai(prompt, "any"))
                if clar.needs_clarification:
                    job["status"] = "clarify"
                    job["step"] = "clarify"
                    job["message"] = "Clarification required."
                    job["questions"] = clar.questions
                    add_chat_message(job_id, "🤔 I need some clarification before I can generate your project.")
                    return

            # ── Save generation record
            gen = Generation(
                id=str(uuid.uuid4()),
                user_id=user["id"],
                prompt=prompt,
                project_type=effective_pt,
                status="running",
                created_at=datetime.utcnow(),
            )
            db.add(gen)
            await db.commit()

            # Stage 2: Generate code
            set_status(job_id, "running", "generating", "Generating code…", {"project_type": effective_pt})
            add_chat_message(job_id, f"🎨 Creating a {effective_pt} project based on your requirements...")
            
            result = await generate_code_with_ai(prompt, effective_pt, effective_prefs)
            files = result.get("files", []) or []
            
            # Store files for live updates
            job["files"] = files
            
            mark_step_complete(job_id, "generating", True, {"file_count": len(files)})
            add_chat_message(job_id, f"✨ Generated {len(files)} files!")

            # Stage 3: Patch files
            set_status(job_id, "running", "patching", "Patching files…")
            files = patch_generated_project(files, effective_prefs)
            job["files"] = files  # Update with patched files
            mark_step_complete(job_id, "patching", True)

            # Stage 4: Validate
            set_status(job_id, "running", "validating", "Validating output…")
            validation_errors = validate_node_openai(files) or []
            mark_step_complete(job_id, "validating", True, {"validation_errors": len(validation_errors)})

            # Stage 5: Security check
            set_status(job_id, "running", "security_check", "Running security analysis…")
            security_findings, security_stats = check_project_security(files)
            job["security_findings"] = security_findings
            
            if security_findings:
                add_chat_message(
                    job_id, 
                    f"🔍 Found {len(security_findings)} security consideration(s): "
                    f"{security_stats['high_severity']} high, {security_stats['medium_severity']} medium, {security_stats['low_severity']} low"
                )
                
                # Apply auto-fixes for security issues
                if security_stats["auto_fixable"] > 0:
                    set_status(job_id, "running", "fixing", "Auto-fixing security issues…", {"fix_count": security_stats["auto_fixable"]})
                    files, applied_security_fixes = apply_security_fixes(files, security_findings)
                    job["applied_fixes"] = applied_security_fixes
                    if applied_security_fixes:
                        add_chat_message(job_id, f"🔧 Auto-fixed {len(applied_security_fixes)} security issue(s)")
                    mark_step_complete(job_id, "fixing", True)
            
            mark_step_complete(job_id, "security_check", True, {"security_findings": security_findings})

            # Stage 6: Save project
            set_status(job_id, "running", "saving", "Saving project…")
            project_id = str(uuid.uuid4())
            now = datetime.utcnow()

            project = Project(
                id=project_id,
                user_id=user["id"],
                prompt=prompt,
                project_type=effective_pt,
                name=result.get("name", "Generated Project"),
                description=result.get("description", ""),
                validation_errors={"items": validation_errors},
                created_at=now,
            )
            db.add(project)
            await db.flush()

            for f in files:
                db.add(
                    ProjectFile(
                        project_id=project_id,
                        path=(f.get("path") or "").lstrip("/"),
                        language=f.get("language"),
                        content=f.get("content") or "",
                        created_at=now,
                    )
                )

            # Save preview report
            preview_report = PreviewReport(
                id=str(uuid.uuid4()),
                job_id=job_id,
                project_id=project_id,
                user_id=user["id"],
                timeline_steps=job.get("timeline", []),
                chat_messages=job.get("chat_messages", []),
                screenshots=job.get("screenshots", []),
                applied_fixes=job.get("applied_fixes", []),
                security_findings=security_findings,
                final_status="success",
                created_at=now,
                updated_at=now,
            )
            db.add(preview_report)

            gen.project_id = project_id
            gen.status = "done"
            gen.duration_ms = int((_now_ts() - t0) * 1000)
            await db.commit()

            mark_step_complete(job_id, "saving", True)

            # Stage 7: Done
            set_status(job_id, "done", "done", "Done.", {"project_name": result.get("name", "Your project")})
            job["project_id"] = project_id

        except Exception as e:
            set_status(job_id, "error", "error", "Failed.", {"error": str(e)})
            job["error"] = str(e)
            add_chat_message(job_id, f"❌ An error occurred: {str(e)}", {"error": True})

            if gen:
                try:
                    gen.status = "error"
                    gen.error_message = str(e)
                    gen.duration_ms = int((_now_ts() - t0) * 1000)
                    await db.commit()
                except Exception:
                    pass
