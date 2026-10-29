"""Spirit Lens router. Placeholder until the image pipeline lands; see docs/API.md for the contract."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
async def status():
    return {"status": "pipeline not implemented yet"}
