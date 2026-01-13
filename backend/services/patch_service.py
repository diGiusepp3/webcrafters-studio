import json
from typing import Any, Dict, List

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