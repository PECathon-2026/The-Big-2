"""The personal horizon: how high the real skyline is in every compass direction.

Terrain part: sample the digital elevation model along each bearing out to RANGE_KM and keep the highest
elevation angle (Earth curvature included). Manual part: points the user traced on a panorama (azimuth, altitude).
The mask is the maximum of both, on a 5° azimuth grid, and any celestial path can be intersected with it.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import BaseModel, Field

from ..core import astro
from ..core.envelope import Provenance
from ..watchtower import openmeteo

AZ_STEP = 5
N_AZ = 360 // AZ_STEP
SAMPLE_AZ_STEP = 10  # bearings actually sampled from the DEM; the 5° grid is interpolated
RANGE_KM = 30.0
R_EARTH_KM = 6371.0
# log-spaced sample distances so nearby hills get fine resolution and far ridges are still seen
DISTANCES_KM = [0.3, 0.6, 1.0, 1.6, 2.5, 4.0, 6.0, 9.0, 13.0, 18.0, 24.0, 30.0]


def destination(lat: float, lon: float, bearing_deg: float, dist_km: float) -> tuple[float, float]:
    b, p1, l1 = math.radians(bearing_deg), math.radians(lat), math.radians(lon)
    d = dist_km / R_EARTH_KM
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180


def elevation_angle(h_obs_m: float, h_m: float, dist_km: float) -> float:
    """Angle above the horizontal to a point `dist_km` away at height `h_m`, with the Earth's curvature drop."""
    drop_m = (dist_km * 1000) ** 2 / (2 * R_EARTH_KM * 1000)
    return math.degrees(math.atan2(h_m - h_obs_m - drop_m, dist_km * 1000))


class MaskPoint(BaseModel):
    az: float = Field(ge=0, le=360)
    alt: float = Field(ge=0, le=90)


class Horizon(BaseModel):
    lat: float
    lon: float
    observer_elevation_m: float
    az_step: int
    terrain: list[float] = Field(description="elevation angle (deg) of the terrain horizon for each 5° azimuth bin, starting at north")
    manual: list[float] = Field(description="same grid, from the user's traced points (0 where none)")
    mask: list[float] = Field(description="max(terrain, manual)")
    highest: dict[str, Any]
    mean_deg: float
    sky_fraction_lost: float = Field(description="fraction of the sky dome below the mask, 0..1")
    note: str


async def terrain_horizon(lat: float, lon: float) -> tuple[list[float], float, list[Provenance]]:
    """Elevation angle per azimuth bin from the DEM, and the observer's own elevation."""
    import asyncio

    n_sample = 360 // SAMPLE_AZ_STEP
    points: list[tuple[float, float]] = [(lat, lon)]
    for i in range(n_sample):
        az = i * SAMPLE_AZ_STEP
        for d in DISTANCES_KM:
            points.append(destination(lat, lon, az, d))
    heights: list[float] = []
    prov: list[Provenance] = []
    for k in range(0, len(points), 100):  # the elevation API takes up to 100 coordinates per call; go gently
        chunk = points[k : k + 100]
        h, p = await openmeteo.elevation(chunk)
        heights += [float(x) if x is not None else 0.0 for x in h]
        if k == 0:
            prov.append(p)
        if not p.cached and p.source != "replay":
            await asyncio.sleep(0.25)  # pause between live calls only; cached chunks must not add a second of latency
    h_obs = heights[0] + 2.0  # eye height
    sampled = []
    idx = 1
    for i in range(n_sample):
        best = 0.0
        for d in DISTANCES_KM:
            best = max(best, elevation_angle(h_obs, heights[idx], d))
            idx += 1
        sampled.append(best)
    # interpolate the sampled bearings onto the 5° output grid
    mask = []
    ratio = SAMPLE_AZ_STEP // AZ_STEP
    for i in range(N_AZ):
        j, f = divmod(i, ratio)
        a, b = sampled[j % n_sample], sampled[(j + 1) % n_sample]
        mask.append(round(a + (b - a) * f / ratio, 2))
    return mask, heights[0], prov


def manual_grid(points: list[MaskPoint]) -> list[float]:
    """Linear interpolation of traced points around the compass; empty → all zeros."""
    grid = [0.0] * N_AZ
    if not points:
        return grid
    pts = sorted(((p.az % 360, p.alt) for p in points), key=lambda x: x[0])
    if len(pts) == 1:
        return [pts[0][1]] * N_AZ
    for i in range(N_AZ):
        az = i * AZ_STEP
        # find neighbours around az (wrapping)
        prev = max((p for p in pts if p[0] <= az), default=None) or (pts[-1][0] - 360, pts[-1][1])
        nxt = min((p for p in pts if p[0] > az), default=None) or (pts[0][0] + 360, pts[0][1])
        span = nxt[0] - prev[0]
        t = (az - prev[0]) / span if span > 0 else 0.0
        grid[i] = round(prev[1] + (nxt[1] - prev[1]) * t, 2)
    return grid


