"""Alerts: subscribe → schedule → due → sent, with the push sender stubbed (no network)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.alerts import sender, store, worker
from app.core.config import settings
from app.main import app

SUB = {"endpoint": "https://push.example.test/abc", "keys": {"p256dh": "BKey", "auth": "auth"}}
SUB2 = {"endpoint": "https://push.example.test/gone", "keys": {"p256dh": "BKey", "auth": "auth"}}


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    store.reset_for_tests()
    yield
    store.reset_for_tests()


@pytest.fixture
def sent(monkeypatch):
    calls: list[tuple[dict, dict]] = []

    def fake(subscription, payload):
        if subscription["endpoint"].endswith("/gone"):
            raise sender.PushGone("410")
        calls.append((subscription, payload))

    monkeypatch.setattr(sender, "current", fake)
    return calls


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_vapid_public_key_is_base64url_point(client):
    r = client.get("/api/alerts/vapid-public-key")
    assert r.status_code == 200
    k = r.json()["public_key"]
    assert len(k) == 87 and k.startswith("B") and "=" not in k  # 65-byte uncompressed P-256 point


def test_subscribe_rejects_incomplete_subscription(client):
    r = client.post("/api/alerts/subscribe", json={"subscription": {"endpoint": "x"}})
    assert r.status_code == 400


def test_schedule_then_deliver_when_due(client, sent):
    r = client.post("/api/alerts/subscribe", json={"subscription": SUB})
    assert r.status_code == 201
    fire = datetime.now(timezone.utc) + timedelta(minutes=5)
    r = client.post("/api/alerts/schedule", json={"endpoint": SUB["endpoint"], "title": "Moonrise", "body": "The Moon rises at 20:14", "fire_at": fire.isoformat()})
    assert r.status_code == 201
    alert_id = r.json()["id"]
    assert worker.deliver_due() == {"sent": 0, "failed": 0, "gone": 0}  # not yet due
    assert worker.deliver_due(now=fire + timedelta(seconds=1)) == {"sent": 1, "failed": 0, "gone": 0}
    assert sent[0][1]["body"] == "The Moon rises at 20:14" and sent[0][1]["alert_id"] == alert_id
    pending = client.get("/api/alerts/scheduled", params={"endpoint": SUB["endpoint"]}).json()
    assert pending == []
    done = client.get("/api/alerts/scheduled", params={"endpoint": SUB["endpoint"], "include_sent": True}).json()
    assert done[0]["status"] == "sent" and done[0]["sent_at"]


def test_cancel_prevents_delivery(client, sent):
    client.post("/api/alerts/subscribe", json={"subscription": SUB})
    fire = datetime.now(timezone.utc) - timedelta(seconds=1)
    alert_id = client.post("/api/alerts/schedule", json={"endpoint": SUB["endpoint"], "title": "t", "body": "b", "fire_at": fire.isoformat()}).json()["id"]
    assert client.delete(f"/api/alerts/scheduled/{alert_id}", params={"endpoint": SUB["endpoint"]}).status_code == 200
    assert worker.deliver_due() == {"sent": 0, "failed": 0, "gone": 0}
    assert sent == []


def test_gone_subscription_is_removed(client, sent):
    client.post("/api/alerts/subscribe", json={"subscription": SUB2})
    fire = datetime.now(timezone.utc) - timedelta(seconds=1)
    client.post("/api/alerts/schedule", json={"endpoint": SUB2["endpoint"], "title": "t", "body": "b", "fire_at": fire.isoformat()})
    assert worker.deliver_due() == {"sent": 0, "failed": 0, "gone": 1}
    assert store.get_subscription(SUB2["endpoint"]) is None


def test_immediate_test_alert(client, sent):
    client.post("/api/alerts/subscribe", json={"subscription": SUB})
    r = client.post("/api/alerts/test", json={"endpoint": SUB["endpoint"]})
    assert r.status_code == 201
    assert r.json()["status"] == "sent" and r.json()["delivery"]["sent"] == 1
    assert sent[0][1]["title"].startswith("Tsukuyomi")


def test_schedule_event_uses_the_event_alert_text(client, sent):
    """Schedules the next moonrise for Bengaluru from the live events feed (astronomy only, no network)."""
    client.post("/api/alerts/subscribe", json={"subscription": SUB})
    evs = client.get("/api/scroll/events", params={"lat": 12.97, "lon": 77.59, "days": 3, "types": "moon"}).json()["data"]
    moonrise = next(e for e in evs if e["id"].startswith("moonrise"))
    r = client.post("/api/alerts/schedule-event", json={"endpoint": SUB["endpoint"], "lat": 12.97, "lon": 77.59, "event_id": moonrise["id"], "lead_minutes": 15})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["body"].startswith("The Moon rises at")
    assert body["event_id"] == moonrise["id"]
    fire = datetime.fromisoformat(body["fire_at"])
    start = datetime.fromisoformat(moonrise["start"])
    assert start - fire <= timedelta(minutes=15, seconds=1)
