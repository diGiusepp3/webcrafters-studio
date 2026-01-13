from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["root"])

@router.get("/")
async def api_root():
    return {"message": "Code Generation API"}