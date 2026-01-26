# =========================================================
# FILE: backend/api/projects.py
# =========================================================

import io
import zipfile
import logging
from typing import List, Optional, Dict, Any
from datetime import timezone, datetime
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.models.project_source import ProjectSource
from backend.models.github_connection import GitHubConnection
from backend.schemas.projects import ProjectHistoryItem, ProjectResponse, ProjectFileSaveRequest, ProjectFileSaveResponse
from backend.schemas.github import GitHubRefreshResponse, GitHubRefreshFileUpdate, GitHubRefreshRequest
from backend.schemas.security import SecurityScanResponse, SecurityFixProposalResponse, SecurityFixApplyResponse
from backend.services.encryption_service import decrypt_token
from backend.services import github_service
from backend.services.security_checker import check_project_security, apply_security_fixes

router = APIRouter(prefix="/api", tags=["projects"])
logger = logging.getLogger("webcrafters-studio.projects")

SECURITY_PROPOSALS: Dict[str, Dict[str, Any]] = {}
SECURITY_PROPOSAL_TTL_SECONDS = 3600


def _cleanup_security_proposals() -> None:
    now = time.time()
    expired = [
        k for k, v in SECURITY_PROPOSALS.items()
        if now - v.get("created_at", 0) > SECURITY_PROPOSAL_TTL_SECONDS
    ]
    for k in expired:
        SECURITY_PROPOSALS.pop(k, None)


