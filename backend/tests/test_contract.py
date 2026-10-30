"""Contract tests for every route in app.main (docs/TEST_PLAN.md, B1 row 1).

1. Every route answers a valid call with 200 + the Envelope shape, or with its documented plain/non-JSON shape
   (docs/API.md: "All JSON responses that come from upstream data or computation are wrapped"; state/static
   routes such as alerts, honor, lens jobs, targets, classes document their own unwrapped shapes; ics and png are
   binary). A final test compares the (method, path) pairs exercised with `app.routes`.
2. Validation: missing required params, out-of-range / non-numeric lat, lon, ra, dec, and absurd days / radius /
   limit values give 422 (or the cap the router declares).
3. Hypothesis property tests on the offline, pure-computation routes.
4. Invariants (recursive NaN/Infinity/None scan, ranges, ordering, score = sum of contributions).

Offline by design: `settings.replay_mode = "first"` serves the committed recordings in data/replay-seed, and every
real HTTP call made through app/core/http.py is BLOCKED and recorded unless the test is marked `network`
(a blocked call shows up as a 502 or a degraded answer plus an assertion on NET["calls"]).

The `network` marker is not registered in pytest config (config is not touched by this file). To silence the
PytestUnknownMarkWarning add to pytest.ini / pyproject:   markers = network: reaches a real upstream provider
Deselect the network tests with:   pytest tests/test_contract.py -m "not network"

The coverage test (last in the file) only makes sense when the whole file runs.
"""
from __future__ import annotations

import json
import math
import re
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings as hsettings, strategies as st

from app.alerts import sender as alert_sender
from app.alerts import store as alert_store
from app.core import http as corehttp
from app.core.config import settings
from app.core.envelope import Contribution
from app.honor import store as honor_store
from app.main import app

BACKEND = Path(__file__).resolve().parents[1]
SEED = BACKEND / "data" / "replay-seed"
SAMPLES = BACKEND / "data" / "samples"

# demo coordinates that have recordings in data/replay-seed (scripts/seed_replay.py)
BLR = {"lat": 12.97, "lon": 77.59}
KYOTO = {"lat": 35.01, "lon": 135.77}
# recorded transient (ZTF) object + candid, and recorded SDSS spectrum
OID, CANDID = "ZTF23aapogvn", "2428284011515015006"
SPEC = {"plate": 1615, "mjd": 53166, "fiberid": 544, "run2d": "26"}
SPEC_POS = {"ra": 214.4981, "dec": 25.1368}

# --------------------------------------------------------------------------------------------- bookkeeping

EXERCISED: set[tuple[str, str]] = set()  # (method, route path) that got a VALID call
NET: dict[str, Any] = {"allow": False, "calls": []}  # every real HTTP attempt: (method, url, allowed)
PUSHED: list[tuple[dict, dict]] = []  # fake Web Push deliveries


class _GuardClient:
    """Stands in for core.http.client(): logs every upstream call, blocks it unless NET['allow'] is True."""

    def __init__(self) -> None:
        self._real: httpx.AsyncClient | None = None

    def _client(self) -> httpx.AsyncClient:
        if self._real is None:
            self._real = httpx.AsyncClient(timeout=settings.http_timeout_s, follow_redirects=True,
                                           headers={"User-Agent": settings.user_agent, "Accept": "application/json, */*"})
        return self._real

    async def _go(self, method: str, url: str, kw: dict) -> httpx.Response:
        NET["calls"].append((method, str(url), NET["allow"]))
        if not NET["allow"]:
            raise httpx.ConnectError(f"network blocked by test_contract: {method} {url}")
        c = self._client()
        return await (c.get(url, **kw) if method == "GET" else c.post(url, **kw))

    async def get(self, url, **kw):
        return await self._go("GET", url, kw)

    async def post(self, url, **kw):
        return await self._go("POST", url, kw)


def _fake_push(subscription: dict, payload: dict) -> None:
    PUSHED.append((subscription, payload))


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    """One app for the whole module: tmp data dir holding a copy of the replay seed and the Lens samples."""
    d = tmp_path_factory.mktemp("contract-data")
    shutil.copytree(SEED, d / "replay-seed")  # lifespan copies it into <data_dir>/replay
    shutil.copytree(SAMPLES, d / "samples")  # no sample downloads
    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "data_dir", str(d))
    mp.setattr(settings, "replay_mode", "first")
    mp.setattr(settings, "demo_replay", False)
    mp.setattr(settings, "astrometry_api_key", "")
    mp.setattr(settings, "http_timeout_s", 20.0)
    guard = _GuardClient()
    mp.setattr(corehttp, "client", lambda: guard)
    mp.setattr(alert_sender, "current", _fake_push)
    alert_store.reset_for_tests()
    honor_store.reset_for_tests()
    try:
        with TestClient(app) as c:
            yield c
    finally:
        mp.undo()
        alert_store.reset_for_tests()
        honor_store.reset_for_tests()
        corehttp._client = None


@pytest.fixture
def online():
    NET["allow"] = True
    yield
    NET["allow"] = False


def hit(c: TestClient, method: str, route: str, path: dict | None = None, count: bool = True, **kw) -> httpx.Response:
    """Call `route` (a template from app.routes) and remember it was exercised."""
    if count:
        EXERCISED.add((method, route))
    url = route
    for k, v in (path or {}).items():
        url = url.replace("{" + k + "}", str(v))
    return c.request(method, url, **kw)


def net_calls_since(mark: int) -> list[tuple[str, str, bool]]:
    return NET["calls"][mark:]


# --------------------------------------------------------------------------------------------- invariants

MAX_MOON_AGE = 29.85  # longest synodic month ~29.83 d
NAN_RE = re.compile(r'(?<![\w"])-?(NaN|Infinity)(?![\w"])')
ALT_KEYS = {"altitude", "alt", "sun_alt", "moon_alt", "radiant_alt", "max_alt", "peak_altitude", "altitude_max",
            "max_altitude", "target_alt", "mask_alt"}
AZ_KEYS = {"azimuth", "az", "start_az", "max_az", "end_az"}
PCT_KEYS = {"score", "mean_score", "night_score"}  # 0..100
FRACTION_KEYS = {"illumination", "moon_illum", "darkness", "quality", "sky_fraction_lost"}  # 0..1
NEVER_NULL = {"score", "mean_score", "altitude", "azimuth", "sun_alt", "moon_alt", "moon_illum", "darkness",
              "illumination", "age_days", "phase_deg", "rate_per_hour", "radiant_alt", "max_alt", "weight",
              "contribution", "penalty", "zhr_now", "limiting_magnitude", "magnitude", "moon_separation_deg",
              "geomagnetic_lat", "dark_hours", "sky_fraction_lost", "mean_deg", "kp"}


