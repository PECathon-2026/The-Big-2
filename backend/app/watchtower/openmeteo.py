"""Open-Meteo adapters: forecast (multi-point), air quality (aerosol optical depth), ensemble spread, elevation."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..core.envelope import Provenance
from ..core.http import fetch

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"

HOURLY = [
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "relative_humidity_2m",
    "visibility",
    "wind_speed_10m",
    "temperature_2m",
    "dew_point_2m",
]


def _fmt(v: float) -> str:
    return f"{round(v, 4):.4f}"


def _parse_times(times: list[str], offset_s: int) -> list[datetime]:
    # Open-Meteo returns local times when timezone=auto; we normalise to UTC.
    out = []
    for s in times:
        dt = datetime.fromisoformat(s)
        out.append((dt - _td(offset_s)).replace(tzinfo=timezone.utc))
    return out


def _td(seconds: int):
    from datetime import timedelta

    return timedelta(seconds=seconds)


async def forecast(points: list[tuple[float, float]], days: int = 3) -> tuple[list[dict[str, Any]], Provenance]:
    """Hourly forecast for one or many points in one request. Returns one dict per point with UTC 'time' list."""
    params = {
        "latitude": ",".join(_fmt(p[0]) for p in points),
        "longitude": ",".join(_fmt(p[1]) for p in points),
        "hourly": ",".join(HOURLY),
        "forecast_days": days,
        "timezone": "auto",
    }
    f = await fetch("open-meteo", FORECAST_URL, params=params, ttl=15 * 60)
    raw = f.data if isinstance(f.data, list) else [f.data]
    out = []
    for r in raw:
        h = r["hourly"]
        out.append(
            {
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "elevation": r.get("elevation"),
                "timezone": r.get("timezone"),
                "utc_offset_seconds": r.get("utc_offset_seconds", 0),
                "time": _parse_times(h["time"], r.get("utc_offset_seconds", 0)),
                **{k: h[k] for k in HOURLY if k in h},
            }
        )
    return out, f.provenance


async def air_quality(lat: float, lon: float, days: int = 3) -> tuple[dict[str, Any], Provenance]:
    params = {
        "latitude": _fmt(lat),
        "longitude": _fmt(lon),
        "hourly": "aerosol_optical_depth,dust",
        "forecast_days": days,
        "timezone": "auto",
    }
    f = await fetch("open-meteo-air-quality", AIR_URL, params=params, ttl=60 * 60)
    h = f.data["hourly"]
    return (
        {
            "time": _parse_times(h["time"], f.data.get("utc_offset_seconds", 0)),
            "aerosol_optical_depth": h.get("aerosol_optical_depth", []),
            "dust": h.get("dust", []),
        },
        f.provenance,
    )


async def ensemble_cloud_spread(lat: float, lon: float, days: int = 2) -> tuple[dict[str, Any], Provenance]:
    """Standard deviation of total cloud cover across ensemble members, per hour (model agreement, not a probability)."""
    params = {
        "latitude": _fmt(lat),
        "longitude": _fmt(lon),
        "hourly": "cloud_cover",
        "models": "icon_seamless,gfs_seamless",
        "forecast_days": days,
    }
    f = await fetch("open-meteo-ensemble", ENSEMBLE_URL, params=params, ttl=60 * 60)
    raw = f.data if isinstance(f.data, list) else [f.data]
    times = raw[0]["hourly"]["time"]
    member_series: list[list[float | None]] = []
    for r in raw:
        for k, v in r["hourly"].items():
            if k.startswith("cloud_cover") and isinstance(v, list):
                member_series.append(v)
    n = len(times)
    mean, spread = [], []
    for i in range(n):
        vals = [s[i] for s in member_series if i < len(s) and s[i] is not None]
        if not vals:
            mean.append(None)
            spread.append(None)
            continue
        m = sum(vals) / len(vals)
        mean.append(round(m, 1))
        spread.append(round((sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5, 1))
    return (
        {
            "time": [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in times],
            "members": len(member_series),
            "cloud_mean": mean,
            "cloud_spread": spread,
        },
        f.provenance,
    )


async def elevation(points: list[tuple[float, float]]) -> tuple[list[float], Provenance]:
    params = {"latitude": ",".join(_fmt(p[0]) for p in points), "longitude": ",".join(_fmt(p[1]) for p in points)}
    f = await fetch("open-meteo-elevation", ELEVATION_URL, params=params, ttl=30 * 24 * 3600)
    return f.data["elevation"], f.provenance
