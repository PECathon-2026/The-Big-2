"""Aurora: geomagnetic latitude and Kp thresholds (no network; NOAA feeds stubbed)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.aurora import space_weather as sw
from app.core.envelope import Provenance


def test_geomagnetic_latitude_of_known_places():
    assert abs(sw.geomagnetic_latitude(69.65, 18.96) - 67) < 3  # Tromsø: under the oval
    assert abs(sw.geomagnetic_latitude(12.97, 77.59) - 4) < 3  # Bengaluru: near the magnetic equator
    assert 24 < sw.geomagnetic_latitude(35.01, 135.77) < 29  # Kyoto
    assert sw.geomagnetic_latitude(-41.3, 174.8) < -40  # Wellington, southern hemisphere (dipole approximation)


def test_required_kp_is_monotonic_and_bounded():
    assert sw.required_kp(68)["horizon"] == 0 and sw.required_kp(68)["overhead"] == 0
    assert sw.required_kp(55)["horizon"] == 3 and sw.required_kp(55)["overhead"] == 6
    assert sw.required_kp(45)["overhead"] is None and sw.required_kp(45)["horizon"] == 8
    assert sw.required_kp(4)["horizon"] is None
    prev = 0
    for m in range(70, 40, -1):
        k = sw.required_kp(m)["horizon"]
        assert k is None or k >= prev
        prev = k if k is not None else 99


def test_chance_words():
    assert sw.chance_word(6.0, 5) == "likely"
    assert sw.chance_word(5.0, 5) == "possible"
    assert sw.chance_word(4.3, 5) == "low"
    assert sw.chance_word(2.0, 5) == "very low"
    assert sw.chance_word(9.0, None) == "none"


def test_verdict_uses_forecast_peak(monkeypatch):
    now = datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc)
    pts = [sw.KpPoint(time=now + timedelta(hours=3 * i), kp=[2, 3, 5.67, 4, 2, 2, 2, 2][i], kind="predicted", g_scale=None) for i in range(8)]

    async def fc():
        return pts, Provenance(source="noaa-swpc")

    async def cur():
        return (1.33, now), Provenance(source="noaa-swpc")

    async def gs():
        return "G0 none", None

    monkeypatch.setattr(sw, "kp_forecast", fc)
    monkeypatch.setattr(sw, "current_kp", cur)
    monkeypatch.setattr(sw, "g_scale_now", gs)
    a, prov = asyncio.run(sw.aurora(60.17, 24.94, now))  # Helsinki, mag lat ~57
    assert a.max_kp_next_24h == 5.67
    assert a.required_kp["horizon"] <= 3
    assert a.chance_tonight == "likely"
    assert "Kp 5.67" in a.verdict and "G2" in a.verdict
    b, _ = asyncio.run(sw.aurora(12.97, 77.59, now))
    assert b.chance_tonight == "none" and "cannot be seen" in b.verdict
