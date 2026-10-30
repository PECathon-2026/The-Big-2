"""State-machine tests (TEST_PLAN B1 row 4): fuzzed sequences against a hand-written model, SQLite as oracle.

Honor:  observe (past / now / default-now / future), restart  vs  an independent sky oracle built on app.core.astro.
Alerts: subscribe, schedule, cancel, unsubscribe, push-gone, fail-once, restart, ticks of deliver_due(now) on a
        monotonic fake clock  vs  a model of which alert must be delivered at which tick.
Plus:   restart semantics, a crash between send and mark, the per-tick batch limit, and a 20-thread smoke test.

Fully offline: weather, Overpass, Lens sample download and the push sender are replaced; the lifespan worker loop
is replaced by a no-op so every delivery in here happens at an explicit `now`.

Tests that encode a rule from the plan which the app does not implement are kept strict on purpose (they are the
spec); they fail and are reported, they are not weakened.
"""
from __future__ import annotations

import tempfile
import threading
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

import astronomy as ae
import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given
from hypothesis import settings as hsettings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, precondition, rule, run_state_machine_as_test

from app.alerts import sender, worker
from app.alerts import store as alert_store
from app.core import astro
from app.core import cache as core_cache
from app.core.config import settings
from app.core.http import ProviderError
from app.honor import rules
from app.honor import store as honor_store
from app.lens import router as lens_router
from app.main import app
from app.watchtower import openmeteo, spots

UTC = timezone.utc
IST = timezone(timedelta(hours=5, minutes=30))
PST = timezone(timedelta(hours=-8))

# ------------------------------------------------------------------------------------------------ fixtures


class Recorder:
    """Replacement for sender.current: logs every successful delivery, can be told to fail.

    gone:      endpoints for which the push service answers 404/410 (raises sender.PushGone, every time)
    fail_once: alert ids whose next send raises a transient error once (e.g. a 503)
    kill_on:   alert ids whose send succeeds and then the process "dies" (BaseException, not caught by the worker)
    """

    def __init__(self, delay: float = 0.0):
        self.lock = threading.Lock()
        self.delivered: list[tuple[int, str]] = []
        self.attempts: list[tuple[int, str]] = []
        self.gone: set[str] = set()
        self.fail_once: set[int] = set()
        self.kill_on: set[int] = set()
        self.delay = delay

    def __call__(self, subscription, payload):
        ep, aid = subscription["endpoint"], payload["alert_id"]
        with self.lock:
            self.attempts.append((aid, ep))
            if ep in self.gone:
                raise sender.PushGone("410 Gone")
            if aid in self.fail_once:
                self.fail_once.discard(aid)
                raise RuntimeError("503 Service Unavailable (transient)")
        if self.delay:
            time.sleep(self.delay)  # a real push round-trip takes 100 ms+; this only widens the window a little
        with self.lock:
            self.delivered.append((aid, ep))
            if aid in self.kill_on:
                self.kill_on.discard(aid)
                raise ProcessKilled(f"process killed right after pushing alert {aid}")

    def delivered_ids(self) -> list[int]:
        with self.lock:
            return [a for a, _ in self.delivered]


class ProcessKilled(BaseException):
    """Simulates the process dying (SIGKILL / OOM / deploy) between the push and the status update."""


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))

    async def no_worker():
        return None

    async def no_weather(*a, **k):
        raise ProviderError("open-meteo", "disabled in tests")

    async def no_overpass(*a, **k):
        raise ProviderError("overpass", "disabled in tests")

    monkeypatch.setattr(worker, "run_forever", no_worker)
    monkeypatch.setattr(lens_router, "_ensure_samples", lambda: None)
    monkeypatch.setattr(core_cache, "seed_replay_from_repo", lambda: 0)
    monkeypatch.setattr(spots, "overpass", no_overpass)
    monkeypatch.setattr(openmeteo, "forecast", no_weather)
    rec = Recorder()
    monkeypatch.setattr(sender, "current", rec)
    honor_store.reset_for_tests()
    alert_store.reset_for_tests()
    yield rec
    honor_store.reset_for_tests()
    alert_store.reset_for_tests()


