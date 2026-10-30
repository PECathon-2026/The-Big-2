"""Unified event feed: everything the Celestial Scroll lists, in one shape, localised to the observer."""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field

from ..core import astro
from ..core.compute import in_thread
from ..core.envelope import Provenance
from ..core.http import ProviderError
from ..core.memo import floor_time, memoize_async
from . import eclipses as ecl
from . import launches as ll
from . import meteors as met
from . import moon as mo
from . import planets as pl
from . import satellites as sat

ALL_TYPES = ["moon", "meteor", "eclipse", "satellite", "launch", "planet"]


class Event(BaseModel):
    id: str
    kind: str
    title: str
    jp: str | None = None
    start: datetime
    end: datetime | None = None
    start_local: str
    visible_from_here: bool | None = Field(None, description="None when visibility does not apply")
    direction: str | None = None
    altitude_max: float | None = None
    detail: str
    alert: str | None = None
    source: str


def _compass(az: float) -> str:
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int((az + 22.5) // 45) % 8]


def _loc(zone) -> Callable[[datetime], str]:
    def loc(d: datetime) -> str:
        return d.astimezone(zone).strftime("%a %d %b %H:%M")

    return loc


def _events_key(lat: float, lon: float, days: int = 7, types: list[str] | None = None, start: datetime | None = None, bortle: float | None = None):
    return round(lat, 2), round(lon, 2), days, tuple(sorted(types or ALL_TYPES)), bortle, floor_time(start or datetime.now(timezone.utc), 300)


@memoize_async(ttl_s=5 * 60, key=_events_key, maxsize=128)
async def events(
    lat: float,
    lon: float,
    days: int = 7,
    types: list[str] | None = None,
    start: datetime | None = None,
    bortle: float | None = None,
) -> tuple[list[Event], list[Provenance]]:
    """The feed has two halves: the computed one (Moon, showers, eclipses, planets) runs in a worker thread so it
    never blocks the event loop; the upstream one (ISS passes, launches) is awaited here."""
    types = types or ALL_TYPES
    start = (start or datetime.now(timezone.utc)).astimezone(timezone.utc)
    end = start + timedelta(days=days)
    zone = astro.tz(lat, lon)
    loc = _loc(zone)

    out: list[Event] = await in_thread(_computed_events, lat, lon, start, end, zone, types, bortle)
    prov: list[Provenance] = [Provenance(source="computed", note="astronomy-engine")]

    if "satellite" in types:
        try:
            ps, p = await sat.passes(lat, lon, days=min(days, 5), sat="ISS", start=start)
            prov.append(p)
            for ps_ in ps:
                if ps_.visible:
                    out.append(
                        Event(
                            id=f"iss-{ps_.start.isoformat()}",
                            kind="satellite",
                            title="ISS pass",
                            jp="国際宇宙ステーション",
                            start=ps_.start,
                            end=ps_.end,
                            start_local=loc(ps_.start),
                            visible_from_here=True,
                            direction=f"{ps_.start_compass}→{ps_.end_compass}",
                            altitude_max=ps_.max_alt,
                            detail=f"Max {ps_.max_alt:.0f}°, {ps_.visible_seconds // 60} min visible, {ps_.brightness_hint}.",
                            alert=ps_.alert,
                            source="celestrak + sgp4",
                        )
                    )
        except (ProviderError, ValueError) as e:
            prov.append(Provenance(source="celestrak", note=str(e)))

    if "launch" in types:
        try:
            ls, p = await ll.upcoming(lat, lon, limit=30)
            prov.append(p)
            for l in ls:
                if l.net and start <= l.net < end:
                    detail = f"{l.provider or ''} · {l.location or ''}"
                    if l.distance_km is not None:
                        detail += f" · {l.distance_km:.0f} km away · {l.visible_trail_hint}"
                    out.append(
                        Event(
                            id=f"launch-{l.id}",
                            kind="launch",
                            title=l.name,
                            jp="打上げ",
                            start=l.net,
                            end=l.window_end,
                            start_local=loc(l.net),
                            visible_from_here=(l.distance_km or 1e9) < 800,
                            detail=detail,
                            source="launch-library-2",
                        )
                    )
        except ProviderError as e:
            prov.append(Provenance(source="launch-library-2", note=str(e)))

    out.sort(key=lambda e: e.start)
    return out, prov


def _computed_events(lat: float, lon: float, start: datetime, end: datetime, zone, types: list[str], bortle: float | None) -> list[Event]:
    """Everything the feed can compute without the network. Pure CPU; called through `in_thread`."""
    loc = _loc(zone)
    out: list[Event] = []

    if "moon" in types:
        obs = astro.observer(lat, lon)
        d = start
        while d < end:
            info = mo.moon_info(lat, lon, d)
            if info.rise and start <= info.rise < end:
                out.append(
                    Event(
                        id=f"moonrise-{info.rise.date()}",
                        kind="moon",
                        title=f"Moonrise · {info.name['kanji']}",
                        jp=info.name["kanji"],
                        start=info.rise,
                        start_local=loc(info.rise),
                        visible_from_here=True,
                        direction="E",
                        detail=f"{info.name['romaji']}, {info.illumination * 100:.0f}% lit. {info.name['meaning']}",
                        alert=f"The Moon rises at {info.rise.astimezone(zone).strftime('%H:%M')}",
                        source="computed",
                    )
                )
            if info.set and start <= info.set < end:
                out.append(
                    Event(
                        id=f"moonset-{info.set.date()}",
                        kind="moon",
                        title="Moonset",
                        jp="月の入り",
                        start=info.set,
                        start_local=loc(info.set),
                        visible_from_here=True,
                        direction="W",
                        detail=(
                            "Dark skies after this for deep-sky objects."
                            if astro.sun_alt(info.set, obs) < -12
                            else "The Moon sets in daylight or twilight."
                        ),
                        alert=f"The Moon sets at {info.set.astimezone(zone).strftime('%H:%M')}",
                        source="computed",
                    )
                )
            d += timedelta(days=1)
        for q in mo.moon_info(lat, lon, start).next_quarters:
            if start <= q.time < end:
                out.append(
                    Event(
                        id=f"quarter-{q.quarter}-{q.time.date()}",
                        kind="moon",
                        title=q.name,
                        jp=["朔", "上弦", "望", "下弦"][q.quarter],
                        start=q.time,
                        start_local=loc(q.time),
                        visible_from_here=None,
                        detail="Exact moment of the phase.",
                        source="computed",
                    )
                )

    if "meteor" in types:
        for s in met.active_showers(lat, lon, start, bortle=bortle):
            if s.best_hour:
                out.append(
                    Event(
                        id=f"meteor-{s.code}-{s.best_hour.time.date()}",
                        kind="meteor",
                        title=f"{s.name} · {'peak night' if s.is_peak_night else 'active'}",
                        jp=s.jp,
                        start=s.best_hour.time,
                        start_local=loc(s.best_hour.time),
                        visible_from_here=s.best_hour.rate_per_hour > 0,
                        altitude_max=s.best_hour.radiant_alt,
                        detail=(
                            (
                                f"About {s.best_hour.rate_per_hour:.0f} meteors/hour at best "
                                if s.best_hour.rate_per_hour >= 1
                                else "Under 1 meteor/hour from here "
                            )
                            + f"(ZHR now {s.zhr_now:.0f}, radiant {s.best_hour.radiant_alt:.0f}° up). Peak {s.peak.date()}."
                        ),
                        alert=f"{s.name}: best around {s.best_hour.time_local}, ~{s.best_hour.rate_per_hour:.0f}/h",
                        source="IMO calendar + computed",
                    )
                )

    if "eclipse" in types:
        for e in ecl.eclipses(lat, lon, start, lunar=2, solar=1):
            out.append(
                Event(
                    id=f"eclipse-{e.type}-{e.peak.date()}",
                    kind="eclipse",
                    title=f"{e.kind.title()} {e.type} eclipse",
                    jp="月食" if e.type == "lunar" else "日食",
                    start=e.begins or e.peak,
                    end=e.ends,
                    start_local=loc(e.peak),
                    visible_from_here=e.visible_from_here,
                    altitude_max=e.peak_altitude,
                    detail=f"Peak {e.peak_local}; obscuration {e.obscuration}; {'visible' if e.visible_from_here else 'not visible'} from here.",
                    source="computed",
                )
            )

    if "planet" in types:
        evening = start.astimezone(zone).replace(hour=21, minute=0, second=0, microsecond=0)
        if evening < start.astimezone(zone):
            evening += timedelta(days=1)
        for p_ in pl.planets(lat, lon, evening.astimezone(timezone.utc)):
            if p_.naked_eye and p_.up_now:
                out.append(
                    Event(
                        id=f"planet-{p_.name}-{evening.date()}",
                        kind="planet",
                        title=f"{p_.name} visible tonight",
                        jp=p_.jp,
                        start=evening.astimezone(timezone.utc),
                        start_local=loc(evening),
                        visible_from_here=True,
                        direction=_compass(p_.azimuth),
                        altitude_max=p_.altitude,
                        detail=f"Magnitude {p_.magnitude:+.1f}, {p_.altitude:.0f}° up at 21:00, {p_.moon_separation_deg:.0f}° from the Moon.",
                        source="computed",
                    )
                )

    return out
