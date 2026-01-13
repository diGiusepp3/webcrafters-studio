# /backend/services/fix_loop_service.py
"""
Fix loop service - diagnoses and attempts to fix build/runtime errors.
"""
import re
import json
from typing import List, Dict, Any, Optional, Tuple


# Common error patterns and their fixes
ERROR_PATTERNS = [
    {
        "id": "missing_import_react",
        "pattern": r"'React' must be in scope when using JSX",
        "description": "Missing React import in JSX file",
        "fix_type": "add_import",
        "fix_content": "import React from 'react';",
        "file_pattern": r"\.(jsx|tsx)$"
    },
    {
        "id": "missing_module",
        "pattern": r"Cannot find module '([^']+)'",
        "description": "Missing npm module",
        "fix_type": "add_dependency",
        "extract_module": 1  # Capture group index
    },
    {
        "id": "missing_export",
        "pattern": r"export '([^']+)' \(imported as '([^']+)'\) was not found",
        "description": "Missing export in module",
        "fix_type": "manual",
        "suggestion": "Check that the export exists and is named correctly"
    },
    {
        "id": "syntax_error_unexpected_token",
        "pattern": r"SyntaxError: Unexpected token[^\n]*\n\s*at ([^:]+):(\d+):(\d+)",
        "description": "JavaScript syntax error",
        "fix_type": "manual",
        "suggestion": "Check for missing brackets, commas, or semicolons"
    },
    {
        "id": "python_import_error",
        "pattern": r"ModuleNotFoundError: No module named '([^']+)'",
        "description": "Missing Python module",
        "fix_type": "add_python_dependency",
        "extract_module": 1
    },
    {
        "id": "python_syntax_error",
        "pattern": r"SyntaxError: ([^\n]+)\n\s*File \"([^\"]+)\", line (\d+)",
        "description": "Python syntax error",
        "fix_type": "manual",
        "suggestion": "Check Python syntax at the indicated line"
    },
    {
        "id": "port_in_use",
        "pattern": r"(?:EADDRINUSE|address already in use)[^\n]*:(\d+)",
        "description": "Port already in use",
        "fix_type": "change_port",
        "suggestion": "Change the application port"
    },
    {
        "id": "env_var_missing",
        "pattern": r"(?:Error|TypeError):[^\n]*(?:undefined|null)[^\n]*(API_KEY|SECRET|TOKEN|DATABASE_URL)",
        "description": "Missing environment variable",
        "fix_type": "add_env_example",
        "suggestion": "Add the required environment variable to .env"
    },
    {
        "id": "typescript_type_error",
        "pattern": r"TS\d+: ([^\n]+)",
        "description": "TypeScript type error",
        "fix_type": "manual",
        "suggestion": "Fix the TypeScript type mismatch"
    },
]


class FixLoopResult:
    """Result of a fix loop iteration."""
    def __init__(self):
        self.success = False
        self.iterations = 0
        self.max_iterations = 3
        self.errors_found: List[Dict[str, Any]] = []
        self.fixes_applied: List[Dict[str, Any]] = []
        self.final_error: Optional[str] = None
        self.logs: List[str] = []


def diagnose_error(error_output: str) -> List[Dict[str, Any]]:
    """Diagnose errors from build/runtime output."""
    diagnosed = []
    
    for pattern_info in ERROR_PATTERNS:
        regex = re.compile(pattern_info["pattern"], re.MULTILINE | re.IGNORECASE)
        matches = regex.findall(error_output)
        
        for match in matches:
            error_info = {
                "id": pattern_info["id"],
                "description": pattern_info["description"],
                "fix_type": pattern_info["fix_type"],
                "suggestion": pattern_info.get("suggestion", ""),
                "match": match if isinstance(match, str) else match[0] if match else "",
                "full_match": str(match)
            }
            
            # Extract module name if applicable
            if "extract_module" in pattern_info:
                idx = pattern_info["extract_module"]
                if isinstance(match, tuple) and len(match) > idx:
                    error_info["module"] = match[idx]
                elif isinstance(match, str):
                    error_info["module"] = match
            
            diagnosed.append(error_info)
    
    return diagnosed