def scan(obj: Any, path: str = "$", errors: list[str] | None = None) -> list[str]:
    """Walk any JSON value: no NaN/Infinity, no None where a number is required, ranges by key name."""
    errors = [] if errors is None else errors
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}.{k}"
            if v is None and k in NEVER_NULL:
                errors.append(f"{p} is null but must be a number")
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                errors.append(f"{p} = {v}")
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                if k in ALT_KEYS and not -90 <= v <= 90:
                    errors.append(f"{p} = {v} outside ±90")
                if k in AZ_KEYS and not 0 <= v < 360:
                    errors.append(f"{p} = {v} outside [0, 360)")
                if k in PCT_KEYS and not 0 <= v <= 100:
                    errors.append(f"{p} = {v} outside 0..100")
                if k in FRACTION_KEYS and not 0 <= v <= 1:
                    errors.append(f"{p} = {v} outside 0..1")
            if k == "trace" and isinstance(v, dict):
                errors.extend(_trace_errors(v, p))
            scan(v, p, errors)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                errors.append(f"{path}[{i}] = {v}")
            scan(v, f"{path}[{i}]", errors)
    return errors


def _trace_errors(t: dict, path: str) -> list[str]:
    errs = []
    if not isinstance(t.get("formula"), str) or not t["formula"]:
        errs.append(f"{path}.formula missing")
    for k, typ in (("inputs", dict), ("contributions", list), ("notes", list)):
        if not isinstance(t.get(k), typ):
            errs.append(f"{path}.{k} is not a {typ.__name__}")
    for i, c in enumerate(t.get("contributions") or []):
        try:
            Contribution.model_validate(c)
        except Exception as e:  # noqa: BLE001
            errs.append(f"{path}.contributions[{i}] not a Contribution: {e}")
    return errs


def parse_dt(s: str) -> datetime:
    assert isinstance(s, str), f"timestamp is not a string: {s!r}"
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    assert d.tzinfo is not None and d.utcoffset() is not None, f"timestamp without UTC offset: {s}"
    return d


def check_json(r: httpx.Response) -> Any:
    assert r.status_code < 500, f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:400]}"
    assert not NAN_RE.search(r.text), f"NaN/Infinity token in {r.request.url}"
    body = r.json()
    errs = scan(body)
    assert not errs, f"{r.request.url}: " + "; ".join(errs[:10])
    return body


def check_envelope(r: httpx.Response, status: int = 200) -> Any:
    assert r.status_code == status, f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:400]}"
    assert r.headers["content-type"].startswith("application/json")
    body = check_json(r)
    assert isinstance(body, dict) and {"data", "provenance", "computed_at"} <= set(body), f"not an Envelope: {list(body)[:8]}"
    prov = body["provenance"]
    assert isinstance(prov, list) and prov, "provenance must be a non-empty list"
    for p in prov:
        assert isinstance(p.get("source"), str) and p["source"], f"provenance without source: {p}"
        assert isinstance(p.get("stale"), bool) and isinstance(p.get("cached"), bool), f"provenance flags: {p}"
        if p.get("fetched_at"):
            parse_dt(p["fetched_at"])
    parse_dt(body["computed_at"])
    return body["data"]


def check_plain(r: httpx.Response, keys: set[str], status: int = 200) -> Any:
    assert r.status_code == status, f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:400]}"
    body = check_json(r)
    if keys:
        assert isinstance(body, dict) and keys <= set(body), f"documented keys {keys - set(body)} missing"
    return body


def check_png(r: httpx.Response) -> None:
    assert r.status_code == 200, f"{r.request.url} -> {r.status_code}: {r.text[:300]}"
    assert r.headers["content-type"].startswith("image/png")
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def assert_monotonic(times: list[datetime], what: str, strict: bool = True) -> None:
    for a, b in zip(times, times[1:]):
        assert (a < b) if strict else (a <= b), f"{what} not monotonic: {a} then {b}"


# ---- per-route invariants

def inv_score(d: dict, at: datetime | None = None) -> None:
    hours = d["hours"]
    times = [parse_dt(h["time"]) for h in hours]
    assert_monotonic(times, "score hours")
    if at is None and times:
        assert times[0] >= datetime.now(timezone.utc) - timedelta(hours=1), f"score hour {times[0]} is before now-1h"
    for h in hours:
        assert 0 <= h["score"] <= 100
        s = sum(c["contribution"] for c in h["contributions"])
        assert abs(h["score"] - s) <= 0.5, f"hour {h['time']}: score {h['score']} != sum(contributions) {s:.2f}"
        present = [c for c in h["contributions"] if c["quality"] is not None]
        if present:
            assert abs(sum(c["weight"] for c in present) - 1) <= 0.01, "weights of known factors must sum to 1"
        for c in present:  # contribution + penalty = weight x 100 x darkness (score.py score_hour)
            assert abs(c["contribution"] + c["penalty"] - c["weight"] * 100 * h["darkness"]) <= 0.2, c
    tc = d["trace"]["contributions"]
    if not any(h["darkness"] > 0 for h in hours):  # score.py: no dark hour -> no reference hour -> empty breakdown
        assert tc == []
    else:
        st_ = sum(c["contribution"] for c in tc)
        ref = [h for h in hours if h["contributions"] == tc]
        assert ref, "trace.contributions must be the breakdown of one of the hours"
        assert abs(ref[0]["score"] - st_) <= 0.5
    v = d["verdict"]
    assert 0 <= v["score"] <= 100
    assert v["verdict"] == ("go" if v["score"] >= 70 else "maybe" if v["score"] >= 45 else "stay_in")
    if d["best_window"]:
        assert parse_dt(d["best_window"]["start"]) < parse_dt(d["best_window"]["end"])


def inv_sun(d: dict) -> None:
    for k in ("time", "sunset", "astronomical_dusk", "astronomical_dawn", "sunrise"):
        parse_dt(d[k])
    for k in ("civil_dusk", "nautical_dusk", "nautical_dawn", "civil_dawn"):
        if d[k] is not None:
            parse_dt(d[k])
    assert -90 <= d["altitude"] <= 90 and 0 <= d["azimuth"] < 360
    assert d["dark_hours"] >= 0


