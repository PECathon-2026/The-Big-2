"""Aurora chance from NOAA space weather: the planetary Kp index (observed and forecast) against the observer's
geomagnetic latitude.

The auroral oval's equatorward edge moves south as Kp rises. NOAA's rule of thumb for the magnetic latitude
where aurora is overhead is used here; aurora is visible low on the poleward horizon from a few degrees
further equatorward. Nothing is a probability: it is "what Kp would be needed here" against "what Kp is
forecast", said plainly.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import BaseModel, Field

from ..core import astro
from ..core.envelope import Provenance, Trace
from ..core.http import ProviderError, fetch
def _rows_ok(d) -> bool:
    return isinstance(d, list) and all(isinstance(r, dict) for r in d[:3])


KP_FORECAST = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
KP_1M = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
SCALES = "https://services.swpc.noaa.gov/products/noaa-scales.json"

# geomagnetic dipole north pole (IGRF-13, epoch 2020)
POLE_LAT, POLE_LON = 80.65, -72.68
# magnetic latitude of the oval's equatorward edge (aurora overhead) for Kp 0..9 (NOAA/SWPC rule of thumb)
OVERHEAD_LAT = [66.5, 64.5, 62.4, 60.4, 58.3, 56.3, 54.2, 52.2, 50.1, 48.1]
HORIZON_OFFSET = 6.0  # degrees further equatorward from which the oval shows low on the horizon
G_SCALE = {5: "G1 minor", 6: "G2 moderate", 7: "G3 strong", 8: "G4 severe", 9: "G5 extreme"}


def geomagnetic_latitude(lat: float, lon: float) -> float:
    p, pp = math.radians(lat), math.radians(POLE_LAT)
    dl = math.radians(lon - POLE_LON)
    return math.degrees(math.asin(math.sin(p) * math.sin(pp) + math.cos(p) * math.cos(pp) * math.cos(dl)))


def required_kp(mag_lat: float) -> dict[str, float | None]:
    """Smallest Kp (0..9) at which aurora is overhead / on the horizon for this |magnetic latitude|."""
    m = abs(mag_lat)
    overhead = next((kp for kp, edge in enumerate(OVERHEAD_LAT) if m >= edge), None)
    horizon = next((kp for kp, edge in enumerate(OVERHEAD_LAT) if m >= edge - HORIZON_OFFSET), None)
    return {"overhead": overhead, "horizon": horizon}


def chance_word(max_kp: float, need_horizon: float | None) -> str:
    if need_horizon is None:
        return "none"
    if max_kp >= need_horizon + 1:
        return "likely"
    if max_kp >= need_horizon:
        return "possible"
    if max_kp >= need_horizon - 1:
        return "low"
    return "very low"


class KpPoint(BaseModel):
    time: datetime
    kp: float
    kind: str = Field(description="observed | estimated | predicted")
    g_scale: str | None


class Aurora(BaseModel):
    lat: float
    lon: float
    geomagnetic_lat: float
    hemisphere: str
    look_toward: str
    kp_now: float | None
    kp_now_time: datetime | None
    g_now: str | None
    forecast: list[KpPoint]
    max_kp_next_24h: float | None
    max_kp_time: datetime | None
    required_kp: dict[str, float | None]
    chance_tonight: str
    verdict: str
    dark_window_local: dict[str, str]
    trace: Trace


async def current_kp() -> tuple[tuple[float, datetime] | None, Provenance]:
    f = await fetch("noaa-swpc", KP_1M, ttl=120, validate=_rows_ok)
    rows = [r for r in f.data if r.get("estimated_kp") is not None]
    if not rows:
        return None, f.provenance
    r = rows[-1]
    return (float(r["estimated_kp"]), datetime.fromisoformat(r["time_tag"]).replace(tzinfo=timezone.utc)), f.provenance


async def kp_forecast() -> tuple[list[KpPoint], Provenance]:
    f = await fetch("noaa-swpc", KP_FORECAST, ttl=15 * 60, validate=_rows_ok)
    out = []
    for r in f.data:
        try:
            t = datetime.fromisoformat(r["time_tag"]).replace(tzinfo=timezone.utc)
            kp = float(r["kp"])
        except (KeyError, TypeError, ValueError):
            continue
        out.append(KpPoint(time=t, kp=kp, kind=str(r.get("observed") or "predicted"), g_scale=r.get("noaa_scale")))
    return out, f.provenance


async def g_scale_now() -> tuple[str | None, Provenance | None]:
    try:
        f = await fetch("noaa-swpc", SCALES, ttl=15 * 60, validate=lambda d: isinstance(d, dict) and "0" in d)
        g = (f.data.get("0") or {}).get("G") or {}
        s = g.get("Scale")
        return (f"G{s} {g.get('Text')}" if s is not None else None), f.provenance
    except ProviderError:
        return None, None


async def aurora(lat: float, lon: float, at: datetime | None = None) -> tuple[Aurora, list[Provenance]]:
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    prov: list[Provenance] = []
    mag = geomagnetic_latitude(lat, lon)
    need = required_kp(mag)
    fc, p = await kp_forecast()
    prov.append(p)
    now = None
    try:
        now, p2 = await current_kp()
        prov.append(p2)
    except ProviderError as e:
        prov.append(Provenance(source="noaa-swpc", note=f"1-minute Kp unavailable: {e}"))
    g_now, p3 = await g_scale_now()
    if p3:
        prov.append(p3)

    window = [k for k in fc if at - timedelta(hours=3) <= k.time <= at + timedelta(hours=48)]
    next24 = [k for k in window if k.time <= at + timedelta(hours=24)]
    max_pt = max(next24, key=lambda k: k.kp) if next24 else None
    max_kp = max_pt.kp if max_pt else None
    chance = chance_word(max_kp, need["horizon"]) if max_kp is not None else "unknown"
    zone = astro.tz(lat, lon)
    sunset, dusk, dawn, sunrise = astro.night_bounds(lat, lon, at)
    hemi = "north" if lat >= 0 else "south"
    toward = "north" if mag >= 0 else "south"

    if need["horizon"] is None:
        verdict = f"Aurora cannot be seen from here: at {abs(mag):.1f}° geomagnetic latitude even a Kp 9 storm keeps the oval below the horizon."
    elif max_kp is None:
        verdict = "No Kp forecast available right now."
    elif need["horizon"] == 0 and need["overhead"] == 0:
        verdict = (
            f"{chance.capitalize()} tonight: you are under the auroral oval, so any geomagnetic activity shows overhead. "
            f"NOAA forecasts a peak of Kp {max_kp:.2f} at {max_pt.time.astimezone(zone).strftime('%a %H:%M')} local; you need darkness ({dusk.astimezone(zone).strftime('%H:%M')}–{dawn.astimezone(zone).strftime('%H:%M')}) and a clear sky."
        )
    else:
        verdict = (
            f"{chance.capitalize()} tonight. You need Kp {need['horizon']} for aurora on the {toward}ern horizon"
            + (f" (Kp {need['overhead']} overhead)" if need["overhead"] is not None else "")
            + f"; NOAA forecasts a peak of Kp {max_kp:.2f}" + (f" ({G_SCALE.get(int(round(max_kp)), 'no storm')})" if max_kp >= 5 else "")
            + f" at {max_pt.time.astimezone(zone).strftime('%a %H:%M')} local."
        )
        if chance in ("possible", "likely"):
            verdict += f" Look {toward} after {dusk.astimezone(zone).strftime('%H:%M')} from a dark {toward}ern horizon."
    trace = Trace(
        formula="geomagnetic latitude from a centred dipole (pole 80.65°N 72.68°W); oval edge overhead at Kp k: OVERHEAD_LAT[k]; visible on the horizon from OVERHEAD_LAT[k] − 6°; chance compares the forecast 24 h peak Kp with the required Kp",
        inputs={"overhead_latitudes_by_kp": OVERHEAD_LAT, "horizon_offset_deg": HORIZON_OFFSET, "geomagnetic_lat": round(mag, 2)},
        notes=["Kp is a planetary 3-hour index; local activity varies", "chance words are thresholds, not probabilities", "forecast: NOAA SWPC planetary K-index forecast product"],
    )
    return Aurora(
        lat=lat, lon=lon, geomagnetic_lat=round(mag, 2), hemisphere=hemi, look_toward=toward,
        kp_now=now[0] if now else None, kp_now_time=now[1] if now else None, g_now=g_now,
        forecast=window, max_kp_next_24h=max_kp, max_kp_time=max_pt.time if max_pt else None,
        required_kp=need, chance_tonight=chance, verdict=verdict,
        dark_window_local={"dusk": dusk.astimezone(zone).strftime("%H:%M"), "dawn": dawn.astimezone(zone).strftime("%H:%M")},
        trace=trace,
    ), prov
