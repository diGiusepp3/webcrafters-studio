import uuid
from pathlib import Path
from typing import List, Dict

# Alle previews lopen via: https://studio.webcrafters.be/preview/{preview_id}/
PREVIEW_PATH_PREFIX = "/preview"

# Vaste map waar preview-builds terechtkomen
PREVIEW_ROOT = Path("/home/webcrafters/subdomains/studio/previews")


class PreviewError(Exception):
    pass


def start_preview_container(project_id: str, files: List[Dict]) -> str:
    preview_id = str(uuid.uuid4())
    preview_dir = PREVIEW_ROOT / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    # Project files schrijven
    for f in files:
        rel_path = (f.get("path") or "").lstrip("/")
        if not rel_path:
            continue

        target = preview_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f.get("content", ""), encoding="utf-8")

    # Basischeck: index.html moet bestaan
    index_file = preview_dir / "index.html"
    if not index_file.exists():
        raise PreviewError("Preview heeft geen index.html")

    return f"{PREVIEW_PATH_PREFIX}/{preview_id}/"
