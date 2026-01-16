# /backend/services/modify_service.py
# AI-powered code modification service

import asyncio
import json
from typing import Dict, Any, List, Optional

from backend.core.config import get_openai_client

openai_client = get_openai_client()

MODIFY_SYSTEM_PROMPT = """
You are an expert code modification assistant. Your job is to apply changes to an existing codebase based on user instructions.

RULES:
1. Output ONLY valid JSON - no explanations, no markdown
2. Only modify files that need to change
3. Include the COMPLETE new content for each modified file
4. Preserve existing functionality unless explicitly asked to remove it
5. Follow the existing code style and patterns
6. Add helpful comments where appropriate

OUTPUT FORMAT:
{
  "modifications": [
    {
      "action": "modify" | "create" | "delete",
      "path": "relative/path/to/file",
      "language": "javascript" | "python" | "html" | etc,
      "content": "FULL NEW FILE CONTENT (for modify/create)",
      "reason": "Brief explanation of the change"
    }
  ],
  "summary": "Brief summary of all changes made"
}

If you cannot fulfill the request or need more information, return:
{
  "error": "Explanation of why the request cannot be fulfilled",
  "suggestions": ["Alternative approaches or clarifying questions"]
}
"""


async def apply_modifications(
    instruction: str,
    current_files: List[Dict[str, str]],
    project_type: str,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Apply AI-powered modifications to existing project files.
    
    Args:
        instruction: User's modification request
        current_files: List of current project files [{path, content, language}]
        project_type: Type of project (frontend, backend, fullstack, etc.)
        context: Additional context (current_file, etc.)
    
    Returns:
        Dict with modifications to apply
    """
    
    # Build context about current files
    files_context = "\n\nCURRENT PROJECT FILES:\n"
    for f in current_files[:20]:  # Limit to 20 files to avoid token limits
        files_context += f"\n--- {f['path']} ({f.get('language', 'text')}) ---\n"
        # Include content preview (first 100 lines)
        content = f.get('content', '')
        lines = content.split('\n')[:100]
        files_context += '\n'.join(lines)
        if len(content.split('\n')) > 100:
            files_context += '\n... (truncated)\n'
    
    # Build user message
    user_msg = f"""
PROJECT TYPE: {project_type}

USER REQUEST:
{instruction}

{files_context}

{f"CONTEXT: User is currently viewing file: {context.get('current_file')}" if context and context.get('current_file') else ''}

Apply the requested modifications and output the updated files.
"""

    def _call():
        return openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": MODIFY_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=8000,
        )

    response = await asyncio.to_thread(_call)
    content = response.choices[0].message.content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {
            "error": "Failed to parse AI response",
            "raw_response": content[:500]
        }


async def generate_modification_chat(
    instruction: str,
    project_name: str
) -> str:
    """
    Generate a friendly chat message about the modification.
    """
    return f"Applying modifications to {project_name}: {instruction[:100]}{'...' if len(instruction) > 100 else ''}"
