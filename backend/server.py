# =========================================================
# FILE: /backend/server.py
# =========================================================

import sys
from pathlib import Path

# Add parent directory to path so 'backend' package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import logging

from fastapi import FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware

from backend.core.database import engine, Base
import backend.models  # noqa: F401 (registreert models)

from backend.api.auth import router as auth_router
from backend.api.generate import router as generate_router
from backend.api.projects import router as projects_router
from backend.api.root import router as root_router
from backend.api.projects_preview import router as preview_router
from backend.api.credits import router as credits_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("webcrafters-studio")

app = FastAPI()


@app.options("/{rest_of_path:path}")
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


# Routers
app.include_router(auth_router)
app.include_router(generate_router)
app.include_router(projects_router)
app.include_router(root_router)
app.include_router(preview_router)  # serveert /preview/{preview_id}/...


# CORS (exact behouden)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https://(www\.)?studio\.webcrafters\.be|http://localhost:3000|http://127\.0\.0\.1:3000)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)