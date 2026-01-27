# /backend/services/agent_service.py
"""
Agent narration service - generates human-readable messages for what the agent is doing.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional


# Step descriptions for the agent timeline
STEP_DESCRIPTIONS = {
    "queued": {
        "title": "Queued",
        "description": "Your request is in the queue",
        "icon": "clock"
    },
    "preflight": {
        "title": "Analyzing Request",
        "description": "Understanding your requirements and planning the project structure",
        "icon": "search"
    },
    "reasoning": {
        "title": "Reasoning Agent",
        "description": "Drafting the PRD, problem statement, and design guardrails",
        "icon": "brain"
    },
    "plan_review": {
        "title": "Plan Review",
        "description": "Awaiting confirmation to proceed with coding",
        "icon": "clipboard-list"
    },
    "clarifying": {
        "title": "Clarifying Intent",
        "description": "Gathering additional details to ensure accurate generation",
        "icon": "message-circle"
    },
    "generating": {
        "title": "Generating Code",
        "description": "AI is writing the source code for your project",
        "icon": "code"
    },
    "patching": {
        "title": "Patching Files",
        "description": "Applying necessary patches and configurations",
        "icon": "wrench"
    },
    "validating": {
        "title": "Validating Output",
        "description": "Checking code quality and structure",
        "icon": "check-circle"
    },
    "security_check": {
        "title": "Security Check",
        "description": "Scanning for security vulnerabilities and best practices",
        "icon": "shield"
    },
    "building": {
        "title": "Building Preview",
        "description": "Compiling and building the project for preview",
        "icon": "package"
    },
    "deploying": {
        "title": "Deploying Preview",
        "description": "Setting up the preview environment",
        "icon": "upload"
    },
    "screenshotting": {
        "title": "Capturing Screenshots",
        "description": "Taking screenshots of the generated application",
        "icon": "camera"
    },
    "testing": {
        "title": "Testing",
        "description": "Running automated tests and checks",
        "icon": "play"
    },
    "fixing": {
        "title": "Auto-Fixing Issues",
        "description": "Automatically resolving detected issues",
        "icon": "tool"
    },
    "saving": {
        "title": "Saving Project",
        "description": "Persisting your project to the database",
        "icon": "save"
    },
    "final_review": {
        "title": "Final Review",
        "description": "Final reasoning review before release",
        "icon": "shield-check"
    },
    "done": {
        "title": "Complete",
        "description": "Your project is ready!",
        "icon": "check"
    },
    "error": {
        "title": "Error",
        "description": "An error occurred during generation",
        "icon": "alert-circle"
    }
}

# All possible steps in order
ALL_STEPS = [
    "queued",
    "preflight",
    "reasoning",
    "plan_review",
    "generating",
    "patching",
    "validating",
    "security_check",
    "building",
    "deploying",
    "screenshotting",
    "testing",
    "fixing",
    "saving",
    "final_review",
    "done"
]


def get_step_info(step: str) -> Dict[str, str]:
    """Get info about a step."""
    return STEP_DESCRIPTIONS.get(step, {
        "title": step.replace("_", " ").title(),
        "description": f"Processing: {step}",
        "icon": "loader"
    })


def create_chat_message(
    message: str,
    role: str = "agent",
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Create a chat message entry."""
    return {
        "role": role,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
        "metadata": metadata or {}
    }


