# FILE: backend/api/code_assistant.py
import os
import json
import time
import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/codeassistant", tags=["codeassistant"])


# -----------------------------
# Config (dev-only)
# -----------------------------
FS_ROOT = Path(os.getenv("DEV_FS_ROOT", "/home/webcrafters/subdomains/studio")).resolve()

# ✅ DEV toegang via user_id (niet via email)
# Zet in backend/.env:
#   DEV_USER_ID=241a8c44-669b-422f-a1c1-a89cd7faa7e9
# of:
#   DEV_USER_IDS=uuid1,uuid2
DEV_USER_IDS = {
    s.strip()
    for s in (
            os.getenv("DEV_USER_IDS", "") or os.getenv("DEV_USER_ID", "")
    ).split(",")
    if s.strip()
}

JWT_SECRET = os.getenv("JWT_SECRET", "")
DEV_ASSISTANT_MODEL = os.getenv("DEV_ASSISTANT_MODEL", "gpt-4.1-mini")

MAX_READ_BYTES = int(os.getenv("DEV_FS_MAX_READ_BYTES", "200000"))          # 200 KB
MAX_CHAT_FILE_BYTES = int(os.getenv("DEV_CHAT_MAX_FILE_BYTES", "60000"))   # 60 KB per file
MAX_LIST_ENTRIES = int(os.getenv("DEV_FS_MAX_LIST_ENTRIES", "1000"))

ALLOWED_JWT_ALGS = {"HS256", "HS384", "HS512"}


# -----------------------------
# JWT helpers
# -----------------------------
def _jwt_decode(token: str) -> Dict[str, Any]:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfig: JWT_SECRET missing")

    # Try python-jose first, then PyJWT
    try:
        from jose import jwt as jose_jwt  # type: ignore
        header = jose_jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        if alg not in ALLOWED_JWT_ALGS:
            raise HTTPException(status_code=401, detail=f"Unsupported JWT alg: {alg}")
        return jose_jwt.decode(token, JWT_SECRET, algorithms=[alg])
    except ImportError:
        pass
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    try:
        import jwt as pyjwt  # type: ignore
        header = pyjwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        if alg not in ALLOWED_JWT_ALGS:
            raise HTTPException(status_code=401, detail=f"Unsupported JWT alg: {alg}")
        return pyjwt.decode(token, JWT_SECRET, algorithms=[alg])
    except ImportError:
        raise HTTPException(status_code=500, detail="JWT decode unavailable: install python-jose or PyJWT")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def _extract_user_id(claims: Dict[str, Any]) -> str:
    # jouw auth_service.create_token gebruikt "user_id"
    uid = claims.get("user_id")
    if isinstance(uid, str) and uid.strip():
        return uid.strip()
    # fallback keys (veilig, maar niet nodig als je token altijd user_id heeft)
    for key in ("uid", "id"):
        v = claims.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _extract_identity_for_logs(claims: Dict[str, Any]) -> str:
    # enkel voor logging / ping output
    for key in ("email", "sub", "username", "user", "name"):
        val = claims.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().lower()
    return ""


def require_dev(request: Request) -> Dict[str, Any]:
    if not DEV_USER_IDS:
        raise HTTPException(status_code=403, detail="Dev console disabled: DEV_USER_ID(S) not set")

    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = auth.split(" ", 1)[1].strip()
    claims = _jwt_decode(token)

    uid = _extract_user_id(claims)
    if not uid:
        raise HTTPException(status_code=403, detail="Dev-only endpoint (missing user_id claim)")

    if uid not in DEV_USER_IDS:
        raise HTTPException(status_code=403, detail="Dev-only endpoint")

    return claims


# -----------------------------
# FS sandbox helpers
# -----------------------------
def _safe_resolve(rel_path: str) -> Path:
    rel_path = (rel_path or "").lstrip("/")
    target = (FS_ROOT / rel_path).resolve()

    # prevent traversal and symlink escape
    try:
        target.relative_to(FS_ROOT)
    except Exception:
        raise HTTPException(status_code=400, detail="Path escapes DEV_FS_ROOT")

    return target


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _read_text_limited(p: Path, limit: int) -> Tuple[str, str, int]:
    if not p.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not p.is_file():
        raise HTTPException(status_code=400, detail="Not a file")

    data = p.read_bytes()
    size = len(data)
    if size > limit:
        raise HTTPException(status_code=413, detail=f"File too large ({size} bytes)")

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=415, detail="Binary file not supported (utf-8 only)")

    return text, _sha256_bytes(data), size


# -----------------------------
# Schemas
# -----------------------------
class WriteFileRequest(BaseModel):
    path: str = Field(..., description="Relative path under DEV_FS_ROOT")
    content: str = Field(..., description="New UTF-8 content")
    expected_sha256: Optional[str] = Field(None, description="If set, enforce optimistic concurrency")
    make_dirs: bool = True
    backup: bool = True


class DeleteFileRequest(BaseModel):
    path: str


class ChatRequest(BaseModel):
    message: str
    context_paths: List[str] = Field(default_factory=list, description="Relative file paths to include as context")
    model: Optional[str] = None


# -----------------------------
# Routes
# -----------------------------
@router.get("/ping")
def ping(claims: Dict[str, Any] = Depends(require_dev)):
    return {
        "ok": True,
        "dev_root": str(FS_ROOT),
        "user_id": _extract_user_id(claims),
        "who": _extract_identity_for_logs(claims),
        "ts": int(time.time()),
    }


