# FILE: backend/services/workflow_service.py
"""
Workflow Service
- Loads workflow bundles from backend/workflows/<bundle>/
- Supports: agents/, commands/, rules/, skills/
- Provides: list_bundles(), list_items(), get_item(), render_command()
- Safe path handling + simple template substitution {{var}}
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Any


# ----------------------------
# Models
# ----------------------------

@dataclass(frozen=True)
class WorkflowItem:
    bundle: str
    kind: str            # agents | commands | rules | skills
    name: str            # filename stem or relative key
    path: Path
    content: str

    @property
    def key(self) -> str:
        return f"{self.bundle}:{self.kind}:{self.name}"


class WorkflowError(Exception):
    pass


# ----------------------------
# Service
# ----------------------------

class WorkflowService:
    """
    Convention:
      backend/workflows/
        <bundle>/
          agents/*.md
          commands/*.md
          rules/*.md
          skills/**/SKILL.md  (or *.md)

    Notes:
      - We treat files as text templates.
      - Variables are substituted using {{var}} placeholders.
    """

    DEFAULT_KINDS = ("agents", "commands", "rules", "skills")

    def __init__(self, workflows_dir: Optional[str] = None) -> None:
        # Prefer explicit env var; fallback to backend/workflows relative to repo.
        env_dir = os.environ.get("WORKFLOWS_DIR")
        if workflows_dir:
            base = Path(workflows_dir)
        elif env_dir:
            base = Path(env_dir)
        else:
            # backend/services/ -> backend/workflows
            base = Path(__file__).resolve().parents[1] / "workflows"

        self.workflows_dir: Path = base.resolve()
        self._cache: Dict[str, WorkflowItem] = {}

    # -------- public API --------

    def list_bundles(self) -> List[str]:
        if not self.workflows_dir.exists():
            return []
        bundles = []
        for p in self.workflows_dir.iterdir():
            if p.is_dir() and not p.name.startswith("."):
                bundles.append(p.name)
        bundles.sort()
        return bundles

    def list_items(
            self,
            bundle: Optional[str] = None,
            kind: Optional[str] = None,
            refresh: bool = False,
    ) -> List[WorkflowItem]:
        if refresh:
            self.refresh()

        # Ensure cache populated at least once
        if not self._cache:
            self.refresh()

        items = list(self._cache.values())
        if bundle:
            items = [i for i in items if i.bundle == bundle]
        if kind:
            items = [i for i in items if i.kind == kind]
        items.sort(key=lambda i: (i.bundle, i.kind, i.name))
        return items

    def get_item(self, bundle: str, kind: str, name: str, refresh: bool = False) -> WorkflowItem:
        if refresh or not self._cache:
            self.refresh()
        key = f"{bundle}:{kind}:{name}"
        item = self._cache.get(key)
        if not item:
            raise WorkflowError(f"Workflow item not found: {key}")
        return item

    def render_command(
            self,
            bundle: str,
            command_name: str,
            variables: Optional[Dict[str, Any]] = None,
            refresh: bool = False,
    ) -> str:
        """
        Loads a command template (markdown/text) and substitutes {{var}} placeholders.
        Unknown vars are left intact.
        """
        item = self.get_item(bundle=bundle, kind="commands", name=command_name, refresh=refresh)
        return self._render_template(item.content, variables or {})

    def refresh(self) -> None:
        self._cache = {}
        if not self.workflows_dir.exists():
            return

        for bundle_dir in self.workflows_dir.iterdir():
            if not bundle_dir.is_dir() or bundle_dir.name.startswith("."):
                continue

            bundle = bundle_dir.name
            for kind in self.DEFAULT_KINDS:
                kind_dir = bundle_dir / kind
                if not kind_dir.exists() or not kind_dir.is_dir():
                    continue

                for file_path in self._iter_text_files(kind_dir):
                    name = self._item_name(kind, file_path, kind_dir)
                    content = self._read_text_safe(file_path)
                    item = WorkflowItem(
                        bundle=bundle,
                        kind=kind,
                        name=name,
                        path=file_path,
                        content=content,
                    )
                    self._cache[item.key] = item

    # -------- internals --------

    def _iter_text_files(self, root: Path):
        # skills may be nested; other kinds usually flat
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if p.name.startswith("."):
                continue
            # Accept .md / .txt; also allow SKILL.md
            if p.suffix.lower() in (".md", ".txt") or p.name.upper().endswith("SKILL.MD"):
                yield p

    def _item_name(self, kind: str, file_path: Path, kind_dir: Path) -> str:
        """
        commands/agents/rules: use stem
        skills: use relative folder key (e.g. verification-loop/SKILL.md -> verification-loop)
        """
        if kind != "skills":
            return file_path.stem

        rel = file_path.relative_to(kind_dir)
        # If SKILL.md inside a folder, prefer the folder name as skill key
        if rel.name.upper() == "SKILL.MD" and rel.parent != Path("."):
            return rel.parent.as_posix()
        # Else use path without extension
        return rel.with_suffix("").as_posix()

    def _read_text_safe(self, path: Path) -> str:
        # Prevent path traversal by enforcing within workflows_dir
        try:
            resolved = path.resolve()
        except Exception as e:
            raise WorkflowError(f"Cannot resolve path: {path}") from e

        if not str(resolved).startswith(str(self.workflows_dir)):
            raise WorkflowError(f"Unsafe path outside workflows_dir: {resolved}")

        try:
            return resolved.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Last resort: latin-1 to avoid crashing on odd files
            return resolved.read_text(encoding="latin-1")
        except Exception as e:
            raise WorkflowError(f"Failed to read workflow file: {resolved}") from e

    _VAR_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.:-]*)\s*\}\}")

    def _render_template(self, text: str, variables: Dict[str, Any]) -> str:
        def repl(m: re.Match) -> str:
            key = m.group(1)
            if key in variables:
                return str(variables[key])
            # dotted lookup (e.g. project.name)
            if "." in key:
                cur: Any = variables
                ok = True
                for part in key.split("."):
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        ok = False
                        break
                if ok:
                    return str(cur)
            return m.group(0)  # leave intact

        return self._VAR_PATTERN.sub(repl, text)


# Singleton helper (optional pattern)
_workflow_service_singleton: Optional[WorkflowService] = None


def get_workflow_service() -> WorkflowService:
    global _workflow_service_singleton
    if _workflow_service_singleton is None:
        _workflow_service_singleton = WorkflowService()
    return _workflow_service_singleton
