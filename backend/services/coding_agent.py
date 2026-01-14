# /backend/services/coding_agent.py
"""
Live Coding Agent - The core AI agent that generates and modifies code.
"""
import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional, AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

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
      "action": "create" | "update" | "delete"
    }
  ],
  "preview_ready": true | false,
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
    """A coding agent session that maintains state and conversation history."""
    
    def __init__(self, session_id: str, project_id: Optional[str] = None):
        self.session_id = session_id
        self.project_id = project_id or str(uuid.uuid4())
        self.files: Dict[str, str] = {}  # path -> content
        self.history: List[Dict[str, Any]] = []
        self.status = "idle"  # idle, thinking, generating, building, testing, done, error
        self.current_step = ""
        self.preview_url: Optional[str] = None
        self.created_at = datetime.utcnow()
        
        # Initialize LLM chat
        self.chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=session_id,
            system_message=SYSTEM_PROMPT
        ).with_model("openai", "gpt-4.1")
    
    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """Add a message to history."""
        self.history.append({
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "metadata": metadata or {},
            "timestamp": datetime.utcnow().isoformat()
        })
    
    def get_file_context(self) -> str:
        """Get current files as context for the AI."""
        if not self.files:
            return "No files generated yet."
        
        context = "Current project files:\n"
        for path, content in self.files.items():
            # Truncate large files
            truncated = content[:2000] + "..." if len(content) > 2000 else content
            context += f"\n--- {path} ---\n{truncated}\n"
        return context
    
    async def process_message(self, user_message: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Process a user message and yield status updates."""
        self.status = "thinking"
        self.current_step = "Understanding your request..."
        
        # Add user message to history
        self.add_message("user", user_message)
        
        yield {
            "type": "status",
            "status": "thinking",
            "step": "Understanding your request...",
            "message": "🤔 Analyzing your request..."
        }
        
        # Build context with current files
        context = self.get_file_context()
        full_prompt = f"{context}\n\nUser request: {user_message}"
        
        try:
            self.status = "generating"
            self.current_step = "Generating code..."
            
            yield {
                "type": "status",
                "status": "generating",
                "step": "Generating code...",
                "message": "✨ Writing code for your request..."
            }
            
            # Call LLM
            llm_message = UserMessage(text=full_prompt)
            response = await self.chat.send_message(llm_message)
            
            # Parse response
            try:
                # Try to extract JSON from response
                response_text = response.strip()
                if response_text.startswith("```json"):
                    response_text = response_text[7:]
                if response_text.startswith("```"):
                    response_text = response_text[3:]
                if response_text.endswith("```"):
                    response_text = response_text[:-3]
                
                result = json.loads(response_text.strip())
            except json.JSONDecodeError:
                # If not JSON, treat as plain message
                result = {
                    "thinking": "Processing response",
                    "message": response,
                    "files": [],
                    "preview_ready": False,
                    "next_steps": []
                }
            
            # Add assistant message to history
            self.add_message("assistant", result.get("message", response), {"files": result.get("files", [])})
            
            # Process files
            files_changed = []
            for file_info in result.get("files", []):
                path = file_info.get("path", "")
                content = file_info.get("content", "")
                action = file_info.get("action", "create")
                
                if action == "delete" and path in self.files:
                    del self.files[path]
                    files_changed.append({"path": path, "action": "deleted"})
                elif content:
                    self.files[path] = content
                    files_changed.append({"path": path, "action": action, "lines": len(content.split("\n"))})
            
            yield {
                "type": "files_updated",
                "files": files_changed,
                "total_files": len(self.files),
                "message": f"💾 Updated {len(files_changed)} file(s)"
            }
            
            # Building step
            if result.get("preview_ready", False) or files_changed:
                self.status = "building"
                self.current_step = "Building preview..."
                
                yield {
                    "type": "status",
                    "status": "building",
                    "step": "Building preview...",
                    "message": "📦 Building your application..."
                }
                
                # Simulate build (in production this would actually build)
                await asyncio.sleep(1)
                
                self.preview_url = f"/preview/{self.project_id}"
                
                yield {
                    "type": "preview_ready",
                    "preview_url": self.preview_url,
                    "message": "🎉 Preview is ready!"
                }
            
            # Done
            self.status = "done"
            self.current_step = "Complete"
            
            yield {
                "type": "agent_response",
                "message": result.get("message", "Done!"),
                "thinking": result.get("thinking", ""),
                "next_steps": result.get("next_steps", []),
                "files": list(self.files.keys())
            }
            
        except Exception as e:
            self.status = "error"
            self.current_step = f"Error: {str(e)}"
            
            yield {
                "type": "error",
                "error": str(e),
                "message": f"❌ Error: {str(e)}"
            }
    
    def get_state(self) -> Dict[str, Any]:
        """Get current session state."""
        return {
            "session_id": self.session_id,
            "project_id": self.project_id,
            "status": self.status,
            "current_step": self.current_step,
            "files": list(self.files.keys()),
            "file_count": len(self.files),
            "preview_url": self.preview_url,
            "history_count": len(self.history),
            "created_at": self.created_at.isoformat()
        }


# Global session store
ACTIVE_SESSIONS: Dict[str, CodingAgentSession] = {}


def get_or_create_session(session_id: str, project_id: Optional[str] = None) -> CodingAgentSession:
    """Get existing session or create new one."""
    if session_id not in ACTIVE_SESSIONS:
        ACTIVE_SESSIONS[session_id] = CodingAgentSession(session_id, project_id)
    return ACTIVE_SESSIONS[session_id]


def get_session(session_id: str) -> Optional[CodingAgentSession]:
    """Get session by ID."""
    return ACTIVE_SESSIONS.get(session_id)
