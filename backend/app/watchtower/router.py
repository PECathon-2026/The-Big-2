from datetime import datetime

from fastapi import APIRouter, Query

from ..core.compute import in_thread
from ..core.envelope import Envelope, Provenance
from ..core.http import ProviderError
from . import lightpollution, openmeteo, spots
from .score import NightScore, compute_night_score

router = APIRouter()


@router.get("/forecast")
async def forecast(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), days: int = Query(2, ge=1, le=5)):
    """Raw hourly forecast (cloud layers, humidity, visibility, wind, temperature, dew point) plus aerosol optical depth."""
    fc, p1 = await openmeteo.forecast([(lat, lon)], days=days)
    prov = [p1]
    data = {**fc[0]}
    try:
        air, p2 = await openmeteo.air_quality(lat, lon, days=days)
        prov.append(p2)
        data["air_quality"] = air
    except ProviderError as e:
        prov.append(Provenance(source="open-meteo-air-quality", note=str(e)))
    return Envelope(data=data, provenance=prov)


@router.get("/score", response_model=Envelope[NightScore])
async def score(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    at: datetime | None = Query(None, description="Reference time (ISO 8601). Defaults to now. The night containing or following it is scored."),
    window_hours: int = Query(2, ge=1, le=4),
    light_pollution: bool = Query(True, description="Sample the VIIRS night-lights layer at the point"),
):
    """The Night Honor Score for tonight, hour by hour, with the best window, a verdict, warnings and a full trace."""
    fc, p1 = await openmeteo.forecast([(lat, lon)], days=2)
    prov = [p1]
    air = ens = None
    try:
        air, p = await openmeteo.air_quality(lat, lon, days=2)
        prov.append(p)
    except ProviderError as e:
        prov.append(Provenance(source="open-meteo-air-quality", note=str(e)))
    try:
        ens, p = await openmeteo.ensemble_cloud_spread(lat, lon, days=2)
        prov.append(p)
    except ProviderError as e:
        prov.append(Provenance(source="open-meteo-ensemble", note=str(e)))
    bortle = None
    if light_pollution:
        try:
            lp, p = await lightpollution.sample(lat, lon)
            bortle = lp["bortle"]
            prov.append(p)
        except ProviderError as e:
            prov.append(Provenance(source="nasa-gibs", note=str(e)))
    prov.append(Provenance(source="computed", note="astronomy-engine for Sun/Moon; Night Honor model in app/watchtower/score.py"))
    ns = await in_thread(compute_night_score, lat, lon, fc[0], air, ens, bortle, ref=at, window_hours=window_hours)
    return Envelope(data=ns, provenance=prov)


@router.get("/light-pollution")
async def light_pollution(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    """Rendered VIIRS Black Marble brightness at the point and the Bortle estimate derived from it."""
    d, p = await lightpollution.sample(lat, lon)
    return Envelope(data=d, provenance=[p])


@router.get("/spots", response_model=Envelope[spots.SpotsResult])
async def spots_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(60, ge=5, le=150),
    limit: int = Query(12, ge=1, le=25),
    at: datetime | None = None,
):
    """Real nearby spots from OpenStreetMap (peaks, viewpoints, shrines, temples, lakes, reserves), each scored for tonight and ranked."""
    res, prov = await spots.rank_spots(lat, lon, radius_km=radius_km, limit=limit, ref=at)
    return Envelope(data=res, provenance=prov)
