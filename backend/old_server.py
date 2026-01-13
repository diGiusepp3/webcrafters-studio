# backend/server.py
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from fastapi import Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from openai import OpenAI

from backend.validators.node_openai_validator import validate_node_openai

import os
import json
import uuid
import bcrypt
import jwt
import io
import zipfile
import asyncio
import logging
import time

from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, BigInteger
from sqlalchemy.dialects.mysql import LONGTEXT, JSON as MYSQL_JSON
from sqlalchemy.dialects.mysql import DATETIME

# ================== SETUP ==================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=True)

print("MYSQL HOST:", os.getenv("MYSQL_HOST"))
print("MYSQL DB:", os.getenv("MYSQL_DB"))


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("codegen")

def _env(*names: str, default: Optional[str] = None) -> str:
    for n in names:
        v = os.environ.get(n)
        if v is not None and str(v).strip() != "":
            return v
    if default is not None:
        return default
    raise KeyError(f"Missing required env var. Tried: {', '.join(names)}")

# ================== MYSQL (SQLAlchemy Async) ==================

def _mysql_url() -> str:
    host = _env("MYSQL_HOST")
    port = int(_env("MYSQL_PORT"))
    user = _env("MYSQL_USER")
    pwd = os.environ.get("MYSQL_PASSWORD")
    db = _env("MYSQL_DB")
    return f"mysql+aiomysql://{user}:{pwd}@{host}:{port}/{db}?charset=utf8mb4"

engine = create_async_engine(_mysql_url(), pool_pre_ping=True, pool_recycle=3600)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as session:
        yield session

# ================== MODELS (DB TABLES) ==================

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # behoud je API-shape: prompt zit ook op project
    prompt: Mapped[str] = mapped_column(LONGTEXT)
    project_type: Mapped[str] = mapped_column(String(40))

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)

    validation_errors: Mapped[dict] = mapped_column(MYSQL_JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

class ProjectFile(Base):
    __tablename__ = "project_files"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(500))
    language: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    content: Mapped[str] = mapped_column(LONGTEXT)
    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

class Generation(Base):
    __tablename__ = "generations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)

    prompt: Mapped[str] = mapped_column(LONGTEXT)
    project_type: Mapped[str] = mapped_column(String(40))

    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ok")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tokens_in: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    ai_request: Mapped[Optional[dict]] = mapped_column(MYSQL_JSON, nullable=True)
    ai_response: Mapped[Optional[dict]] = mapped_column(MYSQL_JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DATETIME(fsp=3), default=datetime.utcnow)

# ================== AUTH/JWT ==================

JWT_SECRET = os.environ.get("JWT_SECRET", "default_secret_key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.environ.get("JWT_EXPIRATION_HOURS", "24"))

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not configured for Webcrafters Studio backend (.env).")
client_ai = OpenAI(api_key=OPENAI_API_KEY)

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ================== Pydantic MODELS ==================

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

class GenerateRequest(BaseModel):
    prompt: str
    project_type: Optional[str] = "fullstack"  # frontend | backend | fullstack | any
    preferences: Optional[Dict[str, Any]] = None

class ClarifyRequest(BaseModel):
    prompt: str
    project_type: Optional[str] = "any"
    preferences: Optional[Dict[str, Any]] = None

class ClarifyResponse(BaseModel):
    needs_clarification: bool
    questions: List[str] = Field(default_factory=list)
    derived: Dict[str, Any] = Field(default_factory=dict)

class ProjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    prompt: str
    project_type: str
    name: str
    description: str
    files: List[Dict[str, str]]
    created_at: str
    validation_errors: List[Any] = Field(default_factory=list)

class ProjectHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    project_type: str
    created_at: str
    file_count: int
    has_validation_errors: bool = False

@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str, request: Request):
    return Response(status_code=204)

# ================== AUTH HELPERS ==================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return {"id": user.id, "email": user.email, "name": user.name, "created_at": user.created_at.replace(tzinfo=timezone.utc).isoformat()}

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ================== STARTUP ==================

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# ================== AUTH ROUTES ==================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()

    return TokenResponse(
        token=create_token(user_id),
        user=UserResponse(
            id=user_id,
            email=data.email,
            name=data.name,
            created_at=user.created_at.replace(tzinfo=timezone.utc).isoformat(),
        ),
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(
        token=create_token(user.id),
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=user.created_at.replace(tzinfo=timezone.utc).isoformat(),
        ),
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def auth_me(user=Depends(get_current_user)):
    return UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user["created_at"])

