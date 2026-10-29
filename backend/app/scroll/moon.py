"""Moon: phase, illumination, age, Japanese name, rise/set/transit, next quarters, libration."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import astronomy as ae
from pydantic import BaseModel, Field

from ..core import astro

SYNODIC = 29.530588853

# (first lunar day, kanji, romaji, meaning)
MOON_NAMES: list[tuple[int, str, str, str]] = [
    (1, "朔", "Saku", "The dark moon. The night belongs to the stars alone."),
    (2, "二日月", "Futsukazuki", "A thread of light low in the west after sunset."),
    (3, "三日月", "Mikazuki", "The blade moon. Thin, bright, and gone early."),
    (7, "上弦の月", "Jōgen no Tsuki", "First quarter. Half the moon stands guard until midnight."),
    (10, "十日夜", "Tōkanya", "The tenth night. The moon lingers well past midnight."),
    (13, "十三夜", "Jūsanya", "The thirteenth night, honoured second only to the full moon."),
    (14, "小望月", "Komochizuki", "The little waiting moon, one night before full."),
    (15, "十五夜", "Jūgoya", "The full moon. Brightest night; the faintest stars retreat."),
    (16, "十六夜", "Izayoi", "The hesitant moon. It rises a little later, as if reluctant to leave the mountain."),
    (17, "立待月", "Tachimachizuki", "The standing-and-waiting moon: wait on your feet, it comes soon."),
    (18, "居待月", "Imachizuki", "The sitting-and-waiting moon: sit, it is later still."),
    (19, "寝待月", "Nemachizuki", "The lying-and-waiting moon: lie down, it will wake you."),
    (20, "更待月", "Fukemachizuki", "The late-night moon. The best dark hours come before it."),
    (23, "下弦の月", "Kagen no Tsuki", "Last quarter. Dark evenings, moonlit dawns."),
    (26, "有明月", "Ariakezuki", "The daybreak moon, pale in the morning sky."),
    (29, "三十日月", "Misokazuki", "The last sliver. Tomorrow, darkness returns."),
]


def moon_name(age_days: float) -> dict:
    day = int(age_days) + 1
    pick = MOON_NAMES[0]
    for m in MOON_NAMES:
        if day >= m[0]:
            pick = m
    return {"lunar_day": day, "kanji": pick[1], "romaji": pick[2], "meaning": pick[3]}


def phase_name(phase_deg: float) -> str:
    names = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"]
    idx = int(((phase_deg + 22.5) % 360) // 45)
    return names[idx]


class Quarter(BaseModel):
    quarter: int = Field(description="0 new, 1 first quarter, 2 full, 3 last quarter")
    name: str
    time: datetime


class MoonInfo(BaseModel):
    time: datetime
    timezone: str
    phase_deg: float = Field(description="0 new, 90 first quarter, 180 full, 270 last quarter")
    phase_name: str
    illumination: float = Field(description="0..1 fraction lit")
    age_days: float
    waxing: bool
    name: dict
    altitude: float
    azimuth: float
    distance_km: float
    angular_diameter_deg: float
    libration: dict
    rise: datetime | None
    set: datetime | None
    rise_local: str | None
    set_local: str | None
    next_quarters: list[Quarter]
    alert: str


def moon_info(lat: float, lon: float, at: datetime | None = None, elev_m: float = 0.0) -> MoonInfo:
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    obs = astro.observer(lat, lon, elev_m)
    t = astro.to_time(at)
    zone = astro.tz(lat, lon)
    phase = ae.MoonPhase(t)
    illum = ae.Illumination(ae.Body.Moon, t)
    age = astro.moon_age_days(at)
    alt, az = astro.altaz(ae.Body.Moon, at, obs)
    lib = ae.Libration(t)
    # rise/set for the local calendar day of `at`
    day_start = at.astimezone(zone).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    rise, sett = astro.rise_set(ae.Body.Moon, obs, day_start, 1.0)
    quarters = []
    mq = ae.SearchMoonQuarter(t)
    for _ in range(4):
        quarters.append(Quarter(quarter=mq.quarter, name=["New Moon", "First Quarter", "Full Moon", "Last Quarter"][mq.quarter], time=astro.from_time(mq.time)))
        mq = ae.NextMoonQuarter(mq)
    name = moon_name(age)
    if rise and rise > at:
        alert = f"The Moon rises tonight at {rise.astimezone(zone).strftime('%H:%M')}"
    elif sett and sett > at:
        alert = f"The Moon sets at {sett.astimezone(zone).strftime('%H:%M')}"
    else:
        nxt_rise, _ = astro.rise_set(ae.Body.Moon, obs, at, 1.5)
        alert = f"The Moon rises next at {nxt_rise.astimezone(zone).strftime('%a %H:%M')}" if nxt_rise else "No moonrise in the next day"
    return MoonInfo(
        time=at,
        timezone=astro.tz_name(lat, lon),
        phase_deg=round(phase, 2),
        phase_name=phase_name(phase),
        illumination=round(illum.phase_fraction, 4),
        age_days=round(age, 2),
        waxing=phase < 180,
        name=name,
        altitude=round(alt, 2),
        azimuth=round(az, 2),
        distance_km=round(lib.dist_km, 0),
        angular_diameter_deg=round(lib.diam_deg, 4),
        libration={"ecliptic_lat": round(lib.elat, 3), "ecliptic_lon": round(lib.elon, 3), "moon_lat": round(lib.mlat, 3), "moon_lon": round(lib.mlon, 3)},
        rise=rise,
        set=sett,
        rise_local=rise.astimezone(zone).strftime("%H:%M") if rise else None,
        set_local=sett.astimezone(zone).strftime("%H:%M") if sett else None,
        next_quarters=quarters,
        alert=alert,
    )
