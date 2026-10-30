"""Chaos tests (docs/TEST_PLAN.md B1 row 2): every upstream misbehaves, the API stays honest.

All upstream traffic goes through app.core.http.fetch, which uses the module-global httpx.AsyncClient. Each test
installs an httpx.MockTransport whose handler answers by hostname, either with a plausible healthy payload or with
an injected fault (timeout, 429, 500, HTML, truncated JSON, empty payload, Overpass "remark"). Nothing touches the
real network: an unknown host raises ConnectError and is counted.

The rules being specified:
  1. no cache + no replay + fault  -> 502 provider_unavailable, or (where the route can legitimately degrade) 200
     whose provenance/data names the failed source. Never a 500, never 200 with silent empty/zero data.
  2. fresh cache + fault            -> 200, provenance cached: true, the faulty upstream not even contacted.
  3. stale cache + fault            -> 200, provenance stale: true with a note about the failure.
  4. replay modes                   -> fallback serves recordings after failure, off ignores them, first never calls out.
  5. corrupted cache/replay files   -> ignored or rebuilt; never a 500.
  6. Overpass 200-with-remark       -> not cached, not recorded, never a "successful" empty spots list.
  7. any 200 payload the app cannot use is treated like a failure (not cached, stale/replay/502).

The app is NOT started with its lifespan (TestClient is used without `with`): the lifespan copies the replay seed,
downloads the Lens samples over the real network and starts the Overpass warm-up and alert worker in the
background, all of which would make these tests non-hermetic. Replay is therefore empty unless a test records one.

The Lens SkyView route is not covered: it needs a finished Lens job with a solved WCS, and the only cheap sample
(synthetic_field) has no WCS, so the route answers 404 before any upstream call (see tests/test_lens.py).
"""
from __future__ import annotations

import io
import json
import shutil
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import cache as cachemod
from app.core import http as corehttp
from app.core.config import settings
from app.lens import catalog
from app.main import app

FITS_FIXTURE = Path(__file__).parent / "fixtures" / "spec-1615-53166-0544.fits"

BLR = {"lat": 12.97, "lon": 77.59}
FAIRBANKS = {"lat": 64.84, "lon": -147.72}
TLE_EPOCH_START = "2008-09-21T00:00:00Z"  # near the epoch of the TLE below, so SGP4 stays valid

ISS_TLE = (
    "ISS (ZARYA)\n"
    "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927\n"
    "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537\n"
)

HTML_PAGE = "<!DOCTYPE html>\n<html>\n<head><title>502 Bad Gateway</title></head>\n<body>\n<h1>502 Bad Gateway</h1>\n</body>\n</html>\n"
TRUNCATED_JSON = '{"hourly": {"time": ['
OVERPASS_REMARK = {"version": 0.6, "elements": [], "remark": 'runtime error: Query timed out in "query" at line 3 after 41 seconds.'}

FAULTS = ["timeout", "http429", "http500", "html", "truncated", "empty"]

# upstream key -> (provenance source, cache directory name)
SOURCES = {
    "open-meteo": ("open-meteo", "open-meteo"),
    "elevation": ("open-meteo-elevation", "open-meteo-elevation"),
    "air": ("open-meteo-air-quality", "open-meteo-air-quality"),
    "ensemble": ("open-meteo-ensemble", "open-meteo-ensemble"),
    "gibs": ("nasa-gibs", "gibs-tiles"),
    "overpass": ("overpass", "overpass"),
    "celestrak": ("celestrak", "celestrak"),
    "ll2": ("launch-library-2", "launch-library-2"),
    "alerce": ("alerce", "alerce"),
    "sdss-sql": ("sdss-skyserver", "sdss-skyserver"),
    "sdss-fits": ("sdss-sas", "sdss-spectra"),
    "simbad": ("simbad", "simbad"),
    "swpc": ("noaa-swpc", "noaa-swpc"),
}


# ------------------------------------------------------------------------------------------- fake upstreams