def inv_sun_order(d: dict) -> None:
    chain = ["sunset", "civil_dusk", "nautical_dusk", "astronomical_dusk", "astronomical_dawn", "nautical_dawn", "civil_dawn", "sunrise"]
    seq = [(k, parse_dt(d[k])) for k in chain if d.get(k) is not None]
    for (ka, a), (kb, b) in zip(seq, seq[1:]):
        assert a < b, f"{ka} {a.isoformat()} is not before {kb} {b.isoformat()}"


def inv_moon(d: dict) -> None:
    assert 0 <= d["illumination"] <= 1
    # TEST_PLAN says [0, 29.6]; a real lunation lasts 29.27-29.83 d, so the age can legitimately reach ~29.8
    # (seen: 29.63 d on 2009-02). The bound is the longest lunation, not the mean.
    assert 0 <= d["age_days"] <= MAX_MOON_AGE
    assert 0 <= d["phase_deg"] < 360
    assert -90 <= d["altitude"] <= 90 and 0 <= d["azimuth"] < 360
    for k in ("time", "rise", "set"):
        if d[k] is not None:
            parse_dt(d[k])
    q = [parse_dt(x["time"]) for x in d["next_quarters"]]
    assert_monotonic(q, "next quarters")


def inv_meteors(showers: list) -> None:
    for s in showers:
        assert s["zhr_now"] >= 0
        assert_monotonic([parse_dt(h["time"]) for h in s["hours"]], f"{s['code']} hours")
        for h in s["hours"]:
            assert h["rate_per_hour"] >= 0, h
            if h["radiant_alt"] <= 0:
                assert h["rate_per_hour"] == 0, f"{s['code']} rate {h['rate_per_hour']} with radiant at {h['radiant_alt']}°"
        if s["hours"]:
            assert s["best_hour"]["rate_per_hour"] == max(h["rate_per_hour"] for h in s["hours"])


def inv_passes(ps: list, min_alt: float = 10) -> None:
    starts = [parse_dt(p["start"]) for p in ps]
    assert_monotonic(starts, "passes")
    for p in ps:
        a, m, b = parse_dt(p["start"]), parse_dt(p["max_time"]), parse_dt(p["end"])
        assert a < m < b, f"pass rise {a} < max {m} < set {b} violated"
        assert p["max_alt"] > min_alt
        assert_monotonic([parse_dt(x["time"]) for x in p["track"]], "pass track")
        assert 0 <= p["visible_seconds"] <= p["duration_s"]


def inv_events(evs: list) -> None:
    starts = [parse_dt(e["start"]) for e in evs]
    assert_monotonic(starts, "events", strict=False)
    ids = [e["id"] for e in evs]
    dups = sorted({i for i in ids if ids.count(i) > 1})
    assert not dups, f"duplicate event ids: {dups}"


def inv_planets(ps: list) -> None:
    assert len(ps) == 7
    for p in ps:
        assert -90 <= p["altitude"] <= 90 and 0 <= p["azimuth"] < 360
        assert p["up_now"] == (p["altitude"] > 0)
        assert 0 <= p["moon_separation_deg"] <= 180
        assert 0 <= p["elongation"] <= 180


def inv_eclipses(es: list) -> None:
    assert_monotonic([parse_dt(e["peak"]) for e in es], "eclipses", strict=False)
    for e in es:
        if e["obscuration"] is not None:
            assert 0 <= e["obscuration"] <= 1
        if e["begins"] and e["ends"]:
            assert parse_dt(e["begins"]) <= parse_dt(e["peak"]) <= parse_dt(e["ends"])


def inv_calendar(d: dict, year: int, month: int) -> None:
    import calendar as _cal
    assert d["year"] == year and d["month"] == month
    assert len(d["days"]) == _cal.monthrange(year, month)[1]
    for day in d["days"]:
        assert 0 <= day["illumination"] <= 1 and 0 <= day["moon_age"] <= MAX_MOON_AGE
        assert 1 <= day["lunar_day"] <= 30 and 1 <= day["lunar_month"] <= 13


def inv_aurora(d: dict) -> None:
    assert -90 <= d["geomagnetic_lat"] <= 90
    assert_monotonic([parse_dt(k["time"]) for k in d["forecast"]], "kp forecast", strict=False)
    for k in d["forecast"]:
        assert 0 <= k["kp"] <= 9
    if d["kp_now"] is not None:
        assert 0 <= d["kp_now"] <= 9


def inv_horizon(d: dict) -> None:
    n = 360 // d["az_step"]
    assert len(d["terrain"]) == len(d["manual"]) == len(d["mask"]) == n
    for t, m, k in zip(d["terrain"], d["manual"], d["mask"]):
        assert -90 <= t <= 90 and 0 <= m <= 90
        assert abs(k - max(t, m)) <= 0.11, "mask must be max(terrain, manual)"
    assert 0 <= d["sky_fraction_lost"] <= 1


# --------------------------------------------------------------------------------------------- 1. every route

def test_health(client):
    check_plain(hit(client, "GET", "/api/health"), {"status", "time", "version"})


def test_watchtower_routes(client):
    m = len(NET["calls"])
    f = check_envelope(hit(client, "GET", "/api/watchtower/forecast", params=BLR))
    times = [parse_dt(t) for t in f["time"]]
    assert times and len(times) == len(f["cloud_cover_low"])
    assert_monotonic(times, "forecast hourly times")
    s = check_envelope(hit(client, "GET", "/api/watchtower/score", params=BLR))
    inv_score(s)
    lp = check_envelope(hit(client, "GET", "/api/watchtower/light-pollution", params=BLR))
    assert 1 <= lp["bortle"] <= 9
    sp = check_envelope(hit(client, "GET", "/api/watchtower/spots", params={**BLR, "radius_km": 60, "limit": 12}))
    assert len(sp["spots"]) <= 12
    for x in sp["spots"]:
        assert x["distance_km"] <= 60 + 0.5 and 0 <= x["night_score"] <= 100
    assert_monotonic([-x["rank_score"] for x in sp["spots"]], "spots ranking", strict=False)
    assert not net_calls_since(m), f"demo-city Watchtower calls reached the network: {net_calls_since(m)}"


def test_forecast_hours_not_before_now_minus_1h(client):
    """TEST_PLAN invariant: forecast hourly times are not before (now - 1 h)."""
    f = check_envelope(hit(client, "GET", "/api/watchtower/forecast", params=BLR))
    first = parse_dt(f["time"][0])
    assert first >= datetime.now(timezone.utc) - timedelta(hours=1), f"forecast starts at {first.isoformat()}, more than 1 h in the past"


