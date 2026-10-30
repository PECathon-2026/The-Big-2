"""The observing planner: for a target, equipment, time budget and travel limit, find the best (place, time)
and explain what would change the answer.

For every candidate spot and every 15-minute step of the night we test the constraints in order
(daylight → altitude → moon → cloud → light pollution). The first failing one is the *binding* constraint
for that step, so the night can be summarised as "blocked 2 h by the Moon, 1 h by cloud". Usable minutes are
weighted by sky quality (cloud and moonlight), travel time is subtracted, and forecast disagreement
(ensemble spread) is a penalty rather than a probability.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

import astronomy as ae
from pydantic import BaseModel, Field

from ..core import astro
from ..core.compute import in_thread
from ..core.envelope import Provenance, Trace
from ..core.http import ProviderError
from ..watchtower import lightpollution, openmeteo, spots
from .targets import Target

STEP_MIN = 15
EQUIPMENT = {
    "eyes": {"min_alt": 15.0, "label": "Naked eye"},
    "binoculars": {"min_alt": 20.0, "label": "Binoculars"},
    "telescope": {"min_alt": 25.0, "label": "Telescope"},
    "camera": {"min_alt": 30.0, "label": "Camera on a tracker"},
}
SUN_LIMIT = {"moon": -6.0, "planet": -6.0, "star": -12.0, "deepsky": -18.0}
AVG_SPEED_KMH = 40.0


class Window(BaseModel):
    start: datetime
    end: datetime
    start_local: str
    end_local: str
    minutes: int


class Step(BaseModel):
    time: datetime
    local: str
    status: str = Field(description="usable | daylight | altitude | moon | cloud | light_pollution")
    target_alt: float
    moon_alt: float
    cloud: float | None
    quality: float


class Candidate(BaseModel):
    name: str
    kind: str
    lat: float
    lon: float
    distance_km: float
    travel_minutes: int
    bortle: float | None
    usable_minutes: int
    mean_quality: float
    blocked_minutes: dict[str, int]
    windows: list[Window]
    net_score: float
    timeline: list[Step]


class Counterfactual(BaseModel):
    question: str
    answer: str
    usable_minutes_best: int
    delta_minutes: int
    best_spot: str
    best_spot_changes: bool


class Plan(BaseModel):
    target: dict[str, Any]
    equipment: str
    min_altitude: float
    sun_limit: float
    date_local: str
    timezone: str
    night: dict[str, str]
    window: dict[str, str]
    travel_limit_km: float
    candidates: list[Candidate]
    best: Candidate | None
    recommendation: str
    counterfactuals: list[Counterfactual]
    moonset_local: str | None
    forecast_spread_pct: float | None
    trace: Trace


def _moon_blocks(kind: str, moon_alt: float, illum: float, sep: float) -> bool:
    if kind == "moon" or moon_alt <= 0:
        return False
    if kind == "planet":
        return sep < 5
    if kind == "star":
        return illum > 0.7 and sep < 20
    return (illum > 0.25 and sep < 60) or illum > 0.6  # deep sky


def _moon_quality(moon_alt: float, illum: float) -> float:
    if moon_alt <= 0:
        return 1.0
    return 1 - illum * min(1.0, 1.4 * math.sin(math.radians(moon_alt)))


def _evaluate(
    target: Target,
    kind: str,
    min_alt: float,
    sun_limit: float,
    lat: float,
    lon: float,
    forecast: dict[str, Any] | None,
    bortle: float | None,
    t0: datetime,
    t1: datetime,
    zone,
    mask: list[float] | None = None,
) -> tuple[list[Step], dict[str, int]]:
    from ..horizon.terrain import mask_at

    obs = astro.observer(lat, lon)
    steps: list[Step] = []
    blocked = {k: 0 for k in ("daylight", "altitude", "moon", "cloud", "light_pollution")}
    times = forecast["time"] if forecast else []
    t = t0
    while t < t1:
        sun = astro.sun_alt(t, obs)
        alt, az = target.altaz(t, obs)
        floor = max(min_alt, mask_at(mask, az) + 2.0) if mask else min_alt  # the real skyline plus a little margin
        m_alt, _ = astro.altaz(ae.Body.Moon, t, obs)
        illum = astro.moon_illumination(t)
        tra, tdec = target.radec(t, obs)
        meq = ae.Equator(ae.Body.Moon, astro.to_time(t), obs, True, True)
        sep = astro.angular_separation(tra / 15.0, tdec, meq.ra, meq.dec)
        cloud = None
        if times:
            i = min(range(len(times)), key=lambda k: abs((times[k] - t).total_seconds()))
            if abs((times[i] - t).total_seconds()) <= 3600:
                lo = (forecast.get("cloud_cover_low") or [None])[i] if i < len(forecast.get("cloud_cover_low") or []) else None
                mid = (forecast.get("cloud_cover_mid") or [None])[i] if i < len(forecast.get("cloud_cover_mid") or []) else None
                if lo is not None:
                    cloud = float(lo) + 0.7 * float(mid or 0)
        status = "usable"
        if sun > sun_limit:
            status = "daylight"
        elif alt < floor:
            status = "altitude"
        elif _moon_blocks(kind, m_alt, illum, sep):
            status = "moon"
        elif cloud is not None and cloud > 50:
            status = "cloud"
        elif kind == "deepsky" and bortle is not None and bortle > 6.5:
            status = "light_pollution"
        q = (1 - min(cloud or 0.0, 100) / 100) * _moon_quality(m_alt, illum) if status == "usable" else 0.0
        if status != "usable":
            blocked[status] += STEP_MIN
        steps.append(Step(time=t, local=t.astimezone(zone).strftime("%H:%M"), status=status, target_alt=round(alt, 1), moon_alt=round(m_alt, 1), cloud=None if cloud is None else round(cloud, 0), quality=round(q, 3)))
        t += timedelta(minutes=STEP_MIN)
    return steps, blocked


def _windows(steps: list[Step], zone) -> list[Window]:
    out: list[Window] = []
    run: list[Step] = []
    for s in steps + [None]:  # type: ignore[list-item]
        if s is not None and s.status == "usable":
            run.append(s)
            continue
        if run:
            end = run[-1].time + timedelta(minutes=STEP_MIN)
            out.append(Window(start=run[0].time, end=end, start_local=run[0].time.astimezone(zone).strftime("%H:%M"), end_local=end.astimezone(zone).strftime("%H:%M"), minutes=len(run) * STEP_MIN))
            run = []
    return out


def _candidate(name: str, kind: str, lat: float, lon: float, dist: float, bortle: float | None, steps: list[Step], blocked: dict[str, int], zone, spread: float | None) -> Candidate:
    usable = [s for s in steps if s.status == "usable"]
    usable_min = len(usable) * STEP_MIN
    mean_q = sum(s.quality for s in usable) / len(usable) if usable else 0.0
    travel = int(round(dist / AVG_SPEED_KMH * 60))
    uncertainty = (spread or 0.0) / 100.0
    net = usable_min * mean_q * (1 - 0.5 * uncertainty) - 0.5 * travel  # half the one-way drive, as the night is the reward
    return Candidate(name=name, kind=kind, lat=lat, lon=lon, distance_km=round(dist, 1), travel_minutes=travel, bortle=bortle, usable_minutes=usable_min, mean_quality=round(mean_q, 3), blocked_minutes=blocked, windows=_windows(steps, zone), net_score=round(net, 1), timeline=steps)


async def make_plan(
    target: Target,
    lat: float,
    lon: float,
    equipment: str = "eyes",
    date: datetime | None = None,
    earliest_local: str | None = None,
    latest_local: str | None = None,
    travel_limit_km: float = 60.0,
    candidate_limit: int = 6,
) -> tuple[Plan, list[Provenance]]:
    prov: list[Provenance] = []
    kind = target.kind
    eq = EQUIPMENT.get(equipment, EQUIPMENT["eyes"])
    min_alt, sun_limit = eq["min_alt"], SUN_LIMIT.get(kind, -18.0)
    zone = astro.tz(lat, lon)
    ref = (date or datetime.now(timezone.utc)).astimezone(timezone.utc)
    sunset, dusk, dawn, sunrise = await in_thread(astro.night_bounds, lat, lon, ref)

    def local_clock(hhmm: str, base: datetime, after: datetime | None = None) -> datetime:
        h, m = (int(x) for x in hhmm.split(":"))
        d = base.astimezone(zone).replace(hour=h, minute=m, second=0, microsecond=0)
        if after is not None and d < after.astimezone(zone):
            d += timedelta(days=1)
        return d.astimezone(timezone.utc)

    t0 = max(sunset, local_clock(earliest_local, sunset) if earliest_local else sunset)
    t1 = min(sunrise, local_clock(latest_local, sunset, after=t0) if latest_local else sunrise)
    if t1 <= t0:
        t0, t1 = sunset, sunrise

    # candidates: home + spots within travel_limit + 50 km (so the "drive farther" question can be answered)
    cands: list[dict[str, Any]] = [{"name": "Where you are", "kind": "home", "lat": lat, "lon": lon, "distance_km": 0.0, "bortle": None}]
    wide = min(150.0, travel_limit_km + 50)
    res = None
    for radius in (wide, travel_limit_km, 60.0):  # fall back to a radius that is probably cached (Watchtower default)
        try:
            res, p = await spots.rank_spots(lat, lon, radius_km=radius, limit=candidate_limit + 4, ref=ref)
            prov += p
            if radius < wide:
                prov.append(Provenance(source="overpass", note=f"used cached spots within {radius:.0f} km; the wider {wide:.0f} km query was unavailable, so 'drive farther' answers are limited"))
            break
        except ProviderError as e:
            last_err = e
    if res is None:
        prov.append(Provenance(source="overpass", note=f"no spots: {last_err}; planning for your location only"))
    else:
        for s in res.spots:
            cands.append({"name": s.name, "kind": s.kind, "lat": s.lat, "lon": s.lon, "distance_km": s.distance_km, "bortle": s.bortle})
    try:
        lp, p = await lightpollution.sample(lat, lon)
        cands[0]["bortle"] = lp["bortle"]
        prov.append(p)
    except ProviderError:
        pass

    # one forecast call for every candidate
    forecasts: list[dict[str, Any] | None] = [None] * len(cands)
    try:
        fc, p = await openmeteo.forecast([(c["lat"], c["lon"]) for c in cands], days=3)
        prov.append(p)
        forecasts = list(fc)
    except ProviderError as e:
        prov.append(Provenance(source="open-meteo", note=f"no forecast: {e}; cloud constraint skipped"))
    spread = None
    try:
        ens, p = await openmeteo.ensemble_cloud_spread(lat, lon, days=2)
        prov.append(p)
        vals = [v for t_, v in zip(ens["time"], ens["cloud_spread"]) if v is not None and t0 <= t_ <= t1]
        spread = round(sum(vals) / len(vals), 1) if vals else None
    except ProviderError:
        pass

    # the real skyline at home (terrain from the elevation model); spots are assumed to have an open horizon
    home_mask: list[float] | None = None
    try:
        from ..horizon.terrain import terrain_horizon

        home_mask, _, p_h = await terrain_horizon(lat, lon)
        prov += p_h
        if max(home_mask) < 1.0:
            home_mask = None
    except ProviderError as e:
        prov.append(Provenance(source="open-meteo-elevation", note=f"terrain horizon unavailable: {e}"))

    def evaluate_all(start: datetime, end: datetime, limit_km: float) -> list[Candidate]:
        out = []
        for c, f in zip(cands, forecasts):
            if c["distance_km"] > limit_km:
                continue
            steps, blocked = _evaluate(target, kind, min_alt, sun_limit, c["lat"], c["lon"], f, c["bortle"], start, end, zone, mask=home_mask if c["kind"] == "home" else None)
            out.append(_candidate(c["name"], c["kind"], c["lat"], c["lon"], c["distance_km"], c["bortle"], steps, blocked, zone, spread))
        out.sort(key=lambda x: x.net_score, reverse=True)
        return out

    # the base ranking, the two "leave later" and the two "drive farther" what-ifs: five sweeps of every candidate
    # at 15-minute steps, all pure astronomy, so they run together in one worker thread
    def sweep_all():
        base = evaluate_all(t0, t1, travel_limit_km)
        later = {hours: evaluate_all(t0 + timedelta(hours=hours), t1, travel_limit_km) for hours in (1, 2)}
        farther = {extra: evaluate_all(t0, t1, travel_limit_km + extra) for extra in (20, 50)}
        _, moonset = astro.rise_set(ae.Body.Moon, astro.observer(lat, lon), t0, 1.0)
        return base, later, farther, moonset

    ranked, later_runs, farther_runs, moonset = await in_thread(sweep_all)
    best = ranked[0] if ranked and ranked[0].usable_minutes > 0 else None

    # moonset tonight, if the Moon is up during the window
    moonset_local = moonset.astimezone(zone).strftime("%H:%M") if moonset and t0 <= moonset <= t1 else None

    # counterfactuals
    cfs: list[Counterfactual] = []
    base_best_name = best.name if best else "nowhere"
    base_min = best.usable_minutes if best else 0

    for hours in (1, 2):
        alt = later_runs[hours]
        ab = alt[0] if alt and alt[0].usable_minutes > 0 else None
        amin = ab.usable_minutes if ab else 0
        cfs.append(Counterfactual(
            question=f"Would leaving {hours} h later help?",
            answer=(f"No: you would lose {base_min - amin} usable minutes." if amin < base_min else f"It costs nothing: {amin} usable minutes either way." if amin == base_min else f"Yes: {amin - base_min} more usable minutes."),
            usable_minutes_best=amin, delta_minutes=amin - base_min, best_spot=ab.name if ab else "nowhere", best_spot_changes=(ab.name if ab else "nowhere") != base_best_name,
        ))
    for extra in (20, 50):
        alt = farther_runs[extra]
        ab = alt[0] if alt and alt[0].usable_minutes > 0 else None
        amin = ab.usable_minutes if ab else 0
        changes = (ab.name if ab else "nowhere") != base_best_name
        cfs.append(Counterfactual(
            question=f"Would driving up to {extra} km farther help?",
            answer=(f"Yes: {ab.name} ({ab.distance_km} km) gives {amin} usable minutes, {amin - base_min:+d} vs {base_best_name}." if changes and ab else "No: nothing within the extra distance beats the current best."),
            usable_minutes_best=amin, delta_minutes=amin - base_min, best_spot=ab.name if ab else "nowhere", best_spot_changes=changes,
        ))
    if best and best.blocked_minutes.get("moon", 0) > 0 and moonset_local:
        cfs.append(Counterfactual(question="What if I wait for moonset?", answer=f"The Moon sets at {moonset_local}; {best.blocked_minutes['moon']} minutes before that are blocked by moonlight at {best.name}.", usable_minutes_best=base_min, delta_minutes=0, best_spot=base_best_name, best_spot_changes=False))

    # recommendation
    if best:
        w = max(best.windows, key=lambda w: w.minutes)
        biggest = max(best.blocked_minutes.items(), key=lambda kv: kv[1])
        rec = f"Go to {best.name}" + (f" ({best.distance_km} km, about {best.travel_minutes} min)" if best.distance_km > 0 else "") + f" and observe {target.name} between {w.start_local} and {w.end_local} ({w.minutes} min)."
        if biggest[1] > 0:
            rec += f" The main loss tonight is {biggest[0].replace('_', ' ')} ({biggest[1]} min)."
    else:
        # say what blocks it, and when that changes
        totals: dict[str, int] = {}
        for c in ranked:
            for k, v in c.blocked_minutes.items():
                totals[k] = totals.get(k, 0) + v
        blocker = max(totals.items(), key=lambda kv: kv[1])[0] if totals else "daylight"
        rec = f"{target.name} is not observable tonight within your limits: the whole window is blocked, mostly by {blocker.replace('_', ' ')}."
        if blocker == "moon":
            illum = astro.moon_illumination(t0 + (t1 - t0) / 2)
            rec += f" The Moon is {illum * 100:.0f}% lit tonight."
            d = ref
            for _ in range(25):
                d += timedelta(days=1)
                if astro.moon_illumination(d) < 0.5:
                    rec += f" It drops below 50% on {d.astimezone(zone).strftime('%d %b')}; plan for that week."
                    break
        elif blocker == "altitude":
            obs_h = astro.observer(lat, lon)
            peak = max(target.altaz(t0 + timedelta(minutes=15 * i), obs_h)[0] for i in range(int((t1 - t0).total_seconds() // 900) + 1))
            rec += f" It only reaches {peak:.0f}° above the horizon tonight; {EQUIPMENT.get(equipment, EQUIPMENT['eyes'])['label']} needs {min_alt:.0f}°." + (" Try a different season or a site with a lower horizon." if peak > 0 else " It does not rise from this latitude.")
        elif blocker == "cloud":
            rec += " The forecast is overcast for the whole window; check again tomorrow."
        elif blocker == "light_pollution":
            rec += " Every candidate is too bright for a faint target; widen the travel limit."
    trace = Trace(
        formula="usable = steps where sun<limit, alt≥min, Moon ok, cloud≤50%, Bortle ok; net = usable·quality·(1−spread/200) − travel/2",
        inputs={"equipment": eq, "sun_limit": sun_limit, "step_minutes": STEP_MIN, "avg_speed_kmh": AVG_SPEED_KMH, "moon_rule": "planet: sep≥5°; star: not (illum>0.7 & sep<20°); deep sky: not (illum>0.25 & sep<60°) and illum≤0.6", "cloud_rule": "low + 0.7·mid ≤ 50%", "light_pollution_rule": "deep sky needs Bortle ≤ 6.5 where known"},
        notes=["binding constraint = first failing test per 15-min step", "forecast spread is the ensemble std-dev of cloud cover, used as a penalty, not a probability"],
    )
    plan = Plan(
        target=target.describe(), equipment=equipment, min_altitude=min_alt, sun_limit=sun_limit,
        date_local=sunset.astimezone(zone).strftime("%Y-%m-%d"), timezone=astro.tz_name(lat, lon),
        night={"sunset": sunset.astimezone(zone).strftime("%H:%M"), "dusk": dusk.astimezone(zone).strftime("%H:%M"), "dawn": dawn.astimezone(zone).strftime("%H:%M"), "sunrise": sunrise.astimezone(zone).strftime("%H:%M")},
        window={"start": t0.astimezone(zone).strftime("%H:%M"), "end": t1.astimezone(zone).strftime("%H:%M")},
        travel_limit_km=travel_limit_km, candidates=ranked, best=best, recommendation=rec, counterfactuals=cfs,
        moonset_local=moonset_local, forecast_spread_pct=spread, trace=trace,
    )
    return plan, prov
