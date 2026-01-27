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
from backend.schemas.generate import GenerateRequest, ClarifyRequest, ClarifyResponse, PlanFeedbackRequest
from backend.services.preflight_service import preflight_analyze
from backend.services.ai_service import clarify_with_ai
from backend.agents.reasoning_agent import run_reasoning_step, run_final_reasoning_step
from backend.agents.code_agent import run_code_agent
from backend.agents.test_agent import run_test_agent
from backend.agents.security_agent import run_security_agent
from backend.agents.build_agent import run_build_agent
from backend.services.patch_service import patch_generated_project
from backend.services.agent_service import (
    get_step_info, create_chat_message, generate_step_chat_messages
)
from backend.services.security_checker import apply_security_fixes
from backend.services.fix_loop_service import run_fix_loop
from backend.services.dev_user_service import get_dev_user_ids, is_dev_user_id
from backend.validators.node_openai_validator import validate_node_openai

# ✅ Use the robust JSON parser (same one as repair step)
from backend.repair.ai_repair import _parse_ai_json as parse_ai_json, AIJSONError

# Preview service (build + status/log polling)
from backend.services.preview_service import start_preview_job, read_status, tail_logs, start_build
from backend.services.agent_event_service import append_event, list_events

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


def _emit_event(job_id: str, payload: Dict[str, Any]) -> None:
    job = JOB_STATUS.get(job_id)
    if not job:
        return
    append_event(job, payload)
    job["updated_at"] = _now_ts()


def _format_plan_text(plan: Dict[str, Any]) -> str:
    if not plan:
        return ""
    lines = []
    problem = plan.get("problem_statement")
    if problem:
        lines.append(f"Problem: {problem}")
    summary = plan.get("plan_summary")
    if summary:
        lines.append(f"Plan summary: {summary}")
    for idx, step in enumerate(plan.get("plan") or [], start=1):
        lines.append(f"{idx}. {step.get('title')}: {step.get('description')}")
    checks = plan.get("checks") or []
    if checks:
        lines.append("Checks:")
        for check in checks:
            lines.append(f"- {check}")
    return "\n".join(lines)


def _build_plan_message(plan: Dict[str, Any]) -> str:
    if not plan:
        return "No plan available."
    message = [
        "Reasoning agent produced a plan.",
        f"Problem statement: {plan.get('problem_statement') or 'N/A'}",
        f"Design guidelines summary: {plan.get('design_guidelines') or 'N/A'}",
        "Plan steps:"
    ]
    for idx, step in enumerate(plan.get("plan") or [], start=1):
        message.append(f"{idx}. {step.get('title')}: {step.get('description')}")
    summary = plan.get("plan_summary")
    if summary:
        message.append(f"Plan summary: {summary}")
    checks = plan.get("checks") or []
    if checks:
        message.append("Checks:")
        for check in checks:
            message.append(f"- {check}")
    return "\n".join(message)

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

        # Agent events
        "events": [],
        "event_seq": 0,

        # Reasoning plan state
        "plan": None,
        "plan_message": None,
        "plan_text": "",
        "plan_summary": None,
        "plan_confirmed": False,
        "plan_confirmation_at": None,
        "plan_ready_at": None,
        "final_reasoning": None,
        "final_reasoning_message": None,
        "final_confirmation": None,

        # Preflight metadata
        "preflight_analysis": None,
        "effective_preferences": None,

        # Preview & reporting
        "preview_url": None,
        "preview_id": None,
        "screenshots": [],
        "build_logs": "",
        "runtime_logs": "",
        "preview_summary": None,
        "build_result": None,

        # Security & fixes
        "security_findings": [],
        "security_stats": None,
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

    if status == "running" and step == "preflight":
        _emit_event(job_id, {
            "type": "plan",
            "title": "Preflight plan",
            "detail": message or "Analyzing prompt",
            "rationale": "Establish a plan before code generation",
        })

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

    if step == "validating" and success:
        _emit_event(job_id, {
            "type": "verify",
            "title": "Validate output",
            "detail": "Validated generated files for schema and structure",
            "rationale": "Ensure generated output meets build requirements",
            "result": {
                "validation_errors": int(ctx.get("validation_errors", 0) or 0),
            },
        })

    if step == "security_check" and success:
        findings = ctx.get("security_findings") or []
        high_count = len([f for f in findings if f.get("severity") == "high"])
        medium_count = len([f for f in findings if f.get("severity") == "medium"])
        scan_severity = "high" if high_count else ("medium" if medium_count else "low")
        _emit_event(job_id, {
            "type": "security_scan",
            "title": "Security scan",
            "detail": "Scanned generated files for security issues",
            "rationale": "Identify vulnerabilities before saving the project",
            "severity": scan_severity,
            "result": {
                "total": len(findings),
                "high": high_count,
                "medium": medium_count,
            },
        })

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


