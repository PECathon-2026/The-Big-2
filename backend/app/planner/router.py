"""Observing planner endpoints."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.envelope import Envelope
from . import plan as planner
from . import targets

router = APIRouter()


class PlanBody(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    target: str | None = Field(None, description="Built-in id (m31, jupiter, moon…), a SIMBAD name ('NGC 7000'), or empty when ra/dec are given")
    ra: float | None = Field(None, ge=0, le=360)
    dec: float | None = Field(None, ge=-90, le=90)
    kind: str | None = Field(None, description="moon | planet | star | deepsky (inferred when omitted)")
    equipment: str = Field("eyes", description="eyes | binoculars | telescope | camera")
    date: datetime | None = Field(None, description="Any time; the night containing or following it is planned")
    earliest_local: str | None = Field(None, pattern=r"^\d{2}:\d{2}$", description="Earliest you can start, local HH:MM")
    latest_local: str | None = Field(None, pattern=r"^\d{2}:\d{2}$", description="Latest you must stop, local HH:MM")
    travel_limit_km: float = Field(60, ge=0, le=150)
    candidate_limit: int = Field(6, ge=1, le=12)


@router.get("/targets")
async def list_targets():
    return {"targets": targets.BUILTIN, "equipment": planner.EQUIPMENT}


@router.post("/plan", response_model=Envelope[planner.Plan])
async def make_plan(body: PlanBody):
    """Best place and time for a target tonight, with the binding constraint per 15 minutes and what-if answers."""
    try:
        target, p0 = await targets.resolve(body.target, body.ra, body.dec, body.kind)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    plan, prov = await planner.make_plan(target, body.lat, body.lon, body.equipment, body.date, body.earliest_local, body.latest_local, body.travel_limit_km, body.candidate_limit)
    return Envelope(data=plan, provenance=[p0, *prov])
