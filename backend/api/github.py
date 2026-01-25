# FILE: backend/api/github.py
import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user
from backend.core.database import get_db
from backend.models.github_connection import GitHubConnection
from backend.models.project import Project
from backend.models.project_file import ProjectFile
from backend.models.project_source import ProjectSource
from backend.schemas.github import (
    GitHubImportPublicRequest,
    GitHubImportPrivateRequest,
    GitHubImportResponse,
    GitHubReposResponse,
    GitHubRepoInfo,
    GitHubConnectionStatus,
    GitHubOAuthStartResponse,
    GitHubSyncRequest,
    GitHubSyncResponse,
)
from backend.services.encryption_service import encrypt_token, decrypt_token
from backend.services import github_service

logger = logging.getLogger("webcrafters-studio.github")

router = APIRouter(prefix="/api/github", tags=["github"])

# In-memory state storage (production would use Redis/DB)
_oauth_states: dict = {}


@router.get("/status", response_model=GitHubConnectionStatus)
async def github_connection_status(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if user has connected their GitHub account."""
    conn = (
        await db.execute(
            select(GitHubConnection).where(GitHubConnection.user_id == user["id"])
        )
    ).scalar_one_or_none()
    
    if conn:
        return GitHubConnectionStatus(
            connected=True,
            github_username=conn.github_username,
            connected_at=conn.created_at.replace(tzinfo=timezone.utc).isoformat(),
        )
    return GitHubConnectionStatus(connected=False)


@router.post("/oauth/start", response_model=GitHubOAuthStartResponse)
async def github_oauth_start(
    user=Depends(get_current_user),
):
    """Start GitHub OAuth flow - returns URL to redirect user to."""
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {
        "user_id": user["id"],
        "created_at": datetime.utcnow(),
    }
    
    auth_url = github_service.get_oauth_url(state)
    return GitHubOAuthStartResponse(auth_url=auth_url, state=state)


@router.get("/oauth/callback")
async def github_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle GitHub OAuth callback."""
    # Validate state
    state_data = _oauth_states.pop(state, None)
    if not state_data:
        # Redirect to frontend with error
        return RedirectResponse(url="/dashboard?github_error=invalid_state")
    
    user_id = state_data["user_id"]
    
    try:
        # Exchange code for token
        token_data = await github_service.exchange_code_for_token(code)
        access_token = token_data.get("access_token")
        scopes = token_data.get("scope", "")
        
        if not access_token:
            return RedirectResponse(url="/dashboard?github_error=no_token")
        
        # Get GitHub user info
        gh_user = await github_service.get_github_user(access_token)
        gh_user_id = str(gh_user["id"])
        gh_username = gh_user["login"]
        
        # Store/update connection
        existing = (
            await db.execute(
                select(GitHubConnection).where(GitHubConnection.user_id == user_id)
            )
        ).scalar_one_or_none()
        
        encrypted_token = encrypt_token(access_token)
        
        if existing:
            existing.github_user_id = gh_user_id
            existing.github_username = gh_username
            existing.access_token_encrypted = encrypted_token
            existing.scopes = scopes
            existing.updated_at = datetime.utcnow()
        else:
            conn = GitHubConnection(
                user_id=user_id,
                github_user_id=gh_user_id,
                github_username=gh_username,
                access_token_encrypted=encrypted_token,
                scopes=scopes,
            )
            db.add(conn)
        
        await db.commit()
        
        # Redirect to frontend with success
        return RedirectResponse(url="/dashboard?github_connected=true")
        
    except Exception as e:
        logger.error(f"GitHub OAuth error: {e}")
        return RedirectResponse(url="/dashboard?github_error=auth_failed")


@router.post("/disconnect")
async def github_disconnect(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect GitHub account."""
    result = await db.execute(
        delete(GitHubConnection).where(GitHubConnection.user_id == user["id"])
    )
    await db.commit()
    
    return {"ok": True, "deleted": result.rowcount > 0}


@router.get("/repos", response_model=GitHubReposResponse)
async def list_github_repos(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List repositories for connected GitHub user."""
    conn = (
        await db.execute(
            select(GitHubConnection).where(GitHubConnection.user_id == user["id"])
        )
    ).scalar_one_or_none()
    
    if not conn:
        raise HTTPException(status_code=400, detail="GitHub not connected")
    
    try:
        token = decrypt_token(conn.access_token_encrypted)
        repos_data = await github_service.list_user_repos(token, page, per_page)
        
        repos = [
            GitHubRepoInfo(
                id=r["id"],
                name=r["name"],
                full_name=r["full_name"],
                description=r.get("description"),
                private=r["private"],
                default_branch=r.get("default_branch", "main"),
                html_url=r["html_url"],
                updated_at=r["updated_at"],
                language=r.get("language"),
                stargazers_count=r.get("stargazers_count", 0),
            )
            for r in repos_data
        ]
        
        return GitHubReposResponse(
            repos=repos,
            page=page,
            has_more=len(repos) == per_page,
        )
    except Exception as e:
        logger.error(f"Failed to list repos: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch repositories")


@router.post("/import/public", response_model=GitHubImportResponse)
async def import_public_repo(
    data: GitHubImportPublicRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a public GitHub repository."""
    try:
        owner, repo = github_service.parse_github_url(data.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Verify repo is public
    try:
        repo_info = await github_service.get_repo_info(owner, repo)
        if repo_info.get("private"):
            raise HTTPException(
                status_code=403,
                detail="This is a private repository. Please connect your GitHub account first."
            )
    except Exception as e:
        if "404" in str(e):
            raise HTTPException(status_code=404, detail="Repository not found")
        raise HTTPException(status_code=400, detail=f"Failed to access repository: {e}")
    
    # Download and extract
    try:
        files, commit_sha, warnings = await github_service.download_repo_archive(
            owner, repo, data.ref, None, data.subdir
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to download repo: {e}")
        raise HTTPException(status_code=500, detail="Failed to download repository")
    
    if not files:
        raise HTTPException(status_code=400, detail="No valid files found in repository")
    
    # Create project
    ref_used = data.ref or repo_info.get("default_branch", "main")
    project_name = data.project_name or repo
    project_id = str(uuid.uuid4())
    
    project = Project(
        id=project_id,
        user_id=user["id"],
        prompt=f"Imported from GitHub: {owner}/{repo}",
        project_type="fullstack",
        name=project_name,
        description=repo_info.get("description") or f"Imported from {owner}/{repo}",
        created_at=datetime.utcnow(),
    )
    db.add(project)
    
    # Add files
    for f in files:
        if not github_service.check_safe_path(f["path"]):
            warnings.append(f"Skipped unsafe path: {f['path']}")
            continue
        
        pf = ProjectFile(
            project_id=project_id,
            path=f["path"],
            language=f.get("language"),
            content=f["content"],
            created_at=datetime.utcnow(),
        )
        db.add(pf)
    
    # Store source info
    snapshot_hash = github_service.compute_snapshot_hash(files)
    source = ProjectSource(
        project_id=project_id,
        source_type="github_public",
        owner=owner,
        repo=repo,
        ref=ref_used,
        subdir=data.subdir,
        last_commit_sha=commit_sha,
        snapshot_hash=snapshot_hash,
        imported_at=datetime.utcnow(),
    )
    db.add(source)
    
    await db.commit()
    
    return GitHubImportResponse(
        project_id=project_id,
        name=project_name,
        file_count=len(files),
        warnings=warnings,
        source_type="github_public",
        owner=owner,
        repo=repo,
        ref=ref_used,
        commit_sha=commit_sha,
    )


@router.post("/import/private", response_model=GitHubImportResponse)
async def import_private_repo(
    data: GitHubImportPrivateRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a private GitHub repository (requires connected account)."""
    conn = (
        await db.execute(
            select(GitHubConnection).where(GitHubConnection.user_id == user["id"])
        )
    ).scalar_one_or_none()
    
    if not conn:
        raise HTTPException(status_code=400, detail="GitHub account not connected")
    
    try:
        token = decrypt_token(conn.access_token_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt token")
    
    # Verify access to repo
    try:
        repo_info = await github_service.get_repo_info(data.owner, data.repo, token)
    except Exception as e:
        if "404" in str(e) or "403" in str(e):
            raise HTTPException(status_code=404, detail="Repository not found or access denied")
        raise HTTPException(status_code=400, detail=f"Failed to access repository: {e}")
    
    # Download and extract
    try:
        files, commit_sha, warnings = await github_service.download_repo_archive(
            data.owner, data.repo, data.ref, token, data.subdir
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to download private repo: {e}")
        raise HTTPException(status_code=500, detail="Failed to download repository")
    
    if not files:
        raise HTTPException(status_code=400, detail="No valid files found in repository")
    
    # Create project
    ref_used = data.ref or repo_info.get("default_branch", "main")
    project_name = data.project_name or data.repo
    project_id = str(uuid.uuid4())
    
    source_type = "github_private" if repo_info.get("private") else "github_public"
    
    project = Project(
        id=project_id,
        user_id=user["id"],
        prompt=f"Imported from GitHub: {data.owner}/{data.repo}",
        project_type="fullstack",
        name=project_name,
        description=repo_info.get("description") or f"Imported from {data.owner}/{data.repo}",
        created_at=datetime.utcnow(),
    )
    db.add(project)
    
    # Add files
    for f in files:
        if not github_service.check_safe_path(f["path"]):
            warnings.append(f"Skipped unsafe path: {f['path']}")
            continue
        
        pf = ProjectFile(
            project_id=project_id,
            path=f["path"],
            language=f.get("language"),
            content=f["content"],
            created_at=datetime.utcnow(),
        )
        db.add(pf)
    
    # Store source info
    snapshot_hash = github_service.compute_snapshot_hash(files)
    source = ProjectSource(
        project_id=project_id,
        source_type=source_type,
        owner=data.owner,
        repo=data.repo,
        ref=ref_used,
        subdir=data.subdir,
        last_commit_sha=commit_sha,
        snapshot_hash=snapshot_hash,
        imported_at=datetime.utcnow(),
    )
    db.add(source)
    
    await db.commit()
    
    return GitHubImportResponse(
        project_id=project_id,
        name=project_name,
        file_count=len(files),
        warnings=warnings,
        source_type=source_type,
        owner=data.owner,
        repo=data.repo,
        ref=ref_used,
        commit_sha=commit_sha,
    )


@router.post("/sync/{project_id}", response_model=GitHubSyncResponse)
async def sync_github_project(
    project_id: str,
    data: GitHubSyncRequest = GitHubSyncRequest(),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync a GitHub-sourced project with its remote repository."""
    # Get project
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
    
    # Get source info
    source = (
        await db.execute(
            select(ProjectSource).where(ProjectSource.project_id == project_id)
        )
    ).scalar_one_or_none()
    
    if not source:
        raise HTTPException(status_code=400, detail="This project was not imported from GitHub")
    
    # Get token if private
    token = None
    if source.source_type == "github_private":
        conn = (
            await db.execute(
                select(GitHubConnection).where(GitHubConnection.user_id == user["id"])
            )
        ).scalar_one_or_none()
        
        if not conn:
            raise HTTPException(status_code=400, detail="GitHub account no longer connected")
        
        token = decrypt_token(conn.access_token_encrypted)
    
    # Get current files and compute hash
    current_files = (
        await db.execute(
            select(ProjectFile).where(ProjectFile.project_id == project_id)
        )
    ).scalars().all()
    
    current_hash = github_service.compute_snapshot_hash([
        {"path": f.path, "content": f.content}
        for f in current_files
    ])
    
    # Check for local changes
    has_local_changes = current_hash != source.snapshot_hash
    
    if has_local_changes and not data.force:
        return GitHubSyncResponse(
            success=False,
            message="Local changes detected. Use force=true to overwrite or commit your changes first.",
            has_local_changes=True,
        )
    
    # Download latest
    try:
        new_files, commit_sha, warnings = await github_service.download_repo_archive(
            source.owner, source.repo, source.ref, token, source.subdir
        )
    except Exception as e:
        logger.error(f"Sync download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to sync: {e}")
    
    if not new_files:
        return GitHubSyncResponse(
            success=False,
            message="No files found in remote repository",
        )
    
    # Delete old files
    await db.execute(
        delete(ProjectFile).where(ProjectFile.project_id == project_id)
    )
    
    # Insert new files
    for f in new_files:
        if not github_service.check_safe_path(f["path"]):
            continue
        pf = ProjectFile(
            project_id=project_id,
            path=f["path"],
            language=f.get("language"),
            content=f["content"],
            created_at=datetime.utcnow(),
        )
        db.add(pf)
    
    # Update source
    source.last_commit_sha = commit_sha
    source.snapshot_hash = github_service.compute_snapshot_hash(new_files)
    source.last_sync_at = datetime.utcnow()
    
    await db.commit()
    
    return GitHubSyncResponse(
        success=True,
        message=f"Successfully synced {len(new_files)} files from {source.owner}/{source.repo}",
        files_updated=len(new_files),
        warnings=warnings,
        has_local_changes=False,
    )


@router.get("/source/{project_id}")
async def get_project_source(
    project_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get GitHub source info for a project."""
    # Verify project ownership
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
    
    source = (
        await db.execute(
            select(ProjectSource).where(ProjectSource.project_id == project_id)
        )
    ).scalar_one_or_none()
    
    if not source:
        return {"has_source": False}
    
    return {
        "has_source": True,
        "source_type": source.source_type,
        "owner": source.owner,
        "repo": source.repo,
        "ref": source.ref,
        "subdir": source.subdir,
        "last_commit_sha": source.last_commit_sha,
        "imported_at": source.imported_at.replace(tzinfo=timezone.utc).isoformat() if source.imported_at else None,
        "last_sync_at": source.last_sync_at.replace(tzinfo=timezone.utc).isoformat() if source.last_sync_at else None,
    }
