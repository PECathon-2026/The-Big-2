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
    night_kind: str = "normal"
    note: str | None = None
    local: dict


def sun_info(lat: float, lon: float, at: datetime | None = None) -> SunInfo:
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    obs = astro.observer(lat, lon)
    zone = astro.tz(lat, lon)
    alt, az = astro.altaz(ae.Body.Sun, at, obs)
    night = astro.night_bounds(lat, lon, at)
    sunset, dusk, dawn, sunrise = night
    civ_d = astro.search_altitude(ae.Body.Sun, obs, -1, sunset, -6.0)
    nau_d = astro.search_altitude(ae.Body.Sun, obs, -1, sunset, -12.0)
    nau_a = astro.search_altitude(ae.Body.Sun, obs, +1, sunset, -12.0)
    civ_a = astro.search_altitude(ae.Body.Sun, obs, +1, sunset, -6.0)
    for name in ("civ_d", "nau_d", "nau_a", "civ_a"):  # twilight crossings belong to this night only
        v = locals()[name]
        if v is not None and not (sunset <= v <= sunrise):
            civ_d, nau_d, nau_a, civ_a = (None if n == name else val for n, val in zip(("civ_d", "nau_d", "nau_a", "civ_a"), (civ_d, nau_d, nau_a, civ_a)))
    fmt = lambda d: d.astimezone(zone).strftime("%H:%M") if d else None  # noqa: E731
    notes = {
        "no_astronomical_night": "The Sun never gets 18° below the horizon tonight: no fully dark sky, only deep twilight around the darkest moment.",
        "polar_day": "Polar day: the Sun does not set here today. Times mark the darkest moment; there is no night.",
        "polar_night": "Polar night: the Sun does not rise here today. 'Sunset' and 'sunrise' are the local noons that bound this 24-hour night.",
    }
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
        night_kind=night.kind,
        note=notes.get(night.kind),
        local={"sunset": fmt(sunset), "astronomical_dusk": fmt(dusk), "astronomical_dawn": fmt(dawn), "sunrise": fmt(sunrise)},
    )
