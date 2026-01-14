# /backend/services/security_checker.py
"""
Security checker service - detects common security flaws in generated code.
"""
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path


# Security rules - can be extended and stored in DB later
SECURITY_RULES = [
    {
        "id": "hardcoded_secret",
        "name": "Hardcoded Secret",
        "severity": "high",
        "description": "Detected hardcoded secrets, API keys, or passwords",
        "patterns": [
            r'["\']?(?:api[_-]?key|apikey|secret[_-]?key|password|passwd|pwd|token|auth[_-]?token)["\']?\s*[:=]\s*["\'][a-zA-Z0-9_\-]{8,}["\']',
            r'(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{20,}',  # Stripe keys
            r'AIza[0-9A-Za-z\-_]{35}',  # Google API keys
            r'ghp_[a-zA-Z0-9]{36}',  # GitHub tokens
            r'xox[baprs]-[0-9]{10,13}-[a-zA-Z0-9-]+',  # Slack tokens
        ],
        "exclude_patterns": [
            r'process\.env\.',
            r'os\.environ',
            r'getenv\(',
            r'\$\{.*\}',
            r'<.*>',  # Placeholders like <YOUR_API_KEY>
            r'your[_-]?api[_-]?key',
            r'xxx+',
            r'example',
        ],
        "auto_fixable": True,
        "fix_suggestion": "Move secret to environment variable"
    },
    {
        "id": "sql_injection",
        "name": "SQL Injection Risk",
        "severity": "high",
        "description": "Potential SQL injection vulnerability",
        "patterns": [
            r'execute\s*\(\s*["\']\s*SELECT.*\+',
            r'execute\s*\(\s*f["\']SELECT',
            r'query\s*\(\s*["\']\s*SELECT.*\$\{',
            r'\.query\s*\(\s*`SELECT.*\$\{',
        ],
        "auto_fixable": False,
        "fix_suggestion": "Use parameterized queries instead of string concatenation"
    },
    {
        "id": "xss_vulnerability",
        "name": "XSS Vulnerability",
        "severity": "high",
        "description": "Potential cross-site scripting vulnerability",
        "patterns": [
            r'dangerouslySetInnerHTML',
            r'\.innerHTML\s*=',
            r'document\.write\s*\(',
            r'eval\s*\(',
        ],
        "auto_fixable": False,
        "fix_suggestion": "Sanitize user input before rendering"
    },
    {
        "id": "insecure_cors",
        "name": "Insecure CORS Configuration",
        "severity": "medium",
        "description": "CORS allows all origins which may be insecure",
        "patterns": [
            r'cors\s*\(\s*\)',
            r'Access-Control-Allow-Origin["\']?\s*[:=]\s*["\']\*["\']',
            r'allow_origins\s*=\s*\[\s*["\']\*["\']\s*\]',
        ],
        "auto_fixable": False,
        "fix_suggestion": "Restrict CORS to specific trusted origins"
    },
    {
        "id": "debug_mode",
        "name": "Debug Mode Enabled",
        "severity": "medium",
        "description": "Debug mode should be disabled in production",
        "patterns": [
            r'DEBUG\s*=\s*True',
            r'debug\s*[:=]\s*true',
            r'app\.run\s*\([^)]*debug\s*=\s*True',
        ],
        "exclude_patterns": [
            r'DEBUG\s*=\s*os\.environ',
            r'DEBUG\s*=\s*env\(',
        ],
        "auto_fixable": True,
        "fix_suggestion": "Use environment variable for debug flag"
    },
    {
        "id": "weak_jwt_secret",
        "name": "Weak JWT Secret",
        "severity": "high",
        "description": "JWT secret appears to be weak or hardcoded",
        "patterns": [
            r'jwt[_-]?secret\s*[:=]\s*["\'][a-zA-Z0-9_\-]{1,20}["\']',
            r'SECRET_KEY\s*=\s*["\'][a-zA-Z0-9_\-]{1,30}["\']',
        ],
        "exclude_patterns": [
            r'process\.env',
            r'os\.environ',
            r'getenv',
        ],
        "auto_fixable": True,
        "fix_suggestion": "Use a strong, randomly generated secret from environment variables"
    },
    {
        "id": "no_input_validation",
        "name": "Missing Input Validation",
        "severity": "medium",
        "description": "User input should be validated before use",
        "patterns": [
            r'req\.body\.[a-zA-Z]+(?!\s*&&)',
            r'request\.json\.get\(["\'][a-zA-Z]+["\']\)(?!\s*or)',
        ],
        "auto_fixable": False,
        "fix_suggestion": "Add input validation using a schema library (Zod, Pydantic, etc.)"
    },
    {
        "id": "http_not_https",
        "name": "Insecure HTTP URL",
        "severity": "low",
        "description": "Using HTTP instead of HTTPS for external requests",
        "patterns": [
            r'http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)',
        ],
        "exclude_patterns": [
            r'http://localhost',
            r'http://127\.0\.0\.1',
            r'http://0\.0\.0\.0',
        ],
        "auto_fixable": True,
        "fix_suggestion": "Use HTTPS for external requests"
    },
    {
        "id": "console_log",
        "name": "Console Log in Production",
        "severity": "low",
        "description": "Console.log statements should be removed in production",
        "patterns": [
            r'console\.log\s*\(',
        ],
        "auto_fixable": True,
        "fix_suggestion": "Remove or replace with proper logging"
    },
]