def _normalize_ai_result(result: Any) -> Dict[str, Any]:
    """
    Accepts dict or string output and always returns validated normalized project JSON.
    Uses the robust parser (extract JSON object + escape control chars + schema guard).
    """
    if isinstance(result, dict):
        # Run through parser for schema guard
        return parse_ai_json(json.dumps(result))
    if isinstance(result, str):
        return parse_ai_json(result)
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
    add_chat_message(job_id, f"🧪 {msg}")
    if phase == "build":
        _emit_event(job_id, {
            "type": "preview_build",
            "title": "Preview build",
            "detail": f"Starting preview build attempt {attempt or 1}",
            "rationale": "Build the project output for runtime verification",
            "result": {
                "attempt": int(attempt or 1),
                "max_attempts": int(max_attempts or 1),
            },
        })


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
    t0 = _now_ts()
    while True:
        st = read_status(preview_id)
        status = (st.get("status") or "").lower()

        logs = tail_logs(preview_id, max_bytes=PREVIEW_MAX_LOG_BYTES) or ""
        _set_live_logs(job_id, logs)

        if status in ("ready", "failed", "error"):
            return st

        set_status(job_id, "running", "preview_build", "Building preview… This can take a while.")
        await asyncio.sleep(PREVIEW_POLL_SECONDS)

        if (_now_ts() - t0) > timeout_seconds:
            raise TimeoutError("Preview build timed out")


def _call_run_fix_loop_dynamic(**kwargs) -> Any:
    sig = inspect.signature(run_fix_loop)
    accepted = {}
    for name in sig.parameters.keys():
        if name in kwargs:
            accepted[name] = kwargs[name]

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

        build_info = await run_build_agent(project_id_hint, effective_pt, files)
        preview_id = build_info.get("preview_id")
        preview_url = build_info.get("preview_url")
        build_result = build_info.get("build_result") or {}
        job["preview_url"] = preview_url
        preview_summary["final_preview_url"] = preview_url
        preview_summary["final_preview_id"] = preview_id
        job["preview_id"] = preview_id
        job["build_result"] = build_result

        if not preview_id:
            raise RuntimeError("Preview build failed to start: missing preview_id")
        if isinstance(build_result, dict) and not build_result.get("ok", True):
            err = build_result.get("error") or "unknown error"
            raise RuntimeError(f"Preview build failed to start: {err}")

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

        sig_now = f"{st.get('status')}|{st.get('error') or ''}|{runtime_sig}"
        if last_sig and sig_now == last_sig:
            add_chat_message(job_id, "🛑 No progress detected (same failure twice). Stopping auto-fix loop.")
            preview_summary["final_status"] = "no_progress"
            return files, preview_summary
        last_sig = sig_now

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
            initial_error=initial_error,
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