def classify(request: httpx.Request) -> str | None:
    host, path = request.url.host, request.url.path
    if host == "api.open-meteo.com":
        return "elevation" if "elevation" in path else "open-meteo"
    if host == "air-quality-api.open-meteo.com":
        return "air"
    if host == "ensemble-api.open-meteo.com":
        return "ensemble"
    if host == "gibs.earthdata.nasa.gov":
        return "gibs"
    if host == "overpass-api.de":
        return "overpass"
    if host == "celestrak.org":
        return "celestrak"
    if host == "ll.thespacedevs.com":
        return "ll2"
    if host.endswith("alerce.online"):
        return "alerce"
    if host == "skyserver.sdss.org":
        return "sdss-sql"
    if host == "dr17.sdss.org":
        return "sdss-fits"
    if host.startswith("simbad."):
        return "simbad"
    if host == "services.swpc.noaa.gov":
        return "swpc"
    if host == "skyview.gsfc.nasa.gov":
        return "skyview"
    return None


def _hours(days: int) -> list[str]:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    return [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range((days + 2) * 24)]


def _n_points(request: httpx.Request) -> tuple[list[float], list[float]]:
    lats = [float(x) for x in request.url.params.get("latitude", "0").split(",")]
    lons = [float(x) for x in request.url.params.get("longitude", "0").split(",")]
    return lats, lons


def healthy_forecast(request: httpx.Request) -> httpx.Response:
    lats, lons = _n_points(request)
    times = _hours(int(request.url.params.get("forecast_days", "2")))
    n = len(times)
    pts = []
    for la, lo in zip(lats, lons):
        pts.append({
            "latitude": la, "longitude": lo, "elevation": 900.0, "timezone": "GMT", "utc_offset_seconds": 0,
            "hourly": {
                "time": times, "cloud_cover": [10] * n, "cloud_cover_low": [5] * n, "cloud_cover_mid": [5] * n,
                "cloud_cover_high": [10] * n, "relative_humidity_2m": [55] * n, "visibility": [24000] * n,
                "wind_speed_10m": [6.0] * n, "temperature_2m": [19.0] * n, "dew_point_2m": [9.0] * n,
            },
        })
    return httpx.Response(200, json=pts if len(pts) > 1 else pts[0])


def healthy_elevation(request: httpx.Request) -> httpx.Response:
    lats, _ = _n_points(request)
    return httpx.Response(200, json={"elevation": [900.0 + (i % 7) * 15 for i in range(len(lats))]})


def healthy_air(request: httpx.Request) -> httpx.Response:
    times = _hours(int(request.url.params.get("forecast_days", "2")))
    return httpx.Response(200, json={"utc_offset_seconds": 0, "hourly": {"time": times, "aerosol_optical_depth": [0.12] * len(times), "dust": [2.0] * len(times)}})


def healthy_ensemble(request: httpx.Request) -> httpx.Response:
    times = _hours(int(request.url.params.get("forecast_days", "2")))
    n = len(times)
    return httpx.Response(200, json={"hourly": {"time": times, "cloud_cover": [10] * n, "cloud_cover_member01": [14] * n, "cloud_cover_member02": [8] * n}})


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (256, 256), (40, 40, 40)).save(buf, format="PNG")
    return buf.getvalue()


PNG_TILE = _png()


def healthy_gibs(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=PNG_TILE, headers={"content-type": "image/png"})


def overpass_elements() -> list[dict[str, Any]]:
    offs = [(0.12, 0.05), (-0.2, 0.1), (0.25, -0.22), (-0.3, -0.3), (0.05, 0.35), (0.38, 0.12)]
    return [
        {"type": "node", "id": 1000 + i, "lat": BLR["lat"] + a, "lon": BLR["lon"] + b, "tags": {"natural": "peak", "name": f"Test Peak {i}", "ele": str(900 + 60 * i)}}
        for i, (a, b) in enumerate(offs)
    ]


def healthy_overpass(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"version": 0.6, "elements": overpass_elements()})


def healthy_celestrak(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=ISS_TLE.encode("ascii"), headers={"content-type": "text/plain"})


def healthy_ll2(request: httpx.Request) -> httpx.Response:
    net = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return httpx.Response(200, json={"count": 1, "results": [{
        "id": "chaos-launch-1", "name": "Falcon 9 | Chaos Test", "net": net, "window_start": net, "window_end": net,
        "status": {"abbrev": "Go"}, "launch_service_provider": {"name": "SpaceX"},
        "rocket": {"configuration": {"full_name": "Falcon 9 Block 5"}}, "mission": {"name": "Chaos"},
        "pad": {"name": "SLC-40", "latitude": "28.56", "longitude": "-80.57", "location": {"name": "Cape Canaveral, FL, USA"}},
        "vid_urls": [], "image": None,
    }]})


