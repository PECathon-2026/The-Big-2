"""Spot discovery from OpenStreetMap (Overpass) and ranking by tonight's conditions."""
from __future__ import annotations

import asyncio
import math
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ..core.envelope import Provenance
from ..core.http import ProviderError, fetch
from . import lightpollution, openmeteo
from .score import NightScore, compute_night_score

OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

KIND_GLYPH = {
    "peak": ("mountain", "山"),
    "viewpoint": ("viewpoint", "望"),
    "shrine": ("shrine", "⛩"),
    "temple": ("temple", "寺"),
    "lake": ("lake", "湖"),
    "park": ("park", "園"),
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _query(lat: float, lon: float, radius_m: int) -> str:
    return f"""[out:json][timeout:40];
(
  node["natural"="peak"](around:{radius_m},{lat},{lon});
  node["tourism"="viewpoint"](around:{radius_m},{lat},{lon});
  nwr["amenity"="place_of_worship"]["name"](around:{radius_m},{lat},{lon});
  nwr["natural"="water"]["name"]["water"~"lake|reservoir"](around:{radius_m},{lat},{lon});
  nwr["leisure"="nature_reserve"]["name"](around:{radius_m},{lat},{lon});
);
out center 400;"""


def _kind(tags: dict[str, str]) -> str:
    if tags.get("natural") == "peak":
        return "peak"
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if tags.get("amenity") == "place_of_worship":
        rel = (tags.get("religion") or "").lower()
        return "shrine" if rel == "shinto" else "temple"
    if tags.get("natural") == "water":
        return "lake"
    return "park"


async def overpass(lat: float, lon: float, radius_km: float) -> tuple[list[dict[str, Any]], Provenance]:
    q = _query(round(lat, 3), round(lon, 3), int(radius_km * 1000))
    last: Exception | None = None
    for url in OVERPASS_SERVERS:
        try:
            f = await fetch("overpass", url, method="POST", data={"data": q}, ttl=24 * 3600, retries=1)
            els = f.data.get("elements", [])
            out = []
            for e in els:
                tags = e.get("tags", {})
                la, lo = (e.get("lat"), e.get("lon")) if e.get("type") == "node" else ((e.get("center") or {}).get("lat"), (e.get("center") or {}).get("lon"))
                if la is None or lo is None:
                    continue
                name = tags.get("name:en") or tags.get("name")
                if not name and _kind(tags) not in ("peak", "viewpoint"):
                    continue
                out.append(
                    {
                        "osm_id": f"{e['type']}/{e['id']}",
                        "name": name or ("Unnamed " + _kind(tags)),
                        "kind": _kind(tags),
                        "lat": float(la),
                        "lon": float(lo),
                        "ele": _float(tags.get("ele")),
                        "religion": tags.get("religion"),
                    }
                )
            return out, f.provenance
        except ProviderError as e:
            last = e
            continue
    raise ProviderError("overpass", str(last))


def _float(v: str | None) -> float | None:
    if not v:
        return None
    try:
        return float(str(v).replace("m", "").strip())
    except ValueError:
        return None


class Spot(BaseModel):
    osm_id: str
    name: str
    kind: str
    glyph: str
    lat: float
    lon: float
    elevation_m: float | None
    distance_km: float
    bortle: float | None
    night_score: float = Field(description="mean Night Honor Score over the best window at this spot")
    best_window: str | None
    rank_score: float = Field(description="night_score × darkness × elevation bonus − travel penalty")
    rank_trace: dict[str, float]
    verdict: str
    warnings: list[str]


class SpotsResult(BaseModel):
    origin: dict[str, float]
    radius_km: float
    candidates_found: int
    spots: list[Spot]
    formula: str


def _select_candidates(cands: list[dict[str, Any]], lat: float, lon: float, limit: int) -> list[dict[str, Any]]:
    """Diversify: prefer peaks/viewpoints, then one of each other kind, spread over distance."""
    for c in cands:
        c["distance_km"] = haversine_km(lat, lon, c["lat"], c["lon"])
    pri = {"peak": 0, "viewpoint": 1, "lake": 2, "park": 3, "shrine": 4, "temple": 5}
    cands.sort(key=lambda c: (pri.get(c["kind"], 9), c["distance_km"]))
    chosen: list[dict[str, Any]] = []
    for c in cands:
        if c["distance_km"] < 2.0:
            continue
        if any(haversine_km(c["lat"], c["lon"], d["lat"], d["lon"]) < 3.0 for d in chosen):
            continue
        same_kind = sum(1 for d in chosen if d["kind"] == c["kind"])
        cap = 8 if c["kind"] in ("peak", "viewpoint") else 3
        if same_kind >= cap:
            continue
        chosen.append(c)
        if len(chosen) >= limit:
            break
    return chosen


async def rank_spots(lat: float, lon: float, radius_km: float = 60.0, limit: int = 12, ref: datetime | None = None) -> tuple[SpotsResult, list[Provenance]]:
    prov: list[Provenance] = []
    cands, p = await overpass(lat, lon, radius_km)
    prov.append(p)
    chosen = _select_candidates(cands, lat, lon, limit)
    if not chosen:
        return SpotsResult(origin={"lat": lat, "lon": lon}, radius_km=radius_km, candidates_found=len(cands), spots=[], formula=""), prov

    points = [(c["lat"], c["lon"]) for c in chosen]
    fc, p = await openmeteo.forecast(points, days=2)
    prov.append(p)
    try:
        air, p = await openmeteo.air_quality(lat, lon, days=2)  # one AOD series for the region (coarse 40 km model anyway)
        prov.append(p)
    except ProviderError:
        air = None

    async def lp(c):
        try:
            d, p = await lightpollution.sample(c["lat"], c["lon"])
            return d["bortle"], p
        except ProviderError as e:
            return None, Provenance(source="nasa-gibs", note=str(e))

    lps = await asyncio.gather(*(lp(c) for c in chosen))
    prov.append(next((p for _, p in lps if p.source == "nasa-gibs" and p.fetched_at), lps[0][1]))

    spots: list[Spot] = []
    for c, f, (bortle, _) in zip(chosen, fc, lps):
        ns: NightScore = compute_night_score(c["lat"], c["lon"], f, air, None, bortle, ref=ref)
        night = ns.best_window.mean_score if ns.best_window else ns.verdict.score
        elev = c.get("ele") or f.get("elevation")
        elev_bonus = 1.0 + min(0.15, max(0.0, ((elev or 0) - 600) / 4000))  # +15% at 1200 m above a 600 m base
        darkness = 1.0 if bortle is None else (9 - bortle) / 8 * 0.5 + 0.5  # 0.5..1.0
        travel = min(25.0, c["distance_km"] * 0.25)  # 1 pt per 4 km, capped at 25
        rank = round(night * darkness * elev_bonus - travel, 1)
        spots.append(
            Spot(
                osm_id=c["osm_id"],
                name=c["name"],
                kind=c["kind"],
                glyph=KIND_GLYPH.get(c["kind"], ("spot", "・"))[1],
                lat=c["lat"],
                lon=c["lon"],
                elevation_m=elev,
                distance_km=round(c["distance_km"], 1),
                bortle=bortle,
                night_score=round(night, 1),
                best_window=f"{ns.best_window.start_local}–{ns.best_window.end_local}" if ns.best_window else None,
                rank_score=rank,
                rank_trace={"night_score": round(night, 1), "darkness_factor": round(darkness, 3), "elevation_bonus": round(elev_bonus, 3), "travel_penalty": round(travel, 1)},
                verdict=ns.verdict.verdict,
                warnings=ns.warnings,
            )
        )
    spots.sort(key=lambda s: s.rank_score, reverse=True)
    return (
        SpotsResult(
            origin={"lat": lat, "lon": lon},
            radius_km=radius_km,
            candidates_found=len(cands),
            spots=spots,
            formula="rank = night_score × (0.5 + 0.5·(9−Bortle)/8) × (1 + min(0.15, (elev−600)/4000)) − min(25, 0.25·km)",
        ),
        prov,
    )
