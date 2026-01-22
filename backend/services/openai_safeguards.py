# FILE: backend/services/openai_safeguards.py
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

# Gebruik je eigen OpenAI wrapper/SDK call in ai_service.py.
# Dit bestand doet alleen: errors normalizen + detectie van policy/ratelimit/timeout.

@dataclass
class NormalizedAIError(Exception):
    code: str                 # e.g. "RATE_LIMIT", "POLICY", "AUTH", "TIMEOUT", "SERVER", "BAD_REQUEST", "UNKNOWN"
    message: str              # korte user-facing tekst
    retryable: bool           # kan opnieuw proberen?
    status_code: int          # HTTP status die jij teruggeeft
    raw: Optional[str] = None # ruwe error voor logs (niet voor user)

    def to_http_detail(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }


def _safe_str(x: Any) -> str:
    try:
        return str(x)
    except Exception:
        return "<unprintable>"


def _looks_like_policy(msg: str) -> bool:
    m = msg.lower()
    return (
            "policy" in m
            or "safety" in m
            or "violat" in m
            or "content" in m and "not allowed" in m
            or "disallowed" in m
            or "moderation" in m
    )


def _looks_like_rate_limit(msg: str) -> bool:
    m = msg.lower()
    return "rate limit" in m or "too many requests" in m or "429" in m


def _looks_like_timeout(msg: str) -> bool:
    m = msg.lower()
    return "timeout" in m or "timed out" in m or "read timeout" in m or "connect timeout" in m


def _looks_like_auth(msg: str) -> bool:
    m = msg.lower()
    return "invalid api key" in m or "api key" in m and "invalid" in m or "unauthorized" in m or "401" in m or "403" in m


def _looks_like_bad_request(msg: str) -> bool:
    m = msg.lower()
    return "400" in m or "bad request" in m or "invalid request" in m


def normalize_openai_exception(err: Exception) -> NormalizedAIError:
    """
    Map whatever SDK/HTTP exception to something stable for your API + UI.
    Works even if you swap OpenAI SDK implementation later.
    """
    msg = _safe_str(err)
    raw = msg[:4000]

    # Policy / safety refusal (user prompt or content)
    if _looks_like_policy(msg):
        return NormalizedAIError(
            code="POLICY",
            message="AI refused this request due to safety/policy constraints. Please rephrase or remove disallowed content.",
            retryable=False,
            status_code=400,
            raw=raw,
        )

    # Auth (revoked key, wrong key, org/permission)
    if _looks_like_auth(msg):
        return NormalizedAIError(
            code="AUTH",
            message="AI authentication failed (API key/permission).",
            retryable=False,
            status_code=503,  # 503 zodat frontend het als 'service not available' kan tonen
            raw=raw,
        )

    # Rate limit / quota
    if _looks_like_rate_limit(msg):
        return NormalizedAIError(
            code="RATE_LIMIT",
            message="AI is rate-limited or quota exceeded. Try again in a moment.",
            retryable=True,
            status_code=429,
            raw=raw,
        )

    # Timeouts
    if _looks_like_timeout(msg):
        return NormalizedAIError(
            code="TIMEOUT",
            message="AI request timed out. Try again.",
            retryable=True,
            status_code=504,
            raw=raw,
        )

    # Upstream/server errors
    if any(x in msg.lower() for x in ["500", "502", "503", "504", "server error", "bad gateway", "service unavailable"]):
        return NormalizedAIError(
            code="SERVER",
            message="AI service is temporarily unavailable. Try again later.",
            retryable=True,
            status_code=503,
            raw=raw,
        )

    # Bad request / invalid parameters
    if _looks_like_bad_request(msg):
        return NormalizedAIError(
            code="BAD_REQUEST",
            message="AI request was rejected due to invalid input/parameters.",
            retryable=False,
            status_code=400,
            raw=raw,
        )

    return NormalizedAIError(
        code="UNKNOWN",
        message="AI request failed unexpectedly.",
        retryable=True,
        status_code=502,
        raw=raw,
    )
