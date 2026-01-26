# =========================================================
# FILE: /backend/services/agent_event_service.py
# =========================================================

import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from backend.schemas.agent_events import AgentEvent

DEFAULT_EVENT_LIMIT = int(os.getenv("AGENT_EVENT_LIMIT", "500"))


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def append_event(
    store: Dict[str, Any],
    payload: Dict[str, Any],
    limit: int = DEFAULT_EVENT_LIMIT,
) -> Optional[Dict[str, Any]]:
    if not store or not isinstance(store, dict):
        return None

    events = store.setdefault("events", [])
    seq = int(store.get("event_seq") or 0) + 1
    store["event_seq"] = seq

    event_id = payload.get("id") or f"{store.get('job_id', 'evt')}:{seq}"

    data = {
        "id": event_id,
        "ts": payload.get("ts") or _now_iso(),
        "type": payload.get("type"),
        "title": payload.get("title") or str(payload.get("type") or "").replace("_", " ").title(),
        "detail": payload.get("detail") or "",
        "command": payload.get("command"),
        "files_read": payload.get("files_read"),
        "files_changed": payload.get("files_changed"),
        "result": payload.get("result"),
        "rationale": payload.get("rationale") or "",
        "severity": payload.get("severity"),
    }

    try:
        event = AgentEvent(**data).dict()
    except Exception:
        return None

    events.append(event)

    if limit and len(events) > limit:
        store["events"] = events[-limit:]
        events = store["events"]

    return event


def list_events(
    store: Dict[str, Any],
    after: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    if not store or not isinstance(store, dict):
        return [], None

    events = store.get("events") or []
    if not events:
        return [], None

    if not after:
        return list(events), events[-1].get("id")

    idx = next((i for i, e in enumerate(events) if e.get("id") == after), None)
    if idx is None:
        return list(events), events[-1].get("id")

    sliced = events[idx + 1 :]
    next_cursor = sliced[-1].get("id") if sliced else after
    return sliced, next_cursor