# ================== PREFLIGHT (NO-BLOCK) ==================

FRONTEND_HINTS = {"react", "vue", "svelte", "angular", "next", "nuxt", "html", "css", "tailwind", "vite", "browser", "frontend", "ui"}
BACKEND_HINTS = {"api", "fastapi", "flask", "django", "express", "node", "backend", "server", "db", "database", "mongodb", "mysql", "postgres", "auth"}
MOBILE_HINTS = {"android", "ios", "flutter", "react native", "expo", "maui"}
DESKTOP_HINTS = {"desktop", "electron", "tauri", "wpf", "winforms", "qt"}

DEFAULT_INDEX_HTML_CRA = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
"""

DEFAULT_INDEX_HTML_VITE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
"""

def _has_any(text: str, words: set) -> bool:
    t = (text or "").lower()
    return any(w in t for w in words)

def _safe_prefs(prefs: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return dict(prefs or {})

def preflight_analyze(prompt: str, project_type: str, preferences: Optional[Dict[str, Any]] = None) -> ClarifyResponse:
    prompt_l = (prompt or "").strip().lower()
    prefs = _safe_prefs(preferences)

    pt = (project_type or "any").lower().strip()
    if pt not in {"frontend", "backend", "fullstack", "any"}:
        pt = "any"

    mentions_front = _has_any(prompt_l, FRONTEND_HINTS)
    mentions_back = _has_any(prompt_l, BACKEND_HINTS)
    mentions_mobile = _has_any(prompt_l, MOBILE_HINTS)
    mentions_desktop = _has_any(prompt_l, DESKTOP_HINTS)

    platform_guess = prefs.get("platform")
    if not platform_guess:
        if mentions_mobile:
            platform_guess = "mobile"
        elif mentions_desktop:
            platform_guess = "desktop"
        else:
            platform_guess = "web"

    wants_ai = any(k in prompt_l for k in ["openai", "chatgpt", "gpt", "ai"])

    effective_project_type = pt
    effective_preferences = dict(prefs)

    if pt == "frontend":
        effective_preferences.setdefault("frontend_stack", "react-cra")
        if wants_ai:
            effective_project_type = "fullstack"
            effective_preferences.setdefault("backend_stack", "fastapi")
            effective_preferences.setdefault("database", "mysql")

    if pt == "backend":
        effective_preferences.setdefault("backend_stack", "fastapi")
        if effective_preferences.get("database") is None:
            effective_preferences["database"] = "mysql"

    if pt == "fullstack":
        effective_preferences.setdefault("frontend_stack", "react-cra")
        effective_preferences.setdefault("backend_stack", "fastapi")
        effective_preferences.setdefault("database", "mysql")

    if effective_project_type in {"backend", "fullstack"}:
        effective_preferences.setdefault("backend_port", 8000)

    if platform_guess == "web" and effective_project_type in {"frontend", "fullstack"}:
        frontend_stack = (effective_preferences.get("frontend_stack") or "").lower()
        required_files = effective_preferences.setdefault("required_files", {})
        if "vite" in frontend_stack:
            required_files.setdefault("frontend/index.html", DEFAULT_INDEX_HTML_VITE)
        else:
            required_files.setdefault("frontend/public/index.html", DEFAULT_INDEX_HTML_CRA)

    derived = {
        "project_type": pt,
        "platform_guess": platform_guess,
        "mentions_frontend": mentions_front,
        "mentions_backend": mentions_back,
        "mentions_mobile": mentions_mobile,
        "mentions_desktop": mentions_desktop,
        "wants_ai": wants_ai,
        "effective_project_type": effective_project_type,
        "effective_preferences": effective_preferences,
    }
    return ClarifyResponse(needs_clarification=False, questions=[], derived=derived)

# ================== POST-GENERATION PATCHERS ==================

def _files_to_map(files: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    m: Dict[str, Dict[str, str]] = {}
    for f in files or []:
        p = (f.get("path") or "").strip().lstrip("/")
        if not p:
            continue
        m[p] = {
            "path": p,
            "language": f.get("language", "text") or "text",
            "content": f.get("content", "") or "",
        }
    return m

def apply_required_files(files: List[Dict[str, str]], required_files: Dict[str, str]) -> List[Dict[str, str]]:
    fm = _files_to_map(files)
    for path, content in (required_files or {}).items():
        p = (path or "").strip().lstrip("/")
        if not p:
            continue
        if p not in fm:
            lang = "html" if p.endswith(".html") else "json" if p.endswith(".json") else "text"
            fm[p] = {"path": p, "language": lang, "content": content or ""}
    return list(fm.values())

def ensure_frontend_proxy(files: List[Dict[str, str]], backend_port: int) -> List[Dict[str, str]]:
    fm = _files_to_map(files)
    pkg_path = "frontend/package.json"
    if pkg_path not in fm:
        return list(fm.values())

    try:
        pkg = json.loads(fm[pkg_path]["content"] or "{}")
    except Exception:
        return list(fm.values())

    target = f"http://localhost:{int(backend_port)}"
    if pkg.get("proxy") != target:
        pkg["proxy"] = target
        fm[pkg_path]["content"] = json.dumps(pkg, indent=2, ensure_ascii=False) + "\n"
        fm[pkg_path]["language"] = "json"

    return list(fm.values())

def patch_generated_project(files: List[Dict[str, str]], effective_prefs: Dict[str, Any]) -> List[Dict[str, str]]:
    required = (effective_prefs or {}).get("required_files") or {}
    backend_port = int((effective_prefs or {}).get("backend_port") or 8000)
    patched = apply_required_files(files, required)
    patched = ensure_frontend_proxy(patched, backend_port)
    return patched

# ================== AI (Generation Contract) ==================

SYSTEM_PROMPT = """
You are a senior software architect and lead developer.

You MUST generate a COMPLETE, RUNNABLE application as a ZIP file.
The developer will run it without guessing or adding missing files.

ABSOLUTE RULES (DO NOT VIOLATE):
- Return ONLY valid JSON (no markdown, no comments).
- The project MUST be complete and runnable after install steps you include in README.
- Do NOT include unused dependencies.
- NEVER put API keys or secrets in frontend/browser code.
- If AI/OpenAI is needed, it MUST be implemented in a backend API. Frontend calls backend via HTTP.

OUTPUT FORMAT:
{
  "name": "project-name",
  "description": "short description",
  "files": [
    {
      "path": "relative/path/to/file",
      "language": "javascript | python | html | json | text | markdown",
      "content": "FULL FILE CONTENT"
    }
  ]
}
"""

CLARIFY_SYSTEM_PROMPT = """
Return ONLY valid JSON (no markdown).

Decide if you need clarification questions before generating code.
Ask at most 3 short questions.
If the conversation already contains enough detail, ask zero questions.

Output format:
{
  "needs_clarification": true/false,
  "questions": ["..."],
  "derived": {"notes":"optional"}
}
"""

def extract_last_user_text(conversation: str) -> str:
    if not conversation:
        return ""
    if "User:" in conversation:
        last = conversation.split("User:")[-1]
        return last.strip()
    return conversation.strip()

async def clarify_with_ai(prompt: str, project_type: str) -> ClarifyResponse:
    last_user = extract_last_user_text(prompt)
    if len(last_user.split()) >= 16:
        return ClarifyResponse(needs_clarification=False, questions=[], derived={"reason": "enough_detail"})

    user_msg = f"""
Project type selected: {project_type}

Conversation:
{prompt}

Task:
If the user request is underspecified, ask the minimum questions needed to generate a runnable project.
If it is specific enough, return no questions.
"""

    def _call():
        return client_ai.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": CLARIFY_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
        )

    resp = await asyncio.to_thread(_call)
    content = (resp.choices[0].message.content or "").strip()
    if content.startswith("```"):
        content = "\n".join(content.split("\n")[1:-1]).strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return ClarifyResponse(needs_clarification=False, questions=[], derived={"reason": "clarify_invalid_json"})

    return ClarifyResponse(
        needs_clarification=bool(data.get("needs_clarification")),
        questions=list(data.get("questions") or []),
        derived=dict(data.get("derived") or {}),
    )

def build_generation_user_message(prompt: str, project_type: str, preferences: Optional[Dict[str, Any]] = None) -> str:
    prefs = preferences or {}
    pt = (project_type or "fullstack").lower().strip()

    if pt == "any":
        return f"""
Generate a COMPLETE, RUNNABLE project. You may choose ANY language/framework/stack that best fits the request.

User request:
{prompt}

Constraints:
- Choose the simplest solution that fully satisfies the request.
- Prefer web unless the request clearly implies mobile/desktop.
- If AI/OpenAI is needed: implement it ONLY in backend code and read keys from environment variables.
- The output MUST be runnable, with complete file structure and a README.md.

Deliverables:
- Include ALL required files.
- Include README.md with install/run steps.
- If fullstack is chosen, separate into frontend/ and backend/.
"""

    if pt == "frontend":
        frontend_stack = prefs.get("frontend_stack") or "react-cra"
        return f"""
Generate a COMPLETE FRONTEND-ONLY project.

User request:
{prompt}

Constraints:
- Frontend stack: {frontend_stack}
- Must include a runnable project with correct file structure for that stack.
- No backend code.
- No OpenAI SDK in the browser.
- If user asked for AI/OpenAI: generate a local non-AI version OR explain in README that AI requires backend and suggest switching to fullstack.

Deliverables:
- Include package.json (or equivalent) and all required entry files.
- Include README.md with install/run instructions.
"""

    if pt == "backend":
        backend_stack = prefs.get("backend_stack") or "fastapi"
        database = prefs.get("database") or "none"
        return f"""
Generate a COMPLETE BACKEND-ONLY project.

User request:
{prompt}

Constraints:
- Backend stack: {backend_stack}
- Database: {database}
- Provide clear API endpoints.
- If OpenAI is needed, implement it ONLY in backend code and read key from environment variables.
- Include requirements.txt (or equivalent) and README.md with run instructions while making sure everything needed to run is included.
"""

    frontend_stack = prefs.get("frontend_stack") or "react-cra"
    backend_stack = prefs.get("backend_stack") or "fastapi"
    database = prefs.get("database") or "mysql"
    backend_port = prefs.get("backend_port") or 8000
    return f"""
Generate a COMPLETE FULLSTACK project.

User request:
{prompt}

Constraints:
- Frontend stack: {frontend_stack}
- Backend stack: {backend_stack}
- Database: {database}
- Generated backend should run on port: {backend_port}
- Must be separated into:
  - frontend/...
  - backend/...
- Frontend calls backend via HTTP (fetch/axios) using /api/... and CRA proxy.
- OpenAI SDK (if needed) ONLY in backend, key from env var.
- Include README.md with full setup instructions for both parts.
"""

async def generate_code_with_ai(prompt: str, project_type: str, preferences: Optional[Dict[str, Any]] = None) -> dict:
    user_msg = build_generation_user_message(prompt, project_type, preferences)

    def _call():
        return client_ai.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
        )

    response = await asyncio.to_thread(_call)
    content = (response.choices[0].message.content or "").strip()
    if content.startswith("```"):
        content = "\n".join(content.split("\n")[1:-1]).strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")

