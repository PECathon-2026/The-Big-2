"""Sun: rise, set, twilights, and the night's dark window."""
from __future__ import annotations

from datetime import datetime, timezone

import astronomy as ae
from pydantic import BaseModel

from ..core import astro


class SunInfo(BaseModel):
    time: datetime
    timezone: str
    altitude: float
    azimuth: float
    sunset: datetime
    civil_dusk: datetime | None
    nautical_dusk: datetime | None
    astronomical_dusk: datetime
    astronomical_dawn: datetime
    nautical_dawn: datetime | None
    civil_dawn: datetime | None
    sunrise: datetime
    dark_hours: float
    local: dict


def sun_info(lat: float, lon: float, at: datetime | None = None) -> SunInfo:
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    obs = astro.observer(lat, lon)
    zone = astro.tz(lat, lon)
    alt, az = astro.altaz(ae.Body.Sun, at, obs)
    sunset, dusk, dawn, sunrise = astro.night_bounds(lat, lon, at)
    civ_d = astro.search_altitude(ae.Body.Sun, obs, -1, sunset, -6.0)
    nau_d = astro.search_altitude(ae.Body.Sun, obs, -1, sunset, -12.0)
    nau_a = astro.search_altitude(ae.Body.Sun, obs, +1, sunset, -12.0)
    civ_a = astro.search_altitude(ae.Body.Sun, obs, +1, sunset, -6.0)
    fmt = lambda d: d.astimezone(zone).strftime("%H:%M") if d else None  # noqa: E731
    return SunInfo(
        time=at,
        timezone=astro.tz_name(lat, lon),
        altitude=round(alt, 2),
        azimuth=round(az, 2),
        sunset=sunset,
        civil_dusk=civ_d,
        nautical_dusk=nau_d,
        astronomical_dusk=dusk,
        astronomical_dawn=dawn,
        nautical_dawn=nau_a,
        civil_dawn=civ_a,
        sunrise=sunrise,
        dark_hours=round((dawn - dusk).total_seconds() / 3600, 2),
        local={"sunset": fmt(sunset), "astronomical_dusk": fmt(dusk), "astronomical_dawn": fmt(dawn), "sunrise": fmt(sunrise)},
    )
