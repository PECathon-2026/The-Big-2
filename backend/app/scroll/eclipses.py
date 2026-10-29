"""Lunar and solar eclipses with local circumstances, computed with astronomy-engine."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import astronomy as ae
from pydantic import BaseModel

from ..core import astro

KIND = {
    ae.EclipseKind.Penumbral: "penumbral",
    ae.EclipseKind.Partial: "partial",
    ae.EclipseKind.Annular: "annular",
    ae.EclipseKind.Total: "total",
}


class Eclipse(BaseModel):
    type: str  # lunar | solar
    kind: str
    peak: datetime
    peak_local: str
    obscuration: float | None
    visible_from_here: bool
    peak_altitude: float | None
    begins: datetime | None
    ends: datetime | None
    duration_minutes: float | None
    note: str


def _fmt(d: datetime, lat: float, lon: float) -> str:
    return d.astimezone(astro.tz(lat, lon)).strftime("%Y-%m-%d %H:%M")


def lunar_eclipses(lat: float, lon: float, start: datetime, count: int = 3) -> list[Eclipse]:
    obs = astro.observer(lat, lon)
    out: list[Eclipse] = []
    info = ae.SearchLunarEclipse(astro.to_time(start))
    for _ in range(count):
        peak = astro.from_time(info.peak)
        alt = astro.moon_alt(peak, obs)
        half = (info.sd_total or info.sd_partial or info.sd_penum) or 0.0
        begins = peak - timedelta(minutes=half)
        ends = peak + timedelta(minutes=half)
        # visible if the Moon is up at some point during the eclipse
        vis = alt > 0 or astro.moon_alt(begins, obs) > 0 or astro.moon_alt(ends, obs) > 0
        out.append(
            Eclipse(
                type="lunar",
                kind=KIND.get(info.kind, str(info.kind)),
                peak=peak,
                peak_local=_fmt(peak, lat, lon),
                obscuration=round(info.obscuration, 3) if info.obscuration is not None else None,
                visible_from_here=vis,
                peak_altitude=round(alt, 1),
                begins=begins,
                ends=ends,
                duration_minutes=round(2 * half, 1),
                note="Moon must be above the horizon; eclipse spans the whole night side of Earth",
            )
        )
        info = ae.NextLunarEclipse(info.peak)
    return out


def solar_eclipses(lat: float, lon: float, start: datetime, count: int = 2) -> list[Eclipse]:
    """Next solar eclipses visible from the observer (local circumstances), plus the next global one if none is local soon."""
    obs = astro.observer(lat, lon)
    out: list[Eclipse] = []
    t = astro.to_time(start)
    loc = ae.SearchLocalSolarEclipse(t, obs)
    for _ in range(count):
        peak = astro.from_time(loc.peak.time)
        pb = astro.from_time(loc.partial_begin.time) if loc.partial_begin else None
        pe = astro.from_time(loc.partial_end.time) if loc.partial_end else None
        out.append(
            Eclipse(
                type="solar",
                kind=KIND.get(loc.kind, str(loc.kind)),
                peak=peak,
                peak_local=_fmt(peak, lat, lon),
                obscuration=round(loc.obscuration, 3) if loc.obscuration is not None else None,
                visible_from_here=loc.peak.altitude > 0,
                peak_altitude=round(loc.peak.altitude, 1),
                begins=pb,
                ends=pe,
                duration_minutes=round((pe - pb).total_seconds() / 60, 1) if pb and pe else None,
                note="local circumstances for this observer",
            )
        )
        loc = ae.NextLocalSolarEclipse(loc.peak.time, obs)
    return out


def eclipses(lat: float, lon: float, start: datetime | None = None, lunar: int = 3, solar: int = 2) -> list[Eclipse]:
    start = (start or datetime.now(timezone.utc)).astimezone(timezone.utc)
    ev = lunar_eclipses(lat, lon, start, lunar) + solar_eclipses(lat, lon, start, solar)
    ev.sort(key=lambda e: e.peak)
    return ev
