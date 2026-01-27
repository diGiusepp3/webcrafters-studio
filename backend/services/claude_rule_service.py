from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

REPO_ROOT = Path(__file__).resolve().parents[2]
HELPER_RULES_DIR = REPO_ROOT / "webcrafters-ai-helpers" / "rules"
RULE_FILES = [
    "coding-style.md",
    "security.md",
    "testing.md",
    "agents.md",
]


def _read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def _build_section(path: Path) -> str:
    name = path.stem.replace("-", " ").title()
    body = _read_file(path)
    if not body:
        return ""
    return f"## {name}\n{body}"


@lru_cache(maxsize=1)
def build_claude_rules_summary() -> str:
    sections: List[str] = []
    if not HELPER_RULES_DIR.exists():
        return ""

    for filename in RULE_FILES:
        path = HELPER_RULES_DIR / filename
        if not path.exists():
            continue
        section = _build_section(path)
        if section:
            sections.append(section)

    return "\n\n".join(sections).strip()
