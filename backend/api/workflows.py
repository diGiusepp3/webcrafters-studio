# FILE: backend/api/workflows.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from backend.services.workflow_service import get_workflow_service, WorkflowServiceError

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class RenderBody(BaseModel):
    path: str
    variables: Optional[Dict[str, Any]] = None


@router.get("/bundles")
def list_bundles() -> Dict[str, Any]:
    try:
        s = get_workflow_service()
        s.refresh()
        return {"bundles": s.list_bundles()}
    except WorkflowServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{bundle}/items")
def list_items(bundle: str, kind: Optional[str] = None) -> Dict[str, Any]:
    try:
        s = get_workflow_service()
        s.refresh()
        items = s.list_items(bundle, kind=kind)
        return {
            "items": [
                {
                    "bundle": i.bundle,
                    "relpath": i.relpath,
                    "kind": i.kind,
                    "ext": i.ext,
                }
                for i in items
            ]
        }
    except WorkflowServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{bundle}/item")
def get_item(bundle: str, path: str) -> Dict[str, Any]:
    try:
        s = get_workflow_service()
        s.refresh()
        ref, raw, parsed = s.get_item(bundle, path)
        return {
            "ref": {"bundle": ref.bundle, "relpath": ref.relpath, "kind": ref.kind, "ext": ref.ext},
            "raw": raw,
            "parsed": parsed,
        }
    except WorkflowServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{bundle}/render")
def render(bundle: str, body: RenderBody) -> Dict[str, Any]:
    try:
        s = get_workflow_service()
        s.refresh()
        rendered = s.render_command(bundle, body.path, body.variables or {})
        return {"rendered": rendered}
    except WorkflowServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))