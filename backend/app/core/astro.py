"""Thin helpers over astronomy-engine (cosinekitty). All times UTC. Angles in degrees."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import astronomy as ae
from timezonefinder import TimezoneFinder

_tf = TimezoneFinder()


def to_time(dt: datetime) -> ae.Time:
    dt = dt.astimezone(timezone.utc)
    return ae.Time.Make(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)


def from_time(t: ae.Time) -> datetime:
    return t.Utc().replace(tzinfo=timezone.utc)


def observer(lat: float, lon: float, elev_m: float = 0.0) -> ae.Observer:
    return ae.Observer(lat, lon, elev_m)


@lru_cache(maxsize=4096)
def tz_name(lat: float, lon: float) -> str:
    return _tf.timezone_at(lat=lat, lng=lon) or "UTC"


def tz(lat: float, lon: float) -> ZoneInfo:
    return ZoneInfo(tz_name(lat, lon))


def local(dt: datetime, lat: float, lon: float) -> datetime:
    return dt.astimezone(tz(lat, lon))


def altaz(body: ae.Body, dt: datetime, obs: ae.Observer) -> tuple[float, float]:
    """Topocentric altitude and azimuth (degrees) with normal refraction."""
    t = to_time(dt)
    eq = ae.Equator(body, t, obs, True, True)
    hor = ae.Horizon(t, obs, eq.ra, eq.dec, ae.Refraction.Normal)
    return hor.altitude, hor.azimuth


def sun_alt(dt: datetime, obs: ae.Observer) -> float:
    return altaz(ae.Body.Sun, dt, obs)[0]


def moon_alt(dt: datetime, obs: ae.Observer) -> float:
    return altaz(ae.Body.Moon, dt, obs)[0]


def moon_illumination(dt: datetime) -> float:
    return ae.Illumination(ae.Body.Moon, to_time(dt)).phase_fraction


def moon_phase_deg(dt: datetime) -> float:
    return ae.MoonPhase(to_time(dt))


def moon_age_days(dt: datetime) -> float:
    """Days since the last new moon."""
    t = to_time(dt)
    prev_new = ae.SearchMoonPhase(0.0, t.AddDays(-30.0), 31.0)
    if prev_new is None:
        return 0.0
    return t.ut - prev_new.ut


def rise_set(body: ae.Body, obs: ae.Observer, start: datetime, limit_days: float = 1.5) -> tuple[datetime | None, datetime | None]:
    t = to_time(start)
    r = ae.SearchRiseSet(body, obs, ae.Direction.Rise, t, limit_days)
    s = ae.SearchRiseSet(body, obs, ae.Direction.Set, t, limit_days)
    return (from_time(r) if r else None, from_time(s) if s else None)


def search_altitude(body: ae.Body, obs: ae.Observer, direction: int, start: datetime, altitude: float, limit_days: float = 1.5) -> datetime | None:
    t = ae.SearchAltitude(body, obs, ae.Direction.Rise if direction > 0 else ae.Direction.Set, to_time(start), limit_days, altitude)
    return from_time(t) if t else None


def night_bounds(lat: float, lon: float, ref: datetime) -> tuple[datetime, datetime, datetime, datetime]:
    """(sunset, astronomical dusk, astronomical dawn, sunrise) for the night that contains or follows `ref`.

    If the Sun is below the horizon at `ref` we are already in that night; otherwise it is the coming night.
    """
    obs = observer(lat, lon)
    if sun_alt(ref, obs) < 0:
        start = ref - timedelta(hours=14)
        sunset = search_altitude(ae.Body.Sun, obs, -1, start, -0.833) or ref
        # the sunset before ref
        while True:
            nxt = search_altitude(ae.Body.Sun, obs, -1, sunset + timedelta(minutes=1), -0.833)
            if nxt and nxt < ref:
                sunset = nxt
            else:
                break
    else:
        sunset = search_altitude(ae.Body.Sun, obs, -1, ref, -0.833) or ref
    dusk = search_altitude(ae.Body.Sun, obs, -1, sunset, -18.0) or sunset
    sunrise = search_altitude(ae.Body.Sun, obs, +1, sunset, -0.833) or (sunset + timedelta(hours=12))
    dawn = search_altitude(ae.Body.Sun, obs, +1, sunset, -18.0) or sunrise
    return sunset, dusk, dawn, sunrise


def angular_separation(ra1_h: float, dec1: float, ra2_h: float, dec2: float) -> float:
    a1, d1, a2, d2 = math.radians(ra1_h * 15), math.radians(dec1), math.radians(ra2_h * 15), math.radians(dec2)
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def radec_to_altaz(ra_h: float, dec_deg: float, dt: datetime, obs: ae.Observer) -> tuple[float, float]:
    hor = ae.Horizon(to_time(dt), obs, ra_h, dec_deg, ae.Refraction.Normal)
    return hor.altitude, hor.azimuth
