"""Planets tonight: altitude, azimuth, magnitude, rise/set, and close approaches with the Moon."""
from __future__ import annotations

from datetime import datetime, timezone

import astronomy as ae
from pydantic import BaseModel

from ..core import astro

PLANETS = [ae.Body.Mercury, ae.Body.Venus, ae.Body.Mars, ae.Body.Jupiter, ae.Body.Saturn, ae.Body.Uranus, ae.Body.Neptune]
JP = {"Mercury": "水星", "Venus": "金星", "Mars": "火星", "Jupiter": "木星", "Saturn": "土星", "Uranus": "天王星", "Neptune": "海王星"}


class PlanetInfo(BaseModel):
    name: str
    jp: str
    altitude: float
    azimuth: float
    magnitude: float
    elongation: float
    ra_hours: float
    dec_deg: float
    up_now: bool
    rise: datetime | None
    set: datetime | None
    rise_local: str | None
    set_local: str | None
    moon_separation_deg: float
    naked_eye: bool


def planets(lat: float, lon: float, at: datetime | None = None) -> list[PlanetInfo]:
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    obs = astro.observer(lat, lon)
    zone = astro.tz(lat, lon)
    t = astro.to_time(at)
    meq = ae.Equator(ae.Body.Moon, t, obs, True, True)
    out = []
    for b in PLANETS:
        eq = ae.Equator(b, t, obs, True, True)
        hor = ae.Horizon(t, obs, eq.ra, eq.dec, ae.Refraction.Normal)
        ill = ae.Illumination(b, t)
        rise, sett = astro.rise_set(b, obs, at, 1.5)
        sep = astro.angular_separation(eq.ra, eq.dec, meq.ra, meq.dec)
        name = b.name
        out.append(
            PlanetInfo(
                name=name,
                jp=JP.get(name, name),
                altitude=round(hor.altitude, 2),
                azimuth=round(hor.azimuth, 2),
                magnitude=round(ill.mag, 2),
                elongation=round(ae.AngleFromSun(b, t), 1),
                ra_hours=round(eq.ra, 4),
                dec_deg=round(eq.dec, 3),
                up_now=hor.altitude > 0,
                rise=rise,
                set=sett,
                rise_local=rise.astimezone(zone).strftime("%H:%M") if rise else None,
                set_local=sett.astimezone(zone).strftime("%H:%M") if sett else None,
                moon_separation_deg=round(sep, 1),
                naked_eye=ill.mag < 6.0 and name not in ("Uranus", "Neptune"),
            )
        )
    return out