def check_file_security(
    file_path: str,
    content: str,
    rules: Optional[List[Dict]] = None
) -> List[Dict[str, Any]]:
    """Check a single file for security issues."""
    findings = []
    rules_to_check = rules or SECURITY_RULES
    
    lines = content.split('\n')
    
    for rule in rules_to_check:
        for pattern in rule.get("patterns", []):
            try:
                regex = re.compile(pattern, re.IGNORECASE)
                for line_num, line in enumerate(lines, 1):
                    if regex.search(line):
                        # Check exclude patterns
                        excluded = False
                        for exclude in rule.get("exclude_patterns", []):
                            if re.search(exclude, line, re.IGNORECASE):
                                excluded = True
                                break
                        
                        if not excluded:
                            findings.append({
                                "rule_id": rule["id"],
                                "name": rule["name"],
                                "severity": rule["severity"],
                                "description": rule["description"],
                                "file": file_path,
                                "line": line_num,
                                "line_content": line.strip()[:100],
                                "auto_fixable": rule.get("auto_fixable", False),
                                "fix_suggestion": rule.get("fix_suggestion", ""),
                                "fixed": False
                            })
            except re.error:
                continue
    
    return findings


def check_project_security(files: List[Dict[str, str]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Check all project files for security issues."""
    all_findings = []
    stats = {
        "total_files": len(files),
        "files_checked": 0,
        "high_severity": 0,
        "medium_severity": 0,
        "low_severity": 0,
        "auto_fixable": 0
    }
    
    # File extensions to check
    check_extensions = {
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go',
        '.rb', '.php', '.cs', '.swift', '.kt', '.rs',
        '.html', '.vue', '.svelte', '.json', '.yaml', '.yml',
        '.env', '.config', '.cfg'
    }
    
    for file in files:
        path = file.get("path", "")
        content = file.get("content", "")
        
        if not path or not content:
            continue
        
        # Check if file should be scanned
        ext = Path(path).suffix.lower()
        if ext not in check_extensions and not path.endswith('.env'):
            continue
        
        stats["files_checked"] += 1
        findings = check_file_security(path, content)
        all_findings.extend(findings)
    
    # Calculate stats
    for finding in all_findings:
        severity = finding.get("severity", "low")
        if severity == "high":
            stats["high_severity"] += 1
        elif severity == "medium":
            stats["medium_severity"] += 1
        else:
            stats["low_severity"] += 1
        
        if finding.get("auto_fixable"):
            stats["auto_fixable"] += 1
    
    return all_findings, stats


def apply_security_fixes(files: List[Dict[str, str]], findings: List[Dict[str, Any]]) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    """Apply automatic fixes where possible."""
    applied_fixes = []
    files_map = {f["path"]: f for f in files}
    
    for finding in findings:
        if not finding.get("auto_fixable") or finding.get("fixed"):
            continue
        
        file_path = finding.get("file")
        if file_path not in files_map:
            continue
        
        file = files_map[file_path]
        content = file.get("content", "")
        lines = content.split('\n')
        line_num = finding.get("line", 0) - 1
        
        if line_num < 0 or line_num >= len(lines):
            continue
        
        original_line = lines[line_num]
        fixed_line = None
        
        rule_id = finding.get("rule_id")
        
        if rule_id == "hardcoded_secret":
            # Replace hardcoded secret with environment variable reference
            # This is a simplified fix - in practice would need more context
            fixed_line = re.sub(
                r'(["\']?)(?:api[_-]?key|secret[_-]?key|password|token)(["\']?)\s*[:=]\s*["\'][^"\']+["\']',
                lambda m: f'{m.group(1)}API_KEY{m.group(2)}: process.env.API_KEY',
                original_line,
                flags=re.IGNORECASE
            )
        elif rule_id == "debug_mode":
            fixed_line = re.sub(
                r'DEBUG\s*=\s*True',
                'DEBUG = os.environ.get("DEBUG", "false").lower() == "true"',
                original_line
            )
            fixed_line = re.sub(
                r'debug\s*[:=]\s*true',
                'debug: process.env.NODE_ENV !== "production"',
                fixed_line,
                flags=re.IGNORECASE
            )
        elif rule_id == "http_not_https":
            fixed_line = re.sub(
                r'http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)',
                'https://',
                original_line
            )
        elif rule_id == "console_log":
            # Comment out console.log instead of removing
            fixed_line = '// ' + original_line
        
        if fixed_line and fixed_line != original_line:
            lines[line_num] = fixed_line
            file["content"] = '\n'.join(lines)
            finding["fixed"] = True
            applied_fixes.append({
                "file": file_path,
                "line": finding.get("line"),
                "rule_id": rule_id,
                "original": original_line.strip(),
                "fixed": fixed_line.strip(),
                "reason": finding.get("fix_suggestion", "Security fix applied")
            })
    
    return list(files_map.values()), applied_fixes
