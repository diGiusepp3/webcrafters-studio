from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from emergentintegrations.llm.chat import LlmChat, UserMessage
import json
import io
import zipfile
from fastapi.responses import StreamingResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'default_secret_key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# LLM Config
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

class GenerateRequest(BaseModel):
    prompt: str
    project_type: Optional[str] = "fullstack"  # fullstack, frontend, backend, any

class FileItem(BaseModel):
    path: str
    content: str
    language: str

class ProjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    prompt: str
    project_type: str
    name: str
    description: str
    files: List[Dict[str, str]]
    created_at: str

class ProjectHistoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    project_type: str
    created_at: str
    file_count: int

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Generate token
    token = create_token(user_id)
    
    return TokenResponse(
        token=token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            created_at=user_doc["created_at"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"])
    
    return TokenResponse(
        token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        created_at=current_user["created_at"]
    )

# ============== CODE GENERATION ==============

SYSTEM_PROMPT = """You are CodeForge, an expert software architect and code generator. 
When given a prompt describing an application, you will:

1. Analyze the requirements
2. Design an appropriate architecture
3. Generate complete, working source code files

CRITICAL: You MUST respond with ONLY valid JSON in this exact format:
{
  "name": "project-name",
  "description": "Brief description of the project",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "complete file content here",
      "language": "javascript|python|html|css|json|etc"
    }
  ]
}

Guidelines:
- Generate complete, production-ready code
- Include all necessary files (package.json, requirements.txt, etc.)
- Use modern best practices
- Add helpful comments
- Ensure the code is runnable
- For fullstack apps: use React frontend + FastAPI backend
- For frontend: use React with Tailwind CSS
- Always include a README.md with setup instructions

DO NOT include any text before or after the JSON. Only output the JSON object."""

async def generate_code_with_ai(prompt: str, project_type: str) -> dict:
    """Generate code using OpenAI GPT-5.2"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"codegen-{uuid.uuid4()}",
            system_message=SYSTEM_PROMPT
        )
        chat.with_model("openai", "gpt-5.2")
        
        user_prompt = f"""Generate a {project_type} application based on this description:

{prompt}

Remember to respond with ONLY the JSON object containing the project structure and files."""
        
        message = UserMessage(text=user_prompt)
        response = await chat.send_message(message)
        
        # Parse JSON response
        response_text = response.strip()
        # Handle markdown code blocks if present
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])
        
        result = json.loads(response_text)
        return result
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        logger.error(f"Response was: {response[:500] if response else 'None'}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"Code generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Code generation failed: {str(e)}")

@api_router.post("/generate", response_model=ProjectResponse)
async def generate_project(request: GenerateRequest, current_user: dict = Depends(get_current_user)):
    """Generate a new project from a prompt"""
    logger.info(f"Generating project for user {current_user['id']}: {request.prompt[:100]}...")
    
    # Generate code with AI
    result = await generate_code_with_ai(request.prompt, request.project_type)
    
    # Create project record
    project_id = str(uuid.uuid4())
    project_doc = {
        "id": project_id,
        "user_id": current_user["id"],
        "prompt": request.prompt,
        "project_type": request.project_type,
        "name": result.get("name", "Generated Project"),
        "description": result.get("description", "AI-generated project"),
        "files": result.get("files", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.projects.insert_one(project_doc)
    
    return ProjectResponse(
        id=project_id,
        user_id=current_user["id"],
        prompt=request.prompt,
        project_type=request.project_type,
        name=project_doc["name"],
        description=project_doc["description"],
        files=project_doc["files"],
        created_at=project_doc["created_at"]
    )

@api_router.get("/projects", response_model=List[ProjectHistoryItem])
async def get_projects(current_user: dict = Depends(get_current_user)):
    """Get user's project history"""
    projects = await db.projects.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return [
        ProjectHistoryItem(
            id=p["id"],
            name=p["name"],
            description=p["description"],
            project_type=p["project_type"],
            created_at=p["created_at"],
            file_count=len(p.get("files", []))
        )
        for p in projects
    ]

@api_router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific project"""
    project = await db.projects.find_one(
        {"id": project_id, "user_id": current_user["id"]},
        {"_id": 0}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse(**project)

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a project"""
    result = await db.projects.delete_one(
        {"id": project_id, "user_id": current_user["id"]}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"message": "Project deleted"}

@api_router.get("/projects/{project_id}/download")
async def download_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """Download project as ZIP file"""
    project = await db.projects.find_one(
        {"id": project_id, "user_id": current_user["id"]},
        {"_id": 0}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for file in project.get("files", []):
            zip_file.writestr(file["path"], file["content"])
    
    zip_buffer.seek(0)
    
    filename = f"{project['name'].replace(' ', '_')}.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/")
async def root():
    return {"message": "CodeForge API - AI Code Generation Platform"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