@pytest.fixture
def fast_sqlite(monkeypatch):
    """Speed only: every commit on this Windows temp dir costs ~7-30 ms (fsync + journal file churn). For the long
    fuzz runs, each fresh store connection gets synchronous=OFF and an in-memory rollback journal. Transaction
    semantics on the single shared connection are unchanged; the restart/crash tests do not use this."""
    for mod in (alert_store, honor_store):
        orig = mod._db
        seen: list = []

        def fast(orig=orig, seen=seen):
            c = orig()
            if not seen or seen[-1] is not c:
                c.execute("PRAGMA synchronous=OFF")
                c.execute("PRAGMA journal_mode=MEMORY")
                seen.append(c)
            return c

        monkeypatch.setattr(mod, "_db", fast)


@pytest.fixture
def client(env):
    with TestClient(app) as c:
        yield c


MACHINE_SETTINGS = dict(
    deadline=None,
    database=None,  # no .hypothesis directory in the repo
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much, HealthCheck.function_scoped_fixture],
)


def _fmt(t: datetime, style: str) -> str:
    if style == "Z":
        return t.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if style == "+05:30":
        return t.astimezone(IST).isoformat()
    if style == "-08:00":
        return t.astimezone(PST).isoformat()
    return t.astimezone(UTC).replace(tzinfo=None).isoformat()  # naive: the API treats it as UTC


def _parse(s: str) -> datetime:
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=UTC)


# ================================================================================================= HONOR

USERS = ["user-alpha", "user-bravo", "user-charlie"]
LOCATIONS = st.one_of(
    st.sampled_from([(12.97, 77.59), (35.68, 139.69), (51.5, -0.12), (64.1, -21.9), (-33.87, 151.21), (78.2, 15.6), (0.0, 0.0)]),
    st.tuples(st.floats(-89.0, 89.0, allow_nan=False).map(lambda x: round(x, 3)), st.floats(-180.0, 180.0, allow_nan=False).map(lambda x: round(x, 3))),
)
KINDS = st.sampled_from(sorted(rules.POINTS) + ["ufo"])  # "ufo" is not a known kind -> must be treated as "custom"
STYLES = st.sampled_from(["Z", "+05:30", "-08:00", "naive"])
NAKED_EYE = [ae.Body.Mercury, ae.Body.Venus, ae.Body.Mars, ae.Body.Jupiter, ae.Body.Saturn]
EXPECTED_RANKS = [(0, "Ashigaru"), (50, "Samurai"), (150, "Daimyō"), (400, "Shōgun")]
BORDERLINE_DEG = 0.25  # within this of a threshold the oracle abstains (rounding / refraction details)


def sky_oracle(kind: str, lat: float, lon: float, t: datetime) -> tuple[bool, float]:
    """Independent expectation for a claim without event_id: (sky allows it, distance to the nearest threshold in degrees)."""
    obs = astro.observer(lat, lon)
    sun = astro.sun_alt(t, obs)
    if kind == "moon":
        alt = astro.moon_alt(t, obs)
        return alt > 0, abs(alt)
    if kind == "planet":
        alts = [astro.altaz(b, t, obs)[0] for b in NAKED_EYE]
        ok = sun <= -3 and any(a > 5 for a in alts)
        return ok, min([abs(sun + 3)] + [abs(a - 5) for a in alts])
    if kind in ("meteor", "deepsky"):
        return sun <= -12, abs(sun + 12)
    return sun <= -6, abs(sun + 6)  # custom, satellite, launch, eclipse without an event: "it must be night"


def expected_rank(points: int) -> tuple[int, str]:
    idx = 0
    for i, (at, _) in enumerate(EXPECTED_RANKS):
        if points >= at:
            idx = i
    return idx, EXPECTED_RANKS[idx][1]


