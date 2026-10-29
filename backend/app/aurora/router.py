from datetime import datetime

from fastapi import APIRouter, Query

from ..core.envelope import Envelope
from . import space_weather

router = APIRouter()


@router.get("", response_model=Envelope[space_weather.Aurora])
@router.get("/", response_model=Envelope[space_weather.Aurora], include_in_schema=False)
async def aurora(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), at: datetime | None = None):
    """Aurora chance tonight: NOAA Kp now and forecast versus the Kp this geomagnetic latitude needs."""
    data, prov = await space_weather.aurora(lat, lon, at)
    return Envelope(data=data, provenance=prov)