def test_scroll_pure_routes(client):
    m = len(NET["calls"])
    inv_moon(check_envelope(hit(client, "GET", "/api/scroll/moon", params=BLR)))
    sun = check_envelope(hit(client, "GET", "/api/scroll/sun", params=BLR))
    inv_sun(sun)
    inv_sun_order(sun)
    inv_eclipses(check_envelope(hit(client, "GET", "/api/scroll/eclipses", params=BLR)))
    inv_meteors(check_envelope(hit(client, "GET", "/api/scroll/meteors", params=BLR)))
    inv_planets(check_envelope(hit(client, "GET", "/api/scroll/planets", params=BLR)))
    now = datetime.now(timezone.utc)
    inv_calendar(check_envelope(hit(client, "GET", "/api/scroll/calendar", params=BLR)), now.year, now.month)
    se = check_envelope(hit(client, "GET", "/api/scroll/season"))
    assert se
    assert not net_calls_since(m), net_calls_since(m)


def test_scroll_upstream_routes(client):
    m = len(NET["calls"])
    inv_passes(check_envelope(hit(client, "GET", "/api/scroll/passes", params={**BLR, "days": 3})))
    ls = check_envelope(hit(client, "GET", "/api/scroll/launches", params=BLR))
    assert len(ls) <= 20
    ev = check_envelope(hit(client, "GET", "/api/scroll/events", params={**BLR, "days": 7}))
    inv_events(ev)
    assert {e["kind"] for e in ev} <= {"moon", "meteor", "eclipse", "satellite", "launch", "planet"}
    assert not net_calls_since(m), net_calls_since(m)


