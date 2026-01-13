# =========================================================
# FILE: /backend/api/generate.py
# =========================================================

import time
import uuid
import json
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from backend.api.deps import get_current_user
from backend.core.database import SessionLocal
from backend.models.generation import Generation
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.schemas.generate import GenerateRequest, ClarifyRequest, ClarifyResponse
from backend.services.preflight_service import preflight_analyze
from backend.services.ai_service import clarify_with_ai, generate_code_with_ai
from backend.services.patch_service import patch_generated_project
from backend.validators.node_openai_validator import validate_node_openai

router = APIRouter(prefix="/api", tags=["generate"])

# ⚠️ In-memory job state = 1 uvicorn worker
JOB_STATUS: Dict[str, Dict[str, Any]] = {}

JOB_TIMEOUT_SECONDS = 10 * 60
JOB_CLEANUP_AFTER_SECONDS = 60 * 60


def _now_ts() -> float:
    return time.time()


def set_status(
        job_id: str,
        status: str,
        step: str,
        message: Optional[str] = None,
):
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    job["status"] = status
    job["step"] = step
    if message is not None:
        job["message"] = message
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
    JOB_STATUS[job_id] = {
        "status": "queued",          # queued | running | clarify | done | error
        "step": "queued",
        "message": "Queued…",
        "project_id": None,
        "questions": None,
        "error": None,
        "payload": {
            "prompt": req.prompt,
            "project_type": req.project_type,
            "preferences": req.preferences,
        },
        "started_at": _now_ts(),
        "updated_at": _now_ts(),
    }

    background_tasks.add_task(_generation_worker, job_id, user)
    return {"job_id": job_id}


# ─────────────────────────────────────────────
# POLL STATUS
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

    return job


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

    background_tasks.add_task(_generation_worker, job_id, user)
    return {"status": "resumed"}


# ─────────────────────────────────────────────
# BACKGROUND WORKER
# ─────────────────────────────────────────────
async def _generation_worker(job_id: str, user: dict):
    job = JOB_STATUS[job_id]
    t0 = _now_ts()

    set_status(job_id, "running", "preflight", "Analyzing prompt…")

    payload = job["payload"]
    prompt = payload["prompt"]
    project_type = payload["project_type"]
    preferences = payload.get("preferences")

    gen: Optional[Generation] = None

    async with SessionLocal() as db:
        try:
            analysis = preflight_analyze(prompt, project_type, preferences)

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
                set_status(job_id, "running", "clarifying", "Clarifying intent…")
                clar = normalize_clarify(await clarify_with_ai(prompt, "any"))
                if clar.needs_clarification:
                    job["status"] = "clarify"
                    job["step"] = "clarify"
                    job["message"] = "Clarification required."
                    job["questions"] = clar.questions
                    return

            # ── Save generation record
            set_status(job_id, "running", "saving_generation", "Saving generation…")
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

            # ── OpenAI
            set_status(job_id, "running", "calling_openai", "Generating code…")
            result = await generate_code_with_ai(prompt, effective_pt, effective_prefs)

            # ── Patch
            set_status(job_id, "running", "patching_files", "Patching files…")
            files = patch_generated_project(result.get("files", []) or [], effective_prefs)

            # ── Validate
            set_status(job_id, "running", "validating", "Validating output…")
            validation_errors = validate_node_openai(files) or []

            # ── Save project
            set_status(job_id, "running", "saving_project", "Saving project…")
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

            gen.project_id = project_id
            gen.status = "done"
            gen.duration_ms = int((_now_ts() - t0) * 1000)
            await db.commit()

            set_status(job_id, "done", "completed", "Done.")
            job["project_id"] = project_id

        except Exception as e:
            set_status(job_id, "error", "failed", "Failed.")
            job["error"] = str(e)

            if gen:
                try:
                    gen.status = "error"
                    gen.error_message = str(e)
                    gen.duration_ms = int((_now_ts() - t0) * 1000)
                    await db.commit()
                except Exception:
                    pass
