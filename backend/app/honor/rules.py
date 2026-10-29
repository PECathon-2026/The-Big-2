"""Honor rules: what an observation is worth, and whether the sky actually allowed it.

A claim earns points only when it is verified: the claimed event was visible from the claimed place at the claimed
time according to the same astronomy the Scroll uses. Nothing here trusts the client.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import astronomy as ae

from ..core import astro
from ..scroll import events as ev
from ..scroll import planets as pl

POINTS = {"moon": 5, "planet": 5, "meteor": 10, "satellite": 15, "launch": 10, "eclipse": 30, "deepsky": 10, "custom": 5}
PHOTO_BONUS = 10  # a Lens job of the claim with a solved WCS proves the photo shows real sky

RANKS = [
    (0, "足軽", "Ashigaru", "Foot soldier. Every samurai began here."),
    (50, "侍", "Samurai", "A sworn watcher of the night."),
    (150, "大名", "Daimyō", "Lord of a province of sky."),
    (400, "将軍", "Shōgun", "The night answers to you."),
]


def rank_for(points: int) -> dict:
    cur = RANKS[0]
    nxt = None
    for r in RANKS:
        if points >= r[0]:
            cur = r
        elif nxt is None:
            nxt = r
    return {
        "points": points,
        "kanji": cur[1],
        "romaji": cur[2],
        "meaning": cur[3],
        "next": {"kanji": nxt[1], "romaji": nxt[2], "at": nxt[0], "points_needed": nxt[0] - points} if nxt else None,
    }


async def verify(lat: float, lon: float, kind: str, event_id: str | None, claimed_at: datetime) -> tuple[bool, str, dict]:
    """Returns (verified, reason, evidence)."""
    claimed_at = claimed_at.astimezone(timezone.utc)
    obs = astro.observer(lat, lon)
    sun_alt = astro.sun_alt(claimed_at, obs)
    evidence: dict = {"sun_alt": round(sun_alt, 1), "claimed_at": claimed_at.isoformat()}

    if event_id:
        items, _ = await ev.events(lat, lon, days=10, start=claimed_at - timedelta(days=2))
        e = next((x for x in items if x.id == event_id), None)
        if e is None:
            return False, f"event {event_id!r} is not in the feed for this place around that time", evidence
        start = e.start - timedelta(minutes=30)
        end = (e.end or e.start + timedelta(minutes=60)) + timedelta(minutes=30)
        evidence.update({"event": e.title, "window_start": start.isoformat(), "window_end": end.isoformat(), "visible_from_here": e.visible_from_here})
        if e.visible_from_here is False:
            return False, f"{e.title} is not visible from this location", evidence
        if not (start <= claimed_at <= end):
            return False, f"{e.title} happens {e.start_local}; the claim is outside its window", evidence
        if e.kind in ("moon", "planet", "meteor", "satellite", "eclipse") and sun_alt > 0:
            return False, "the Sun is up at the claimed time", evidence
        return True, f"{e.title} was visible from here at the claimed time", evidence

    if kind == "moon":
        alt = astro.moon_alt(claimed_at, obs)
        evidence["moon_alt"] = round(alt, 1)
        if alt <= 0:
            return False, "the Moon is below the horizon at the claimed time", evidence
        return True, f"Moon {alt:.0f}° above the horizon", evidence

    if kind == "planet":
        up = [p.name for p in pl.planets(lat, lon, claimed_at) if p.naked_eye and p.altitude > 5]
        evidence["planets_up"] = up
        if not up or sun_alt > -3:
            return False, "no naked-eye planet is up in a dark enough sky at the claimed time", evidence
        return True, f"{', '.join(up)} above the horizon", evidence

    if kind in ("meteor", "deepsky"):
        if sun_alt > -12:
            return False, "the sky is not dark enough (Sun above -12°) at the claimed time", evidence
        return True, "astronomically dark sky at the claimed time", evidence

    if sun_alt > -6:
        return False, "it is daytime at the claimed place and time", evidence
    return True, "night-time claim accepted", evidence
