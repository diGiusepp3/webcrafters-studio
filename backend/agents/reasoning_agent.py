from typing import Any, Dict, Optional

from backend.services.ai_service import run_final_reasoning_agent, run_reasoning_agent


async def run_reasoning_step(prompt: str, project_type: str, preferences: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Generate a plan JSON (problem, guidelines, plan steps, checks)."""
    return await run_reasoning_agent(prompt, project_type, preferences)


async def run_final_reasoning_step(
    prompt: str,
    project_type: str,
    preferences: Optional[Dict[str, Any]] = None,
    plan_summary: Optional[str] = "",
    plan_message: Optional[str] = "",
    files_count: int = 0,
    test_report: Optional[Dict[str, Any]] = None,
    security_stats: Optional[Dict[str, Any]] = None,
    preview_summary: Optional[Dict[str, Any]] = None,
    build_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run the final reasoning agent to verify readiness and list issues."""
    return await run_final_reasoning_agent(
        prompt,
        project_type,
        preferences,
        plan_summary=plan_summary,
        plan_message=plan_message,
        files_count=files_count,
        test_report=test_report,
        security_stats=security_stats,
        preview_summary=preview_summary,
        build_result=build_result,
    )