def _format_security_findings(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted = []
    for f in findings:
        item = dict(f)
        item["title"] = item.get("name") or item.get("rule_id") or "Security issue"
        item["recommendation"] = item.get("fix_suggestion") or item.get("recommendation")
        item["code"] = item.get("line_content") or item.get("code")
        formatted.append(item)
    return formatted


async def _count_files(db: AsyncSession, project_id: str) -> int:
    n = (
        await db.execute(
            select(func.count(ProjectFile.id))
            .where(ProjectFile.project_id == project_id)
        )
    ).scalar_one()
    return int(n or 0)

def _infer_language_from_path(path: str) -> str:
    ext = (path or "").lower().rsplit(".", 1)
    suffix = ext[-1] if len(ext) > 1 else ""
    lang_map = {
        "py": "python",
        "js": "javascript",
        "jsx": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "html": "html",
        "css": "css",
        "json": "json",
        "md": "markdown",
        "yml": "yaml",
        "yaml": "yaml",
        "sh": "bash",
        "sql": "sql",
    }
    return lang_map.get(suffix, "text")

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

@router.post("/projects/{pid}/files", response_model=ProjectFileSaveResponse)
async def save_project_file(
        pid: str,
        req: ProjectFileSaveRequest,
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

    if not (req.path or "").strip():
        raise HTTPException(status_code=400, detail="File path is required")

    if not github_service.check_safe_path(req.path):
        raise HTTPException(status_code=400, detail="Invalid file path")

    existing = (
        await db.execute(
            select(ProjectFile)
            .where(ProjectFile.project_id == p.id, ProjectFile.path == req.path)
        )
    ).scalar_one_or_none()

    language = req.language or (existing.language if existing else None) or _infer_language_from_path(req.path)

    if existing:
        existing.content = req.content
        existing.language = language
        action = "updated"
    else:
        pf = ProjectFile(
            project_id=p.id,
            path=req.path,
            language=language,
            content=req.content,
            created_at=datetime.utcnow(),
        )
        db.add(pf)
        action = "created"

    await db.commit()
    return ProjectFileSaveResponse(
        path=req.path,
        content=req.content,
        language=language or "text",
        action=action,
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
        data: GitHubRefreshRequest = GitHubRefreshRequest(),
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

    has_local_changes = bool(source.snapshot_hash and current_snapshot and current_snapshot != source.snapshot_hash)
    if has_local_changes and not data.force:
        return GitHubRefreshResponse(
            success=False,
            status="error",
            message="Local changes detected. Please commit/export your edits before refreshing from GitHub.",
            updated_files=[],
            warnings=[],
            has_local_changes=True,
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
            has_local_changes=has_local_changes,
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
        has_local_changes=has_local_changes,
    )


@router.post("/projects/{pid}/security/scan", response_model=SecurityScanResponse)
async def scan_project_security(
        pid: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    project = (
        await db.execute(
            select(Project).where(Project.id == pid, Project.user_id == user["id"])
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    rows = (
        await db.execute(
            select(ProjectFile.path, ProjectFile.content, ProjectFile.language)
            .where(ProjectFile.project_id == pid)
        )
    ).all()
    files = [
        {"path": path, "content": content, "language": (language or "text")}
        for (path, content, language) in rows
    ]

    findings, stats = check_project_security(files)
    return SecurityScanResponse(
        findings=_format_security_findings(findings),
        stats=stats,
    )


@router.post("/projects/{pid}/security/fix/propose", response_model=SecurityFixProposalResponse)
async def propose_security_fixes(
        pid: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    _cleanup_security_proposals()

    project = (
        await db.execute(
            select(Project).where(Project.id == pid, Project.user_id == user["id"])
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    rows = (
        await db.execute(
            select(ProjectFile.path, ProjectFile.content, ProjectFile.language)
            .where(ProjectFile.project_id == pid)
        )
    ).all()
    files = [
        {"path": path, "content": content, "language": (language or "text")}
        for (path, content, language) in rows
    ]

    findings, stats = check_project_security(files)
    formatted = _format_security_findings(findings)
    auto_fixable = [f for f in findings if f.get("auto_fixable")]

    if not auto_fixable:
        return SecurityFixProposalResponse(
            proposal_id=None,
            proposal={"updated_files": [], "summary": "No auto-fixable findings", "notes": []},
            findings=formatted,
            stats=stats,
        )

    files_copy = [dict(f) for f in files]
    fixed_files, applied_fixes = apply_security_fixes(files_copy, auto_fixable)

    original_map = {f["path"]: f for f in files}
    fixes_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for fix in applied_fixes:
        fixes_by_file.setdefault(fix.get("file"), []).append(fix)

    updated_files = []
    for f in fixed_files:
        original = original_map.get(f["path"])
        if not original:
            continue
        if f.get("content") == original.get("content"):
            continue
        file_fixes = fixes_by_file.get(f["path"], [])
        change_list = []
        for fx in file_fixes:
            line = fx.get("line")
            rule_id = fx.get("rule_id")
            reason = fx.get("reason") or "Security fix applied"
            if line:
                change_list.append(f"Line {line}: {reason} ({rule_id})")
            else:
                change_list.append(f"{reason} ({rule_id})")

        updated_files.append({
            "path": f["path"],
            "action": "modify",
            "language": f.get("language") or original.get("language") or "text",
            "content": f.get("content") or "",
            "explanation": {
                "what": f"Auto-fixed {len(file_fixes) or 1} security issue(s)",
                "where": f["path"],
                "why": "Apply auto-fixable security recommendations",
            },
            "change_list": change_list,
            "reason": "Security auto-fix",
        })

    if not updated_files:
        return SecurityFixProposalResponse(
            proposal_id=None,
            proposal={"updated_files": [], "summary": "No auto-fix changes available", "notes": []},
            findings=formatted,
            stats=stats,
        )

    proposal_id = str(uuid.uuid4())
    proposal = {
        "updated_files": updated_files,
        "summary": f"Proposed security fixes for {len(updated_files)} file(s).",
        "notes": [f"Auto-fixable findings: {stats.get('auto_fixable', 0)}"],
    }

    SECURITY_PROPOSALS[proposal_id] = {
        "project_id": pid,
        "user_id": user["id"],
        "updated_files": updated_files,
        "created_at": time.time(),
        "proposal": proposal,
    }

    return SecurityFixProposalResponse(
        proposal_id=proposal_id,
        proposal=proposal,
        findings=formatted,
        stats=stats,
    )


@router.post("/projects/{pid}/security/fix/apply/{proposal_id}", response_model=SecurityFixApplyResponse)
async def apply_security_fix(
        pid: str,
        proposal_id: str,
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
):
    _cleanup_security_proposals()

    proposal = SECURITY_PROPOSALS.get(proposal_id)
    if not proposal or proposal.get("project_id") != pid or proposal.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Security proposal not found")

    updates = proposal.get("updated_files") or []
    if not updates:
        SECURITY_PROPOSALS.pop(proposal_id, None)
        return SecurityFixApplyResponse(status="done", message="No changes to apply", updated_files=[])

    for upd in updates:
        path = upd.get("path")
        if not path or not github_service.check_safe_path(path):
            continue
        content = upd.get("content", "")
        language = upd.get("language") or "text"

        res = await db.execute(
            update(ProjectFile)
            .where(ProjectFile.project_id == pid, ProjectFile.path == path)
            .values(content=content, language=language)
        )
        if not res.rowcount:
            db.add(ProjectFile(
                project_id=pid,
                path=path,
                content=content,
                language=language,
                created_at=datetime.utcnow(),
            ))

    await db.commit()
    SECURITY_PROPOSALS.pop(proposal_id, None)

    return SecurityFixApplyResponse(
        status="done",
        message=f"Applied {len(updates)} security fix(es).",
        updated_files=updates,
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
