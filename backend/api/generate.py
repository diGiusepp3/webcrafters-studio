# FILE: backend/api/generate.py
# =========================================================
# Enhanced with Agent Timeline, Chat Messages, Security & Fix Loop
# =========================================================

"""
Upgrade:
- Preview is NOT built during generation anymore.
  Generation finishes -> user clicks Preview -> backend runs preview build + fix loop.
- Fix-loop: run_fix_loop(initial_error=...) is always provided when required.
- UX: while preview is building, job.message updates continuously + live build_logs stream.
"""

import os
import time
import uuid
import json
import asyncio
import inspect
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select, func

from backend.api.deps import get_current_user
from backend.core.database import SessionLocal
from backend.models.generation import Generation
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.models.preview_report import PreviewReport
from backend.models.credit_ledger import CreditLedger
from backend.schemas.generate import GenerateRequest, ClarifyRequest, ClarifyResponse
from backend.services.preflight_service import preflight_analyze
from backend.services.ai_service import clarify_with_ai, generate_code_with_ai
from backend.services.patch_service import patch_generated_project
from backend.services.agent_service import (
    get_step_info, create_chat_message, generate_step_chat_messages
)
from backend.services.security_checker import check_project_security, apply_security_fixes
from backend.services.fix_loop_service import run_fix_loop
from backend.validators.node_openai_validator import validate_node_openai

# Preview service (build + status/log polling)
from backend.services.preview_service import start_preview_job, read_status, tail_logs

router = APIRouter(prefix="/api", tags=["generate"])

# ⚠️ In-memory job state = 1 uvicorn worker
JOB_STATUS: Dict[str, Dict[str, Any]] = {}

JOB_TIMEOUT_SECONDS = 10 * 60
JOB_CLEANUP_AFTER_SECONDS = 60 * 60

# Preview fix-loop controls
PREVIEW_FIX_MAX_ITERS = int(os.getenv("PREVIEW_FIX_MAX_ITERS", "4"))
PREVIEW_POLL_SECONDS = float(os.getenv("PREVIEW_POLL_SECONDS", "1.5"))
PREVIEW_POLL_TIMEOUT_SECONDS = int(os.getenv("PREVIEW_POLL_TIMEOUT_SECONDS", "12")) * 60
PREVIEW_MAX_LOG_BYTES = int(os.getenv("PREVIEW_MAX_LOG_BYTES", "16000"))

# Runtime error policy: treat console error as failure unless allowlisted
RUNTIME_ERROR_STRICT = (os.getenv("PREVIEW_RUNTIME_ERROR_STRICT", "true").strip().lower() in ("1", "true", "yes"))


def _now_ts() -> float:
    return time.time()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def init_job_state(job_id: str, payload: Dict[str, Any], user_id: str) -> Dict[str, Any]:
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

        # Timeline and chat
        "timeline": [],
        "chat_messages": [],

        # Preview & reporting
        "preview_url": None,
        "screenshots": [],
        "build_logs": "",
        "runtime_logs": "",
        "preview_summary": None,

        # Security & fixes
        "security_findings": [],
        "applied_fixes": [],

        # Live file updates
        "files": [],

        # Store effective project metadata for Preview click later
        "effective_project_type": None,
        "effective_prompt": None,

        # Timestamps
        "started_at": _now_ts(),
        "updated_at": _now_ts(),
    }


def set_status(job_id: str, status: str, step: str, message: Optional[str] = None, context: Optional[Dict[str, Any]] = None):
    job = JOB_STATUS.get(job_id)
    if not job:
        return

    ctx = context or {}
    job["status"] = status
    job["step"] = step
    if message is not None:
        job["message"] = message
    job["updated_at"] = _now_ts()

    # timeline
    step_info = get_step_info(step)
    timeline = job.get("timeline", [])
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
        timeline.append({
            "step": step,
            "status": "running" if status == "running" else ("success" if status == "done" else "error"),
            "title": step_info.get("title", step),
            "description": step_info.get("description", ""),
            "icon": step_info.get("icon", "loader"),
            "started_at": _now_iso(),
            "completed_at": None,
            "duration_ms": None
        })

    job["timeline"] = timeline

    # chat messages
    chat_status = "running" if status == "running" else ("success" if status == "done" else "error")
    messages = generate_step_chat_messages(step, chat_status, ctx)
    if messages:
        job["chat_messages"] = job.get("chat_messages", []) + messages