def healthy_alerce(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"total": 1, "items": [{
        "oid": "ZTF26chaosaa", "meanra": 150.1, "meandec": 2.2, "ndet": 12, "firstmjd": 61300.1, "lastmjd": 61340.2,
        "deltajd": 40.1, "class": "SNIa", "classifier": "lc_classifier", "probability": 0.8, "stellar": False,
    }]})


def healthy_sdss_sql(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=[{"TableName": "Table1", "Rows": [{
        "specObjID": "1818100000000000000", "plate": 1615, "mjd": 53166, "fiberID": 544, "class": "GALAXY", "subClass": "",
        "z": 0.0042, "zErr": 0.00001, "ra": 187.7059, "dec": 12.3911, "survey": "sdss", "run2d": "26", "snMedian": 20.0, "distance": 0.01,
    }]}])


def healthy_sdss_fits(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=FITS_FIXTURE.read_bytes(), headers={"content-type": "application/fits"})


def healthy_simbad(request: httpx.Request) -> httpx.Response:
    q = request.url.params.get("QUERY", "")
    if "TOP 1 main_id FROM basic" in q:
        return httpx.Response(200, json={"data": [["M   1"]]})
    return httpx.Response(200, json={"data": [[314.75, 44.33, "NGC  7000", "HII"]]})


def healthy_swpc(request: httpx.Request) -> httpx.Response:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    path = request.url.path
    if "k-index-forecast" in path:
        rows = [{"time_tag": (now + timedelta(hours=3 * i - 6)).strftime("%Y-%m-%dT%H:%M:%S"), "kp": 4.33, "observed": "predicted", "noaa_scale": None} for i in range(24)]
        return httpx.Response(200, json=rows)
    if "k_index_1m" in path:
        return httpx.Response(200, json=[{"time_tag": now.strftime("%Y-%m-%dT%H:%M:%S"), "kp_index": 3, "estimated_kp": 3.33}])
    return httpx.Response(200, json={"0": {"G": {"Scale": "1", "Text": "minor"}}})


HEALTHY = {
    "open-meteo": healthy_forecast, "elevation": healthy_elevation, "air": healthy_air, "ensemble": healthy_ensemble,
    "gibs": healthy_gibs, "overpass": healthy_overpass, "celestrak": healthy_celestrak, "ll2": healthy_ll2,
    "alerce": healthy_alerce, "sdss-sql": healthy_sdss_sql, "sdss-fits": healthy_sdss_fits, "simbad": healthy_simbad,
    "swpc": healthy_swpc,
}

BINARY = {"gibs", "celestrak", "sdss-fits", "skyview"}


def empty_payload(key: str, request: httpx.Request) -> httpx.Response:
    """A 200 with the upstream's natural empty container (or zero bytes for binary upstreams)."""
    if key in BINARY:
        return httpx.Response(200, content=b"", headers={"content-type": "application/octet-stream"})
    if key == "sdss-sql" or (key == "swpc" and "scales" not in request.url.path):
        return httpx.Response(200, json=[])
    return httpx.Response(200, json={})


def fault_response(key: str, fault: str, request: httpx.Request) -> httpx.Response:
    if fault == "timeout":
        raise httpx.ReadTimeout("simulated read timeout", request=request)
    if fault == "http429":
        return httpx.Response(429, text="Too Many Requests", headers={"retry-after": "1"})
    if fault == "http500":
        return httpx.Response(500, text="Internal Server Error")
    if fault == "down":
        return httpx.Response(503, text="Service Unavailable")
    if fault == "html":
        return httpx.Response(200, text=HTML_PAGE, headers={"content-type": "text/html; charset=utf-8"})
    if fault == "truncated":
        return httpx.Response(200, text=TRUNCATED_JSON, headers={"content-type": "application/json"})
    if fault == "empty":
        return empty_payload(key, request)
    if fault == "remark":
        return httpx.Response(200, json=OVERPASS_REMARK)
    if fault == "remark_partial":
        return httpx.Response(200, json={**OVERPASS_REMARK, "elements": overpass_elements()[:1]})
    raise AssertionError(f"unknown fault {fault}")


