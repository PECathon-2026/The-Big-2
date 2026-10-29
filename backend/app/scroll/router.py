from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import Response

from ..core.envelope import Envelope, Provenance
from . import calendar_lunar, eclipses, events, ics, launches, meteors, moon, planets, satellites, sun

router = APIRouter()
COMPUTED = Provenance(source="computed", note="astronomy-engine (cosinekitty), topocentric, refraction applied")


@router.get("/moon", response_model=Envelope[moon.MoonInfo])
async def moon_endpoint(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), at: datetime | None = None):
    """Phase, illumination, age, Japanese moon name, rise/set, next quarters, libration, and the moonrise alert text."""
    return Envelope(data=moon.moon_info(lat, lon, at), provenance=[COMPUTED])


@router.get("/sun", response_model=Envelope[sun.SunInfo])
async def sun_endpoint(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), at: datetime | None = None):
    """Sunset, twilights, astronomical night bounds and dark hours for tonight."""
    return Envelope(data=sun.sun_info(lat, lon, at), provenance=[COMPUTED])


@router.get("/eclipses", response_model=Envelope[list[eclipses.Eclipse]])
async def eclipses_endpoint(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), start: datetime | None = None, lunar: int = Query(3, ge=0, le=10), solar: int = Query(2, ge=0, le=10)):
    """Upcoming lunar and solar eclipses with local circumstances and visibility from the observer."""
    return Envelope(data=eclipses.eclipses(lat, lon, start, lunar, solar), provenance=[COMPUTED])


@router.get("/meteors", response_model=Envelope[list[meteors.Shower]])
async def meteors_endpoint(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), at: datetime | None = None, bortle: float | None = Query(None, ge=1, le=9)):
    """Active meteor showers with the expected hourly rate from this observer, hour by hour tonight."""
    return Envelope(data=meteors.active_showers(lat, lon, at, bortle=bortle), provenance=[Provenance(source="imo-calendar", note="static IMO working list in backend/data/meteor_showers.json"), COMPUTED])


@router.get("/passes", response_model=Envelope[list[satellites.Pass]])
async def passes_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    days: float = Query(3, ge=0.1, le=7),
    sat: str = Query("ISS", description="ISS, TIANGONG, HUBBLE or a NORAD id"),
    min_alt: float = Query(10, ge=0, le=90),
    start: datetime | None = None,
):
    """Satellite passes from CelesTrak TLEs + SGP4. 'visible' means the observer is dark and the satellite is sunlit."""
    ps, prov = await satellites.passes(lat, lon, days=days, sat=sat, min_alt=min_alt, start=start)
    return Envelope(data=ps, provenance=[prov, Provenance(source="computed", note="SGP4 (sgp4 lib), TEME→ECEF via GMST, cylindrical shadow test")])


@router.get("/launches", response_model=Envelope[list[launches.Launch]])
async def launches_endpoint(lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180), limit: int = Query(20, ge=1, le=50)):
    """Upcoming launches from Launch Library 2 (cached 60 min), with distance from the observer and a trail-visibility hint."""
    ls, prov = await launches.upcoming(lat, lon, limit)
    return Envelope(data=ls, provenance=[prov])


@router.get("/planets", response_model=Envelope[list[planets.PlanetInfo]])
async def planets_endpoint(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), at: datetime | None = None):
    """Planet positions, magnitudes, rise/set and separation from the Moon at the given time."""
    return Envelope(data=planets.planets(lat, lon, at), provenance=[COMPUTED])


@router.get("/calendar", response_model=Envelope[calendar_lunar.LunarCalendar])
async def calendar_endpoint(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), year: int | None = None, month: int | None = Query(None, ge=1, le=12)):
    """The lunisolar month: moon age and name per day, lunar month/day, 24 sekki and 72 kō, all computed."""
    now = datetime.now(timezone.utc)
    return Envelope(data=calendar_lunar.month_calendar(lat, lon, year or now.year, month or now.month), provenance=[COMPUTED])


@router.get("/season")
async def season_endpoint(at: datetime | None = None):
    """Today's sekki and kō (micro-season) from the Sun's ecliptic longitude."""
    return Envelope(data=calendar_lunar.sekki_for(at or datetime.now(timezone.utc)), provenance=[COMPUTED])


@router.get("/events", response_model=Envelope[list[events.Event]])
async def events_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    days: int = Query(7, ge=1, le=30),
    types: str | None = Query(None, description="comma-separated subset of moon,meteor,eclipse,satellite,launch,planet"),
    start: datetime | None = None,
    bortle: float | None = Query(None, ge=1, le=9),
):
    """One feed of everything: moon rise/set/quarters, showers, eclipses, visible ISS passes, launches, planets."""
    tl = [t.strip() for t in types.split(",")] if types else None
    ev, prov = await events.events(lat, lon, days=days, types=tl, start=start, bortle=bortle)
    return Envelope(data=ev, provenance=prov)


@router.get("/ics")
async def ics_endpoint(title: str, start: datetime, end: datetime | None = None, description: str = "", location: str = ""):
    """Download an .ics calendar file for any event."""
    body = ics.make_ics(title, start, end, description, location)
    return Response(content=body, media_type="text/calendar", headers={"Content-Disposition": 'attachment; filename="tsukuyomi-event.ics"'})
