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
    prev_new = ae.SearchMoonPhase(0.0, t.AddDays(-35.0), 36.0)  # some new moon in the last ~35 days
    if prev_new is None:
        return 0.0
    while True:  # walk forward to the last new moon that is still before `dt`
        nxt = ae.SearchMoonPhase(0.0, prev_new.AddDays(1.0), 35.0)
        if nxt is None or nxt.ut > t.ut:
            break
        prev_new = nxt
    return t.ut - prev_new.ut


def rise_set(body: ae.Body, obs: ae.Observer, start: datetime, limit_days: float = 1.5) -> tuple[datetime | None, datetime | None]:
    t = to_time(start)
    r = ae.SearchRiseSet(body, obs, ae.Direction.Rise, t, limit_days)
    s = ae.SearchRiseSet(body, obs, ae.Direction.Set, t, limit_days)
    return (from_time(r) if r else None, from_time(s) if s else None)


def search_altitude(body: ae.Body, obs: ae.Observer, direction: int, start: datetime, altitude: float, limit_days: float = 1.5) -> datetime | None:
    t = ae.SearchAltitude(body, obs, ae.Direction.Rise if direction > 0 else ae.Direction.Set, to_time(start), limit_days, altitude)
    return from_time(t) if t else None


class NightBounds(tuple):
    """(sunset, astronomical dusk, astronomical dawn, sunrise) that also says what kind of night it is.

    Unpacks like the plain 4-tuple every caller expects; `kind` is one of
    "normal", "no_astronomical_night" (the Sun sets but never reaches −18°), "polar_day" (it never sets) or
    "polar_night" (it never rises). In the degenerate kinds the four times are still ordered and never invented:
    with no darkness, dusk and dawn coincide at the darkest moment so the dark window has zero length.
    """

    kind: str

    def __new__(cls, sunset: datetime, dusk: datetime, dawn: datetime, sunrise: datetime, kind: str = "normal"):
        obj = super().__new__(cls, (sunset, dusk, dawn, sunrise))
        obj.kind = kind
        return obj


def _culmination(obs: ae.Observer, start: datetime, lower: bool) -> datetime:
    """The Sun's next lower (midnight) or upper (noon) culmination after `start`."""
    return from_time(ae.SearchHourAngle(ae.Body.Sun, obs, 12.0 if lower else 0.0, to_time(start)).time)


def night_bounds(lat: float, lon: float, ref: datetime) -> NightBounds:
    """The night that contains or follows `ref`: if the Sun is below the horizon at `ref` we are already in it,
    otherwise it is the coming night. See `NightBounds` for the polar and no-darkness cases."""
    sun = ae.Body.Sun
    obs = observer(lat, lon)
    up_now = sun_alt(ref, obs) >= -0.833
    if up_now:
        sunset = search_altitude(sun, obs, -1, ref, -0.833)
    else:  # the sunset that began this night: the last one before ref
        sunset = search_altitude(sun, obs, -1, ref - timedelta(hours=30), -0.833)
        while sunset is not None:
            nxt = search_altitude(sun, obs, -1, sunset + timedelta(minutes=1), -0.833)
            if nxt is None or nxt >= ref:
                break
            sunset = nxt
        if sunset is not None and sunset < ref - timedelta(hours=26):
            sunset = None  # that sunset was days ago: the Sun has not risen since, this is polar night

    if sunset is None and up_now:  # polar day: no night at all
        low = _culmination(obs, ref, lower=True)
        return NightBounds(low, low, low, low, "polar_day")
    if sunset is None:  # polar night: the "night" runs from one local noon to the next
        noon = _culmination(obs, ref - timedelta(hours=25), lower=False)
        while True:
            nxt = _culmination(obs, noon + timedelta(minutes=1), lower=False)
            if nxt >= ref:
                break
            noon = nxt
        sunset, sunrise, kind = noon, _culmination(obs, noon + timedelta(minutes=1), lower=False), "polar_night"
    else:
        sunrise = search_altitude(sun, obs, +1, sunset, -0.833) or _culmination(obs, sunset, lower=False)
        kind = "normal"

    dusk = search_altitude(sun, obs, -1, sunset, -18.0)
    dawn = search_altitude(sun, obs, +1, dusk, -18.0) if dusk is not None else None
    if dusk is None or dawn is None or dusk > sunrise or dawn > sunrise:
        if kind == "polar_night" and sun_alt(sunset, obs) < -18.0:  # dark the whole way round
            dusk, dawn = sunset, sunrise
        else:  # never astronomically dark tonight: a zero-length window at the darkest moment
            low = _culmination(obs, sunset, lower=True)
            if low > sunrise:
                low = sunset
            dusk = dawn = low
            if kind == "normal":
                kind = "no_astronomical_night"
    return NightBounds(sunset, dusk, dawn, sunrise, kind)


def angular_separation(ra1_h: float, dec1: float, ra2_h: float, dec2: float) -> float:
    a1, d1, a2, d2 = math.radians(ra1_h * 15), math.radians(dec1), math.radians(ra2_h * 15), math.radians(dec2)
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def radec_to_altaz(ra_h: float, dec_deg: float, dt: datetime, obs: ae.Observer) -> tuple[float, float]:
    hor = ae.Horizon(to_time(dt), obs, ra_h, dec_deg, ae.Refraction.Normal)
    return hor.altitude, hor.azimuth