# ================== CLARIFY ROUTE ==================

@api_router.post("/generate/clarify", response_model=ClarifyResponse)
async def generate_clarify(req: ClarifyRequest, user=Depends(get_current_user)):
    pt = (req.project_type or "any").lower().strip()
    if pt != "any":
        return ClarifyResponse(needs_clarification=False, questions=[], derived={"reason": "not_any"})
    return await clarify_with_ai(req.prompt, pt)

# ================== GENERATE ==================

@api_router.post("/generate", response_model=ProjectResponse)
async def generate_project(req: GenerateRequest, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t0 = time.time()

    analysis = preflight_analyze(req.prompt, req.project_type or "any", req.preferences)
    effective_pt = analysis.derived.get("effective_project_type") or (req.project_type or "fullstack")
    effective_prefs = analysis.derived.get("effective_preferences") or (req.preferences or {})

    if (req.project_type or "").lower().strip() == "any":
        clar = await clarify_with_ai(req.prompt, "any")
        if clar.needs_clarification and clar.questions:
            raise HTTPException(
                status_code=400,
                detail={"needs_clarification": True, "questions": clar.questions, "derived": clar.derived},
            )

    gen_id = str(uuid.uuid4())
    gen = Generation(
        id=gen_id,
        user_id=user["id"],
        prompt=req.prompt,
        project_type=effective_pt,
        status="ok",
        ai_request={"prompt": req.prompt, "project_type": effective_pt, "preferences": effective_prefs},
        created_at=datetime.utcnow(),
    )
    db.add(gen)
    await db.commit()

    try:
        result = await generate_code_with_ai(req.prompt, effective_pt, effective_prefs)
        files = result.get("files", []) or []

        files = patch_generated_project(files, effective_prefs)
        result["files"] = files

        validation_errors = validate_node_openai(files) or []

        project_id = str(uuid.uuid4())
        now = datetime.utcnow()

        project = Project(
            id=project_id,
            user_id=user["id"],
            prompt=req.prompt,
            project_type=effective_pt,
            name=result.get("name", "Generated Project"),
            description=result.get("description", "AI-generated project"),
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

        gen.project_id = project_id
        gen.model = "gpt-4.1-mini"
        gen.duration_ms = int((time.time() - t0) * 1000)
        gen.ai_response = {
            "name": project.name,
            "description": project.description,
            "files_count": len(files),
            "validation_errors": validation_errors,
        }

        await db.commit()

        return ProjectResponse(
            id=project_id,
            user_id=user["id"],
            prompt=req.prompt,
            project_type=effective_pt,
            name=project.name,
            description=project.description,
            files=[{"path": f["path"], "language": f.get("language", "text"), "content": f.get("content", "")} for f in files],
            created_at=project.created_at.replace(tzinfo=timezone.utc).isoformat(),
            validation_errors=validation_errors,
        )

    except Exception as e:
        gen.status = "error"
        gen.error_message = str(e)
        gen.duration_ms = int((time.time() - t0) * 1000)
        await db.commit()
        raise

# ================== GENERATE STREAM ==================

@api_router.post("/generate/stream")
async def generate_project_stream(req: GenerateRequest, user=Depends(get_current_user)):
    async def stream():
        t0 = time.time()
        async with SessionLocal() as db:
            gen_id = str(uuid.uuid4())
            try:
                analysis = preflight_analyze(req.prompt, req.project_type or "any", req.preferences)
                effective_pt = analysis.derived.get("effective_project_type") or (req.project_type or "fullstack")
                effective_prefs = analysis.derived.get("effective_preferences") or (req.preferences or {})

                yield f"data: {json.dumps({'stage':'analyzing','derived':analysis.derived})}\n\n"
                await asyncio.sleep(0.3)

                if (req.project_type or "").lower().strip() == "any":
                    clar = await clarify_with_ai(req.prompt, "any")
                    if clar.needs_clarification and clar.questions:
                        yield f"data: {json.dumps({'stage':'clarify','questions':clar.questions,'derived':clar.derived})}\n\n"
                        return

                gen = Generation(
                    id=gen_id,
                    user_id=user["id"],
                    prompt=req.prompt,
                    project_type=effective_pt,
                    status="ok",
                    ai_request={"prompt": req.prompt, "project_type": effective_pt, "preferences": effective_prefs},
                    created_at=datetime.utcnow(),
                )
                db.add(gen)
                await db.commit()

                yield f"data: {json.dumps({'stage':'generating'})}\n\n"
                result = await generate_code_with_ai(req.prompt, effective_pt, effective_prefs)

                files = result.get("files", []) or []
                files = patch_generated_project(files, effective_prefs)
                result["files"] = files

                validation_errors = validate_node_openai(files) or []

                project_id = str(uuid.uuid4())
                now = datetime.utcnow()

                project = Project(
                    id=project_id,
                    user_id=user["id"],
                    prompt=req.prompt,
                    project_type=effective_pt,
                    name=result.get("name", "Generated Project"),
                    description=result.get("description", "AI-generated project"),
                    validation_errors={"items": validation_errors},
                    created_at=now,
                )
                db.add(project)

                for f in files:
                    db.add(ProjectFile(
                        project_id=project_id,
                        path=(f.get("path") or "").lstrip("/"),
                        language=f.get("language"),
                        content=f.get("content") or "",
                        created_at=now,
                    ))

                gen.project_id = project_id
                gen.model = "gpt-4.1-mini"
                gen.duration_ms = int((time.time() - t0) * 1000)
                gen.ai_response = {
                    "name": project.name,
                    "description": project.description,
                    "files_count": len(files),
                    "validation_errors": validation_errors,
                }

                await db.commit()

                yield f"data: {json.dumps({'stage':'done','project_id':project_id,'validation_errors':validation_errors})}\n\n"

            except HTTPException as e:
                yield f"data: {json.dumps({'stage':'error','message':e.detail})}\n\n"
            except Exception as e:
                # mark generation error if we managed to create it
                try:
                    g = (await db.execute(select(Generation).where(Generation.id == gen_id))).scalar_one_or_none()
                    if g:
                        g.status = "error"
                        g.error_message = str(e)
                        g.duration_ms = int((time.time() - t0) * 1000)
                        await db.commit()
                except Exception:
                    pass
                yield f"data: {json.dumps({'stage':'error','message':str(e)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

# ================== PROJECTS ==================

@api_router.get("/projects", response_model=List[ProjectHistoryItem])
async def projects(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Project).where(Project.user_id == user["id"]).order_by(Project.created_at.desc())
    )).scalars().all()

    items: List[ProjectHistoryItem] = []
    for p in rows:
        ve = (p.validation_errors or {}).get("items") or []
        items.append(ProjectHistoryItem(
            id=p.id,
            name=p.name or "Generated Project",
            description=p.description or "",
            project_type=p.project_type or "",
            created_at=p.created_at.replace(tzinfo=timezone.utc).isoformat(),
            file_count=await _count_files(db, p.id),
            has_validation_errors=len(ve) > 0,
        ))
    return items

