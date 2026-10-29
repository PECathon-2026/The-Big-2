"""Honor: claims are verified against the sky before points are awarded (astronomy only, weather stubbed out)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.http import ProviderError
from app.honor import rules, store
from app.main import app
from app.watchtower import openmeteo

BLR = {"lat": 12.97, "lon": 77.59}
USER = "test-user-123"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    store.reset_for_tests()

    async def no_weather(*a, **k):
        raise ProviderError("open-meteo", "disabled in tests")

    monkeypatch.setattr(openmeteo, "forecast", no_weather)
    yield
    store.reset_for_tests()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_rank_thresholds():
    assert rules.rank_for(0)["romaji"] == "Ashigaru"
    assert rules.rank_for(50)["romaji"] == "Samurai"
    assert rules.rank_for(149)["next"]["romaji"] == "Daimyō"
    assert rules.rank_for(400)["romaji"] == "Shōgun" and rules.rank_for(400)["next"] is None


def test_moon_claim_rejected_when_moon_is_down(client):
    # 2026-10-29 15:30 IST: the Moon (age ~18 d) set mid-morning and rises ~21:00, so it is below the horizon.
    r = client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "moon", "claimed_at": "2026-10-29T10:00:00Z"})
    assert r.status_code == 201
    body = r.json()
    assert body["accepted"] is False and body["points_awarded"] == 0
    assert "below the horizon" in body["reason"]


def test_moon_claim_accepted_when_moon_is_up(client):
    # 2026-10-30 02:00 IST (2026-10-29T20:30Z): Moon well above the horizon over Bengaluru.
    r = client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "moon", "claimed_at": "2026-10-29T20:30:00Z"})
    body = r.json()
    assert body["accepted"] is True and body["points_awarded"] == rules.POINTS["moon"]
    assert body["rank"]["points"] == rules.POINTS["moon"]


def test_future_claim_is_refused(client):
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r = client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "custom", "claimed_at": future})
    assert r.status_code == 400


def test_event_claim_checks_the_event_window(client):
    evs = client.get("/api/scroll/events", params={**BLR, "days": 3, "types": "moon", "start": "2026-10-29T12:00:00Z"}).json()["data"]
    moonrise = next(e for e in evs if e["id"].startswith("moonrise"))
    inside = datetime.fromisoformat(moonrise["start"]) + timedelta(minutes=10)
    r = client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "moon", "event_id": moonrise["id"], "claimed_at": inside.isoformat()})
    assert r.json()["accepted"] is True, r.text
    outside = datetime.fromisoformat(moonrise["start"]) - timedelta(hours=5)
    r = client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "moon", "event_id": moonrise["id"], "claimed_at": outside.isoformat()})
    assert r.json()["accepted"] is False and "outside its window" in r.json()["reason"]


def test_ledger_totals_and_counts(client):
    client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "moon", "claimed_at": "2026-10-29T20:30:00Z"})
    client.post("/api/honor/observe", json={**BLR, "user_id": USER, "kind": "moon", "claimed_at": "2026-10-29T10:00:00Z"})
    led = client.get("/api/honor/ledger", params={"user_id": USER}).json()
    assert led["verified_count"] == 1 and led["rejected_count"] == 1
    assert led["rank"]["points"] == rules.POINTS["moon"]
    assert led["entries"][0]["evidence"]