class Upstream:
    """The fake internet. `faults[key]` overrides the healthy answer for one upstream; `default` for all."""

    def __init__(self) -> None:
        self.faults: dict[str, str] = {}
        self.default: str | None = None
        self.calls: Counter[str] = Counter()
        self.unknown: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        key = classify(request)
        if key is None:
            self.unknown.append(str(request.url))
            raise httpx.ConnectError("offline test: unknown host", request=request)
        self.calls[key] += 1
        fault = self.faults.get(key, self.default)
        if fault:
            return fault_response(key, fault, request)
        if key not in HEALTHY:
            raise httpx.ConnectError("offline test: no healthy fake", request=request)
        return HEALTHY[key](request)

    def heal(self) -> None:
        self.faults.clear()
        self.default = None


@dataclass
class Env:
    data: Path
    up: Upstream
    client: TestClient

    def cache_dir(self, name: str) -> Path:
        return self.data / "cache" / name

    def drop_cache(self) -> None:
        shutil.rmtree(self.data / "cache", ignore_errors=True)
        cachemod._caches.clear()  # what a process restart would do to the in-memory layer

    def drop_replay(self) -> None:
        shutil.rmtree(self.data / "replay", ignore_errors=True)

    def make_stale(self) -> int:
        n = 0
        for p in (self.data / "cache").rglob("*.json"):
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                raw["fetched_at"] = time.time() - float(raw["ttl"]) - 3600
            except Exception:  # noqa: BLE001
                continue
            p.write_text(json.dumps(raw), encoding="utf-8")
            n += 1
        cachemod._caches.clear()
        return n

    def replay_files_for(self, url_fragment: str) -> list[Path]:
        out = []
        for p in (self.data / "replay").glob("*.json"):
            try:
                if url_fragment in json.loads(p.read_text(encoding="utf-8")).get("key", ""):
                    out.append(p)
            except Exception:  # noqa: BLE001
                pass
        return out


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "replay_mode", "off")
    monkeypatch.setattr(settings, "demo_replay", False)
    monkeypatch.setattr(cachemod, "_caches", {})
    monkeypatch.setattr(catalog, "_live_mirror", None)

    async def no_sleep(*_a, **_k):
        return None

    # only core.http's retry back-off is skipped; the real asyncio module is left alone
    monkeypatch.setattr(corehttp, "asyncio", SimpleNamespace(sleep=no_sleep))
    up = Upstream()
    corehttp._client = httpx.AsyncClient(transport=httpx.MockTransport(up.handle))
    client = TestClient(app, raise_server_exceptions=False)
    yield Env(tmp_path, up, client)
    corehttp._client = None
    assert not up.unknown, f"tests tried to reach unknown hosts: {up.unknown}"


# ------------------------------------------------------------------------------------------- routes under test

@dataclass
class Route:
    name: str
    method: str
    path: str
    upstream: str  # the upstream whose failure the route cannot hide
    params: dict[str, Any] = field(default_factory=dict)
    body: dict[str, Any] | None = None
    background_down: tuple[str, ...] = ()  # upstreams that are always down for this route (keeps it fast)
    degrade: str | None = None  # name of the legitimate-degradation rule, if any

    @property
    def source(self) -> str:
        return SOURCES[self.upstream][0]

    def call(self, env: Env) -> httpx.Response:
        for k in self.background_down:
            env.up.faults.setdefault(k, "down")
        if self.method == "GET":
            return env.client.get(self.path, params=self.params)
        return env.client.post(self.path, json=self.body)


PLANNER_BACKGROUND = ("overpass", "gibs", "open-meteo", "ensemble", "elevation", "air")

ROUTES = {
    r.name: r
    for r in [
        Route("forecast", "GET", "/api/watchtower/forecast", "open-meteo", BLR),
        Route("score", "GET", "/api/watchtower/score", "open-meteo", BLR),
        Route("light-pollution", "GET", "/api/watchtower/light-pollution", "gibs", BLR),
        Route("spots", "GET", "/api/watchtower/spots", "overpass", {**BLR, "radius_km": 60, "limit": 6}),
        Route("passes", "GET", "/api/scroll/passes", "celestrak", {**BLR, "days": 1, "start": TLE_EPOCH_START}),
        Route("launches", "GET", "/api/scroll/launches", "ll2", BLR),
        Route("aurora", "GET", "/api/aurora", "swpc", FAIRBANKS, degrade="aurora"),
        Route("horizon-terrain", "GET", "/api/horizon/terrain", "elevation", BLR, degrade="terrain"),
        Route("transients-recent", "GET", "/api/transients/recent", "alerce", {"class_name": "SNIa"}),
        Route("spectra-at/skyserver", "GET", "/api/spectra/at", "sdss-sql", {"ra": 187.7059, "dec": 12.3911}),
        Route("spectra-at/fits", "GET", "/api/spectra/at", "sdss-fits", {"ra": 187.7059, "dec": 12.3911}),
        Route("planner-plan", "POST", "/api/planner/plan", "simbad",
              body={**BLR, "target": "North America Nebula", "date": "2026-11-05T12:00:00Z"}, background_down=PLANNER_BACKGROUND),
    ]
}