def test_ics(client):
    r = hit(client, "GET", "/api/scroll/ics", params={"title": "Moonrise; test", "start": "2026-11-01T14:30:00Z", "description": "a,b"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    assert r.text.startswith("BEGIN:VCALENDAR") and "DTSTART:20261101T143000Z" in r.text and "SUMMARY:Moonrise\\; test" in r.text


def test_aurora_both_paths(client):
    for route in ("/api/aurora", "/api/aurora/"):
        inv_aurora(check_envelope(hit(client, "GET", route, params=KYOTO)))


def test_alerts_lifecycle(client):
    sub = {"endpoint": "https://push.example.test/contract", "keys": {"p256dh": "BKey", "auth": "auth"}}
    ep = sub["endpoint"]
    k = check_plain(hit(client, "GET", "/api/alerts/vapid-public-key"), {"public_key"})
    assert len(k["public_key"]) == 87
    check_plain(hit(client, "POST", "/api/alerts/subscribe", json={"subscription": sub}), {"subscription_id", "endpoint", "created_at"}, 201)
    fire = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    row = check_plain(hit(client, "POST", "/api/alerts/schedule", json={"endpoint": ep, "title": "t", "body": "b", "fire_at": fire}), {"id"}, 201)
    ev = client.get("/api/scroll/events", params={**BLR, "days": 7, "types": "moon"}).json()["data"]
    assert ev, "need at least one moon event to schedule"
    se = check_plain(hit(client, "POST", "/api/alerts/schedule-event", json={"endpoint": ep, **BLR, "event_id": ev[-1]["id"]}), {"id", "event"}, 201)
    assert se["event"]["id"] == ev[-1]["id"]
    n0 = len(PUSHED)
    t = check_plain(hit(client, "POST", "/api/alerts/test", json={"endpoint": ep}), {"id", "delivery"}, 201)
    assert t["delivery"]["sent"] >= 1 and len(PUSHED) > n0
    lst = check_plain(hit(client, "GET", "/api/alerts/scheduled", params={"endpoint": ep}), set())
    assert isinstance(lst, list) and any(a["id"] == row["id"] for a in lst)
    check_plain(hit(client, "DELETE", "/api/alerts/scheduled/{alert_id}", path={"alert_id": row["id"]}, params={"endpoint": ep}), {"cancelled"})
    check_plain(hit(client, "GET", "/api/alerts/stats"), {"poll_seconds"})
    assert check_plain(hit(client, "DELETE", "/api/alerts/subscribe", params={"endpoint": ep}), {"deleted"})["deleted"] == 1


def test_honor_routes(client):
    m = len(NET["calls"])
    check_plain(hit(client, "GET", "/api/honor/ranks"), {"ranks", "points", "photo_bonus"})
    claimed = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    o = check_plain(hit(client, "POST", "/api/honor/observe", json={**BLR, "user_id": "contract-user", "kind": "custom", "claimed_at": claimed}),
                    {"observation", "accepted", "points_awarded", "reason", "rank"}, 201)
    assert o["points_awarded"] >= 0
    led = check_plain(hit(client, "GET", "/api/honor/ledger", params={"user_id": "contract-user"}), {"user_id", "rank", "verified_count", "rejected_count", "entries"})
    assert len(led["entries"]) == 1
    assert not net_calls_since(m), net_calls_since(m)


def test_horizon_routes(client):
    m = len(NET["calls"])
    inv_horizon(check_envelope(hit(client, "GET", "/api/horizon/terrain", params=BLR)))
    pts = [{"az": 90, "alt": 20}, {"az": 100, "alt": 25}]
    hz = check_envelope(hit(client, "POST", "/api/horizon/mask", json={**BLR, "points": pts}))
    inv_horizon(hz)
    assert max(hz["mask"]) >= 20
    p = check_envelope(hit(client, "POST", "/api/horizon/path", json={**BLR, "target": "m31", "points": pts}))
    inv_horizon(p["horizon"])
    rep = p["report"]
    assert 0 <= rep["minutes_above_mask"] <= rep["minutes_above_geometric"]
    assert rep["minutes_lost_to_skyline"] == rep["minutes_above_geometric"] - rep["minutes_above_mask"]
    assert parse_dt(p["night"]["sunset"]) < parse_dt(p["night"]["sunrise"])
    assert not net_calls_since(m), net_calls_since(m)


def _wait_job(c: TestClient, job_id: str, timeout: float = 150.0) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = hit(c, "GET", "/api/lens/jobs/{job_id}", path={"job_id": job_id}).json()
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.3)
    raise AssertionError(f"lens job {job_id} did not finish in {timeout}s")


@pytest.fixture(scope="module")
def lens_jobs(client):
    """Cheap jobs: the synthetic sample (no WCS) and heic1502a (AVM WCS, its SkyView/SIMBAD/ALeRCE calls are recorded)."""
    ids = {}
    for sid in ("synthetic_field", "heic1502a"):
        r = hit(client, "POST", "/api/lens/jobs", data={"sample_id": sid})
        assert r.status_code == 202, r.text
        ids[sid] = r.json()["job_id"]
    out = {sid: _wait_job(client, jid) for sid, jid in ids.items()}
    return out


def test_lens_routes(client, lens_jobs):
    m = len(NET["calls"])
    check_plain(hit(client, "GET", "/api/lens/status"), {"status", "astrometry_enabled", "stages"})
    samples = check_plain(hit(client, "GET", "/api/lens/samples"), set())
    assert "synthetic_field" in [s["id"] for s in samples]
    r = hit(client, "GET", "/api/lens/samples/{sample_id}", path={"sample_id": "synthetic_field"})
    assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    syn, heic = lens_jobs["synthetic_field"], lens_jobs["heic1502a"]
    assert syn["status"] == "done", syn.get("error")
    check_json(client.get(f"/api/lens/jobs/{syn['job_id']}"))
    check_png(hit(client, "GET", "/api/lens/jobs/{job_id}/image/{kind}", path={"job_id": syn["job_id"], "kind": "overlay"}))
    b = check_plain(hit(client, "POST", "/api/lens/jobs/{job_id}/benchmark", path={"job_id": syn["job_id"]}, params={"n_stars": 5}), {"injected", "recovered"})
    assert 0 <= b["recovered"] <= b["injected"] == 5
    # solve needs an astrometry.net key and a real upstream solve: documented 400 without the key
    r = hit(client, "POST", "/api/lens/jobs/{job_id}/solve", path={"job_id": syn["job_id"]})
    assert r.status_code == 400 and "astrometry" in r.text
    # skyview on a job without WCS: documented 404 ("404 until the WCS is known")
    r = client.get(f"/api/lens/jobs/{syn['job_id']}/skyview")
    assert r.status_code == 404
    assert heic["status"] == "done" and heic["result"]["wcs"]["solved"], "heic1502a should carry an AVM WCS"
    r = hit(client, "GET", "/api/lens/jobs/{job_id}/skyview", path={"job_id": heic["job_id"]})
    check_png(r)
    assert not net_calls_since(m), net_calls_since(m)


def test_lens_catalog(client, lens_jobs):
    """SIMBAD matches for the AVM-solved sample: Envelope, and offline under replay-first (the cones are recorded)."""
    m = len(NET["calls"])
    heic = lens_jobs["heic1502a"]
    cat = check_envelope(hit(client, "GET", "/api/lens/jobs/{job_id}/catalog", path={"job_id": heic["job_id"]}))
    assert cat["queried"] <= 10 and len(cat["matches"]) <= cat["queried"]
    assert not net_calls_since(m), f"catalog reached the network in replay-first mode: {net_calls_since(m)}"


def test_transient_routes(client, lens_jobs):
    m = len(NET["calls"])
    check_plain(hit(client, "GET", "/api/transients/classes"), {"classes"})
    n = check_envelope(hit(client, "GET", "/api/transients/near", params={"ra": 10.68, "dec": 41.27, "radius_arcsec": 600, "limit": 25}))
    assert len(n["objects"]) <= 25
    rc = check_envelope(hit(client, "GET", "/api/transients/recent", params={"class_name": "SNIa", "min_probability": 0.7, "limit": 25, **BLR}))
    assert len(rc["objects"]) <= 25
    f = check_envelope(hit(client, "GET", "/api/transients/field/{job_id}", path={"job_id": lens_jobs["heic1502a"]["job_id"]}))
    assert f["radius_arcsec"] <= 3600
    o = check_envelope(hit(client, "GET", "/api/transients/{oid}", path={"oid": OID}, params=BLR))
    assert o["visibility"]["max_altitude"] <= 90
    check_envelope(hit(client, "GET", "/api/transients/{oid}/lightcurve", path={"oid": OID}))
    check_png(hit(client, "GET", "/api/transients/{oid}/stamps/{candid}/{kind}.png", path={"oid": OID, "candid": CANDID, "kind": "science"}))
    s = check_envelope(hit(client, "POST", "/api/transients/{oid}/subtract", path={"oid": OID}, params={"candid": CANDID}))
    assert s["oid"] == OID
    jid = lens_jobs["synthetic_field"]["job_id"]
    check_envelope(hit(client, "POST", "/api/transients/subtract-jobs", params={"job_old": jid, "job_new": jid}))
    assert not net_calls_since(m), net_calls_since(m)


def test_spectra_routes(client):
    m = len(NET["calls"])
    n = check_envelope(hit(client, "GET", "/api/spectra/near", params={**SPEC_POS, "radius_arcmin": 1.0, "limit": 1}))
    assert len(n["objects"]) <= 1
    sp = check_envelope(hit(client, "GET", "/api/spectra/spectrum/{plate}/{mjd}/{fiberid}",
                            path={k: SPEC[k] for k in ("plate", "mjd", "fiberid")}, params={"run2d": SPEC["run2d"]}))
    assert len(sp["wavelength"]) == len(sp["flux"]) <= 900  # sdss.parse caps the series at max_points=900
    assert_monotonic(sp["wavelength"], "wavelength")
    a = check_envelope(hit(client, "GET", "/api/spectra/at", params=SPEC_POS))
    assert a["binned_to"] <= 900
    assert not net_calls_since(m), net_calls_since(m)


def test_planner_targets(client):
    t = check_plain(hit(client, "GET", "/api/planner/targets"), {"targets", "equipment"})
    assert any(x["id"] == "m31" for x in t["targets"])


@pytest.mark.network
def test_planner_plan(client, online):
    """Planner for Bengaluru: its multi-point forecast key depends on tonight's spot ranking, so it may miss the
    recordings and go to the network (marked network)."""
    m = len(NET["calls"])
    p = check_envelope(hit(client, "POST", "/api/planner/plan", json={**BLR, "target": "m31"}))
    assert len(p["candidates"]) <= 6 + 1 + 4
    for c in p["candidates"]:
        assert 0 <= c["usable_minutes"]
        assert_monotonic([parse_dt(s["time"]) for s in c["timeline"]], "plan timeline")
    print("planner network calls:", net_calls_since(m))


# --------------------------------------------------------------------------------------------- 2. validation

def _routes() -> list[Any]:
    """Every API route with its full path. FastAPI 0.16x keeps included routers as `_IncludedRouter` entries in
    app.routes, so walk their effective route contexts (which carry the prefixed path, methods and dependant)."""
    def walk(rs):
        for r in rs:
            if isinstance(r, APIRoute) or type(r).__name__ == "_EffectiveRouteContext":
                yield r
            elif hasattr(r, "effective_candidates"):
                yield from walk(r.effective_candidates())
    return list(walk(app.routes))


DUMMY_PATH = {"alert_id": "1", "plate": "1", "mjd": "1", "fiberid": "1", "kind": "overlay"}


def _fill(path: str) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: DUMMY_PATH.get(m.group(1), "x"), path)