class HonorMachine(RuleBasedStateMachine):
    client: TestClient
    base_dir: str

    def __init__(self):
        super().__init__()
        settings.data_dir = tempfile.mkdtemp(dir=self.base_dir)
        honor_store.reset_for_tests()
        self.rows: dict[str, dict[int, dict]] = {u: {} for u in USERS}
        self.rank_idx = {u: 0 for u in USERS}

    def teardown(self):
        honor_store.reset_for_tests()

    # -------------------------------------------------------------------------------- helpers
    def _post(self, user, kind, loc, claimed_at: str | None):
        body = {"user_id": user, "lat": loc[0], "lon": loc[1], "kind": kind}
        if claimed_at is not None:
            body["claimed_at"] = claimed_at
        return self.client.post("/api/honor/observe", json=body), body

    def _accepted_claim(self, user, kind, loc, claimed_at):
        r, req = self._post(user, kind, loc, claimed_at)
        assert r.status_code == 201, (req, r.text)
        b = r.json()
        row = b["observation"]
        eff = kind if kind in rules.POINTS else "custom"
        assert row["kind"] == eff and row["user_id"] == user
        t = _parse(row["claimed_at"])
        ok, margin = sky_oracle(eff, loc[0], loc[1], t)
        pts = b["points_awarded"]
        assert pts == (rules.POINTS[eff] if b["accepted"] else 0), b
        assert row["points"] == pts and row["verified"] == b["accepted"]
        if margin > BORDERLINE_DEG:
            assert b["accepted"] == ok, f"sky oracle says {ok} (margin {margin:.2f} deg) for {req}: {b['reason']} {row['evidence']}"
        if not ok and margin > BORDERLINE_DEG:
            assert pts == 0, f"points for a claim the sky forbids: {req}"
        self.rows[user][row["id"]] = {"points": pts, "verified": b["accepted"]}
        total = sum(x["points"] for x in self.rows[user].values())
        assert b["rank"]["points"] == total
        assert b["rank"]["romaji"] == expected_rank(total)[1]

    # -------------------------------------------------------------------------------- rules
    @rule(user=st.sampled_from(USERS), kind=KINDS, loc=LOCATIONS, ago=st.integers(0, 30 * 86400), us=st.integers(0, 999_999), style=STYLES)
    def observe_past(self, user, kind, loc, ago, us, style):
        t = datetime.now(UTC) - timedelta(seconds=ago, microseconds=us)
        self._accepted_claim(user, kind, loc, _fmt(t, style))

    @rule(user=st.sampled_from(USERS), kind=KINDS, loc=LOCATIONS, style=STYLES)
    def observe_exactly_now(self, user, kind, loc, style):
        self._accepted_claim(user, kind, loc, _fmt(datetime.now(UTC), style))

    @rule(user=st.sampled_from(USERS), kind=KINDS, loc=LOCATIONS)
    def observe_default_now(self, user, kind, loc):
        self._accepted_claim(user, kind, loc, None)

    @rule(user=st.sampled_from(USERS), kind=KINDS, loc=LOCATIONS, ahead=st.integers(5, 10 * 86400), style=STYLES)
    def observe_future(self, user, kind, loc, ahead, style):
        t = datetime.now(UTC) + timedelta(seconds=ahead)
        r, req = self._post(user, kind, loc, _fmt(t, style))
        assert r.status_code == 400, (req, r.text)  # and no row: the ledger invariant checks the count did not change

    @rule()
    def restart(self):
        honor_store.reset_for_tests()  # next call opens a fresh connection on the same data_dir

    # -------------------------------------------------------------------------------- invariants
    @invariant()
    def ledgers_match_model(self):
        for u in USERS:
            led = self.client.get("/api/honor/ledger", params={"user_id": u}).json()
            entries = led["entries"]
            ids = {e["id"] for e in entries}
            assert ids == set(self.rows[u]), f"ledger for {u} lost or gained rows: {sorted(ids ^ set(self.rows[u]))}"
            assert len(entries) == len(ids)
            assert all(e["user_id"] == u for e in entries)
            assert all(e["points"] == 0 for e in entries if not e["verified"])
            total = sum(x["points"] for x in self.rows[u].values())
            assert led["rank"]["points"] == total == sum(e["points"] for e in entries if e["verified"])
            assert honor_store.total_points(u) == total
            assert led["verified_count"] == sum(1 for x in self.rows[u].values() if x["verified"])
            assert led["rejected_count"] == sum(1 for x in self.rows[u].values() if not x["verified"])
            idx, romaji = expected_rank(total)
            assert led["rank"]["romaji"] == romaji
            assert idx >= self.rank_idx[u], "rank went down"
            self.rank_idx[u] = idx


