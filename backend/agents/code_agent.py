from typing import Any, Dict, List, Optional

from backend.services.ai_service import generate_code_with_ai


async def run_code_agent(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_text: str = "",
) -> Dict[str, Any]:
    """Generate code files using the AI generator with the provided plan text."""
    return await generate_code_with_ai(prompt, project_type, preferences, plan_text)