async def _count_files(db: AsyncSession, project_id: str) -> int:
    # klein en duidelijk: tel files via SELECT COUNT(*)
    from sqlalchemy import func
    n = (await db.execute(select(func.count(ProjectFile.id)).where(ProjectFile.project_id == project_id))).scalar_one()
    return int(n or 0)

@api_router.get("/projects/{pid}", response_model=ProjectResponse)
async def project(pid: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Project).where(Project.id == pid, Project.user_id == user["id"]))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    files = (await db.execute(
        select(ProjectFile).where(ProjectFile.project_id == p.id).order_by(ProjectFile.id.asc())
    )).scalars().all()

    ve = (p.validation_errors or {}).get("items") or []

    return ProjectResponse(
        id=p.id,
        user_id=p.user_id,
        prompt=p.prompt,
        project_type=p.project_type,
        name=p.name,
        description=p.description,
        files=[{"path": f.path, "language": f.language or "text", "content": f.content} for f in files],
        created_at=p.created_at.replace(tzinfo=timezone.utc).isoformat(),
        validation_errors=ve,
    )

@api_router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(delete(Project).where(Project.id == pid, Project.user_id == user["id"]))
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.commit()
    return {"ok": True}

# ================== ZIP ==================

@api_router.get("/projects/{pid}/download")
async def download(pid: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Project).where(Project.id == pid, Project.user_id == user["id"]))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    files = (await db.execute(select(ProjectFile).where(ProjectFile.project_id == p.id))).scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.writestr(f.path, f.content)

    buf.seek(0)
    safe_name = (p.name or "project").replace(" ", "_")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={safe_name}.zip"},
    )

# ================== ROOT ==================

@api_router.get("/")
async def api_root():
    return {"message": "Code Generation API"}

# ================== FINAL ==================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https://(www\.)?studio\.webcrafters\.be|http://localhost:3000|http://127\.0\.0\.1:3000)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

@app.on_event("shutdown")
async def shutdown():
    # netjes pool sluiten
    await engine.dispose()
