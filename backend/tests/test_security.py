"""Guards for a public demo server: rate limits, body-size limits, input checks on the endpoints that write or proxy."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.core.config import settings
from app.honor import store as honor_store
from app.main import app

ORIGIN = "http://localhost:3000"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "rate_limit", True)
    honor_store.reset_for_tests()
    security.buckets.clear()
    with TestClient(app) as c:
        yield c
    security.buckets.clear()
    honor_store.reset_for_tests()


def test_upload_tier_answers_429_with_retry_after_and_cors(client):
    codes = []
    for _ in range(security.UPLOAD.burst + 2):
        r = client.post("/api/lens/jobs", files={"file": ("x.png", b"nope", "image/png")}, headers={"Origin": ORIGIN})
        codes.append(r.status_code)
    assert codes[: int(security.UPLOAD.burst)] == [415] * int(security.UPLOAD.burst)
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) >= 1
    assert r.headers.get("access-control-allow-origin") == ORIGIN  # the page can read the refusal
    assert r.json()["error"] == "rate_limited"


def test_clients_are_keyed_separately_and_health_is_exempt(client):
    for _ in range(int(security.UPLOAD.burst) + 1):
        client.post("/api/lens/jobs", files={"file": ("x.png", b"nope", "image/png")}, headers={"X-Forwarded-For": "1.1.1.1"})
    assert client.post("/api/lens/jobs", files={"file": ("x.png", b"nope", "image/png")}, headers={"X-Forwarded-For": "1.1.1.1"}).status_code == 429
    assert client.post("/api/lens/jobs", files={"file": ("x.png", b"nope", "image/png")}, headers={"X-Forwarded-For": "2.2.2.2"}).status_code == 415
    for _ in range(50):
        assert client.get("/api/health").status_code == 200


def test_oversized_bodies_are_refused(client):
    r = client.post("/api/honor/observe", content=b"x" * (security.MAX_BODY_BYTES + 1), headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_security_headers_on_every_response(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"


def test_push_subscription_must_be_a_real_push_service(client):
    keys = {"p256dh": "x", "auth": "y"}
    for bad in ("http://169.254.169.254/latest/meta-data", "https://localhost:8000/x", "https://evil.example/fcm.googleapis.com", "file:///etc/passwd"):
        r = client.post("/api/alerts/subscribe", json={"subscription": {"endpoint": bad, "keys": keys}})
        assert r.status_code == 400, bad
    r = client.post("/api/alerts/subscribe", json={"subscription": {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": keys}})
    assert r.status_code == 201


def test_job_ids_never_reach_the_filesystem(client):
    for bad in ("..", "..%5C..%5Cjobs", "ZZZZZZZZZZZZ", "a" * 200):
        assert client.get(f"/api/lens/jobs/{bad}").status_code == 404


def test_same_sighting_scores_once(client, monkeypatch):
    from app.core.http import ProviderError
    from app.watchtower import openmeteo

    async def no_weather(*a, **k):
        raise ProviderError("open-meteo", "disabled in tests")

    monkeypatch.setattr(openmeteo, "forecast", no_weather)
    body = {"lat": 12.97, "lon": 77.59, "user_id": "dup-user", "kind": "moon", "title": "The Moon", "claimed_at": "2026-10-29T20:30:00Z"}
    first = client.post("/api/honor/observe", json=body).json()
    again = client.post("/api/honor/observe", json={**body, "claimed_at": "2026-10-29T21:00:00Z"}).json()
    assert first["accepted"] is True and first["points_awarded"] > 0
    assert again["accepted"] is False and again["points_awarded"] == 0 and "already logged" in again["reason"]


def test_ics_cannot_inject_lines(client):
    r = client.get("/api/scroll/ics", params={"title": "Moon\r\nATTENDEE:mailto:x@y", "start": "2026-10-30T12:00:00Z"})
    assert r.status_code == 200
    assert "\r\nATTENDEE" not in r.text
    assert client.get("/api/scroll/ics", params={"title": "x" * 500, "start": "2026-10-30T12:00:00Z"}).status_code == 422