def test_honor_state_machine(client, fast_sqlite, tmp_path):
    HonorMachine.client = client
    HonorMachine.base_dir = str(tmp_path)
    run_state_machine_as_test(HonorMachine, settings=hsettings(max_examples=20, stateful_step_count=15, **MACHINE_SETTINGS))


def test_rank_table_and_monotonic_rank():
    assert [(r[0], r[2]) for r in rules.RANKS] == EXPECTED_RANKS
    prev = -1
    for p in range(0, 1001):
        r = rules.rank_for(p)
        idx = [x[1] for x in EXPECTED_RANKS].index(r["romaji"])
        assert idx >= prev and idx == expected_rank(p)[0]
        prev = idx
        if r["next"]:
            assert r["next"]["points_needed"] == r["next"]["at"] - p > 0


MOON_UP_BLR = {"lat": 12.97, "lon": 77.59, "kind": "moon", "claimed_at": "2026-10-29T20:30:00Z"}  # Moon well up (see test_honor)


def test_duplicate_identical_claim_earns_nothing(client):
    """Plan: a duplicate identical claim inside the cooldown is rejected or earns 0."""
    user = "dup-" + uuid.uuid4().hex[:8]
    first = client.post("/api/honor/observe", json={**MOON_UP_BLR, "user_id": user}).json()
    assert first["accepted"] is True and first["points_awarded"] == rules.POINTS["moon"]
    second = client.post("/api/honor/observe", json={**MOON_UP_BLR, "user_id": user})
    assert second.status_code in (201, 400, 409)
    if second.status_code == 201:
        assert second.json()["points_awarded"] == 0, f"identical claim scored again: {second.json()['reason']}"
    assert client.get("/api/honor/ledger", params={"user_id": user}).json()["rank"]["points"] == rules.POINTS["moon"]


def test_ledger_survives_restart(env, tmp_path):
    user = "restart-" + uuid.uuid4().hex[:8]
    with TestClient(app) as c:
        c.post("/api/honor/observe", json={**MOON_UP_BLR, "user_id": user})
        c.post("/api/honor/observe", json={**MOON_UP_BLR, "user_id": user, "claimed_at": "2026-10-29T10:00:00Z"})
        before = c.get("/api/honor/ledger", params={"user_id": user}).json()
    honor_store.reset_for_tests()  # process restart: connection closed, new one on the same data_dir
    with TestClient(app) as c:
        after = c.get("/api/honor/ledger", params={"user_id": user}).json()
    assert after["entries"] == before["entries"] and after["rank"] == before["rank"]
    assert len(after["entries"]) == 2


def test_ledger_is_newest_first_across_utc_offsets(client):
    """Extra invariant: the ledger is ordered by claim instant, newest first, whatever offset the client sent."""
    user = "order-" + uuid.uuid4().hex[:8]
    loc = {"lat": 12.97, "lon": 77.59, "kind": "custom", "user_id": user}
    client.post("/api/honor/observe", json={**loc, "claimed_at": "2026-10-29T20:00:00Z"})  # later instant
    client.post("/api/honor/observe", json={**loc, "claimed_at": "2026-10-30T00:30:00+05:30"})  # = 19:00Z, earlier instant
    entries = client.get("/api/honor/ledger", params={"user_id": user}).json()["entries"]
    instants = [_parse(e["claimed_at"]) for e in entries]
    assert instants == sorted(instants, reverse=True), [e["claimed_at"] for e in entries]


