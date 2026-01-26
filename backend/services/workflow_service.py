# FILE: backend/services/workflow_service.py
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# Root: backend/workflows/*
DEFAULT_WORKFLOWS_ROOT = Path(__file__).resolve().parents[1] / "workflows"

# Allowed file types we consider "items"
ITEM_EXTS = {".json", ".md", ".txt", ".yaml", ".yml", ".py"}

_VAR_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}")


class WorkflowServiceError(Exception):
    pass


def _safe_join(root: Path, *parts: str) -> Path:
    """
    Prevent path traversal: resolve must stay within root.
    """
    p = (root / Path(*parts)).resolve()
    r = root.resolve()
    if r == p or r in p.parents:
        return p
    raise WorkflowServiceError("Unsafe path outside workflows root")


def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def _read_json(p: Path) -> Any:
    return json.loads(_read_text(p))


def _render_template(text: str, variables: Dict[str, Any]) -> str:
    """
    Very small templater: replaces {{key}} with variables[key].
    Missing keys stay unchanged.
    Supports dotted keys: foo.bar -> variables["foo"]["bar"] if dicts.
    """

    def _lookup(key: str) -> Optional[str]:
        cur: Any = variables
        for part in key.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return None
        return "" if cur is None else str(cur)

    def repl(m: re.Match) -> str:
        key = m.group(1)
        v = _lookup(key)
        return m.group(0) if v is None else v

    return _VAR_PATTERN.sub(repl, text)


@dataclass(frozen=True)
class WorkflowItemRef:
    bundle: str
    relpath: str  # relative inside bundle, e.g. "commands/build.md"
    abspath: str
    kind: str     # e.g. "commands" / "agents" / "rules" / "skills" / "other"
    ext: str


class WorkflowService:
    """
    Loads and serves workflow bundles from backend/workflows/<bundle>/...

    Expected structure (flexible):
      workflows/
        <bundle>/
          agents/
          commands/
          rules/
          skills/   (can be nested)
          meta.json (optional)

    Items are files (md/json/txt/yaml/yml/py). We don't execute .py; it's just content.
    """

    def __init__(self, workflows_root: Optional[Path] = None) -> None:
        self.root = (workflows_root or DEFAULT_WORKFLOWS_ROOT).resolve()
        self._cache: Dict[str, Dict[str, WorkflowItemRef]] = {}  # bundle -> key -> ref
        self._bundle_meta_cache: Dict[str, Any] = {}
        self._loaded = False

    # -------- Public API

    def refresh(self) -> None:
        self._cache.clear()
        self._bundle_meta_cache.clear()
        self._loaded = False

    def list_bundles(self) -> List[str]:
        self._ensure_loaded()
        return sorted(self._cache.keys())

    def get_bundle_meta(self, bundle: str) -> Optional[Any]:
        self._ensure_loaded()
        return self._bundle_meta_cache.get(bundle)

    def list_items(self, bundle: str, kind: Optional[str] = None) -> List[WorkflowItemRef]:
        self._ensure_loaded()
        if bundle not in self._cache:
            raise WorkflowServiceError(f"Unknown bundle: {bundle}")
        items = list(self._cache[bundle].values())
        if kind:
            items = [i for i in items if i.kind == kind]
        return sorted(items, key=lambda x: (x.kind, x.relpath))

    def get_item(self, bundle: str, relpath: str) -> Tuple[WorkflowItemRef, str, Optional[Any]]:
        """
        Returns (ref, raw_text, parsed_optional)
        parsed_optional is JSON if .json, else None.
        """
        self._ensure_loaded()
        key = self._key(bundle, relpath)
        ref = self._cache.get(bundle, {}).get(key)
        if not ref:
            raise WorkflowServiceError(f"Item not found: {bundle}/{relpath}")

        p = Path(ref.abspath)
        raw = _read_text(p)

        parsed = None
        if p.suffix.lower() == ".json":
            parsed = _read_json(p)

        return ref, raw, parsed

    def render_command(self, bundle: str, relpath: str, variables: Optional[Dict[str, Any]] = None) -> str:
        """
        Read item content and render {{vars}}.
        Intended for command templates stored as .md/.txt/.yaml etc.
        """
        _, raw, parsed = self.get_item(bundle, relpath)

        # If JSON, render string fields if present (simple)
        if parsed is not None and isinstance(parsed, dict):
            text = json.dumps(parsed, ensure_ascii=False, indent=2)
        else:
            text = raw

        return _render_template(text, variables or {})

    # -------- Internals

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        if not self.root.exists():
            # fail-fast but readable
            raise WorkflowServiceError(f"workflows root not found: {self.root}")

        for bundle_dir in sorted([p for p in self.root.iterdir() if p.is_dir()]):
            bundle = bundle_dir.name
            self._cache[bundle] = {}

            meta_path = bundle_dir / "meta.json"
            if meta_path.exists() and meta_path.is_file():
                try:
                    self._bundle_meta_cache[bundle] = _read_json(meta_path)
                except Exception:
                    # keep it non-fatal: bad meta shouldn't kill bundle listing
                    self._bundle_meta_cache[bundle] = {"error": "invalid meta.json"}

            # scan files
            for file_path in bundle_dir.rglob("*"):
                if not file_path.is_file():
                    continue
                if file_path.name.startswith("."):
                    continue

                ext = file_path.suffix.lower()
                if ext not in ITEM_EXTS:
                    continue

                rel_inside_bundle = file_path.relative_to(bundle_dir).as_posix()
                kind = rel_inside_bundle.split("/", 1)[0] if "/" in rel_inside_bundle else "other"

                ref = WorkflowItemRef(
                    bundle=bundle,
                    relpath=rel_inside_bundle,
                    abspath=str(file_path.resolve()),
                    kind=kind,
                    ext=ext,
                )
                self._cache[bundle][self._key(bundle, rel_inside_bundle)] = ref

        self._loaded = True

    @staticmethod
    def _key(bundle: str, relpath: str) -> str:
        # normalize
        rp = relpath.replace("\\", "/").lstrip("/")
        return f"{bundle}::{rp}"


# Singleton access (cheap and explicit)
_workflow_service_singleton: Optional[WorkflowService] = None


def get_workflow_service() -> WorkflowService:
    global _workflow_service_singleton
    if _workflow_service_singleton is None:
        _workflow_service_singleton = WorkflowService()
    return _workflow_service_singleton