async def _plan_worker(job_id: str, user: dict):
    job = JOB_STATUS.get(job_id)
    if not job:
        return

    payload = job.get("payload") or {}
    prompt = str(payload.get("prompt") or "")
    project_type = str(payload.get("project_type") or "any")
    preferences = payload.get("preferences") or {}

    try:
        set_status(job_id, "running", "preflight", "Analyzing your prompt…")
        analysis = preflight_analyze(prompt, project_type, preferences)
        mark_step_complete(job_id, "preflight", True)

        effective_pt = (
            analysis.derived.get("effective_project_type")
            or project_type
            or "fullstack"
        ).lower().strip()
        effective_prefs = analysis.derived.get("effective_preferences") or preferences or {}

        job["effective_project_type"] = effective_pt
        job["effective_prompt"] = prompt
        job["effective_preferences"] = effective_prefs
        job["preflight_analysis"] = analysis

        if (project_type or "").lower().strip() == "any":
            set_status(job_id, "running", "clarifying", "Clarifying intent…", {"project_type": effective_pt})
            clar = normalize_clarify(await clarify_with_ai(prompt, "any"))
            if clar.needs_clarification:
                job["status"] = "clarify"
                job["step"] = "clarify"
                job["message"] = "Clarification required."
                job["questions"] = clar.questions
                add_chat_message(job_id, "ðŸ¤” I need some clarification before I can generate your project.")
                return

        set_status(job_id, "running", "reasoning", "Drafting the PRD and design guidelines…")
        plan = await run_reasoning_step(prompt, effective_pt, effective_prefs)
        job["plan"] = plan
        job["plan_summary"] = plan.get("plan_summary")
        job["plan_text"] = _format_plan_text(plan)
        job["plan_message"] = _build_plan_message(plan)
        job["plan_ready_at"] = _now_ts()
        job["plan_confirmed"] = False
        mark_step_complete(job_id, "reasoning", True)

        set_status(job_id, "running", "plan_review", "Plan ready. Confirm to continue.")
        job["status"] = "plan_ready"
        job["step"] = "plan_review"
        job["message"] = (
            "The reasoning agent produced a PRD and design checklist. "
            "Please review and confirm to proceed."
        )
        add_chat_message(job_id, f"ðŸš€ Reasoning plan ready:\n{job['plan_message']}")

    except HTTPException as e:
        set_status(job_id, "error", "error", "Failed.", {"error": str(e.detail)})
        job["status"] = "error"
        job["error"] = str(e.detail)
        add_chat_message(job_id, f"âŒ {str(e.detail)}", {"error": True})

    except Exception as e:
        set_status(job_id, "error", "error", "Failed.", {"error": str(e)})
        job["status"] = "error"
        job["error"] = str(e)
        add_chat_message(job_id, f"âŒ An error occurred: {str(e)}", {"error": True})


@router.post("/generate/clarify", response_model=ClarifyResponse)
async def generate_clarify(req: ClarifyRequest, user=Depends(get_current_user)):
    if (req.project_type or "").lower().strip() != "any":
        return ClarifyResponse(needs_clarification=False, questions=[], derived={"reason": "not_any"})
    return normalize_clarify(await clarify_with_ai(req.prompt, "any"))


@router.post("/generate")
async def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    cleanup_jobs()

    DEV_USER_IDS = get_dev_user_ids()
    if not (DEV_USER_IDS and is_dev_user_id(user["id"])):
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
    background_tasks.add_task(_plan_worker, job_id, user)
    return {"job_id": job_id}


@router.post("/generate/preview/{job_id}")
async def build_preview_for_job(job_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not job.get("files") or not job.get("effective_project_type") or not job.get("effective_prompt"):
        raise HTTPException(status_code=400, detail="Nothing to preview yet")

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


@router.get("/generate/status/{job_id}")
async def get_generation_status(job_id: str, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] in {"queued", "running"}:
        step = (job.get("step") or "").lower()
        preview_in_progress = step.startswith("preview")
        if not preview_in_progress and (_now_ts() - job["started_at"]) > JOB_TIMEOUT_SECONDS:
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

        "build_logs": job.get("build_logs", ""),
        "runtime_logs": job.get("runtime_logs", ""),

        "files": job.get("files", []),

        "started_at": job.get("started_at"),
        "updated_at": job.get("updated_at"),
        "plan": job.get("plan"),
        "plan_summary": job.get("plan_summary"),
        "plan_message": job.get("plan_message"),
        "plan_text": job.get("plan_text"),
        "plan_ready_at": job.get("plan_ready_at"),
        "plan_confirmed": job.get("plan_confirmed"),
        "plan_confirmation_at": job.get("plan_confirmation_at"),
        "test_report": job.get("test_report"),
        "security_stats": job.get("security_stats"),
        "final_reasoning": job.get("final_reasoning"),
        "final_reasoning_message": job.get("final_reasoning_message"),
        "final_confirmation": job.get("final_confirmation"),
        "build_result": job.get("build_result"),
        "preview_id": job.get("preview_id"),
    }


@router.get("/generate/events/{job_id}")
async def get_generation_events(
    job_id: str,
    after: Optional[str] = None,
    wait_ms: Optional[int] = None,
    user=Depends(get_current_user),
):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    wait_ms = max(0, min(int(wait_ms or 0), 30000))
    deadline = _now_ts() + (wait_ms / 1000.0 if wait_ms else 0)

    while True:
        events, cursor = list_events(job, after)
        if events or wait_ms <= 0 or _now_ts() >= deadline:
            return {"events": events, "next_cursor": cursor}
        await asyncio.sleep(0.25)

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
    background_tasks.add_task(_plan_worker, job_id, user)
    return {"status": "resumed"}