def _required_cases():
    out = []
    for r in _routes():
        dep = r.dependant
        req_q = [p.name for p in dep.query_params if p.field_info.is_required()]
        req_b = [p.name for p in dep.body_params if p.field_info.is_required()]
        if req_q or req_b:
            for m in sorted(r.methods):
                out.append(pytest.param(m, r.path, id=f"{m} {r.path}"))
    return out


@pytest.mark.parametrize("method,path", _required_cases())
def test_missing_required_params_give_422(client, method, path):
    r = client.request(method, _fill(path))
    assert r.status_code == 422, f"{method} {path} without required params -> {r.status_code}: {r.text[:200]}"


# valid params for each route that takes lat/lon in the query (offline: recorded or pure)
LATLON_ROUTES = {
    "/api/watchtower/forecast": {}, "/api/watchtower/score": {}, "/api/watchtower/light-pollution": {},
    "/api/watchtower/spots": {"radius_km": 60, "limit": 12},
    "/api/scroll/moon": {}, "/api/scroll/sun": {}, "/api/scroll/eclipses": {}, "/api/scroll/meteors": {},
    "/api/scroll/passes": {"days": 0.2}, "/api/scroll/launches": {}, "/api/scroll/planets": {}, "/api/scroll/calendar": {},
    "/api/scroll/events": {"days": 1}, "/api/aurora": {}, "/api/aurora/": {}, "/api/horizon/terrain": {},
    "/api/transients/recent": {"class_name": "SNIa", "min_probability": 0.7, "limit": 25},
    f"/api/transients/{OID}": {},
}
BAD_LATLON = [("lat", 91), ("lat", -91), ("lon", 181), ("lon", -181), ("lat", "abc"), ("lon", "abc"), ("lat", "nan"), ("lon", "inf")]


def test_latlon_route_table_is_complete():
    """Every route declaring lat/lon query params is in LATLON_ROUTES (so the next test cannot silently skip one)."""
    have = set()
    for r in _routes():
        names = {p.name for p in r.dependant.query_params}
        if {"lat", "lon"} <= names:
            have.add(r.path.replace("{oid}", OID))
    assert have == set(LATLON_ROUTES), have ^ set(LATLON_ROUTES)


@pytest.mark.parametrize("path", list(LATLON_ROUTES))
@pytest.mark.parametrize("name,bad", BAD_LATLON, ids=[f"{n}={v}" for n, v in BAD_LATLON])
def test_bad_latlon_gives_422(client, path, name, bad):
    params = {**BLR, **LATLON_ROUTES[path], name: bad}
    r = client.get(path, params=params)
    assert r.status_code == 422, f"GET {path}?{name}={bad} -> {r.status_code}: {r.text[:200]}"


BODY_LATLON = {
    "/api/honor/observe": {"user_id": "contract-user", "kind": "custom", "claimed_at": "2026-10-01T00:00:00Z"},
    "/api/planner/plan": {"target": "m31"},
    "/api/horizon/mask": {"use_terrain": False},
    "/api/horizon/path": {"target": "m31", "use_terrain": False},
    "/api/alerts/schedule-event": {"endpoint": "https://push.example.test/latlon", "event_id": "none"},
}


@pytest.mark.parametrize("path", list(BODY_LATLON))
@pytest.mark.parametrize("name,bad", BAD_LATLON[:4], ids=[f"{n}={v}" for n, v in BAD_LATLON[:4]])
def test_bad_latlon_in_body_gives_422(client, path, name, bad):
    if path == "/api/alerts/schedule-event":  # subscribe first so a missing bound is not masked by the 404
        client.post("/api/alerts/subscribe", json={"subscription": {"endpoint": BODY_LATLON[path]["endpoint"], "keys": {"p256dh": "k", "auth": "a"}}})
    r = client.post(path, json={**BLR, **BODY_LATLON[path], name: bad})
    assert r.status_code == 422, f"POST {path} with {name}={bad} -> {r.status_code}: {r.text[:200]}"


RADEC_ROUTES = {
    "/api/spectra/near": {"limit": 1}, "/api/spectra/at": {},
    "/api/transients/near": {"radius_arcsec": 600, "limit": 25},
}


@pytest.mark.parametrize("path", list(RADEC_ROUTES))
@pytest.mark.parametrize("name,bad", [("ra", -1), ("ra", 361), ("dec", 91), ("dec", -91), ("ra", "abc")])
def test_bad_radec_gives_422(client, path, name, bad):
    r = client.get(path, params={"ra": 10.68, "dec": 41.27, **RADEC_ROUTES[path], name: bad})
    assert r.status_code == 422, f"GET {path}?{name}={bad} -> {r.status_code}: {r.text[:200]}"


# absurd values: each router declares a cap, so the answer must be 422 (none of these clamp silently)
ABSURD_QUERY = [
    ("/api/watchtower/forecast", {**BLR, "days": 1000}),
    ("/api/watchtower/forecast", {**BLR, "days": 0}),
    ("/api/watchtower/score", {**BLR, "window_hours": 1000}),
    ("/api/watchtower/spots", {**BLR, "radius_km": 100000}),
    ("/api/watchtower/spots", {**BLR, "radius_km": -5}),
    ("/api/watchtower/spots", {**BLR, "limit": 100000}),
    ("/api/scroll/passes", {**BLR, "days": 1000}),
    ("/api/scroll/passes", {**BLR, "min_alt": 1000}),
    ("/api/scroll/events", {**BLR, "days": 1000}),
    ("/api/scroll/events", {**BLR, "days": -1}),
    ("/api/scroll/launches", {**BLR, "limit": 100000}),
    ("/api/scroll/eclipses", {**BLR, "lunar": 1000}),
    ("/api/scroll/eclipses", {**BLR, "solar": 1000}),
    ("/api/scroll/calendar", {**BLR, "month": 13}),
    ("/api/scroll/calendar", {**BLR, "year": 99999}),  # no bound declared on `year`
    ("/api/scroll/calendar", {**BLR, "year": -5}),  # no bound declared on `year`
    ("/api/scroll/meteors", {**BLR, "bortle": 100}),
    ("/api/transients/near", {"ra": 10.68, "dec": 41.27, "radius_arcsec": 1e7}),
    ("/api/transients/near", {"ra": 10.68, "dec": 41.27, "limit": 100000}),
    ("/api/transients/recent", {"limit": 100000}),
    ("/api/transients/recent", {"min_probability": 5}),
    ("/api/transients/field/x", {"limit": 100000}),
    ("/api/spectra/near", {**SPEC_POS, "radius_arcmin": 1e6}),
    ("/api/spectra/near", {**SPEC_POS, "limit": 100000}),
    ("/api/spectra/at", {**SPEC_POS, "radius_arcmin": 1e6}),
    ("/api/scroll/sun", {**BLR, "at": "not-a-date"}),
    ("/api/scroll/ics", {"title": "x", "start": "not-a-date"}),
]


