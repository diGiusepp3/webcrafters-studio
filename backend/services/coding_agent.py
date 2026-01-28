# /backend/services/coding_agent.py

"""
Live Coding Agent - The core AI agent that generates and modifies code.
(OpenAI v4 version - direct API calls)
"""
import json
import uuid
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional, AsyncGenerator

from backend.core.config import get_openai_client
from backend.services.openai_model_service import CODE_MODEL

SYSTEM_PROMPT = """You are an expert full-stack developer AI assistant. You help users build web applications by:
1. Understanding their requirements
2. Generating clean, production-ready code
3. Making iterative improvements based on feedback
4. Explaining what you're doing and why

When generating code, ALWAYS respond with a JSON object in this format:
{
  "thinking": "Your thought process about what to build",
  "message": "A friendly message to the user explaining what you're doing",
  "files": [
    {
      "path": "src/App.js",
      "content": "// file content here",
      "action": "create"
    }
  ],
  "preview_ready": true,
  "next_steps": ["suggestion 1", "suggestion 2"]
}

Rules:
- Generate complete, working code - no placeholders or TODOs
- Use modern React with hooks and Tailwind CSS for frontend
- Use FastAPI for backend if needed
- Always include all necessary imports
- Make the code production-ready
- Explain your changes in the message field
"""


class CodingAgentSession:
    def __init__(self, session_id: str, project_id: Optional[str] = None):
        self.session_id = session_id
        self.project_id = project_id or str(uuid.uuid4())
        self.files: Dict[str, str] = {}
        self.history: List[Dict[str, Any]] = []
        self.status = "idle"
        self.preview_url: Optional[str] = None
        self.created_at = datetime.utcnow()

        # Read OPENAI_API_KEY from backend/.env via config.get_openai_client().
        self.client = get_openai_client()

    def add_message(self, role: str, content: str):
        self.history.append({"role": role, "content": content})

    def get_file_context(self) -> str:
        if not self.files:
            return "No files generated yet."
        out = "Current project files:\n"
        for path, content in self.files.items():
            out += f"\n--- {path} ---\n{content[:2000]}\n"
        return out

    def _openai_call(self, messages: list) -> str:
        response = self.client.chat.completions.create(
            model=CODE_MODEL,
            messages=messages,
            temperature=0.2
        )
        return response.choices[0].message.content.strip()

    async def process_message(self, user_message: str) -> AsyncGenerator[Dict[str, Any], None]:
        self.status = "thinking"
        yield {"type": "status", "status": "thinking"}

        self.add_message("user", user_message)

        prompt = f"{self.get_file_context()}\n\nUser request:\n{user_message}"

        try:
            self.status = "generating"
            yield {"type": "status", "status": "generating"}

            content = await asyncio.to_thread(
                lambda: self._openai_call([
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ])
            )

            if content.startswith("```"):
                content = content.strip("`").replace("json", "", 1).strip()

            result = json.loads(content)

            files_changed = []
            for f in result.get("files", []):
                path = f["path"]
                action = f.get("action", "create")

                if action == "delete":
                    self.files.pop(path, None)
                else:
                    self.files[path] = f["content"]

                files_changed.append(path)

            yield {"type": "files_updated", "files": files_changed}

            if result.get("preview_ready") or files_changed:
                self.preview_url = f"/preview/{self.project_id}"
                yield {"type": "preview_ready", "preview_url": self.preview_url}

            self.status = "done"
            yield {
                "type": "agent_response",
                "message": result.get("message"),
                "thinking": result.get("thinking"),
                "next_steps": result.get("next_steps", []),
                "files": list(self.files.keys())
            }

        except Exception as e:
            self.status = "error"
            yield {"type": "error", "error": str(e)}

    def get_state(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "project_id": self.project_id,
            "status": self.status,
            "files": list(self.files.keys()),
            "preview_url": self.preview_url
        }


ACTIVE_SESSIONS: Dict[str, CodingAgentSession] = {}


def get_or_create_session(session_id: str, project_id: Optional[str] = None) -> CodingAgentSession:
    if session_id not in ACTIVE_SESSIONS:
        ACTIVE_SESSIONS[session_id] = CodingAgentSession(session_id, project_id)
    return ACTIVE_SESSIONS[session_id]


def get_session(session_id: str) -> Optional[CodingAgentSession]:
    return ACTIVE_SESSIONS.get(session_id)
