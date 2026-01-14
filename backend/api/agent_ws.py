# /backend/api/agent_ws.py
"""
WebSocket endpoint for live coding agent communication.
"""
import json
import uuid
from typing import Dict, Any
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState

from backend.services.coding_agent import get_or_create_session, get_session, ACTIVE_SESSIONS

router = APIRouter(tags=["agent"])

# Connected WebSocket clients
CONNECTED_CLIENTS: Dict[str, WebSocket] = {}


async def send_json(ws: WebSocket, data: Dict[str, Any]):
    """Send JSON data to WebSocket if connected."""
    if ws.client_state == WebSocketState.CONNECTED:
        await ws.send_json(data)


@router.websocket("/ws/agent/{session_id}")
async def agent_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time agent communication."""
    await websocket.accept()
    CONNECTED_CLIENTS[session_id] = websocket
    
    # Get or create session
    session = get_or_create_session(session_id)
    
    # Send initial state
    await send_json(websocket, {
        "type": "connected",
        "session_id": session_id,
        "state": session.get_state(),
        "message": "👋 Connected to coding agent!"
    })
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")
            
            if msg_type == "message":
                # Process user message
                user_message = data.get("content", "")
                
                if not user_message.strip():
                    await send_json(websocket, {
                        "type": "error",
                        "error": "Empty message"
                    })
                    continue
                
                # Stream agent responses
                async for update in session.process_message(user_message):
                    await send_json(websocket, update)
            
            elif msg_type == "get_state":
                # Return current state
                await send_json(websocket, {
                    "type": "state",
                    "state": session.get_state()
                })
            
            elif msg_type == "get_file":
                # Return file content
                path = data.get("path", "")
                content = session.files.get(path, "")
                await send_json(websocket, {
                    "type": "file_content",
                    "path": path,
                    "content": content,
                    "exists": path in session.files
                })
            
            elif msg_type == "get_files":
                # Return all files
                await send_json(websocket, {
                    "type": "all_files",
                    "files": [
                        {"path": path, "lines": len(content.split("\n")), "size": len(content)}
                        for path, content in session.files.items()
                    ]
                })
            
            elif msg_type == "get_history":
                # Return chat history
                await send_json(websocket, {
                    "type": "history",
                    "messages": session.history
                })
            
            elif msg_type == "ping":
                await send_json(websocket, {"type": "pong"})
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await send_json(websocket, {
                "type": "error",
                "error": str(e)
            })
        except:
            pass
    finally:
        CONNECTED_CLIENTS.pop(session_id, None)


# REST endpoints for non-WebSocket access
@router.get("/api/agent/sessions")
async def list_sessions():
    """List all active sessions."""
    return {
        "sessions": [
            session.get_state() for session in ACTIVE_SESSIONS.values()
        ]
    }


@router.get("/api/agent/session/{session_id}")
async def get_session_state(session_id: str):
    """Get session state."""
    session = get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    return session.get_state()


@router.get("/api/agent/session/{session_id}/files")
async def get_session_files(session_id: str):
    """Get all files in a session."""
    session = get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    return {
        "files": [
            {
                "path": path,
                "content": content,
                "lines": len(content.split("\n")),
                "size": len(content)
            }
            for path, content in session.files.items()
        ]
    }


@router.get("/api/agent/session/{session_id}/file/{path:path}")
async def get_file_content(session_id: str, path: str):
    """Get specific file content."""
    session = get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    
    content = session.files.get(path)
    if content is None:
        return {"error": "File not found"}
    
    return {
        "path": path,
        "content": content,
        "lines": len(content.split("\n")),
        "size": len(content)
    }
