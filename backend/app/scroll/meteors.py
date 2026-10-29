"""Meteor showers: which are active, and the expected hourly rate from this observer tonight.

expected_rate(hour) = ZHR_now × sin(radiant altitude) × r^(6.5 − LM)

ZHR_now follows a simple exponential activity profile around the peak (full ZHR at peak, halving every 2 days away).
LM is the limiting magnitude: 6.5 at a pristine site, reduced by light pollution (Bortle) and by moonlight.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pydantic import BaseModel

from ..core import astro
from ..core.envelope import Trace

DATA = Path(__file__).resolve().parents[2] / "data" / "meteor_showers.json"


def _load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def _date(md: str, year: int) -> datetime:
    m, d = md.split("-")
    return datetime(year, int(m), int(d), tzinfo=timezone.utc)


def limiting_magnitude(bortle: float | None, moon_alt: float, moon_illum: float) -> tuple[float, str]:
    lm = 6.5 - 0.45 * ((bortle or 4.0) - 1)  # 6.5 at Bortle 1 → ~2.9 at Bortle 9
    note = f"LM base 6.5 − 0.45·(Bortle−1) with Bortle {bortle if bortle is not None else '4 (assumed)'}"
    if moon_alt > 0:
        pen = 2.2 * moon_illum * min(1.0, math.sin(math.radians(moon_alt)) * 1.4)
        lm -= pen
        note += f"; moon up ({moon_illum*100:.0f}% lit) −{pen:.1f}"
    return max(2.0, lm), note


class HourRate(BaseModel):
    time: datetime
    time_local: str
    radiant_alt: float
    limiting_magnitude: float
    rate_per_hour: float


class Shower(BaseModel):
    code: str
    name: str
    jp: str
    active_from: datetime
    active_to: datetime
    peak: datetime
    days_from_peak: float
    zhr_peak: int
    zhr_now: float
    population_index: float
    velocity_kms: int
    radiant_ra: float
    radiant_dec: float
    is_peak_night: bool
    best_hour: HourRate | None
    hours: list[HourRate]
    trace: Trace


def active_showers(lat: float, lon: float, at: datetime | None = None, bortle: float | None = None, elev_m: float = 0.0) -> list[Shower]:
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    obs = astro.observer(lat, lon, elev_m)
    zone = astro.tz(lat, lon)
    sunset, dusk, dawn, sunrise = astro.night_bounds(lat, lon, at)
    out: list[Shower] = []
    for s in _load()["showers"]:
        # resolve the shower's dates for the year that makes it active around `at`
        candidates = []
        for y in (at.year - 1, at.year, at.year + 1):
            start = _date(s["start"], y)
            end = _date(s["end"], y)
            if end < start:  # wraps the year (Quadrantids)
                end = _date(s["end"], y + 1)
            peak = _date(s["peak"], y)
            if peak < start:
                peak = _date(s["peak"], y + 1)
            candidates.append((start, end, peak))
        act = next(((st, en, pk) for st, en, pk in candidates if st - timedelta(days=1) <= at <= en + timedelta(days=1)), None)
        if not act:
            continue
        start, end, peak = act
        dpk = (at - peak).total_seconds() / 86400
        zhr_now = s["zhr"] * 0.5 ** (abs(dpk) / 2.0)
        hours: list[HourRate] = []
        t = dusk.replace(minute=0, second=0, microsecond=0)
        while t <= dawn:
            r_alt, _ = astro.radec_to_altaz(s["ra"] / 15.0, s["dec"], t, obs)
            m_alt = astro.moon_alt(t, obs)
            m_ill = astro.moon_illumination(t)
            lm, _ = limiting_magnitude(bortle, m_alt, m_ill)
            rate = zhr_now * max(0.0, math.sin(math.radians(r_alt))) * s["r"] ** (6.5 - lm) if r_alt > 0 else 0.0
            hours.append(HourRate(time=t, time_local=t.astimezone(zone).strftime("%H:%M"), radiant_alt=round(r_alt, 1), limiting_magnitude=round(lm, 2), rate_per_hour=round(rate, 1)))
            t += timedelta(hours=1)
        best = max(hours, key=lambda h: h.rate_per_hour) if hours else None
        _, lm_note = limiting_magnitude(bortle, 0.0, 0.0)
        out.append(
            Shower(
                code=s["code"],
                name=s["name"],
                jp=s["jp"],
                active_from=start,
                active_to=end,
                peak=peak,
                days_from_peak=round(dpk, 1),
                zhr_peak=s["zhr"],
                zhr_now=round(zhr_now, 1),
                population_index=s["r"],
                velocity_kms=s["velocity_kms"],
                radiant_ra=s["ra"],
                radiant_dec=s["dec"],
                is_peak_night=abs(dpk) <= 1.0,
                best_hour=best,
                hours=hours,
                trace=Trace(
                    formula="rate = ZHR_now × sin(radiant alt) × r^(6.5 − LM); ZHR_now = ZHR × 0.5^(|days from peak|/2)",
                    inputs={"shower": s, "limiting_magnitude": lm_note, "radiant": "fixed at peak position (drift ignored)"},
                    notes=["IMO working-list values", "observer darkness from astronomy-engine", "moon altitude and illumination per hour"],
                ),
            )
        )
    out.sort(key=lambda s: -(s.best_hour.rate_per_hour if s.best_hour else 0))
    return out