def generate_step_chat_messages(step: str, status: str, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Generate agent chat messages for a step transition."""
    messages = []
    ctx = context or {}
    
    if status == "running":
        if step == "preflight":
            messages.append(create_chat_message(
                "🔍 Analyzing your request to understand the project requirements..."
            ))
        elif step == "generating":
            project_type = ctx.get("project_type", "project")
            messages.append(create_chat_message(
                f"✨ Starting code generation for your {project_type} project. This may take a moment..."
            ))
        elif step == "patching":
            messages.append(create_chat_message(
                "🔧 Applying necessary patches and configurations to ensure compatibility..."
            ))
        elif step == "validating":
            messages.append(create_chat_message(
                "✅ Validating the generated code for quality and correctness..."
            ))
        elif step == "security_check":
            messages.append(create_chat_message(
                "🛡️ Running security analysis to detect potential vulnerabilities..."
            ))
        elif step == "reasoning":
            messages.append(create_chat_message(
                "🧠 Reasoning agent is drafting the PRD and design checklist..."
            ))
        elif step == "plan_review":
            messages.append(create_chat_message(
                "📋 Plan ready. Please confirm to proceed with coding."
            ))
        elif step == "building":
            messages.append(create_chat_message(
                "📦 Building the project to create a preview..."
            ))
        elif step == "deploying":
            messages.append(create_chat_message(
                "🚀 Deploying to preview environment..."
            ))
        elif step == "screenshotting":
            messages.append(create_chat_message(
                "📸 Capturing screenshots of your application..."
            ))
        elif step == "testing":
            messages.append(create_chat_message(
                "🧪 Running automated tests to verify functionality..."
            ))
        elif step == "fixing":
            fix_count = ctx.get("fix_count", 0)
            messages.append(create_chat_message(
                f"🔨 Auto-fixing {fix_count} detected issue(s)..."
            ))
        elif step == "saving":
            messages.append(create_chat_message(
                "💾 Saving your project..."
            ))
    
    elif status == "success":
        if step == "validating":
            error_count = ctx.get("validation_errors", 0)
            if error_count > 0:
                messages.append(create_chat_message(
                    f"⚠️ Validation complete with {error_count} warning(s). Continuing..."
                ))
            else:
                messages.append(create_chat_message(
                    "✅ Validation passed! Code looks good."
                ))
        elif step == "security_check":
            findings = ctx.get("security_findings", [])
            if findings:
                high = len([f for f in findings if f.get("severity") == "high"])
                medium = len([f for f in findings if f.get("severity") == "medium"])
                if high > 0:
                    messages.append(create_chat_message(
                        f"🚨 Found {high} high-severity security issue(s). Attempting auto-fix..."
                    ))
                elif medium > 0:
                    messages.append(create_chat_message(
                        f"⚠️ Found {medium} medium-severity issue(s). Review recommended."
                    ))
            else:
                messages.append(create_chat_message(
                    "🛡️ Security check passed! No critical issues found."
                ))
        elif step == "building":
            messages.append(create_chat_message(
                "✅ Build successful!"
            ))
        elif step == "deploying":
            preview_url = ctx.get("preview_url", "")
            if preview_url:
                messages.append(create_chat_message(
                    f"🎉 Preview deployed! Access it at: {preview_url}"
                ))
        elif step == "done":
            project_name = ctx.get("project_name", "Your project")
            messages.append(create_chat_message(
                f"🎊 {project_name} is ready! You can download it or view the files."
            ))
    
    elif status == "error":
        error_msg = ctx.get("error", "Unknown error")
        messages.append(create_chat_message(
            f"❌ Error during {step}: {error_msg}",
            metadata={"error": True}
        ))
    
    return messages


def build_timeline_from_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build a structured timeline from job events."""
    timeline = []
    step_data = {}
    
    for event in events:
        step = event.get("step")
        event_type = event.get("event_type")
        
        if not step:
            continue
        
        if step not in step_data:
            step_data[step] = {
                "step": step,
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "duration_ms": None,
                **get_step_info(step)
            }
        
        if event_type == "step_start":
            step_data[step]["status"] = "running"
            step_data[step]["started_at"] = event.get("timestamp")
        elif event_type == "step_complete":
            step_data[step]["status"] = "success"
            step_data[step]["completed_at"] = event.get("timestamp")
            step_data[step]["duration_ms"] = event.get("duration_ms")
        elif event_type == "step_error":
            step_data[step]["status"] = "error"
            step_data[step]["error"] = event.get("message")
            step_data[step]["completed_at"] = event.get("timestamp")
    
    # Build ordered timeline
    for step_name in ALL_STEPS:
        if step_name in step_data:
            timeline.append(step_data[step_name])
    
    return timeline