def apply_fix(
    files: List[Dict[str, str]],
    error_info: Dict[str, Any]
) -> Tuple[List[Dict[str, str]], Optional[Dict[str, Any]]]:
    """Apply a fix for a diagnosed error."""
    files_map = {f["path"]: f for f in files}
    fix_applied = None
    fix_type = error_info.get("fix_type")
    
    if fix_type == "add_import":
        # Find files that need the import
        pattern = error_info.get("file_pattern", r"\.jsx?$")
        import_line = error_info.get("fix_content", "")
        
        for path, file in files_map.items():
            if re.search(pattern, path) and import_line not in file.get("content", ""):
                content = file.get("content", "")
                # Add import at the top
                file["content"] = import_line + "\n" + content
                fix_applied = {
                    "file": path,
                    "action": "add_import",
                    "content": import_line,
                    "error_id": error_info["id"]
                }
                break
    
    elif fix_type == "add_dependency":
        module = error_info.get("module", "")
        if module and "package.json" in files_map:
            pkg_file = files_map["package.json"]
            try:
                pkg = json.loads(pkg_file.get("content", "{}"))
                if "dependencies" not in pkg:
                    pkg["dependencies"] = {}
                if module not in pkg["dependencies"]:
                    pkg["dependencies"][module] = "latest"
                    pkg_file["content"] = json.dumps(pkg, indent=2)
                    fix_applied = {
                        "file": "package.json",
                        "action": "add_dependency",
                        "module": module,
                        "error_id": error_info["id"]
                    }
            except json.JSONDecodeError:
                pass
    
    elif fix_type == "add_python_dependency":
        module = error_info.get("module", "")
        if module:
            req_path = "requirements.txt"
            if req_path not in files_map:
                files_map[req_path] = {"path": req_path, "language": "text", "content": ""}
            
            req_file = files_map[req_path]
            content = req_file.get("content", "")
            if module not in content:
                req_file["content"] = content + f"\n{module}\n"
                fix_applied = {
                    "file": req_path,
                    "action": "add_python_dependency",
                    "module": module,
                    "error_id": error_info["id"]
                }
    
    elif fix_type == "add_env_example":
        env_path = ".env.example"
        if env_path not in files_map:
            files_map[env_path] = {"path": env_path, "language": "text", "content": "# Environment variables\n"}
        
        env_file = files_map[env_path]
        var_name = error_info.get("match", "MISSING_VAR")
        content = env_file.get("content", "")
        if var_name not in content:
            env_file["content"] = content + f"{var_name}=your_value_here\n"
            fix_applied = {
                "file": env_path,
                "action": "add_env_example",
                "variable": var_name,
                "error_id": error_info["id"]
            }
    
    return list(files_map.values()), fix_applied


def run_fix_loop(
    files: List[Dict[str, str]],
    initial_error: str,
    max_iterations: int = 3
) -> Tuple[List[Dict[str, str]], FixLoopResult]:
    """Run the fix loop - diagnose and fix errors iteratively."""
    result = FixLoopResult()
    result.max_iterations = max_iterations
    current_files = files.copy()
    current_error = initial_error
    
    for iteration in range(max_iterations):
        result.iterations = iteration + 1
        result.logs.append(f"Fix loop iteration {iteration + 1}")
        
        # Diagnose current errors
        errors = diagnose_error(current_error)
        result.errors_found.extend(errors)
        
        if not errors:
            # No recognized errors - check if it's a success or unknown error
            if "error" not in current_error.lower() and "exception" not in current_error.lower():
                result.success = True
                result.logs.append("No errors detected - success!")
            else:
                result.final_error = current_error
                result.logs.append("Unknown error pattern - cannot auto-fix")
            break
        
        # Try to fix the first fixable error
        fixed_any = False
        for error in errors:
            if error.get("fix_type") != "manual":
                current_files, fix = apply_fix(current_files, error)
                if fix:
                    result.fixes_applied.append(fix)
                    result.logs.append(f"Applied fix: {fix.get('action')} for {error['id']}")
                    fixed_any = True
                    break
        
        if not fixed_any:
            # All errors require manual intervention
            result.final_error = current_error
            result.logs.append("All remaining errors require manual fixes")
            break
        
        # In a real implementation, we would re-run the build here
        # For now, we just return after applying fixes
        result.logs.append("Fixes applied - would re-run build in production")
        result.success = True
        break
    
    return current_files, result


def generate_fix_report(result: FixLoopResult) -> Dict[str, Any]:
    """Generate a human-readable fix report."""
    return {
        "success": result.success,
        "iterations": result.iterations,
        "max_iterations": result.max_iterations,
        "errors_diagnosed": len(result.errors_found),
        "fixes_applied": len(result.fixes_applied),
        "fixes": result.fixes_applied,
        "remaining_errors": [
            {
                "description": e.get("description"),
                "suggestion": e.get("suggestion")
            }
            for e in result.errors_found
            if e.get("fix_type") == "manual"
        ],
        "final_error": result.final_error,
        "logs": result.logs
    }
