from typing import Any, Dict, List

from backend.services.security_checker import check_project_security


async def run_security_agent(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze generated files for security findings."""
    findings, stats = check_project_security(files)
    return {
        "security_findings": findings,
        "security_stats": stats,
    }
