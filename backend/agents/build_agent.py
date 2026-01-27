import asyncio
from typing import Any, Dict, List

from backend.services.preview_service import start_preview_job, start_build


async def run_build_agent(project_id: str, project_type: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create a preview build and return the result."""
    preview_job = await asyncio.to_thread(start_preview_job, project_id, files, project_type=project_type)
    preview_id = preview_job.get('preview_id')
    build_result = await asyncio.to_thread(start_build, preview_id, files)
    return {
        'preview_id': preview_id,
        'preview_url': preview_job.get('url'),
        'build_result': build_result,
    }
