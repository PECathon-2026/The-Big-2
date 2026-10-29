"""Horizon mask geometry with a synthetic hill (no network)."""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone

import pytest

from app.core.envelope import Provenance
from app.horizon import terrain
from app.planner import targets
from app.watchtower import openmeteo

BLR = (12.97, 77.59)


@pytest.fixture
def hill_to_the_east(monkeypatch):
    """A 400 m ridge 5 km east of the observer (who sits at 900 m); flat elsewhere."""

    async def fake_elevation(points):
        out = []
        for la, lo in points:
            d_east = (lo - BLR[1]) * 111.0 * math.cos(math.radians(BLR[0]))
            d_north = (la - BLR[0]) * 111.0
            hill = 400.0 if abs(d_north) < 1.5 and 4.0 < d_east < 6.5 else 0.0
            out.append(900.0 + hill)
        return out, Provenance(source="test-dem")

    monkeypatch.setattr(openmeteo, "elevation", fake_elevation)


def test_elevation_angle_includes_curvature():
    assert terrain.elevation_angle(0, 0, 10) < 0  # flat ground 10 km away dips below the horizontal
    assert abs(terrain.elevation_angle(0, 100, 1) - math.degrees(math.atan2(100 - 0.0785, 1000))) < 0.01


def test_terrain_mask_sees_the_hill_only_to_the_east(hill_to_the_east):
    mask, h, _ = asyncio.run(terrain.terrain_horizon(*BLR))
    east = mask[90 // terrain.AZ_STEP]
    north = mask[0]
    assert h == 900.0
    assert east > 3.0  # 400 m at 5 km ≈ 4.5°
    assert north < 0.5


def test_manual_points_interpolate_and_wrap():
    grid = terrain.manual_grid([terrain.MaskPoint(az=350, alt=20), terrain.MaskPoint(az=10, alt=20), terrain.MaskPoint(az=180, alt=0)])
    assert grid[0] == 20.0  # between 350° and 10°
    assert grid[180 // terrain.AZ_STEP] == 0.0
    assert 0 < grid[90 // terrain.AZ_STEP] < 20


def test_path_reports_delayed_clearance(hill_to_the_east):
    """A tall wall to the east delays when the Moon 'clears' the skyline relative to its geometric rise."""
    mask = [0.0] * terrain.N_AZ
    for i in range(terrain.N_AZ):
        az = i * terrain.AZ_STEP
        if 60 <= az <= 120:
            mask[i] = 25.0
    moon, _ = asyncio.run(targets.resolve("moon", None, None, None))
    t0 = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 10, 30, 1, 0, tzinfo=timezone.utc)
    rep = terrain.path_vs_mask(moon, *BLR, mask, t0, t1)
    assert rep.geometric_rise_local is not None
    up = [c for c in rep.crossings if c.kind == "rises_above_mask"]
    assert up and up[0].time > t0
    assert rep.minutes_lost_to_skyline > 30
    assert "clears your skyline only at" in rep.sentence
