#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

BASE_URL = os.getenv("WEBCRAFTERS_BASE_URL", "https://studio.webcrafters.be")
TOKEN_PATH = os.getenv("WEBCRAFTERS_JWT_PATH", "env-dev.txt")
LOG_PATH = os.getenv("WEBCRAFTERS_LOG_PATH", os.path.join("Docs", "test_results.json"))

POLL_SECONDS = float(os.getenv("WEBCRAFTERS_POLL_SECONDS", "2.0"))
STATUS_TIMEOUT_SECONDS = int(os.getenv("WEBCRAFTERS_STATUS_TIMEOUT_SECONDS", "1200"))
PREVIEW_TIMEOUT_SECONDS = int(os.getenv("WEBCRAFTERS_PREVIEW_TIMEOUT_SECONDS", "1200"))
MAX_TOTAL_SECONDS = int(os.getenv("WEBCRAFTERS_MAX_SECONDS", "120"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("WEBCRAFTERS_REQUEST_TIMEOUT", "20"))

DEFAULT_PROMPT = (
    "Build a responsive marketing site for a neighborhood coffee shop with "
    "a hero image, feature grid, menu highlights, testimonials, and a contact form."
)
DEFAULT_PROJECT_TYPE = "fullstack"


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def load_token() -> str:
    path = Path(TOKEN_PATH)
    if not path.exists():
        raise SystemExit(f"JWT file not found: {TOKEN_PATH}")
    text = path.read_text(encoding="utf-8")
    if not text or not text.strip():
        raise SystemExit("JWT file is empty")

    compact = "".join(text.split())
    match = re.search(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", compact)
    if match:
        return match.group(0)

    if "TOKEN=" in compact:
        token = compact.split("TOKEN=", 1)[1]
        for marker in ("EMAIL=", "PASSWORD="):
            if marker in token:
                token = token.split(marker, 1)[0]
        if token:
            return token

    token = text.strip()
    if token:
        return token

    raise SystemExit("JWT token not found in file")


def resolve_log_path() -> Path:
    path = Path(LOG_PATH)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path


def append_log(entry: Dict[str, Any]) -> None:
    path = resolve_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def log_user(job_id: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    meta = metadata or {}
    append_log({
        "ts": now_iso(),
        "job_id": job_id,
        "role": "user",
        "message": message,
        "metadata": meta,
        "user": {
            "message": message,
            "metadata": meta,
        },
    })


def log_agent(
    job_id: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
    agent_ts: Optional[str] = None,
) -> None:
    meta = metadata or {}
    payload: Dict[str, Any] = {
        "ts": now_iso(),
        "job_id": job_id,
        "role": "agent",
        "message": message,
        "metadata": meta,
        "agent": {
            "message": message,
            "metadata": meta,
        },
    }
    if agent_ts:
        payload["agent"]["timestamp"] = agent_ts
        payload["agent_timestamp"] = agent_ts
    append_log(payload)


def request_json(
    method: str,
    path: str,
    token: str,
    payload: Optional[Dict[str, Any]] = None,
    timeout: Optional[int] = None,
) -> Dict[str, Any]:
    url = BASE_URL.rstrip("/") + path
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout or REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            if not body:
                return {}
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                raise RuntimeError(f"Non-JSON response from {path}: {body[:1000]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {e.reason}: {body[:1000]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e}")


def extract_new_agent_messages(chat_messages: Iterable[Dict[str, Any]], seen: Set[str]) -> List[Dict[str, Any]]:
    new_msgs: List[Dict[str, Any]] = []
    for msg in chat_messages or []:
        if msg.get("role") != "agent":
            continue
        key = f"{msg.get('timestamp','')}|{msg.get('message','')}"
        if key in seen:
            continue
        seen.add(key)
        new_msgs.append(msg)
    return new_msgs


def build_clarify_answers(questions: Any) -> Dict[str, Any]:
    if isinstance(questions, list) and questions:
        return {str(q): "No preference." for q in questions}
    return {"details": "No preference."}


def run_flow(prompt: str, project_type: str, run_preview: bool, max_seconds: int) -> None:
    token = load_token()

    request_json("GET", "/api/auth/me", token)

    payload = {
        "prompt": prompt,
        "project_type": project_type,
        "preferences": {},
    }
    gen_res = request_json("POST", "/api/generate", token, payload)
    job_id = gen_res.get("job_id")
    if not job_id:
        raise RuntimeError("Missing job_id from /api/generate")

    log_user(job_id, prompt, {"endpoint": "/api/generate", "project_type": project_type})

    seen: Set[str] = set()
    clarify_sent = False
    error_logged = False
    overall_deadline = time.time() + max_seconds
    deadline = min(time.time() + STATUS_TIMEOUT_SECONDS, overall_deadline)
    status_res: Dict[str, Any] = {}

    while time.time() < deadline:
        remaining = max(1, int(overall_deadline - time.time()))
        status_res = request_json(
            "GET",
            f"/api/generate/status/{job_id}",
            token,
            timeout=min(REQUEST_TIMEOUT_SECONDS, remaining),
        )
        new_msgs = extract_new_agent_messages(status_res.get("chat_messages", []), seen)
        for msg in new_msgs:
            log_agent(
                job_id,
                msg.get("message") or "",
                msg.get("metadata") or {},
                msg.get("timestamp"),
            )

        status = status_res.get("status")
        if status == "clarify" and not clarify_sent:
            questions = status_res.get("questions") or []
            answers = build_clarify_answers(questions)
            log_user(job_id, json.dumps(answers, ensure_ascii=False), {
                "endpoint": f"/api/generate/continue/{job_id}",
                "questions": questions,
            })
            remaining = max(1, int(overall_deadline - time.time()))
            request_json(
                "POST",
                f"/api/generate/continue/{job_id}",
                token,
                answers,
                timeout=min(REQUEST_TIMEOUT_SECONDS, remaining),
            )
            clarify_sent = True

        if status in ("done", "error"):
            if status == "error" and not error_logged:
                err_msg = status_res.get("error") or status_res.get("message") or "Unknown error"
                log_agent(job_id, err_msg, {"source": "status_error"}, None)
                error_logged = True
            break

        time.sleep(POLL_SECONDS)

    if time.time() >= overall_deadline:
        log_agent(job_id, "Client timeout reached (max 120s).", {"source": "client_timeout"}, None)
        return

    if run_preview and status_res.get("status") == "done":
        log_user(job_id, "Preview requested", {"endpoint": f"/api/generate/preview/{job_id}"})
        remaining = max(1, int(overall_deadline - time.time()))
        request_json(
            "POST",
            f"/api/generate/preview/{job_id}",
            token,
            {},
            timeout=min(REQUEST_TIMEOUT_SECONDS, remaining),
        )

        preview_deadline = min(time.time() + PREVIEW_TIMEOUT_SECONDS, overall_deadline)
        while time.time() < preview_deadline:
            remaining = max(1, int(overall_deadline - time.time()))
            status_res = request_json(
                "GET",
                f"/api/generate/status/{job_id}",
                token,
                timeout=min(REQUEST_TIMEOUT_SECONDS, remaining),
            )
            new_msgs = extract_new_agent_messages(status_res.get("chat_messages", []), seen)
            for msg in new_msgs:
                log_agent(
                    job_id,
                    msg.get("message") or "",
                    msg.get("metadata") or {},
                    msg.get("timestamp"),
                )

            preview_summary = status_res.get("preview_summary")
            if preview_summary or status_res.get("status") == "error":
                if status_res.get("status") == "error" and not error_logged:
                    err_msg = status_res.get("error") or status_res.get("message") or "Unknown error"
                    log_agent(job_id, err_msg, {"source": "preview_error"}, None)
                break

            time.sleep(POLL_SECONDS)

        if time.time() >= overall_deadline:
            log_agent(
                job_id,
                "Client timeout reached during preview (max 120s).",
                {"source": "client_timeout"},
                None,
            )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Webcrafters Studio production generate flow and log agent messages."
    )
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--project-type", default=DEFAULT_PROJECT_TYPE)
    parser.add_argument("--no-preview", action="store_true")
    parser.add_argument("--max-seconds", type=int, default=MAX_TOTAL_SECONDS)
    args = parser.parse_args()

    run_flow(args.prompt, args.project_type, not args.no_preview, args.max_seconds)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