def mask_at(mask: list[float], az: float) -> float:
    i = int(round((az % 360) / AZ_STEP)) % N_AZ
    return mask[i]


def build(lat: float, lon: float, terrain: list[float], h_obs: float, points: list[MaskPoint]) -> Horizon:
    manual = manual_grid(points)
    mask = [round(max(t, m), 2) for t, m in zip(terrain, manual)]
    hi = max(range(N_AZ), key=lambda i: mask[i])
    # sky fraction below the mask: integrate (1 - sin(h)) over azimuth? Area of a cap of altitude h is sin(h) of the dome.
    lost = sum(math.sin(math.radians(min(90.0, m))) for m in mask) / N_AZ
    comp = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return Horizon(
        lat=lat, lon=lon, observer_elevation_m=round(h_obs, 1), az_step=AZ_STEP, terrain=terrain, manual=manual, mask=mask,
        highest={"az": hi * AZ_STEP, "compass": comp[int(((hi * AZ_STEP) + 11.25) // 22.5) % 16], "alt": mask[hi]},
        mean_deg=round(sum(mask) / N_AZ, 2), sky_fraction_lost=round(lost, 3),
        note=f"terrain from a 90 m digital elevation model (Open-Meteo) sampled at {len(DISTANCES_KM)} distances out to {RANGE_KM:.0f} km every {SAMPLE_AZ_STEP}° of bearing, interpolated to 5°; manual points interpolated linearly",
    )


class Crossing(BaseModel):
    kind: str = Field(description="rises_above_mask | sets_below_mask")
    time: datetime
    local: str
    az: float
    alt: float
    mask_alt: float


class PathReport(BaseModel):
    target: str
    geometric_rise_local: str | None
    geometric_set_local: str | None
    crossings: list[Crossing]
    minutes_above_geometric: int
    minutes_above_mask: int
    minutes_lost_to_skyline: int
    sentence: str
    path: list[dict[str, Any]]


def path_vs_mask(target, lat: float, lon: float, mask: list[float], t0: datetime, t1: datetime, step_min: int = 5) -> PathReport:
    """Intersect a target's path (alt/az over time) with the mask and report when it truly clears the skyline."""
    obs = astro.observer(lat, lon)
    zone = astro.tz(lat, lon)
    fmt = lambda d: d.astimezone(zone).strftime("%H:%M")  # noqa: E731
    path = []
    t = t0
    prev_geo = prev_mask = None
    rise = sett = None
    crossings: list[Crossing] = []
    above_geo = above_mask = 0
    while t <= t1:
        alt, az = target.altaz(t, obs)
        m = mask_at(mask, az)
        geo, msk = alt > 0, alt > m
        if prev_geo is not None and geo != prev_geo:
            if geo:
                rise = rise or t
            else:
                sett = sett or t
        if prev_mask is not None and msk != prev_mask:
            crossings.append(Crossing(kind="rises_above_mask" if msk else "sets_below_mask", time=t, local=fmt(t), az=round(az, 1), alt=round(alt, 1), mask_alt=round(m, 1)))
        if geo:
            above_geo += step_min
        if msk:
            above_mask += step_min
        path.append({"time": t.isoformat(), "local": fmt(t), "alt": round(alt, 1), "az": round(az, 1), "mask_alt": round(m, 1), "visible": msk})
        prev_geo, prev_mask = geo, msk
        t += timedelta(minutes=step_min)
    first_up = next((c for c in crossings if c.kind == "rises_above_mask"), None)
    if above_mask == 0:
        sentence = f"{target.name} never clears your skyline tonight."
    elif first_up and rise:
        sentence = f"{target.name} rises at {fmt(rise)} but clears your skyline only at {first_up.local} ({first_up.mask_alt:.0f}° high toward {int(first_up.az)}°)."
    elif first_up:
        sentence = f"{target.name} clears your skyline at {first_up.local}."
    else:
        sentence = f"{target.name} is above your skyline for the whole window."
    return PathReport(
        target=target.name, geometric_rise_local=fmt(rise) if rise else None, geometric_set_local=fmt(sett) if sett else None,
        crossings=crossings, minutes_above_geometric=above_geo, minutes_above_mask=above_mask, minutes_lost_to_skyline=above_geo - above_mask,
        sentence=sentence, path=path,
    )