# ================================================================================================= ALERTS

ENDPOINTS = [f"https://fcm.googleapis.com/fcm/send/ep{i}" for i in range(4)]


def sub_json(ep: str) -> dict:
    return {"endpoint": ep, "keys": {"p256dh": "BKey", "auth": "auth"}}


class AlertsMachine(RuleBasedStateMachine):
    client: TestClient
    base_dir: str

    def __init__(self):
        super().__init__()
        settings.data_dir = tempfile.mkdtemp(dir=self.base_dir)
        alert_store.reset_for_tests()
        self.rec = Recorder()
        sender.current = self.rec  # the test-level monkeypatch restores the real sender afterwards
        self.clock = datetime.now(UTC)
        self.subs: dict[str, int] = {}  # live endpoint -> subscription id
        self.alerts: dict[int, dict] = {}  # alert id -> {ep, fire_at, status}
        self.never_deliver: set[int] = set()  # cancelled, or dropped while still pending
        self.delivered_at: dict[int, datetime] = {}

    def teardown(self):
        alert_store.reset_for_tests()

    def _scheduled(self):
        return [i for i, a in self.alerts.items() if a["status"] == "scheduled"]

    # -------------------------------------------------------------------------------- rules
    @rule(ep=st.sampled_from(ENDPOINTS))
    def subscribe(self, ep):
        r = self.client.post("/api/alerts/subscribe", json={"subscription": sub_json(ep)})
        assert r.status_code == 201, r.text
        sid = r.json()["subscription_id"]
        if ep in self.subs:
            assert sid == self.subs[ep], "re-subscribing the same endpoint must keep its id (upsert)"
        self.subs[ep] = sid

    @rule(ep=st.sampled_from(ENDPOINTS))
    def unsubscribe(self, ep):
        r = self.client.delete("/api/alerts/subscribe", params={"endpoint": ep})
        assert r.status_code == 200 and r.json()["deleted"] == (1 if ep in self.subs else 0)
        self._drop_endpoint(ep)

    def _drop_endpoint(self, ep):
        """The store promises ON DELETE CASCADE: every alert of that subscription disappears with it."""
        self.subs.pop(ep, None)
        for aid in [i for i, a in self.alerts.items() if a["ep"] == ep]:
            if self.alerts[aid]["status"] == "scheduled":
                self.never_deliver.add(aid)
            del self.alerts[aid]

    @rule(ep=st.sampled_from(ENDPOINTS), secs=st.integers(1, 3 * 3600), us=st.integers(0, 999_999), style=STYLES)
    def schedule(self, ep, secs, us, style):
        fire = self.clock + timedelta(seconds=secs, microseconds=us)
        r = self.client.post("/api/alerts/schedule", json={"endpoint": ep, "title": "t", "body": f"b{secs}", "fire_at": _fmt(fire, style)})
        if ep not in self.subs:
            assert r.status_code == 404, r.text
            return
        assert r.status_code == 201, r.text
        row = r.json()
        assert _parse(row["fire_at"]) == fire and row["status"] == "scheduled" and row["subscription_id"] == self.subs[ep]
        self.alerts[row["id"]] = {"ep": ep, "fire_at": fire, "status": "scheduled"}

    @precondition(lambda self: self.alerts)
    @rule(data=st.data(), ep=st.sampled_from(ENDPOINTS))
    def cancel(self, data, ep):
        aid = data.draw(st.sampled_from(sorted(self.alerts)))
        a = self.alerts[aid]
        r = self.client.delete(f"/api/alerts/scheduled/{aid}", params={"endpoint": ep})
        if a["status"] == "scheduled" and a["ep"] == ep:
            assert r.status_code == 200, r.text
            a["status"] = "cancelled"
            self.never_deliver.add(aid)
        else:
            assert r.status_code == 404, (aid, a, ep, r.text)  # someone else's, or no longer pending

    @rule(aid=st.integers(10_000, 20_000), ep=st.sampled_from(ENDPOINTS))
    def cancel_unknown(self, aid, ep):
        assert self.client.delete(f"/api/alerts/scheduled/{aid}", params={"endpoint": ep}).status_code == 404

    @precondition(lambda self: any(a["status"] == "scheduled" for a in self.alerts.values()))
    @rule(data=st.data())
    def push_service_fails_once(self, data):
        self.rec.fail_once.add(data.draw(st.sampled_from(sorted(self._scheduled()))))

    @rule(ep=st.sampled_from(ENDPOINTS))
    def push_service_says_gone(self, ep):
        self.rec.gone.add(ep)

    @rule()
    def restart(self):
        alert_store.reset_for_tests()

    @rule(ep=st.sampled_from(ENDPOINTS), include_sent=st.booleans())
    def http_views_agree(self, ep, include_sent):
        """The HTTP list and stats views say the same as the store."""
        rows = self.client.get("/api/alerts/scheduled", params={"endpoint": ep, "include_sent": include_sent}).json()
        assert rows == alert_store.list_alerts(ep, include_sent=include_sent)
        stats = self.client.get("/api/alerts/stats").json()
        assert {k: v for k, v in stats.items() if k not in ("poll_seconds", "sender")} == alert_store.stats()

    @rule(secs=st.one_of(st.just(0), st.integers(1, 4 * 3600)), us=st.integers(0, 999_999))
    def tick(self, secs, us):
        self.clock += timedelta(seconds=secs, microseconds=us if secs else 0)
        self._tick()

    @precondition(lambda self: any(a["status"] == "scheduled" and a["fire_at"] >= self.clock for a in self.alerts.values()))
    @rule()
    def tick_exactly_at_next_fire(self):
        self.clock = min(a["fire_at"] for a in self.alerts.values() if a["status"] == "scheduled" and a["fire_at"] >= self.clock)
        self._tick()

    def _tick(self):
        due = [i for i in self._scheduled() if self.alerts[i]["fire_at"] <= self.clock]
        gone_eps = {self.alerts[i]["ep"] for i in due if self.alerts[i]["ep"] in self.rec.gone}
        gone_due = [i for i in due if self.alerts[i]["ep"] in gone_eps]
        exp_failed = {i for i in due if i not in gone_due and i in self.rec.fail_once}
        exp_sent = {i for i in due if i not in gone_due and i not in exp_failed}
        before = len(self.rec.delivered_ids())
        res = worker.deliver_due(now=self.clock)
        new = self.rec.delivered_ids()[before:]
        assert sorted(new) == sorted(exp_sent), f"at {self.clock.isoformat()} delivered {sorted(new)}, expected {sorted(exp_sent)}"
        assert res["sent"] == len(exp_sent) and res["failed"] == len(exp_failed), res
        assert (res["gone"] > 0) == bool(gone_eps) and res["gone"] <= len(gone_due), res
        for i in exp_sent:
            self.alerts[i]["status"] = "sent"
            self.delivered_at[i] = self.clock
        for i in exp_failed:
            self.alerts[i]["status"] = "failed"
        for ep in gone_eps:
            assert alert_store.get_subscription(ep) is None, "410 Gone must remove the subscription"
            self._drop_endpoint(ep)
        assert alert_store.due(self.clock) == [], "something due at this tick was left undelivered"

    # -------------------------------------------------------------------------------- invariants
    @invariant()
    def store_matches_model(self):
        ids = self.rec.delivered_ids()
        dup = [i for i, n in Counter(ids).items() if n > 1]
        assert not dup, f"delivered more than once: {dup}"
        assert not (set(ids) & self.never_deliver), f"cancelled/unsubscribed alerts delivered: {set(ids) & self.never_deliver}"
        for i, at in self.delivered_at.items():
            if i in self.alerts:
                assert self.alerts[i]["fire_at"] <= at
        for ep in ENDPOINTS:
            all_rows = alert_store.list_alerts(ep, include_sent=True)  # store calls here (the router is a pass-through); speed
            pending = alert_store.list_alerts(ep)
            mine = {i for i, a in self.alerts.items() if a["ep"] == ep}
            assert {r["id"] for r in all_rows} == mine, f"list_alerts({ep}) shows {sorted(r['id'] for r in all_rows)}, model {sorted(mine)}"
            assert {r["id"] for r in pending} == {i for i in mine if self.alerts[i]["status"] == "scheduled"}
            for r in all_rows:
                assert r["subscription_id"] == self.subs[ep] and r["status"] == self.alerts[r["id"]]["status"]
        st_ = alert_store.stats()
        assert st_["subscriptions"] == len(self.subs)
        counts = Counter(a["status"] for a in self.alerts.values())
        for status in ("scheduled", "sent", "cancelled", "failed"):
            assert st_.get(status, 0) == counts.get(status, 0), (status, st_, dict(counts))