# ------------------------------------------------------------------------------------------- assertion helpers

def show(r: httpx.Response) -> str:
    return f"HTTP {r.status_code}: {r.text[:200]}"


def prov_for(r: httpx.Response, source: str) -> list[dict[str, Any]]:
    return [p for p in r.json().get("provenance", []) if p.get("source") == source]


def assert_provider_unavailable(r: httpx.Response) -> None:
    assert r.status_code == 502, show(r)
    body = r.json()
    if "error" in body:
        assert body["error"] == "provider_unavailable", show(r)
    else:  # a router-level HTTPException(502, "...") is acceptable when it explains itself
        assert body.get("detail"), show(r)


def assert_honest_failure(route: Route, fault: str, r: httpx.Response) -> None:
    """Rule 1: 502, or a legitimate degradation that names the failed source. Never a 500, never silent emptiness."""
    assert r.status_code != 500, show(r)
    if r.status_code == 200 and route.degrade == "terrain":
        notes = [p for p in prov_for(r, "open-meteo-elevation") if p.get("note")]
        assert notes and not any(p.get("fetched_at") for p in notes), f"flat horizon without a note naming the elevation source: {show(r)}"
        return
    if r.status_code == 200 and route.degrade == "aurora" and fault == "empty":
        d = r.json()["data"]
        assert d["chance_tonight"] == "unknown" and d["max_kp_next_24h"] is None and "no kp forecast" in d["verdict"].lower(), show(r)
        return
    assert_provider_unavailable(r)


def assert_cached(route: Route, r: httpx.Response) -> None:
    assert r.status_code == 200, show(r)
    ps = prov_for(r, route.source)
    assert ps and ps[0].get("cached") is True and not ps[0].get("stale"), f"{route.source} provenance not cached: {show(r)}"


def assert_stale(route: Route, r: httpx.Response) -> None:
    assert r.status_code == 200, show(r)
    ps = prov_for(r, route.source)
    assert ps and ps[0].get("stale") is True, f"{route.source} provenance not stale: {show(r)} / {r.json().get('provenance')}"
    assert "fail" in (ps[0].get("note") or "").lower(), f"stale note does not mention the failure: {ps[0]}"


# ------------------------------------------------------------------------------------------- 0. sanity of the fakes

@pytest.mark.parametrize("name", list(ROUTES))
def test_healthy_fakes_give_200(env, name):
    route = ROUTES[name]
    r = route.call(env)
    assert r.status_code == 200, show(r)
    ps = prov_for(r, route.source)
    assert ps and ps[0].get("fetched_at") and not ps[0].get("cached") and not ps[0].get("stale"), r.json().get("provenance")


# ------------------------------------------------------------------------------------------- 1. no cache, no replay

@pytest.mark.parametrize("fault", FAULTS)
@pytest.mark.parametrize("name", list(ROUTES))
def test_fault_without_cache_is_honest(env, name, fault):
    route = ROUTES[name]
    env.up.faults[route.upstream] = fault
    r = route.call(env)
    assert env.up.calls[route.upstream] >= 1
    assert_honest_failure(route, fault, r)


def test_meteors_need_no_upstream(env):
    """The meteor list is the static IMO working list on disk: it must answer with the whole internet down."""
    env.up.default = "timeout"
    r = env.client.get("/api/scroll/meteors", params={**BLR, "at": "2026-12-14T18:00:00Z"})
    assert r.status_code == 200, show(r)
    assert any(s["code"].upper().startswith("GEM") for s in r.json()["data"]), r.text[:300]
    assert sum(env.up.calls.values()) == 0


# legitimate degradations: secondary sources may fail, and the envelope must say which one
SCORE_SECONDARY = ["air", "ensemble", "gibs"]


