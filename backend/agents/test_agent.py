from typing import Any, Dict, List

from backend.validators.node_openai_validator import validate_node_openai


async def run_test_agent(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Run lightweight validation tests on the generated files."""
    validation_errors = validate_node_openai(files) or []
    return {
        "validation_errors": validation_errors,
        "error_count": len(validation_errors),
    }