def test_alerts_state_machine(client, fast_sqlite, tmp_path):
    AlertsMachine.client = client
    AlertsMachine.base_dir = str(tmp_path)
    run_state_machine_as_test(AlertsMachine, settings=hsettings(max_examples=30, stateful_step_count=20, **MACHINE_SETTINGS))


@hsettings(max_examples=8, **MACHINE_SETTINGS)
@given(ago=st.integers(1, 30 * 86400), style=STYLES)
def test_schedule_in_the_past_is_rejected(client, fast_sqlite, ago, style):
    """Plan: scheduling an alert in the past gives 400 (the event cannot be warned about any more)."""
    client.post("/api/alerts/subscribe", json={"subscription": sub_json(ENDPOINTS[0])})
    fire = datetime.now(UTC) - timedelta(seconds=ago)
    r = client.post("/api/alerts/schedule", json={"endpoint": ENDPOINTS[0], "title": "t", "body": "b", "fire_at": _fmt(fire, style)})
    assert r.status_code == 400, f"past fire_at {_fmt(fire, style)} accepted: {r.status_code} {r.text}"


def test_restart_delivers_past_due_alerts_exactly_once(env, tmp_path):
    rec = env
    ep = ENDPOINTS[0]
    t0 = datetime.now(UTC)
    with TestClient(app) as c:
        c.post("/api/alerts/subscribe", json={"subscription": sub_json(ep)})
        ids = [c.post("/api/alerts/schedule", json={"endpoint": ep, "title": "t", "body": str(k), "fire_at": (t0 + timedelta(minutes=k)).isoformat()}).json()["id"] for k in range(1, 7)]
        cancelled = ids.pop()
        assert c.delete(f"/api/alerts/scheduled/{cancelled}", params={"endpoint": ep}).status_code == 200
    alert_store.reset_for_tests()  # restart: the process was down while all of them came due
    with TestClient(app) as c:
        res = worker.deliver_due(now=t0 + timedelta(hours=2))
        assert res == {"sent": len(ids), "failed": 0, "gone": 0}
        assert sorted(rec.delivered_ids()) == sorted(ids)
        assert worker.deliver_due(now=t0 + timedelta(hours=3)) == {"sent": 0, "failed": 0, "gone": 0}
        rows = {r["id"]: r for r in c.get("/api/alerts/scheduled", params={"endpoint": ep, "include_sent": True}).json()}
    assert all(rows[i]["status"] in ("sent", "missed") for i in ids)  # delivered once or marked missed, never dropped
    assert rows[cancelled]["status"] == "cancelled" and cancelled not in rec.delivered_ids()