@pytest.mark.parametrize("fault", ["timeout", "http500", "html", "empty"])
@pytest.mark.parametrize("secondary", SCORE_SECONDARY)
def test_score_degrades_with_a_named_note_when_a_secondary_source_fails(env, secondary, fault):
    env.up.faults[secondary] = fault
    r = env.client.get("/api/watchtower/score", params=BLR)
    assert r.status_code == 200, show(r)
    src = SOURCES[secondary][0]
    ps = prov_for(r, src)
    assert ps and ps[0].get("note") and not ps[0].get("fetched_at"), f"no failure note for {src}: {r.json().get('provenance')}"


@pytest.mark.parametrize("fault", ["timeout", "http500", "html", "empty"])
def test_forecast_degrades_with_a_note_when_air_quality_fails(env, fault):
    env.up.faults["air"] = fault
    r = env.client.get("/api/watchtower/forecast", params=BLR)
    assert r.status_code == 200, show(r)
    ps = prov_for(r, "open-meteo-air-quality")
    assert ps and ps[0].get("note") and "air_quality" not in r.json()["data"], r.json().get("provenance")


@pytest.mark.parametrize("fault", ["timeout", "http500", "html", "empty"])
@pytest.mark.parametrize("secondary", ["ll2", "celestrak"])
def test_events_feed_degrades_with_a_note_when_one_source_fails(env, secondary, fault):
    env.up.faults[secondary] = fault
    r = env.client.get("/api/scroll/events", params={**BLR, "days": 1, "types": "satellite,launch", "start": TLE_EPOCH_START})
    assert r.status_code == 200, show(r)
    src = SOURCES[secondary][0]
    ps = prov_for(r, src)
    assert ps and ps[0].get("note") and not ps[0].get("fetched_at"), f"no failure note for {src}: {r.json().get('provenance')}"


# ------------------------------------------------------------------------------------------- 2. fresh cache

@pytest.mark.parametrize("name", list(ROUTES))
def test_fresh_cache_survives_a_fault_without_calling_out(env, name):
    route = ROUTES[name]
    assert route.call(env).status_code == 200
    env.drop_replay()
    before = env.up.calls[route.upstream]
    env.up.faults[route.upstream] = "timeout"
    r = route.call(env)
    assert_cached(route, r)
    assert env.up.calls[route.upstream] == before, "a fresh cache entry must not trigger a live call"


# ------------------------------------------------------------------------------------------- 3. stale cache

@pytest.mark.parametrize("fault", ["timeout", "http500", "html"])
@pytest.mark.parametrize("name", list(ROUTES))
def test_stale_cache_is_served_and_marked_when_upstream_fails(env, name, fault):
    route = ROUTES[name]
    assert route.call(env).status_code == 200
    env.drop_replay()
    assert env.make_stale() > 0
    env.up.faults[route.upstream] = fault
    r = route.call(env)
    assert_stale(route, r)


# ------------------------------------------------------------------------------------------- 4. replay modes

def _record_then_forget_cache(env: Env, route: Route) -> None:
    assert route.call(env).status_code == 200
    env.drop_cache()
    assert any((env.data / "replay").glob("*.json")), "a successful call must leave a recording"


@pytest.mark.parametrize("name", ["forecast", "light-pollution", "launches", "spectra-at/fits"])
def test_replay_fallback_serves_recording_after_failure(env, monkeypatch, name):
    route = ROUTES[name]
    _record_then_forget_cache(env, route)
    monkeypatch.setattr(settings, "replay_mode", "fallback")
    env.up.faults[route.upstream] = "http500"
    before = env.up.calls[route.upstream]
    r = route.call(env)
    assert r.status_code == 200, show(r)
    assert env.up.calls[route.upstream] > before, "fallback mode must try the live upstream first"
    reps = [p for p in r.json()["provenance"] if p.get("source") == "replay" and route.source in (p.get("note") or "")]
    assert reps and "fail" in reps[0]["note"].lower(), r.json()["provenance"]


@pytest.mark.parametrize("name", ["forecast", "light-pollution", "launches", "spectra-at/fits"])
def test_replay_off_ignores_recordings(env, monkeypatch, name):
    route = ROUTES[name]
    _record_then_forget_cache(env, route)
    monkeypatch.setattr(settings, "replay_mode", "off")
    env.up.faults[route.upstream] = "http500"
    r = route.call(env)
    assert_provider_unavailable(r)
    assert not any(p.get("source") == "replay" for p in (r.json().get("provenance") or []))


