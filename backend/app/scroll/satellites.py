"""Satellite passes (ISS and friends) from CelesTrak TLEs with SGP4.

A pass is listed only when it is actually visible: the observer is in darkness (Sun below -6°) and the satellite is
sunlit (outside Earth's shadow). Positions: SGP4 TEME → ECEF via GMST rotation → topocentric alt/az.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import astronomy as ae
import numpy as np
from pydantic import BaseModel, Field
from sgp4.api import Satrec, jday

from ..core import astro
from ..core.envelope import Provenance
from ..core.http import fetch

CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php"
SATELLITES = {
    "ISS": 25544,
    "TIANGONG": 48274,
    "HUBBLE": 20580,
}
R_EARTH = 6378.137
F = 1 / 298.257223563


async def tle(catnr: int) -> tuple[tuple[str, str, str], Provenance]:
    f = await fetch("celestrak", CELESTRAK, params={"CATNR": catnr, "FORMAT": "TLE"}, ttl=6 * 3600, binary=True)
    lines = [l.strip() for l in f.data.decode("ascii", "ignore").splitlines() if l.strip()]
    if len(lines) < 3:
        raise ValueError(f"bad TLE for {catnr}: {lines}")
    return (lines[0], lines[1], lines[2]), f.provenance


def _gmst_rad(dt: datetime) -> float:
    return math.radians(ae.SiderealTime(astro.to_time(dt)) * 15.0)


def _teme_to_ecef(r_teme: np.ndarray, dt: datetime) -> np.ndarray:
    g = _gmst_rad(dt)
    c, s = math.cos(g), math.sin(g)
    rot = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    return rot @ r_teme


def _observer_ecef(lat: float, lon: float, h_km: float) -> np.ndarray:
    la, lo = math.radians(lat), math.radians(lon)
    e2 = F * (2 - F)
    n = R_EARTH / math.sqrt(1 - e2 * math.sin(la) ** 2)
    return np.array([(n + h_km) * math.cos(la) * math.cos(lo), (n + h_km) * math.cos(la) * math.sin(lo), (n * (1 - e2) + h_km) * math.sin(la)])


def _altaz(r_sat_ecef: np.ndarray, lat: float, lon: float, h_km: float) -> tuple[float, float, float]:
    obs = _observer_ecef(lat, lon, h_km)
    d = r_sat_ecef - obs
    la, lo = math.radians(lat), math.radians(lon)
    # ENU
    e = -math.sin(lo) * d[0] + math.cos(lo) * d[1]
    n = -math.sin(la) * math.cos(lo) * d[0] - math.sin(la) * math.sin(lo) * d[1] + math.cos(la) * d[2]
    u = math.cos(la) * math.cos(lo) * d[0] + math.cos(la) * math.sin(lo) * d[1] + math.sin(la) * d[2]
    rng = math.sqrt(e * e + n * n + u * u)
    alt = math.degrees(math.asin(u / rng))
    az = math.degrees(math.atan2(e, n)) % 360
    return alt, az, rng


def _sunlit(r_sat_teme: np.ndarray, dt: datetime) -> bool:
    """Cylindrical Earth-shadow test using the Sun's geocentric direction (equator of date ≈ TEME)."""
    sv = ae.GeoVector(ae.Body.Sun, astro.to_time(dt), True)
    s = np.array([sv.x, sv.y, sv.z])
    s /= np.linalg.norm(s)
    proj = float(np.dot(r_sat_teme, s))
    if proj > 0:
        return True
    perp = r_sat_teme - proj * s
    return float(np.linalg.norm(perp)) > R_EARTH


