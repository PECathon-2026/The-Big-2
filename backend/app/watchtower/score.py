"""The Night Honor Score: an explainable, hour-by-hour stargazing quality model.

score(hour) = darkness_gate(sun altitude) x 100 x sum_i( w_i x q_i )

Each factor q_i is a quality in [0, 1] (1 = perfect). Weights sum to 1. If a factor is unknown (e.g. light pollution
not sampled) it is excluded and the remaining weights are renormalised, and the trace says so.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

import astronomy as ae
from pydantic import BaseModel, Field

from ..core import astro
from ..core.envelope import Contribution, Trace

WEIGHTS: dict[str, tuple[float, str]] = {
    "cloud_low": (0.30, "Low cloud"),
    "cloud_mid": (0.15, "Mid cloud"),
    "cloud_high": (0.08, "High cloud"),
    "humidity": (0.12, "Humidity / dew risk"),
    "transparency": (0.10, "Transparency (visibility, aerosols)"),
    "moon": (0.15, "Moonlight"),
    "light_pollution": (0.10, "Light pollution"),
}

FORMULA = "score = darkness(sun_alt) × 100 × Σ wᵢ·qᵢ ; q in [0,1]; weights: " + ", ".join(
    f"{k}={w}" for k, (w, _) in WEIGHTS.items()
)


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def darkness_gate(sun_alt: float) -> float:
    """1 in astronomical night (< -18°), tapering to 0 at civil twilight (-6°)."""
    if sun_alt <= -18:
        return 1.0
    if sun_alt >= -6:
        return 0.0
    return clamp((-6 - sun_alt) / 12.0)


def factor_qualities(
    *,
    cloud_low: float | None,
    cloud_mid: float | None,
    cloud_high: float | None,
    humidity: float | None,
    visibility_m: float | None,
    aod: float | None,
    moon_alt: float,
    moon_illum: float,
    bortle: float | None,
) -> dict[str, tuple[float | None, float | None, str | None, str | None]]:
    """Returns factor -> (raw value, quality, unit, note)."""
    q: dict[str, tuple[float | None, float | None, str | None, str | None]] = {}
    q["cloud_low"] = (cloud_low, None if cloud_low is None else 1 - cloud_low / 100, "%", None)
    q["cloud_mid"] = (cloud_mid, None if cloud_mid is None else 1 - cloud_mid / 100, "%", None)
    q["cloud_high"] = (cloud_high, None if cloud_high is None else 1 - 0.6 * cloud_high / 100, "%", "high cloud is thin; weighted 0.6")
    if humidity is None:
        q["humidity"] = (None, None, "%", None)
    else:
        q["humidity"] = (humidity, 1.0 if humidity <= 60 else clamp(1 - (humidity - 60) / 40), "%", "linear penalty above 60% RH")
    # transparency: visibility saturates at 20 km; aerosol optical depth penalises above 0.1
    tq = []
    if visibility_m is not None:
        tq.append(clamp(visibility_m / 20000))
    if aod is not None:
        tq.append(clamp(1 - (aod - 0.1) / 0.6))
    q["transparency"] = (
        aod if aod is not None else visibility_m,
        (sum(tq) / len(tq)) if tq else None,
        "AOD" if aod is not None else "m",
        "mean of visibility/20km and 1-(AOD-0.1)/0.6",
    )
    # moonlight: only hurts when the Moon is above the horizon; scaled by illumination and altitude
    moon_pen = moon_illum * clamp(math.sin(math.radians(max(0.0, moon_alt))) * 1.4) if moon_alt > 0 else 0.0
    q["moon"] = (round(moon_illum * 100, 1), 1 - moon_pen, "% lit", f"moon altitude {moon_alt:.0f}°")
    q["light_pollution"] = (bortle, None if bortle is None else clamp((9 - bortle) / 8), "Bortle", None)
    return q


def score_hour(sun_alt: float, qualities: dict[str, tuple[float | None, float | None, str | None, str | None]]) -> tuple[float, list[Contribution], float]:
    present = {k: v for k, v in qualities.items() if v[1] is not None}
    total_w = sum(WEIGHTS[k][0] for k in present)
    gate = darkness_gate(sun_alt)
    contribs: list[Contribution] = []
    raw_sum = 0.0
    for k, (w, label) in WEIGHTS.items():
        val, qual, unit, note = qualities[k]
        if qual is None:
            contribs.append(Contribution(factor=k, label=label, value=val, unit=unit, quality=None, weight=0.0, contribution=0.0, penalty=0.0, note="unknown, excluded"))
            continue
        wn = w / total_w if total_w else 0.0
        raw_sum += wn * qual
        contribs.append(
            Contribution(
                factor=k,
                label=label,
                value=val,
                unit=unit,
                quality=round(qual, 3),
                weight=round(wn, 3),
                contribution=round(wn * qual * 100 * gate, 1),
                penalty=round(wn * (1 - qual) * 100 * gate, 1),
                note=note,
            )
        )
    return round(100 * gate * raw_sum, 1), contribs, gate


class HourScore(BaseModel):
    time: datetime
    time_local: str
    score: float
    darkness: float = Field(description="0..1 gate from the Sun's altitude")
    sun_alt: float
    moon_alt: float
    moon_illum: float
    cloud_low: float | None = None
    cloud_mid: float | None = None
    cloud_high: float | None = None
    humidity: float | None = None
    visibility_m: float | None = None
    aod: float | None = None
    temperature: float | None = None
    dew_point: float | None = None
    wind_kmh: float | None = None
    cloud_spread: float | None = Field(None, description="ensemble std-dev of total cloud cover, % (model agreement)")
    contributions: list[Contribution]


class BestWindow(BaseModel):
    start: datetime
    end: datetime
    start_local: str
    end_local: str
    mean_score: float
    reason: str


class Verdict(BaseModel):
    verdict: str = Field(description="go | maybe | stay_in")
    headline: str
    reason: str
    score: float


class NightScore(BaseModel):
    lat: float
    lon: float
    timezone: str
    night_start: datetime
    night_end: datetime
    astronomical_dusk: datetime
    astronomical_dawn: datetime
    hours: list[HourScore]
    best_window: BestWindow | None
    verdict: Verdict
    warnings: list[str]
    bortle: float | None
    trace: Trace


def _pick(series: list[Any] | None, i: int) -> float | None:
    if not series or i >= len(series):
        return None
    v = series[i]
    return None if v is None else float(v)


def _nearest_index(times: list[datetime], t: datetime) -> int | None:
    best, bi = None, None
    for i, x in enumerate(times):
        d = abs((x - t).total_seconds())
        if best is None or d < best:
            best, bi = d, i
    return bi if best is not None and best <= 1800 else None


def compute_night_score(
    lat: float,
    lon: float,
    forecast: dict[str, Any],
    air: dict[str, Any] | None,
    ensemble: dict[str, Any] | None,
    bortle: float | None,
    ref: datetime | None = None,
    window_hours: int = 2,
) -> NightScore:
    ref = ref or datetime.now(timezone.utc)
    obs = astro.observer(lat, lon, float(forecast.get("elevation") or 0.0))
    sunset, dusk, dawn, sunrise = astro.night_bounds(lat, lon, ref)
    zone = astro.tz(lat, lon)
    times: list[datetime] = forecast["time"]
    hours: list[HourScore] = []
    earliest = max(sunset - timedelta(minutes=30), ref - timedelta(minutes=45))  # past hours are not actionable
    for i, t in enumerate(times):
        if t < earliest or t > sunrise + timedelta(minutes=30):
            continue
        sun_alt = astro.sun_alt(t, obs)
        m_alt = astro.moon_alt(t, obs)
        m_ill = astro.moon_illumination(t)
        ai = _nearest_index(air["time"], t) if air else None
        ei = _nearest_index(ensemble["time"], t) if ensemble else None
        q = factor_qualities(
            cloud_low=_pick(forecast.get("cloud_cover_low"), i),
            cloud_mid=_pick(forecast.get("cloud_cover_mid"), i),
            cloud_high=_pick(forecast.get("cloud_cover_high"), i),
            humidity=_pick(forecast.get("relative_humidity_2m"), i),
            visibility_m=_pick(forecast.get("visibility"), i),
            aod=_pick(air["aerosol_optical_depth"], ai) if air and ai is not None else None,
            moon_alt=m_alt,
            moon_illum=m_ill,
            bortle=bortle,
        )
        s, contribs, gate = score_hour(sun_alt, q)
        hours.append(
            HourScore(
                time=t,
                time_local=t.astimezone(zone).strftime("%H:%M"),
                score=s,
                darkness=round(gate, 3),
                sun_alt=round(sun_alt, 1),
                moon_alt=round(m_alt, 1),
                moon_illum=round(m_ill, 3),
                cloud_low=q["cloud_low"][0],
                cloud_mid=q["cloud_mid"][0],
                cloud_high=q["cloud_high"][0],
                humidity=q["humidity"][0],
                visibility_m=_pick(forecast.get("visibility"), i),
                aod=_pick(air["aerosol_optical_depth"], ai) if air and ai is not None else None,
                temperature=_pick(forecast.get("temperature_2m"), i),
                dew_point=_pick(forecast.get("dew_point_2m"), i),
                wind_kmh=_pick(forecast.get("wind_speed_10m"), i),
                cloud_spread=_pick(ensemble["cloud_spread"], ei) if ensemble and ei is not None else None,
                contributions=contribs,
            )
        )

    # best window: highest mean score over `window_hours` consecutive hours with darkness > 0
    best: BestWindow | None = None
    dark = [h for h in hours if h.darkness > 0]
    for k in range(0, max(0, len(dark) - window_hours + 1)):
        seg = dark[k : k + window_hours]
        if any((seg[j + 1].time - seg[j].time) > timedelta(hours=1, minutes=5) for j in range(len(seg) - 1)):
            continue
        m = sum(h.score for h in seg) / len(seg)
        if best is None or m > best.mean_score:
            worst = max(seg[0].contributions, key=lambda c: c.penalty)
            after_moonset = all(h.moon_alt <= 0 for h in seg)
            reason = "after moonset" if after_moonset and seg[0].moon_illum > 0.3 else f"largest loss: {worst.label.lower()}"
            best = BestWindow(
                start=seg[0].time,
                end=seg[-1].time + timedelta(hours=1),
                start_local=seg[0].time.astimezone(zone).strftime("%H:%M"),
                end_local=(seg[-1].time + timedelta(hours=1)).astimezone(zone).strftime("%H:%M"),
                mean_score=round(m, 1),
                reason=reason,
            )

    # verdict from the best window (or the night mean)
    s = best.mean_score if best else (sum(h.score for h in dark) / len(dark) if dark else 0.0)
    ref_hour = next((h for h in dark if best and h.time == best.start), dark[0] if dark else None)
    biggest = max(ref_hour.contributions, key=lambda c: c.penalty) if ref_hour else None
    if s >= 70:
        v, head = "go", "Go. The night is worth it."
    elif s >= 45:
        v, head = "maybe", "Maybe. Pick your hour carefully."
    else:
        v, head = "stay_in", "Stay in. The sky will not open tonight."
    reason = (
        f"Best {window_hours} h window {best.start_local}–{best.end_local} averages {best.mean_score:.0f}; "
        f"largest loss is {biggest.label.lower()} ({biggest.penalty:.0f} pts)."
        if best and biggest
        else "No dark hours in the forecast range."
    )
    verdict = Verdict(verdict=v, headline=head, reason=reason, score=round(s, 1))

    # warnings
    warnings: list[str] = []
    fog = next((h for h in dark if h.temperature is not None and h.dew_point is not None and (h.temperature - h.dew_point) < 2.0), None)
    if fog:
        warnings.append(f"Dew: optics will fog from about {fog.time_local} (dew-point spread under 2 °C).")
    cold = min((h.temperature for h in dark if h.temperature is not None), default=None)
    if cold is not None and cold < 8:
        warnings.append(f"Cold: lows near {cold:.0f} °C. Dress warmer than you think.")
    windy = max((h.wind_kmh for h in dark if h.wind_kmh is not None), default=None)
    if windy is not None and windy > 30:
        warnings.append(f"Wind: gusts near {windy:.0f} km/h will shake a tripod.")
    if bortle is None:
        warnings.append("Light pollution not sampled for this point; score excludes it.")

    trace = Trace(
        formula=FORMULA,
        inputs={
            "forecast": "Open-Meteo hourly (cloud layers, humidity, visibility, wind, temperature, dew point)",
            "aerosol_optical_depth": "Open-Meteo Air Quality (CAMS)",
            "ensemble_spread": "Open-Meteo ensemble (icon_seamless, gfs_seamless) cloud_cover std-dev",
            "sun_moon": "astronomy-engine topocentric altitudes and Moon illumination",
            "light_pollution": "NASA GIBS VIIRS Black Marble rendered radiance sampled at the point (uncalibrated Bortle estimate)",
            "window_hours": window_hours,
        },
        contributions=ref_hour.contributions if ref_hour else [],
        notes=[
            "darkness gate: 1 below -18° Sun altitude, 0 above -6°, linear between",
            "moonlight penalty = illumination × min(1, 1.4·sin(moon altitude)) while the Moon is up",
            "unknown factors are excluded and the remaining weights renormalised",
        ],
    )
    return NightScore(
        lat=lat,
        lon=lon,
        timezone=astro.tz_name(lat, lon),
        night_start=sunset,
        night_end=sunrise,
        astronomical_dusk=dusk,
        astronomical_dawn=dawn,
        hours=hours,
        best_window=best,
        verdict=verdict,
        warnings=warnings,
        bortle=bortle,
        trace=trace,
    )