def test_crash_between_send_and_mark_does_not_redeliver_after_restart(env):
    """Restart in the worst place: the push went out, the process died before marking it sent."""
    rec = env
    sub = alert_store.upsert_subscription(sub_json(ENDPOINTS[0]))
    t0 = datetime.now(UTC)
    a = alert_store.schedule(sub["id"], "t", "b", t0 - timedelta(seconds=1))
    rec.kill_on.add(a["id"])
    with pytest.raises(ProcessKilled):
        worker.deliver_due(now=t0)
    alert_store.reset_for_tests()  # the process comes back
    worker.deliver_due(now=t0 + timedelta(minutes=1))
    status = alert_store.get_alert(a["id"])["status"]
    assert rec.delivered_ids().count(a["id"]) == 1, f"alert pushed {rec.delivered_ids().count(a['id'])} times across the restart (status {status})"


def test_backlog_beyond_batch_limit_is_delivered_on_the_first_due_tick(env, fast_sqlite):
    """Oracle: each alert is delivered at the first tick whose now >= fire_at, however many are due at once."""
    rec = env
    sub = alert_store.upsert_subscription(sub_json(ENDPOINTS[0]))
    t0 = datetime.now(UTC)
    for k in range(60):
        alert_store.schedule(sub["id"], "t", str(k), t0 + timedelta(seconds=k))
    res = worker.deliver_due(now=t0 + timedelta(hours=1))
    assert res["sent"] == 60 and len(rec.delivered_ids()) == 60, f"one tick delivered {res['sent']} of 60 due alerts"