def _compass(az: float) -> str:
    return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][int((az + 11.25) // 22.5) % 16]


class PassPoint(BaseModel):
    time: datetime
    alt: float
    az: float
    sunlit: bool


class Pass(BaseModel):
    satellite: str
    norad_id: int
    start: datetime
    start_local: str
    end: datetime
    end_local: str
    duration_s: int
    max_alt: float
    max_time: datetime
    start_az: float
    start_compass: str
    max_az: float
    end_az: float
    end_compass: str
    visible: bool = Field(description="observer dark and satellite sunlit for at least part of the pass")
    visible_seconds: int
    brightness_hint: str
    track: list[PassPoint] = Field(description="every 10 s while above the horizon")
    alert: str


async def passes(lat: float, lon: float, days: float = 3.0, sat: str = "ISS", elev_m: float = 0.0, min_alt: float = 10.0, start: datetime | None = None) -> tuple[list[Pass], Provenance]:
    catnr = SATELLITES.get(sat.upper(), None) or int(sat)
    (name, l1, l2), prov = await tle(catnr)
    satrec = Satrec.twoline2rv(l1, l2)
    start = (start or datetime.now(timezone.utc)).astimezone(timezone.utc)
    obs = astro.observer(lat, lon, elev_m)
    zone = astro.tz(lat, lon)
    step = timedelta(seconds=10)
    t = start
    end_t = start + timedelta(days=days)
    out: list[Pass] = []
    cur: list[tuple[datetime, float, float, bool]] = []
    # coarse scan at 30 s, refine to 10 s when above horizon
    coarse = timedelta(seconds=30)
    while t < end_t:
        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond / 1e6)
        err, r, _ = satrec.sgp4(jd, fr)
        if err != 0:
            t += coarse
            continue
        r = np.array(r)
        alt, az, _ = _altaz(_teme_to_ecef(r, t), lat, lon, elev_m / 1000)
        if alt > 0:
            cur.append((t, alt, az, _sunlit(r, t)))
            t += step
        else:
            if cur:
                p = _finish(cur, name.strip(), catnr, obs, zone, min_alt)
                if p:
                    out.append(p)
                cur = []
            t += coarse
    if cur:
        p = _finish(cur, name.strip(), catnr, obs, zone, min_alt)
        if p:
            out.append(p)
    return out, prov


def _finish(cur, name, catnr, obs, zone, min_alt) -> Pass | None:
    max_pt = max(cur, key=lambda x: x[1])
    if max_pt[1] < min_alt:
        return None
    vis_pts = [p for p in cur if p[3] and astro.sun_alt(p[0], obs) < -6]
    visible = len(vis_pts) > 0
    vstart = vis_pts[0][0] if visible else cur[0][0]
    vend = vis_pts[-1][0] if visible else cur[-1][0]
    if max_pt[1] >= 60:
        hint = "very bright, brighter than any star"
    elif max_pt[1] >= 30:
        hint = "bright, like a fast-moving planet"
    else:
        hint = "low pass, dimmer and brief"
    alert = (
        f"{name} rises {_compass(cur[0][2])} at {vstart.astimezone(zone).strftime('%H:%M')} · max {max_pt[1]:.0f}° · {int((vend - vstart).total_seconds() // 60)} min visible"
        if visible
        else f"{name} passes {cur[0][0].astimezone(zone).strftime('%H:%M')} but is not visible (daylight or in shadow)"
    )
    return Pass(
        satellite=name,
        norad_id=catnr,
        start=cur[0][0],
        start_local=cur[0][0].astimezone(zone).strftime("%a %H:%M:%S"),
        end=cur[-1][0],
        end_local=cur[-1][0].astimezone(zone).strftime("%H:%M:%S"),
        duration_s=int((cur[-1][0] - cur[0][0]).total_seconds()),
        max_alt=round(max_pt[1], 1),
        max_time=max_pt[0],
        start_az=round(cur[0][2], 1),
        start_compass=_compass(cur[0][2]),
        max_az=round(max_pt[2], 1),
        end_az=round(cur[-1][2], 1),
        end_compass=_compass(cur[-1][2]),
        visible=visible,
        visible_seconds=int((vend - vstart).total_seconds()) if visible else 0,
        brightness_hint=hint,
        track=[PassPoint(time=p[0], alt=round(p[1], 1), az=round(p[2], 1), sunlit=p[3]) for p in cur],
        alert=alert,
    )