@pytest.mark.parametrize("name", ["forecast", "light-pollution", "launches", "spectra-at/fits"])
def test_replay_first_never_calls_the_transport_when_a_recording_exists(env, monkeypatch, name):
    route = ROUTES[name]
    _record_then_forget_cache(env, route)
    monkeypatch.setattr(settings, "replay_mode", "first")
    env.up.calls.clear()
    env.up.default = "timeout"
    r = route.call(env)
    assert r.status_code == 200, show(r)
    assert sum(env.up.calls.values()) == 0, f"transport was invoked in replay-first mode: {dict(env.up.calls)}"
    assert any(p.get("source") == "replay" and "first" in (p.get("note") or "") for p in r.json()["provenance"])


def test_replay_first_without_recording_goes_live(env, monkeypatch):
    monkeypatch.setattr(settings, "replay_mode", "first")
    r = ROUTES["forecast"].call(env)
    assert r.status_code == 200, show(r)
    assert env.up.calls["open-meteo"] == 1


# ------------------------------------------------------------------------------------------- 5. corrupted files

GARBAGE = {
    "not_json": "\x00\xffthis is not json {{{",
    "truncated": '{"key": "GET https://api.open-meteo.com/v1/forecast", "value": {"hourly": {"time": [',
    "empty_file": "",
    "wrong_schema": '{"foo": 1, "bar": [1, 2, 3]}',
    "wrong_types": '{"key": "x", "value": {}, "fetched_at": "yesterday", "ttl": "forever"}',
    "json_list": "[1, 2, 3]",
}


@pytest.mark.parametrize("healthy", [True, False], ids=["upstream-ok", "upstream-down"])
def test_garbage_files_under_unrelated_names_are_ignored(env, monkeypatch, healthy):
    monkeypatch.setattr(settings, "replay_mode", "fallback")
    for i, text in enumerate(GARBAGE.values()):
        for d in (env.cache_dir("open-meteo"), env.cache_dir("open-meteo-air-quality"), env.data / "replay"):
            d.mkdir(parents=True, exist_ok=True)
            (d / f"x{i}.json").write_text(text, encoding="utf-8")
    (env.data / "replay" / "x.json").write_text(GARBAGE["not_json"], encoding="utf-8")
    (env.cache_dir("open-meteo") / "x.json").write_text(GARBAGE["truncated"], encoding="utf-8")
    if not healthy:
        env.up.faults["open-meteo"] = "http500"
    r = ROUTES["forecast"].call(env)
    if healthy:
        assert r.status_code == 200, show(r)
    else:
        assert_provider_unavailable(r)


def _poisoned_value() -> str:
    return json.dumps({"key": "GET https://api.open-meteo.com/v1/forecast", "value": {"error": True, "reason": "garbage"}, "fetched_at": time.time(), "ttl": 1e9})


@pytest.mark.parametrize("healthy", [True, False], ids=["upstream-ok", "upstream-down"])
@pytest.mark.parametrize("variant", [*GARBAGE, "poisoned_value"])
def test_corrupted_files_at_the_exact_key_are_ignored_or_rebuilt(env, monkeypatch, variant, healthy):
    """Seed a real cache entry + recording for the forecast request, then corrupt exactly those files."""
    route = ROUTES["forecast"]
    assert route.call(env).status_code == 200
    cache_files = list(env.cache_dir("open-meteo").glob("*.json"))
    replay_files = env.replay_files_for("api.open-meteo.com/v1/forecast")
    assert cache_files and replay_files
    text = _poisoned_value() if variant == "poisoned_value" else GARBAGE[variant]
    for p in cache_files + replay_files:
        p.write_text(text, encoding="utf-8")
    cachemod._caches.clear()
    monkeypatch.setattr(settings, "replay_mode", "fallback")
    if healthy:
        r = route.call(env)
        assert r.status_code == 200, show(r)
        raw = json.loads(cache_files[0].read_text(encoding="utf-8"))
        assert "hourly" in json.dumps(raw["value"]), "the corrupted cache file was not rebuilt from the live answer"
    else:
        env.up.faults["open-meteo"] = "http500"
        r = route.call(env)
        assert_provider_unavailable(r)