@router.get("/fs/list")
def fs_list(path: str = "", claims: Dict[str, Any] = Depends(require_dev)):
    base = _safe_resolve(path)
    if not base.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not base.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    entries = []
    count = 0
    for item in sorted(base.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        count += 1
        if count > MAX_LIST_ENTRIES:
            break

        try:
            st = item.stat()
        except Exception:
            continue

        rel = str(item.relative_to(FS_ROOT))
        entries.append(
            {
                "name": item.name,
                "path": rel,
                "type": "dir" if item.is_dir() else "file",
                "size": st.st_size,
                "mtime": int(st.st_mtime),
            }
        )

    return {"base": str(base.relative_to(FS_ROOT)), "entries": entries, "truncated": count > MAX_LIST_ENTRIES}


@router.get("/fs/read")
def fs_read(path: str, claims: Dict[str, Any] = Depends(require_dev)):
    p = _safe_resolve(path)
    text, sha, size = _read_text_limited(p, MAX_READ_BYTES)
    return {"path": str(p.relative_to(FS_ROOT)), "sha256": sha, "size": size, "content": text}


@router.post("/fs/write")
def fs_write(body: WriteFileRequest, claims: Dict[str, Any] = Depends(require_dev)):
    p = _safe_resolve(body.path)

    if body.make_dirs:
        p.parent.mkdir(parents=True, exist_ok=True)

    if p.exists() and not p.is_file():
        raise HTTPException(status_code=400, detail="Target is not a file")

    if p.exists() and body.expected_sha256:
        current_bytes = p.read_bytes()
        current_sha = _sha256_bytes(current_bytes)
        if current_sha != body.expected_sha256:
            raise HTTPException(status_code=409, detail="File changed (sha mismatch)")

    new_bytes = body.content.encode("utf-8")
    if len(new_bytes) > MAX_READ_BYTES:
        raise HTTPException(status_code=413, detail="Write too large")

    backup_path = None
    if body.backup and p.exists():
        backup_path = p.with_suffix(p.suffix + f".bak.{int(time.time())}")
        backup_path.write_bytes(p.read_bytes())

    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_bytes(new_bytes)
    tmp.replace(p)

    return {
        "ok": True,
        "path": str(p.relative_to(FS_ROOT)),
        "sha256": _sha256_bytes(new_bytes),
        "backup": str(backup_path.relative_to(FS_ROOT)) if backup_path else None,
    }


@router.post("/fs/delete")
def fs_delete(body: DeleteFileRequest, claims: Dict[str, Any] = Depends(require_dev)):
    p = _safe_resolve(body.path)
    if not p.exists():
        return {"ok": True, "deleted": False}
    if p.is_dir():
        raise HTTPException(status_code=400, detail="Refusing to delete directory")
    p.unlink()
    return {"ok": True, "deleted": True, "path": str(p.relative_to(FS_ROOT))}


@router.post("/ai/chat")
def ai_chat(body: ChatRequest, claims: Dict[str, Any] = Depends(require_dev)):
    # Load context files (small slices)
    context_blocks: List[Dict[str, str]] = []
    for rel in body.context_paths[:30]:
        p = _safe_resolve(rel)
        text, sha, size = _read_text_limited(p, MAX_CHAT_FILE_BYTES)
        context_blocks.append(
            {
                "path": str(p.relative_to(FS_ROOT)),
                "sha256": sha,
                "content": text,
            }
        )

    system = (
        "You are CodeAssistant for a production server codebase.\n"
        "Rules:\n"
        "- Be surgical and safe.\n"
        "- When proposing edits, output STRICT JSON only.\n"
        "- JSON schema:\n"
        "  {\"reply\": string, \"edits\": [{\"path\": string, \"expected_sha256\": string, \"new_content\": string}]}\n"
        "- Only edit files the user provided in context.\n"
        "- If you cannot be sure, reply with no edits.\n"
    )

    user_payload = {
        "message": body.message,
        "files": context_blocks,
    }

    model = (body.model or DEV_ASSISTANT_MODEL).strip()

    # Call OpenAI (works with openai>=1.x; fallback for older)
    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        if not client.api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY missing")

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            temperature=0.2,
        )
        content = resp.choices[0].message.content or ""
    except ImportError:
        try:
            import openai  # type: ignore

            if not os.getenv("OPENAI_API_KEY"):
                raise HTTPException(status_code=500, detail="OPENAI_API_KEY missing")

            openai.api_key = os.getenv("OPENAI_API_KEY")
            resp = openai.ChatCompletion.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user_payload)},
                ],
                temperature=0.2,
            )
            content = resp["choices"][0]["message"]["content"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI call failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI call failed: {str(e)}")

    # Parse strict JSON
    try:
        data = json.loads(content)
        if not isinstance(data, dict) or "reply" not in data or "edits" not in data:
            raise ValueError("Invalid JSON shape")

        # Hard safety: only allow edits for provided files
        allowed_paths = {f["path"] for f in context_blocks}
        safe_edits = []
        for edit in data.get("edits", []):
            if not isinstance(edit, dict):
                continue
            pth = str(edit.get("path", ""))
            if pth in allowed_paths:
                safe_edits.append(edit)

        data["edits"] = safe_edits
        return {"ok": True, "raw": content, "parsed": data}
    except Exception:
        return {"ok": True, "raw": content, "parsed": None}
