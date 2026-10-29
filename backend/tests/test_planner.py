"""Planner: constraint logic on fixed inputs (no network; spots, light pollution and forecast are stubbed)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.envelope import Provenance
from app.core.http import ProviderError
from app.planner import plan as planner
from app.planner import targets
from app.watchtower import lightpollution, openmeteo, spots

BLR = (12.97, 77.59)
NIGHT = datetime(2026, 12, 15, 14, 0, tzinfo=timezone.utc)  # a December evening in Bengaluru: Orion up all night, Moon a thin crescent


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    async def no_spots(*a, **k):
        raise ProviderError("overpass", "offline in tests")

    async def no_lp(*a, **k):
        raise ProviderError("nasa-gibs", "offline in tests")

    async def no_fc(*a, **k):
        raise ProviderError("open-meteo", "offline in tests")

    monkeypatch.setattr(spots, "rank_spots", no_spots)
    monkeypatch.setattr(lightpollution, "sample", no_lp)
    monkeypatch.setattr(openmeteo, "forecast", no_fc)
    monkeypatch.setattr(openmeteo, "ensemble_cloud_spread", no_fc)


def test_builtin_targets_resolve_without_network():
    import asyncio

    t, p = asyncio.run(targets.resolve("m42", None, None, None))
    assert t.name.startswith("Orion") and t.kind == "deepsky" and p.source == "built-in list"
    t, _ = asyncio.run(targets.resolve("jupiter", None, None, None))
    assert t.body is not None and t.kind == "planet"
    t, _ = asyncio.run(targets.resolve(None, 83.8, -5.4, "deepsky"))
    assert t.source == "coordinates"


def test_orion_nebula_has_a_usable_window_in_december():
    import asyncio

    t, _ = asyncio.run(targets.resolve("m42", None, None, None))
    plan, prov = asyncio.run(planner.make_plan(t, *BLR, equipment="binoculars", date=NIGHT))
    assert plan.best is not None and plan.best.name == "Where you are"
    assert plan.best.usable_minutes >= 120
    w = max(plan.best.windows, key=lambda w: w.minutes)
    assert w.minutes >= 120
    assert plan.recommendation.startswith("Go to Where you are")
    assert {c.question for c in plan.counterfactuals} >= {"Would leaving 1 h later help?", "Would driving up to 20 km farther help?"}
    # leaving later can only reduce or keep the usable minutes when the window already starts at dusk
    later = next(c for c in plan.counterfactuals if c.question.startswith("Would leaving 1 h"))
    assert later.delta_minutes <= 0


def test_polaris_is_too_low_from_bengaluru_for_a_telescope():
    import asyncio

    t, _ = asyncio.run(targets.resolve("polaris", None, None, None))
    plan, _ = asyncio.run(planner.make_plan(t, *BLR, equipment="telescope", date=NIGHT))
    assert plan.best is None
    assert plan.candidates[0].blocked_minutes["altitude"] > 0
    assert "not observable" in plan.recommendation


def test_daylight_blocks_before_dusk_and_sun_limit_depends_on_kind():
    import asyncio

    moon, _ = asyncio.run(targets.resolve("moon", None, None, None))
    deep, _ = asyncio.run(targets.resolve("m31", None, None, None))
    pm = asyncio.run(planner.make_plan(moon, *BLR, date=NIGHT))[0]
    pd = asyncio.run(planner.make_plan(deep, *BLR, date=NIGHT))[0]
    assert pm.sun_limit == -6.0 and pd.sun_limit == -18.0
    # deep-sky needs a darker sky, so it loses at least as many minutes to daylight as the Moon does
    assert pd.candidates[0].blocked_minutes["daylight"] >= pm.candidates[0].blocked_minutes["daylight"]


def test_windows_are_contiguous_runs():
    zone = timezone.utc
    t0 = datetime(2026, 1, 1, tzinfo=zone)
    mk = lambda i, st: planner.Step(time=t0 + timedelta(minutes=15 * i), local="", status=st, target_alt=0, moon_alt=0, cloud=None, quality=1.0)  # noqa: E731
    steps = [mk(0, "usable"), mk(1, "usable"), mk(2, "cloud"), mk(3, "usable")]
    ws = planner._windows(steps, zone)
    assert [w.minutes for w in ws] == [30, 15]