@pytest.mark.parametrize("variant", ["not_json", "truncated", "wrong_schema"])
def test_corrupted_replay_in_first_mode_falls_back_to_live(env, monkeypatch, variant):
    route = ROUTES["forecast"]
    assert route.call(env).status_code == 200
    for p in env.replay_files_for("api.open-meteo.com"):
        p.write_text(GARBAGE[variant], encoding="utf-8")
    env.drop_cache()
    monkeypatch.setattr(settings, "replay_mode", "first")
    before = env.up.calls["open-meteo"]
    r = route.call(env)
    assert r.status_code == 200, show(r)
    assert env.up.calls["open-meteo"] == before + 1
    assert prov_for(r, "open-meteo") and not any(p.get("source") == "replay" for p in r.json()["provenance"])


# ------------------------------------------------------------------------------------------- 6. Overpass remark

@pytest.mark.parametrize("fault", ["remark", "remark_partial"])
def test_overpass_remark_is_not_cached_and_never_a_successful_empty_list(env, fault):
    route = ROUTES["spots"]
    env.up.faults["overpass"] = fault
    r = route.call(env)
    assert r.status_code != 200 or r.json()["data"]["spots"], f"200 with an empty spots list after an Overpass error remark: {show(r)}"
    assert_provider_unavailable(r)
    assert not list(env.cache_dir("overpass").glob("*.json")), "a remark payload was written to the cache"
    assert not env.replay_files_for("overpass-api.de"), "a remark payload was recorded for replay"
    env.up.heal()
    before = env.up.calls["overpass"]
    r = route.call(env)
    assert r.status_code == 200, show(r)
    assert env.up.calls["overpass"] == before + 1, "the healthy retry must go live (the remark must not have been cached)"
    assert r.json()["data"]["spots"] and r.json()["data"]["candidates_found"] == len(overpass_elements())


# ------------------------------------------------------------------------------------------- 7. the validate hook and unusable 200s

def test_overpass_remark_with_stale_cache_serves_stale(env):
    route = ROUTES["spots"]
    assert route.call(env).status_code == 200
    env.drop_replay()
    env.make_stale()
    env.up.faults["overpass"] = "remark"
    r = route.call(env)
    assert_stale(route, r)
    assert "validation" in prov_for(r, "overpass")[0]["note"]
    assert r.json()["data"]["spots"]


def test_overpass_remark_with_recording_serves_replay_in_fallback(env, monkeypatch):
    route = ROUTES["spots"]
    _record_then_forget_cache(env, route)
    monkeypatch.setattr(settings, "replay_mode", "fallback")
    env.up.faults["overpass"] = "remark"
    r = route.call(env)
    assert r.status_code == 200, show(r)
    assert any(p.get("source") == "replay" and "overpass" in (p.get("note") or "") for p in r.json()["provenance"])
    assert r.json()["data"]["spots"]


@pytest.mark.parametrize(
    "name,fault",
    [
        ("forecast", "empty"),
        ("light-pollution", "html"),
        ("light-pollution", "empty"),
        ("passes", "html"),
        ("launches", "empty"),
        ("transients-recent", "empty"),
        ("horizon-terrain", "empty"),
        ("spectra-at/fits", "html"),
    ],
)
def test_unusable_200_does_not_poison_the_cache(env, name, fault):
    """A 200 the app cannot use must be treated like a failure: once the upstream recovers, the next call is healthy."""
    route = ROUTES[name]
    env.up.faults[route.upstream] = fault
    first = route.call(env)
    assert first.status_code != 500, show(first)
    env.up.heal()
    r = route.call(env)
    assert r.status_code == 200, f"after recovery: {show(r)}"
    ps = prov_for(r, route.source)
    assert ps and not ps[0].get("cached"), f"recovered call was served the cached bad payload: {ps}"
    data = r.json()["data"]
    if name == "launches":
        assert len(data) == 1
    if name == "transients-recent":
        assert len(data["objects"]) == 1


@pytest.mark.parametrize("name,fault", [("light-pollution", "html"), ("passes", "html"), ("spectra-at/fits", "html")])
def test_unusable_200_with_stale_cache_serves_stale(env, name, fault):
    """Binary upstreams have no validate hook: an HTML 200 must still fall back to the stale entry."""
    route = ROUTES[name]
    assert route.call(env).status_code == 200
    env.drop_replay()
    env.make_stale()
    env.up.faults[route.upstream] = fault
    r = route.call(env)
    assert_stale(route, r)