def add_chat_message(job_id: str, message: str, metadata: Optional[Dict[str, Any]] = None):
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    chat_msg = create_chat_message(message, "agent", metadata)
    job["chat_messages"] = job.get("chat_messages", []) + [chat_msg]
    job["updated_at"] = _now_ts()


def mark_step_complete(job_id: str, step: str, success: bool = True, context: Optional[Dict[str, Any]] = None):
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
# AI JSON repair + parse (minimal)
# ─────────────────────────────────────────────
def _extract_json_object(raw: str) -> str:
    s = raw.strip()
    i = s.find("{")
    j = s.rfind("}")
    if i == -1 or j == -1 or j <= i:
        raise ValueError("No JSON object found in AI output")
    return s[i: j + 1]


def _repair_json_control_chars_in_strings(s: str) -> str:
    out: List[str] = []
    in_str = False
    esc = False
    for ch in s:
        if not in_str:
            if ch == '"':
                in_str = True
            out.append(ch)
            continue

        if esc:
            out.append(ch)
            esc = False
            continue

        if ch == "\\":
            out.append(ch)
            esc = True
            continue

        if ch == '"':
            in_str = False
            out.append(ch)
            continue

        if ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        else:
            out.append(ch)

    return "".join(out)


def _parse_ai_json(raw: str) -> Dict[str, Any]:
    js = _extract_json_object(raw)
    js2 = _repair_json_control_chars_in_strings(js)
    return json.loads(js2)


def _normalize_ai_result(result: Any) -> Dict[str, Any]:
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        return _parse_ai_json(result)
    raise ValueError("AI result must be dict or JSON string")


# ─────────────────────────────────────────────
# UX helpers for preview build loop
# ─────────────────────────────────────────────
def set_building_message(job_id: str, phase: str, attempt: Optional[int] = None, max_attempts: Optional[int] = None):
    label = {
        "install": "Installing dependencies",
        "build": "Building",
        "render": "Rendering preview",
        "fix": "Auto-fixing",
        "verify": "Verifying runtime",
    }.get(phase, "Building")

    suffix = ""
    if attempt is not None and max_attempts is not None:
        suffix = f" (attempt {attempt}/{max_attempts})"

    msg = f"{label}{suffix}… This can take a while."
    set_status(job_id, "running", "preview_build", msg)
    # geen spam: chat enkel bij phase change/attempt start
    add_chat_message(job_id, f"🧪 {msg}")


def _set_live_logs(job_id: str, text: str):
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    job["build_logs"] = (text or "")[-24000:]
    job["updated_at"] = _now_ts()


# ─────────────────────────────────────────────
# Preview build + auto-fix loop (ON PREVIEW CLICK)
# ─────────────────────────────────────────────
def _runtime_error_signature(screenshots: Dict[str, Any]) -> str:
    errs = screenshots.get("page_errors") or []
    console = screenshots.get("console") or []
    c_errs = [c.get("text", "") for c in console if str(c.get("type", "")).lower() == "error"]
    sig = "\n".join((errs[:3] + c_errs[:3]))[:1400]
    return sig.strip()


async def _poll_preview_until_done_streaming(job_id: str, preview_id: str, timeout_seconds: int) -> Dict[str, Any]:
    """
    Poll preview status, and keep updating job.message + job.build_logs so users see progress.
    """
    t0 = _now_ts()
    while True:
        st = read_status(preview_id)
        status = (st.get("status") or "").lower()

        # stream logs while building
        logs = tail_logs(preview_id, max_bytes=PREVIEW_MAX_LOG_BYTES) or ""
        _set_live_logs(job_id, logs)

        if status in ("ready", "failed", "error"):
            return st

        # user-facing heartbeat
        set_status(job_id, "running", "preview_build", "Building preview… This can take a while.")
        await asyncio.sleep(PREVIEW_POLL_SECONDS)

        if (_now_ts() - t0) > timeout_seconds:
            raise TimeoutError("Preview build timed out")


def _call_run_fix_loop_dynamic(**kwargs) -> Any:
    """
    Calls run_fix_loop() with only the args it accepts.
    IMPORTANT: supports required 'initial_error'.
    """
    sig = inspect.signature(run_fix_loop)
    accepted = {}
    for name in sig.parameters.keys():
        if name in kwargs:
            accepted[name] = kwargs[name]

    # if initial_error is required and missing -> synthesize from available info
    if "initial_error" in sig.parameters and "initial_error" not in accepted:
        accepted["initial_error"] = (
                kwargs.get("initial_error")
                or kwargs.get("build_error")
                or kwargs.get("runtime_error_sig")
                or kwargs.get("runtime_logs")
                or kwargs.get("build_logs")
                or "Preview failed"
        )

    return run_fix_loop(**accepted)