@router.post("/generate/plan/{job_id}/confirm")
async def confirm_plan(job_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not job.get("plan"):
        raise HTTPException(status_code=400, detail="Plan not ready yet")
    if job.get("plan_confirmed"):
        raise HTTPException(status_code=400, detail="Plan already confirmed")

    job["plan_confirmed"] = True
    job["plan_confirmation_at"] = _now_ts()
    mark_step_complete(job_id, "plan_review", True)
    job["status"] = "running"
    job["step"] = "generating"
    job["message"] = "Plan confirmed. Generating code…"
    add_chat_message(job_id, "âœ… Plan confirmed. Code agent starting…")
    background_tasks.add_task(_execution_worker, job_id, user)
    return {"status": "started"}


@router.post("/generate/plan/{job_id}/feedback")
async def submit_plan_feedback(
    job_id: str,
    payload: PlanFeedbackRequest,
    user=Depends(get_current_user),
):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    if job.get("plan_confirmed"):
        raise HTTPException(status_code=400, detail="Plan already confirmed")
    if job.get("status") != "plan_ready":
        raise HTTPException(status_code=400, detail="Plan feedback is only accepted while the plan is pending review")

    user_message = create_chat_message(payload.message, "user", {"topic": "plan_feedback"})
    ack_message = create_chat_message(
        "✍️ Noted your note about the plan. Confirm when you are ready to begin coding.",
        "agent",
        {"topic": "plan_feedback_ack"},
    )
    job["chat_messages"] = job.get("chat_messages", []) + [user_message, ack_message]
    job["updated_at"] = _now_ts()
    return {"status": "recorded"}


@router.post("/generate/final/confirm/{job_id}")
async def confirm_final_review(job_id: str, user=Depends(get_current_user)):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not job.get("final_reasoning"):
        raise HTTPException(status_code=400, detail="Final review not ready")
    if job.get("final_confirmation"):
        raise HTTPException(status_code=400, detail="Already confirmed")

    job["final_confirmation"] = {
        "user_id": user["id"],
        "timestamp": _now_iso(),
    }
    mark_step_complete(job_id, "final_review", True)
    set_status(job_id, "done", "done", "Final review confirmed.")
    job["message"] = "Final review confirmed. Project ready."
    add_chat_message(job_id, "âœ… Final review confirmed. Mission complete.")
    return {"status": "confirmed"}


async def _execution_worker(job_id: str, user: dict):
    job = JOB_STATUS.get(job_id)
    if not job:
        return

    t0 = _now_ts()
    payload = job.get("payload") or {}
    prompt = str(job.get("effective_prompt") or payload.get("prompt") or "")
    project_type = (
        str(job.get("effective_project_type") or payload.get("project_type") or "fullstack")
    ).lower().strip()
    preferences = job.get("effective_preferences") or payload.get("preferences") or {}
    plan_text = str(job.get("plan_text") or "")
    plan_summary = job.get("plan_summary")
    plan_message = job.get("plan_message")

    gen: Optional[Generation] = None
    files: List[Dict[str, str]] = []
    test_report: Optional[Dict[str, Any]] = None
    security_stats: Dict[str, Any] = {}

    async with SessionLocal() as db:
        try:
            gen = Generation(
                id=str(uuid.uuid4()),
                user_id=user["id"],
                prompt=prompt,
                project_type=project_type,
                status="running",
                created_at=datetime.utcnow(),
            )
            db.add(gen)
            await db.commit()

            set_status(job_id, "running", "generating", "Generating code…", {"project_type": project_type})
            add_chat_message(job_id, "✨ Reasoning confirmed. Code agent is writing the project…")

            raw = await run_code_agent(prompt, project_type, preferences, plan_text)

            try:
                result = _normalize_ai_result(raw)
            except AIJSONError as e:
                snippet = raw[:2000] if isinstance(raw, str) else ""
                job["status"] = "error"
                job["step"] = "generating"
                job["error"] = f"AI output invalid JSON: {str(e)}"
                job["message"] = "Generation failed: invalid AI JSON."
                add_chat_message(job_id, "âŒ AI output invalid JSON. Retrying generation usually fixes this.", {"error": True})
                if snippet:
                    add_chat_message(job_id, f"ðŸ§¾ Raw snippet (first 2k chars):\n{snippet}", {"error": True})
                if gen:
                    try:
                        gen.status = "error"
                        gen.error_message = str(e)
                        gen.duration_ms = int((_now_ts() - t0) * 1000)
                        await db.commit()
                    except Exception:
                        pass
                return

            files = result.get("files") or []
            job["files"] = files
            mark_step_complete(job_id, "generating", True, {"file_count": len(files)})
            add_chat_message(job_id, f"âœ¨ Generated {len(files)} files!")

            set_status(job_id, "running", "patching", "Patching files…")
            files = patch_generated_project(files, preferences)
            job["files"] = files
            mark_step_complete(job_id, "patching", True)

            set_status(job_id, "running", "testing", "Running tests and validations…")
            test_report = await run_test_agent(files)
            job["test_report"] = test_report
            validation_errors = len(test_report.get("validation_errors") or []) if test_report else 0
            mark_step_complete(job_id, "testing", True, {"validation_errors": validation_errors})
            if validation_errors:
                add_chat_message(job_id, f"⚠️ Validation returned {validation_errors} warning(s).")

            set_status(job_id, "running", "security_check", "Running security analysis…")
            security_result = await run_security_agent(files)
            findings = security_result.get("security_findings") or []
            security_stats = security_result.get("security_stats") or {}
            job["security_findings"] = findings
            job["security_stats"] = security_stats

            if findings and int(security_stats.get("auto_fixable", 0) or 0) > 0:
                set_status(
                    job_id,
                    "running",
                    "fixing",
                    "Auto-fixing security issues…",
                    {"fix_count": int(security_stats.get("auto_fixable", 0) or 0)}
                )
                files, applied_security_fixes = apply_security_fixes(files, findings)
                job["files"] = files
                job["applied_fixes"] = _as_list_safe(job.get("applied_fixes")) + _as_list_safe(applied_security_fixes)
                mark_step_complete(job_id, "fixing", True)

            mark_step_complete(
                job_id,
                "security_check",
                True,
                {
                    "security_findings": findings,
                    "security_findings_count": len(findings),
                }
            )

            set_status(job_id, "running", "saving", "Saving project…")
            project_id = str(uuid.uuid4())
            now = datetime.utcnow()

            project = Project(
                id=project_id,
                user_id=user["id"],
                prompt=prompt,
                project_type=project_type,
                name=result.get("name", "Generated Project"),
                description=result.get("description", ""),
                validation_errors={"items": test_report.get("validation_errors") if test_report else []},
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

            preview_report = PreviewReport(
                id=str(uuid.uuid4()),
                job_id=job_id,
                project_id=project_id,
                user_id=user["id"],
                timeline_steps=job.get("timeline", []),
                chat_messages=job.get("chat_messages", []),
                screenshots=[],
                applied_fixes=job.get("applied_fixes", []),
                security_findings=job.get("security_findings", []),
                final_status="success",
                created_at=now,
                updated_at=now,
            )
            db.add(preview_report)

            gen.project_id = project_id
            gen.status = "done"
            gen.duration_ms = int((_now_ts() - t0) * 1000)
            await db.commit()

            job["project_id"] = project_id
            mark_step_complete(job_id, "saving", True)
            add_chat_message(job_id, "âœ… Project saved. Building preview…")

            await _preview_worker(job_id)

            set_status(job_id, "running", "final_review", "Final reasoning review…")
            job["status"] = "review_pending"
            job["step"] = "final_review"
            job["message"] = "Final reasoning review ready. Confirm to finish."
            final_reasoning = await run_final_reasoning_step(
                prompt=prompt,
                project_type=project_type,
                preferences=preferences,
                plan_summary=plan_summary,
                plan_message=plan_message,
                files_count=len(files),
                test_report=test_report,
                security_stats=security_stats,
                preview_summary=job.get("preview_summary"),
                build_result=job.get("build_result"),
            )
            job["final_reasoning"] = final_reasoning
            job["final_reasoning_message"] = json.dumps(final_reasoning, ensure_ascii=False, indent=2)
            add_chat_message(job_id, f"🧭 Final reasoning review ready:\\n{job['final_reasoning_message']}")

        except HTTPException as e:
            set_status(job_id, "error", "error", "Failed.", {"error": str(e.detail)})
            job["error"] = str(e.detail)
            add_chat_message(job_id, f"âŒ {str(e.detail)}", {"error": True})
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
            add_chat_message(job_id, f"âŒ An error occurred: {str(e)}", {"error": True})
            if gen:
                try:
                    gen.status = "error"
                    gen.error_message = str(e)
                    gen.duration_ms = int((_now_ts() - t0) * 1000)
                    await db.commit()
                except Exception:
                    pass


