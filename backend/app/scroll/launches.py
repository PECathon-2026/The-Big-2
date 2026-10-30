"""Rocket launches from Launch Library 2 (The Space Devs), cached server-side (15 calls/hour unauthenticated)."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from pydantic import BaseModel

from ..core import astro
from ..core.config import settings
from ..core.envelope import Provenance
from ..core.http import fetch

LL2 = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/"


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Launch(BaseModel):
    id: str
    name: str
    provider: str | None
    rocket: str | None
    mission: str | None
    status: str | None
    net: datetime | None
    net_local: str | None
    window_start: datetime | None
    window_end: datetime | None
    pad: str | None
    location: str | None
    pad_lat: float | None
    pad_lon: float | None
    distance_km: float | None
    visible_trail_hint: str
    webcast: str | None
    image: str | None


async def upcoming(lat: float | None = None, lon: float | None = None, limit: int = 20) -> tuple[list[Launch], Provenance]:
    params: dict = {"limit": limit, "mode": "detailed", "ordering": "net"}
    headers = {"Authorization": f"Token {settings.launch_library_key}"} if settings.launch_library_key else None
    f = await fetch("launch-library-2", LL2, params=params, headers=headers, ttl=60 * 60, retries=0, validate=lambda d: isinstance(d, dict) and isinstance(d.get("results"), list))
    zone = astro.tz(lat, lon) if lat is not None and lon is not None else timezone.utc
    out: list[Launch] = []
    for r in f.data.get("results", []):
        pad = r.get("pad") or {}
        loc = pad.get("location") or {}
        plat, plon = _f(pad.get("latitude")), _f(pad.get("longitude"))
        dist = haversine_km(lat, lon, plat, plon) if None not in (lat, lon, plat, plon) else None
        net = _dt(r.get("net"))
        hint = "too far to see the trail"
        if dist is not None:
            if dist < 300:
                hint = "within 300 km: the ascent trail may be visible above the horizon in clear sky"
            elif dist < 800:
                hint = "within 800 km: a night launch can show as a faint glow or plume low on the horizon"
        out.append(
            Launch(
                id=r["id"],
                name=r.get("name", ""),
                provider=(r.get("launch_service_provider") or {}).get("name"),
                rocket=((r.get("rocket") or {}).get("configuration") or {}).get("full_name"),
                mission=(r.get("mission") or {}).get("name"),
                status=(r.get("status") or {}).get("abbrev"),
                net=net,
                net_local=net.astimezone(zone).strftime("%a %d %b %H:%M") if net else None,
                window_start=_dt(r.get("window_start")),
                window_end=_dt(r.get("window_end")),
                pad=pad.get("name"),
                location=loc.get("name"),
                pad_lat=plat,
                pad_lon=plon,
                distance_km=round(dist, 0) if dist is not None else None,
                visible_trail_hint=hint,
                webcast=next((v.get("url") for v in (r.get("vid_urls") or []) if v.get("url")), None),
                image=(r.get("image") or {}).get("image_url") if isinstance(r.get("image"), dict) else r.get("image"),
            )
        )
    return out, f.provenance


def _f(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _dt(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