# ------------------------------------------------------------------------------------------- concurrency


def _hammer(rec: Recorder, threads: int = 20, per_thread: int = 5):
    subs = [alert_store.upsert_subscription(sub_json(ep))["id"] for ep in ENDPOINTS]
    t0 = datetime.now(UTC)
    barrier = threading.Barrier(threads)
    scheduled: list[int] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def run(n: int):
        try:
            barrier.wait()
            for j in range(per_thread):
                a = alert_store.schedule(subs[(n + j) % len(subs)], f"t{n}", f"{n}-{j}", t0 - timedelta(seconds=1))
                with lock:
                    scheduled.append(a["id"])
                worker.deliver_due(now=t0 + timedelta(minutes=5))
                alert_store.stats()
                alert_store.list_alerts(ENDPOINTS[n % len(ENDPOINTS)], include_sent=True)
        except BaseException as e:  # noqa: BLE001
            with lock:
                errors.append(e)

    ts = [threading.Thread(target=run, args=(n,)) for n in range(threads)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(timeout=60)
    worker.deliver_due(now=t0 + timedelta(minutes=10))  # drain whatever is left
    return scheduled, errors


def test_concurrent_schedule_and_deliver_no_lock_errors_and_totals_consistent(env, fast_sqlite):
    rec = env
    rec.delay = 0.002
    scheduled, errors = _hammer(rec)
    assert not errors, [repr(e) for e in errors[:5]]
    assert len(scheduled) == len(set(scheduled)) == 100
    s = alert_store.stats()
    assert s["subscriptions"] == len(ENDPOINTS)
    assert s.get("sent", 0) == 100 and sum(v for k, v in s.items() if k != "subscriptions") == 100, s
    assert set(rec.delivered_ids()) == set(scheduled)


def test_concurrent_ticks_never_deliver_an_alert_twice(env, fast_sqlite):
    rec = env
    rec.delay = 0.002  # a stand-in for the network round-trip of a real push
    scheduled, errors = _hammer(rec)
    assert not errors, [repr(e) for e in errors[:5]]
    dup = {i: n for i, n in Counter(rec.delivered_ids()).items() if n > 1}
    assert not dup, f"{len(dup)} of {len(scheduled)} alerts pushed more than once (e.g. {dict(list(dup.items())[:5])})"
