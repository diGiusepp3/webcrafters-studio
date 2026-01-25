# FILE: backend/server.py

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import logging
import os
from pathlib import Path as PathLib

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware

from backend.core.database import engine, Base
import backend.models  # noqa: F401

from backend.api.auth import router as auth_router
from backend.api.generate import router as generate_router
from backend.api.projects import router as projects_router
from backend.api.root import router as root_router
from backend.api.projects_preview import router as preview_router
from backend.api.credits import router as credits_router
from backend.api.agent_ws import router as agent_router
from backend.api.modify import router as modify_router
from backend.api.code_assistant import router as code_assistant_router
from backend.api.github import router as github_router


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("webcrafters-studio")

app = FastAPI()

# ✅ Preflight enkel op /api/* (niet globaal)
@app.options("/api/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str, request: Request):
    return Response(status_code=204)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Startup complete: DB schema ensured.")

@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()
    logger.info("Shutdown complete: DB engine disposed.")

app.include_router(auth_router)
app.include_router(generate_router)
app.include_router(projects_router)
app.include_router(root_router)
app.include_router(preview_router)
app.include_router(credits_router)
app.include_router(agent_router)
app.include_router(modify_router)
app.include_router(code_assistant_router)
app.include_router(github_router)

# Static preview serving (blijft root-level /preview)
PREVIEW_ROOT = PathLib(os.environ.get("PREVIEW_ROOT", "/tmp/previews"))
PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)

@app.get("/preview/{preview_id}/{file_path:path}")
async def serve_preview_static(preview_id: str, file_path: str):
    if not file_path:
        file_path = "index.html"

    preview_dir = (PREVIEW_ROOT / preview_id).resolve()
    target_file = (preview_dir / file_path).resolve()

    if not str(target_file).startswith(str(preview_dir)):
        return Response(status_code=403, content="Access denied")

    if not target_file.exists() or not target_file.is_file():
        if (preview_dir / file_path).is_dir():
            target_file = preview_dir / file_path / "index.html"
            if not target_file.exists():
                return Response(status_code=404, content="Not found")
        else:
            return Response(status_code=404, content="Not found")

    media_types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }
    media_type = media_types.get(target_file.suffix.lower(), "application/octet-stream")
    return FileResponse(target_file, media_type=media_type)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https://(www\.)?studio\.webcrafters\.be|http://localhost:3000|http://127\.0\.0\.1:3000)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)