@pytest.mark.parametrize("path,params", ABSURD_QUERY, ids=[f"{p}?{'&'.join(f'{k}={v}' for k, v in q.items() if k not in ('lat', 'lon', 'ra', 'dec'))}" for p, q in ABSURD_QUERY])
def test_absurd_query_values_give_422(client, path, params):
    r = client.get(path, params=params)
    assert r.status_code == 422, f"GET {path} {params} -> {r.status_code}: {r.text[:200]}"


def test_absurd_post_values_give_422(client):
    cases = [
        ("/api/lens/jobs/x/benchmark", {"params": {"n_stars": 100000}}),
        ("/api/lens/jobs", {"data": {"sample_id": "synthetic_field", "deblur_iterations": 100000}}),
        ("/api/lens/jobs", {"data": {"sample_id": "synthetic_field", "detect_sigma": 1e6}}),
        ("/api/lens/jobs", {"data": {"sample_id": "synthetic_field", "denoise_strength": 5}}),
        ("/api/transients/subtract-jobs", {"params": {"job_old": "a", "job_new": "b", "nsigma": 1e6}}),
        ("/api/planner/plan", {"json": {**BLR, "target": "m31", "travel_limit_km": 1e6}}),
        ("/api/planner/plan", {"json": {**BLR, "target": "m31", "candidate_limit": 100000}}),
        ("/api/planner/plan", {"json": {**BLR, "target": "m31", "earliest_local": "25:99:00"}}),
        ("/api/alerts/schedule-event", {"json": {"endpoint": "e", **BLR, "event_id": "x", "days": 1000}}),
        ("/api/alerts/schedule-event", {"json": {"endpoint": "e", **BLR, "event_id": "x", "lead_minutes": 10**7}}),
        ("/api/alerts/test", {"json": {"endpoint": "e", "delay_seconds": 10**9}}),
        ("/api/honor/observe", {"json": {**BLR, "user_id": "ab"}}),
        ("/api/honor/observe", {"json": {**BLR, "user_id": "contract-user", "note": "x" * 501}}),
        ("/api/horizon/mask", {"json": {**BLR, "points": [{"az": 400, "alt": 10}]}}),
        ("/api/horizon/mask", {"json": {**BLR, "points": [{"az": 10, "alt": 100}]}}),
    ]
    bad = []
    for path, kw in cases:
        r = client.post(path, **kw)
        if r.status_code != 422:
            bad.append(f"POST {path} {kw} -> {r.status_code}")
    assert not bad, bad
    r = client.get("/api/lens/jobs/x/image/overlay", params={"stretch": "bogus"})
    assert r.status_code == 422


def test_horizon_mask_point_count_is_capped(client):
    """The `max_points` case: a traced skyline has a few hundred points; 20 000 must be refused (422/413) or capped."""
    pts = [{"az": (i * 0.018) % 360, "alt": 5} for i in range(20000)]
    r = client.post("/api/horizon/mask", json={**BLR, "use_terrain": False, "points": pts})
    assert r.status_code in (413, 422), f"POST /api/horizon/mask with {len(pts)} points -> {r.status_code} (no max length on `points`)"


def test_passes_unknown_satellite_name_is_4xx(client):
    r = client.get("/api/scroll/passes", params={**BLR, "sat": "NOT-A-SATELLITE"})
    assert 400 <= r.status_code < 500, f"sat=NOT-A-SATELLITE -> {r.status_code}: {r.text[:200]}"


def test_unknown_ids_give_404(client):
    """Routes whose resource would cost a real upstream call to create are checked with a missing id."""
    for path in ("/api/lens/jobs/nope", "/api/lens/jobs/nope/image/overlay", "/api/lens/jobs/nope/skyview",
                 "/api/lens/jobs/nope/catalog", "/api/transients/field/nope", "/api/lens/samples/nope"):
        r = client.get(path)
        assert r.status_code == 404, f"GET {path} -> {r.status_code}"
    for path in ("/api/lens/jobs/nope/benchmark", "/api/lens/jobs/nope/solve"):
        r = client.post(path)
        assert r.status_code in (400, 404), f"POST {path} -> {r.status_code}"
    r = client.get("/api/lens/jobs/x/image/bogus")
    assert r.status_code == 404
    r = client.post("/api/transients/subtract-jobs", params={"job_old": "a", "job_new": "b"})
    assert r.status_code == 404
    r = client.get(f"/api/transients/{OID}/stamps/{CANDID}/bogus.png")
    assert r.status_code == 404
    r = client.post("/api/alerts/schedule", json={"endpoint": "https://push.example.test/never", "title": "t", "body": "b", "fire_at": "2030-01-01T00:00:00Z"})
    assert r.status_code == 404
    r = client.delete("/api/alerts/scheduled/999999", params={"endpoint": "https://push.example.test/never"})
    assert r.status_code == 404
    r = client.post("/api/alerts/subscribe", json={"subscription": {"endpoint": "x"}})
    assert r.status_code == 400


# --------------------------------------------------------------------------------------------- 3. hypothesis

LAT = st.floats(min_value=-89.9, max_value=89.9, allow_nan=False, allow_infinity=False)
LON = st.floats(min_value=-180, max_value=180, allow_nan=False, allow_infinity=False)
WHEN = st.one_of(st.none(), st.datetimes(min_value=datetime(1990, 1, 1), max_value=datetime(2060, 12, 31), timezones=st.just(timezone.utc)))
PROP = hsettings(max_examples=25, deadline=None, database=None, suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow])