def _as_list_safe(x: Any) -> List[Any]:
    if x is None:
        return []
    if isinstance(x, list):
        return x
    if isinstance(x, tuple):
        return list(x)
    if isinstance(x, dict):
        return [x]
    return []


def _normalize_fix_loop_return(ret: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if isinstance(ret, tuple) and len(ret) == 2:
        files, fixes = ret
        return _as_list_safe(files), _as_list_safe(fixes)

    if isinstance(ret, dict):
        files = ret.get("files") or ret.get("patched_files") or ret.get("result_files") or []
        fixes = ret.get("applied_fixes") or ret.get("fixes") or ret.get("patches") or []
        return _as_list_safe(files), _as_list_safe(fixes)

    if isinstance(ret, list):
        return ret, []

    raise ValueError("Unsupported run_fix_loop return type")


async def _preview_fix_loop(
        job_id: str,
        project_id_hint: str,
        prompt: str,
        effective_pt: str,
        files: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    job = JOB_STATUS[job_id]
    applied_fixes_all: List[Dict[str, Any]] = list(job.get("applied_fixes") or [])
    fixes_memory: List[Dict[str, Any]] = []
    last_sig = None

    preview_summary: Dict[str, Any] = {
        "iterations": [],
        "final_preview_url": None,
        "final_preview_id": None,
        "final_screenshots": None,
        "final_status": None,
    }

    for i in range(PREVIEW_FIX_MAX_ITERS):
        attempt = i + 1
        set_building_message(job_id, "build", attempt, PREVIEW_FIX_MAX_ITERS)

        pj = start_preview_job(project_id_hint, files, project_type=effective_pt)
        preview_id = pj.get("preview_id")
        preview_url = pj.get("url")
        job["preview_url"] = preview_url
        preview_summary["final_preview_url"] = preview_url
        preview_summary["final_preview_id"] = preview_id

        st = await _poll_preview_until_done_streaming(job_id, preview_id, PREVIEW_POLL_TIMEOUT_SECONDS)
        build_logs = tail_logs(preview_id, max_bytes=PREVIEW_MAX_LOG_BYTES) or ""
        _set_live_logs(job_id, build_logs)

        screenshots = st.get("screenshots") or {}
        runtime_sig = _runtime_error_signature(screenshots)
        has_runtime_errors = bool(runtime_sig)

        build_failed = (st.get("status") or "").lower() in ("failed", "error")
        runtime_failed = (RUNTIME_ERROR_STRICT and has_runtime_errors)

        preview_summary["iterations"].append({
            "attempt": attempt,
            "preview_id": preview_id,
            "preview_url": preview_url,
            "build_status": st.get("status"),
            "build_error": st.get("error"),
            "runtime_error_sig": runtime_sig,
        })

        if not build_failed and not runtime_failed:
            job["screenshots"] = [
                {"type": "desktop", "path": screenshots.get("desktop")},
                {"type": "mobile", "path": screenshots.get("mobile")},
            ]
            preview_summary["final_screenshots"] = screenshots
            preview_summary["final_status"] = "ok"
            add_chat_message(job_id, "✅ Preview ok.")
            return files, preview_summary

        # No-progress detection
        sig_now = f"{st.get('status')}|{st.get('error') or ''}|{runtime_sig}"
        if last_sig and sig_now == last_sig:
            add_chat_message(job_id, "🛑 No progress detected (same failure twice). Stopping auto-fix loop.")
            preview_summary["final_status"] = "no_progress"
            return files, preview_summary
        last_sig = sig_now

        # Build/runtime failure -> run fix loop
        set_building_message(job_id, "fix", attempt, PREVIEW_FIX_MAX_ITERS)

        runtime_logs = ""
        if has_runtime_errors:
            runtime_logs = json.dumps({
                "page_errors": screenshots.get("page_errors") or [],
                "console_errors": [
                    c for c in (screenshots.get("console") or [])
                    if str(c.get("type", "")).lower() == "error"
                ],
            }, indent=2)

        job["runtime_logs"] = runtime_logs

        initial_error = (st.get("error") or runtime_sig or "Preview failed")

        ret = _call_run_fix_loop_dynamic(
            prompt=prompt,
            project_type=effective_pt,
            files=files,
            build_logs=build_logs,
            runtime_logs=runtime_logs,
            previous_fixes=fixes_memory,
            iteration=attempt,
            max_iters=PREVIEW_FIX_MAX_ITERS,
            initial_error=initial_error,      # ✅ required by your run_fix_loop
            build_error=st.get("error"),
            runtime_error_sig=runtime_sig,
        )
        new_files, new_fixes = _normalize_fix_loop_return(ret)

        fixes_memory.extend(_as_list_safe(new_fixes))
        applied_fixes_all.extend(_as_list_safe(new_fixes))
        job["applied_fixes"] = applied_fixes_all
        job["files"] = new_files
        files = new_files

        add_chat_message(job_id, "🔁 Auto-fix applied. Rebuilding preview…")

    preview_summary["final_status"] = "max_iters_reached"
    add_chat_message(job_id, "🛑 Auto-fix limit reached.")
    return files, preview_summary


# ─────────────────────────────────────────────
# CLARIFY (standalone)
# ─────────────────────────────────────────────
@router.post("/generate/clarify", response_model=ClarifyResponse)
async def generate_clarify(req: ClarifyRequest, user=Depends(get_current_user)):
    if (req.project_type or "").lower().strip() != "any":
        return ClarifyResponse(needs_clarification=False, questions=[], derived={"reason": "not_any"})
    return normalize_clarify(await clarify_with_ai(req.prompt, "any"))


# ─────────────────────────────────────────────
# START GENERATION
# ─────────────────────────────────────────────
@router.post("/generate")
async def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    cleanup_jobs()

    # ✅ PAYWALL ENFORCEMENT (backend is source of truth)
    DEV_USER_ID = (os.getenv("DEV_USER_ID") or os.getenv("REACT_APP_DEV_USER_ID") or "").strip()
    if DEV_USER_ID and str(user["id"]) != str(DEV_USER_ID):
        async with SessionLocal() as db:
            r = await db.execute(
                select(func.coalesce(func.sum(CreditLedger.amount_cents), 0))
                .where(CreditLedger.user_id == user["id"])
            )
            balance_cents = int(r.scalar() or 0)
        if balance_cents <= 0:
            raise HTTPException(status_code=402, detail="No credits. Please purchase credits to generate.")

    job_id = str(uuid.uuid4())
    payload = {"prompt": req.prompt, "project_type": req.project_type, "preferences": req.preferences}
    JOB_STATUS[job_id] = init_job_state(job_id, payload, user["id"])

    add_chat_message(job_id, "🚀 Starting your project generation...")
    background_tasks.add_task(_generation_worker, job_id, user)
    return {"job_id": job_id}


# ─────────────────────────────────────────────
# PREVIEW CLICK (NEW)
# ─────────────────────────────────────────────
@router.post("/generate/preview/{job_id}")
async def build_preview_for_job(job_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not job.get("files") or not job.get("effective_project_type") or not job.get("effective_prompt"):
        raise HTTPException(status_code=400, detail="Nothing to preview yet")

    # run preview build loop in background
    background_tasks.add_task(_preview_worker, job_id)
    set_building_message(job_id, "build", 1, PREVIEW_FIX_MAX_ITERS)
    return {"status": "started"}


async def _preview_worker(job_id: str):
    job = JOB_STATUS.get(job_id)
    if not job:
        return

    try:
        set_building_message(job_id, "build", 1, PREVIEW_FIX_MAX_ITERS)

        files, preview_summary = await _preview_fix_loop(
            job_id=job_id,
            project_id_hint=str(job.get("project_id") or f"job:{job_id}"),
            prompt=str(job.get("effective_prompt") or ""),
            effective_pt=str(job.get("effective_project_type") or "any"),
            files=list(job.get("files") or []),
        )

        job["files"] = files
        job["preview_summary"] = preview_summary
        job["updated_at"] = _now_ts()

        # keep status as done (generation is done) but with preview ready
        job["status"] = "done"
        job["step"] = "done"
        job["message"] = "Preview finished."
        add_chat_message(job_id, "✅ Preview finished.")

    except Exception as e:
        job["status"] = "error"
        job["step"] = "preview_failed"
        job["error"] = str(e)
        job["message"] = "Preview failed."
        add_chat_message(job_id, f"❌ Preview failed: {str(e)}", {"error": True})


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
            add_chat_message(job_id, "⏱️ Generation timed out. Please try again with a simpler request.")

    return {
        "job_id": job_id,
        "status": job.get("status"),
        "step": job.get("step"),
        "message": job.get("message"),
        "project_id": job.get("project_id"),
        "questions": job.get("questions"),
        "error": job.get("error"),

        "timeline": job.get("timeline", []),
        "chat_messages": job.get("chat_messages", []),

        "preview_url": job.get("preview_url"),
        "screenshots": job.get("screenshots", []),
        "preview_summary": job.get("preview_summary"),

        "security_findings": job.get("security_findings", []),
        "applied_fixes": job.get("applied_fixes", []),

        # show logs while preview building
        "build_logs": job.get("build_logs", ""),
        "runtime_logs": job.get("runtime_logs", ""),

        "files": job.get("files", []),

        "started_at": job.get("started_at"),
        "updated_at": job.get("updated_at"),
    }


# ─────────────────────────────────────────────
# CONTINUE AFTER CLARIFY
# ─────────────────────────────────────────────
@router.post("/generate/continue/{job_id}")
async def continue_generation(job_id: str, answers: Dict[str, Any], background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job or job["status"] != "clarify":
        raise HTTPException(status_code=400, detail="Job is not awaiting clarification")

    original_prompt = job["payload"]["prompt"]
    merged_prompt = original_prompt + "\n\nCLARIFICATION ANSWERS:\n" + json.dumps(answers, indent=2)

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
# BACKGROUND WORKER (GENERATION ONLY; NO PREVIEW BUILD HERE)
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
    files: List[Dict[str, str]] = []

    async with SessionLocal() as db:
        try:
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

            job["effective_project_type"] = effective_pt
            job["effective_prompt"] = prompt

            # Clarify if needed
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

            # Save generation record
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

            # Generate code
            set_status(job_id, "running", "generating", "Generating code…", {"project_type": effective_pt})
            add_chat_message(job_id, f"🎨 Creating a {effective_pt} project…")

            raw = await generate_code_with_ai(prompt, effective_pt, effective_prefs)
            result = _normalize_ai_result(raw)

            files = result.get("files", []) or []
            job["files"] = files
            mark_step_complete(job_id, "generating", True, {"file_count": len(files)})
            add_chat_message(job_id, f"✨ Generated {len(files)} files!")

            # Patch files
            set_status(job_id, "running", "patching", "Patching files…")
            files = patch_generated_project(files, effective_prefs)
            job["files"] = files
            mark_step_complete(job_id, "patching", True)

            # Validate
            set_status(job_id, "running", "validating", "Validating output…")
            validation_errors = validate_node_openai(files) or []
            mark_step_complete(job_id, "validating", True, {"validation_errors": len(validation_errors)})

            # Security check
            set_status(job_id, "running", "security_check", "Running security analysis…")
            security_findings, security_stats = check_project_security(files)
            job["security_findings"] = security_findings

            if security_findings and int(security_stats.get("auto_fixable", 0) or 0) > 0:
                set_status(job_id, "running", "fixing", "Auto-fixing security issues…", {"fix_count": security_stats["auto_fixable"]})
                files, applied_security_fixes = apply_security_fixes(files, security_findings)
                job["files"] = files
                job["applied_fixes"] = _as_list_safe(job.get("applied_fixes")) + _as_list_safe(applied_security_fixes)
                mark_step_complete(job_id, "fixing", True)

            mark_step_complete(job_id, "security_check", True, {"security_findings": len(security_findings or [])})

            # Save project
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
                db.add(ProjectFile(
                    project_id=project_id,
                    path=(f.get("path") or "").lstrip("/"),
                    language=f.get("language"),
                    content=f.get("content") or "",
                    created_at=now,
                ))

            # Save preview report (generation report only; preview build happens on click)
            preview_report = PreviewReport(
                id=str(uuid.uuid4()),
                job_id=job_id,
                project_id=project_id,
                user_id=user["id"],
                timeline_steps=job.get("timeline", []),
                chat_messages=job.get("chat_messages", []),
                screenshots=[],
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

            # Done (tell user Preview click will build)
            job["project_id"] = project_id
            set_status(job_id, "done", "done", "Generated. Click Preview to build & verify runtime.")
            add_chat_message(job_id, "✅ Generated. Click Preview to build & verify runtime.")

        except HTTPException as e:
            set_status(job_id, "error", "error", "Failed.", {"error": str(e.detail)})
            job["error"] = str(e.detail)
            add_chat_message(job_id, f"❌ {str(e.detail)}", {"error": True})
            if gen:
                try:
                    gen.status = "error"
                    gen.error_message = str(e.detail)
                    gen.duration_ms = int((_now_ts() - t0) * 1000)
                    await db.commit()
                except Exception:
                    pass

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
