"""Personal horizon endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..core import astro
from ..core.envelope import Envelope, Provenance
from ..core.http import ProviderError
from ..planner import targets
from . import terrain

router = APIRouter()


class MaskBody(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    points: list[terrain.MaskPoint] = Field(default_factory=list, description="Traced obstructions: azimuth (deg from north) and altitude (deg)")
    use_terrain: bool = True


class PathBody(MaskBody):
    target: str | None = None
    ra: float | None = Field(None, ge=0, le=360)
    dec: float | None = Field(None, ge=-90, le=90)
    kind: str | None = None
    date: datetime | None = None


async def _terrain(lat: float, lon: float, use: bool) -> tuple[list[float], float, list[Provenance]]:
    if not use:
        return [0.0] * terrain.N_AZ, 0.0, [Provenance(source="computed", note="terrain horizon disabled")]
    try:
        return await terrain.terrain_horizon(lat, lon)
    except ProviderError as e:
        return [0.0] * terrain.N_AZ, 0.0, [Provenance(source="open-meteo-elevation", note=f"terrain unavailable: {e}; flat horizon assumed")]


@router.get("/terrain", response_model=Envelope[terrain.Horizon])
async def get_terrain(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    """Terrain-only horizon for a point: the elevation angle of the land in every 5° direction."""
    t, h, prov = await _terrain(lat, lon, True)
    return Envelope(data=terrain.build(lat, lon, t, h, []), provenance=prov)


@router.post("/mask", response_model=Envelope[terrain.Horizon])
async def mask(body: MaskBody):
    """Terrain horizon merged with the user's traced skyline."""
    t, h, prov = await _terrain(body.lat, body.lon, body.use_terrain)
    return Envelope(data=terrain.build(body.lat, body.lon, t, h, body.points), provenance=prov)


@router.post("/path")
async def path(body: PathBody):
    """When does a target really clear this skyline tonight (vs the geometric horizon)?"""
    try:
        target, p0 = await targets.resolve(body.target, body.ra, body.dec, body.kind)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    t, h, prov = await _terrain(body.lat, body.lon, body.use_terrain)
    hz = terrain.build(body.lat, body.lon, t, h, body.points)
    ref = (body.date or datetime.now(timezone.utc)).astimezone(timezone.utc)
    sunset, dusk, dawn, sunrise = astro.night_bounds(body.lat, body.lon, ref)
    rep = terrain.path_vs_mask(target, body.lat, body.lon, hz.mask, sunset, sunrise)
    return Envelope(data={"horizon": hz, "report": rep, "night": {"sunset": sunset, "sunrise": sunrise}}, provenance=[p0, *prov])