def _q(lat, lon, at=None, key="at", **extra):
    q = {"lat": round(lat, 4), "lon": round(lon, 4), **extra}
    if at is not None:
        q[key] = at.isoformat()
    return q


def _offline(c: TestClient, path: str, params: dict) -> Any:
    m = len(NET["calls"])
    d = check_envelope(c.get(path, params=params))
    assert not net_calls_since(m), f"{path} reached the network: {net_calls_since(m)}"
    return d


@PROP
@given(lat=LAT, lon=LON, at=WHEN)
def test_prop_moon(client, lat, lon, at):
    inv_moon(_offline(client, "/api/scroll/moon", _q(lat, lon, at)))


@PROP
@given(lat=LAT, lon=LON, at=WHEN)
def test_prop_sun_shape(client, lat, lon, at):
    inv_sun(_offline(client, "/api/scroll/sun", _q(lat, lon, at)))


@PROP
@given(lat=LAT, lon=LON, at=WHEN)
def test_prop_sun_order(client, lat, lon, at):
    """sunset < dusk < dawn < sunrise (with the civil/nautical twilights in between when present)."""
    inv_sun_order(_offline(client, "/api/scroll/sun", _q(lat, lon, at)))


@PROP
@given(lat=LAT, lon=LON, at=WHEN)
def test_prop_planets(client, lat, lon, at):
    inv_planets(_offline(client, "/api/scroll/planets", _q(lat, lon, at)))


@PROP
@given(lat=LAT, lon=LON, at=WHEN, bortle=st.one_of(st.none(), st.floats(min_value=1, max_value=9)))
def test_prop_meteors(client, lat, lon, at, bortle):
    extra = {} if bortle is None else {"bortle": round(bortle, 2)}
    inv_meteors(_offline(client, "/api/scroll/meteors", _q(lat, lon, at, **extra)))


@PROP
@given(lat=LAT, lon=LON, at=WHEN)
def test_prop_eclipses(client, lat, lon, at):
    es = _offline(client, "/api/scroll/eclipses", _q(lat, lon, at, key="start", lunar=2, solar=1))
    assert len(es) == 3
    inv_eclipses(es)


@hsettings(PROP, max_examples=6)  # ~8 s per month calendar; 25 examples alone would take > 3 min
@given(lat=LAT, lon=LON, year=st.integers(min_value=1990, max_value=2060), month=st.integers(min_value=1, max_value=12))
def test_prop_calendar(client, lat, lon, year, month):
    inv_calendar(_offline(client, "/api/scroll/calendar", _q(lat, lon, year=year, month=month)), year, month)


@PROP
@given(at=WHEN)
def test_prop_season(client, at):
    _offline(client, "/api/scroll/season", {} if at is None else {"at": at.isoformat()})


@PROP
@given(lat=LAT, lon=LON, at=WHEN)
def test_prop_aurora(client, lat, lon, at):
    """NOAA SWPC recordings are location-free, so any point is offline."""
    inv_aurora(_offline(client, "/api/aurora", _q(lat, lon, at)))


@PROP
@given(lat=LAT, lon=LON, at=WHEN, days=st.integers(min_value=1, max_value=10))
def test_prop_events_offline_types(client, lat, lon, at, days):
    """moon, meteor, eclipse, planet are computed; launch uses the location-free Launch Library recording."""
    inv_events(_offline(client, "/api/scroll/events", _q(lat, lon, at, key="start", days=days, types="moon,meteor,eclipse,planet,launch")))


@PROP
@given(lat=LAT, lon=LON, at=st.one_of(st.none(), st.datetimes(min_value=datetime(2026, 10, 25), max_value=datetime(2026, 11, 5), timezones=st.just(timezone.utc))))
def test_prop_passes(client, lat, lon, at):
    """The ISS TLE recording is location-free; a short window keeps SGP4 fast and close to the TLE epoch."""
    inv_passes(_offline(client, "/api/scroll/passes", _q(lat, lon, at, key="start", days=0.5)))


@PROP
@given(lat=LAT, lon=LON, pts=st.lists(st.fixed_dictionaries({"az": st.floats(0, 360), "alt": st.floats(0, 90)}), max_size=30))
def test_prop_horizon_mask_flat(client, lat, lon, pts):
    m = len(NET["calls"])
    r = client.post("/api/horizon/mask", json={"lat": round(lat, 4), "lon": round(lon, 4), "points": pts, "use_terrain": False})
    hz = check_envelope(r)
    assert not net_calls_since(m)
    inv_horizon(hz)
    assert all(t == 0 for t in hz["terrain"])


# --------------------------------------------------------------------------------------------- 5. edge, network

@pytest.mark.network
@pytest.mark.parametrize("path", ["/api/watchtower/score", "/api/watchtower/forecast"])
def test_null_island_score_and_forecast(client, online, path):
    """lat=0&lon=0 has no recording: live Open-Meteo. 200 with the invariants, or the documented 502."""
    r = client.get(path, params={"lat": 0, "lon": 0})
    if r.status_code == 502:
        assert r.json()["error"] == "provider_unavailable"
        pytest.fail(f"upstream unreachable for {path} at 0,0: {r.text[:200]}")
    d = check_envelope(r)
    if path.endswith("score"):
        inv_score(d)
    else:
        assert_monotonic([parse_dt(t) for t in d["time"]], "forecast hourly times")


@pytest.mark.network
def test_null_island_spots(client, online):
    """Open ocean: Overpass finds nothing. Must not 5xx; an empty list must say why."""
    r = client.get("/api/watchtower/spots", params={"lat": 0, "lon": 0, "radius_km": 20, "limit": 5})
    assert r.status_code < 500, f"spots at 0,0 -> {r.status_code}: {r.text[:200]}"
    body = r.json()
    d = check_envelope(r)
    if not d["spots"]:
        notes = [p.get("note") for p in body["provenance"] if p.get("note")]
        assert d.get("message") or d.get("note") or notes, f"empty spots without any message: {d}"


# --------------------------------------------------------------------------------------------- coverage (keep last)

def test_every_route_exercised():
    all_routes = {(m, r.path) for r in _routes() for m in r.methods}
    missing = sorted(all_routes - EXERCISED)
    extra = sorted(EXERCISED - all_routes)
    print(f"\n{len(all_routes)} (method, path) pairs in app.routes; exercised {len(EXERCISED & all_routes)}")
    for m, p in missing:
        print("  untested:", m, p)
    assert not extra, f"tests named routes that do not exist: {extra}"
    assert not missing, f"untested routes: {missing}"
