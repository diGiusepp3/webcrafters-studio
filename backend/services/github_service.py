# FILE: backend/services/github_service.py
import hashlib
import io
import logging
import os
import re
import tarfile
import zipfile
from typing import Optional, List, Dict, Tuple
from datetime import datetime

import httpx

logger = logging.getLogger("webcrafters-studio.github")

# Configuration limits
MAX_ARCHIVE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB
MAX_FILE_COUNT = 5000
BINARY_EXTENSIONS = {'.exe', '.dll', '.so', '.dylib', '.bin', '.img', '.iso', '.zip', '.tar', '.gz', '.rar', '.7z', '.jar', '.war', '.ear', '.pyc', '.pyo', '.class', '.o', '.obj', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'}
SKIP_DIRS = {'node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'vendor', 'venv', '.venv', 'env', '.env'}
SECRET_PATTERNS = [
    re.compile(r'(?:api[_-]?key|apikey|secret[_-]?key|auth[_-]?token|access[_-]?token|password|passwd|pwd|bearer)\s*[=:]\s*["\']?[\w\-_.]{16,}', re.IGNORECASE),
    re.compile(r'ghp_[a-zA-Z0-9]{36}'),  # GitHub PAT
    re.compile(r'github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}'),  # Fine-grained PAT
    re.compile(r'sk-[a-zA-Z0-9]{48}'),  # OpenAI
    re.compile(r'AKIA[0-9A-Z]{16}'),  # AWS Access Key
]

GITHUB_API_BASE = "https://api.github.com"
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_CALLBACK_URL = os.environ.get("GITHUB_CALLBACK_URL", "")


def get_oauth_url(state: str) -> str:
    """Generate GitHub OAuth authorization URL."""
    scopes = "repo,read:user"
    return (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={GITHUB_CALLBACK_URL}"
        f"&scope={scopes}"
        f"&state={state}"
    )


async def exchange_code_for_token(code: str) -> Dict:
    """Exchange OAuth code for access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise ValueError(data.get("error_description", data["error"]))
        return data


async def get_github_user(token: str) -> Dict:
    """Get GitHub user info."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API_BASE}/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


async def list_user_repos(token: str, page: int = 1, per_page: int = 30) -> List[Dict]:
    """List repositories accessible to the authenticated user."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API_BASE}/user/repos",
            params={
                "sort": "updated",
                "direction": "desc",
                "per_page": per_page,
                "page": page,
                "affiliation": "owner,collaborator,organization_member",
            },
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


async def get_repo_info(owner: str, repo: str, token: Optional[str] = None) -> Dict:
    """Get repository information."""
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}",
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


async def get_default_branch(owner: str, repo: str, token: Optional[str] = None) -> str:
    """Get default branch of a repository."""
    info = await get_repo_info(owner, repo, token)
    return info.get("default_branch", "main")


async def get_latest_commit_sha(owner: str, repo: str, ref: str, token: Optional[str] = None) -> Optional[str]:
    """Get the latest commit SHA for a ref."""
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{ref}",
            headers=headers,
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.json().get("sha")
        return None


def parse_github_url(url: str) -> Tuple[str, str]:
    """Parse GitHub URL to extract owner and repo."""
    # Support various formats
    patterns = [
        r"github\.com[/:]([^/]+)/([^/.\s]+?)(?:\.git)?(?:/|$)",
        r"^([^/]+)/([^/]+)$",  # owner/repo format
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1), match.group(2).rstrip('/')
    raise ValueError(f"Invalid GitHub URL: {url}")


def _should_skip_path(path: str) -> bool:
    """Check if a path should be skipped during extraction."""
    parts = path.split('/')
    for part in parts:
        if part in SKIP_DIRS:
            return True
    return False


def _is_binary_file(path: str) -> bool:
    """Check if file is likely binary based on extension."""
    ext = os.path.splitext(path.lower())[1]
    return ext in BINARY_EXTENSIONS


def _detect_secrets(content: str) -> List[str]:
    """Detect potential secrets in content. Returns list of matches (redacted)."""
    found = []
    for pattern in SECRET_PATTERNS:
        matches = pattern.findall(content)
        for m in matches:
            # Redact the actual value
            redacted = m[:10] + "..." if len(m) > 10 else m
            found.append(redacted)
    return found


def _detect_language(path: str) -> Optional[str]:
    """Detect programming language from file extension."""
    ext_map = {
        '.py': 'python', '.js': 'javascript', '.jsx': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescript', '.html': 'html',
        '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
        '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml',
        '.md': 'markdown', '.sql': 'sql', '.sh': 'bash', '.bash': 'bash',
        '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin',
        '.swift': 'swift', '.rb': 'ruby', '.php': 'php', '.c': 'c',
        '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp',
        '.vue': 'vue', '.svelte': 'svelte', '.toml': 'toml', '.ini': 'ini',
        '.env': 'dotenv', '.gitignore': 'gitignore', '.dockerfile': 'dockerfile',
    }
    ext = os.path.splitext(path.lower())[1]
    basename = os.path.basename(path.lower())
    if basename == 'dockerfile':
        return 'dockerfile'
    return ext_map.get(ext)


async def download_repo_archive(
    owner: str,
    repo: str,
    ref: Optional[str] = None,
    token: Optional[str] = None,
    subdir: Optional[str] = None,
) -> Tuple[List[Dict[str, str]], str, List[str]]:
    """
    Download and extract repository archive.
    
    Returns:
        Tuple of (files_list, commit_sha, warnings)
        Each file is {"path": str, "content": str, "language": str}
    """
    if not ref:
        ref = await get_default_branch(owner, repo, token)
    
    commit_sha = await get_latest_commit_sha(owner, repo, ref, token) or ""
    
    # Use tarball for smaller download
    archive_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/tarball/{ref}"
    
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    files: List[Dict[str, str]] = []
    warnings: List[str] = []
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        async with client.stream("GET", archive_url, headers=headers, timeout=120) as resp:
            resp.raise_for_status()
            
            # Check content length
            content_length = int(resp.headers.get("content-length", 0))
            if content_length > MAX_ARCHIVE_SIZE:
                raise ValueError(f"Archive too large: {content_length / 1024 / 1024:.1f}MB (max {MAX_ARCHIVE_SIZE / 1024 / 1024}MB)")
            
            # Download to memory
            chunks = []
            total_size = 0
            async for chunk in resp.aiter_bytes():
                total_size += len(chunk)
                if total_size > MAX_ARCHIVE_SIZE:
                    raise ValueError(f"Archive exceeds max size of {MAX_ARCHIVE_SIZE / 1024 / 1024}MB")
                chunks.append(chunk)
            
            archive_data = b''.join(chunks)
    
    # Extract tarball
    try:
        with tarfile.open(fileobj=io.BytesIO(archive_data), mode='r:gz') as tar:
            file_count = 0
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                
                # Remove the root directory (owner-repo-sha/)
                parts = member.name.split('/', 1)
                if len(parts) < 2:
                    continue
                relative_path = parts[1]
                
                # Apply subdir filter
                if subdir:
                    subdir_clean = subdir.strip('/')
                    if not relative_path.startswith(subdir_clean + '/') and relative_path != subdir_clean:
                        continue
                    # Remove subdir prefix from path
                    if relative_path.startswith(subdir_clean + '/'):
                        relative_path = relative_path[len(subdir_clean) + 1:]
                    elif relative_path == subdir_clean:
                        continue  # Skip the subdir itself
                
                if not relative_path:
                    continue
                
                # Skip unwanted paths
                if _should_skip_path(relative_path):
                    continue
                
                # Skip binary files
                if _is_binary_file(relative_path):
                    continue
                
                # Check file size
                if member.size > MAX_FILE_SIZE:
                    warnings.append(f"Skipped large file: {relative_path} ({member.size / 1024:.1f}KB)")
                    continue
                
                # Check file count
                file_count += 1
                if file_count > MAX_FILE_COUNT:
                    warnings.append(f"Stopped at {MAX_FILE_COUNT} files (limit reached)")
                    break
                
                # Extract and read content
                try:
                    f = tar.extractfile(member)
                    if f:
                        content = f.read()
                        try:
                            text_content = content.decode('utf-8')
                        except UnicodeDecodeError:
                            # Skip binary content
                            continue
                        
                        # Check for secrets
                        secrets_found = _detect_secrets(text_content)
                        if secrets_found:
                            warnings.append(f"Potential secrets in {relative_path}: {', '.join(secrets_found[:3])}")
                        
                        files.append({
                            "path": relative_path,
                            "content": text_content,
                            "language": _detect_language(relative_path) or "text",
                        })
                except Exception as e:
                    logger.warning(f"Failed to extract {relative_path}: {e}")
                    continue
    except tarfile.TarError as e:
        raise ValueError(f"Failed to extract archive: {e}")
    
    return files, commit_sha, warnings


def compute_snapshot_hash(files: List[Dict[str, str]]) -> str:
    """Compute a hash of all file contents for change detection."""
    hasher = hashlib.sha256()
    # Sort by path for deterministic ordering
    for f in sorted(files, key=lambda x: x["path"]):
        hasher.update(f["path"].encode())
        hasher.update(f["content"].encode())
    return hasher.hexdigest()


def check_safe_path(path: str, base: str = "") -> bool:
    """Prevent zip slip and path traversal attacks."""
    if ".." in path or path.startswith("/") or path.startswith("\\"):
        return False
    # Normalize and check
    normalized = os.path.normpath(path)
    if normalized.startswith(".."):
        return False
    return True
