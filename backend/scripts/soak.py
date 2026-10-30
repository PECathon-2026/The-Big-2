"""Soak / burst test against a live local Tsukuyomi Watch backend.

docs/TEST_PLAN.md B1 row 5.  Measures only; never modifies the app.

Usage:
    .venv/Scripts/python scripts/soak.py --minutes 8 --burst-rps 20

Phases
  0. warm-up   : one sequential pass over every route for both demo cities.
  1. soak      : ~2 req/s round-robin over routes x cities, plus every 60 s a
                 5 s burst (burst_rps new requests per second, concurrency
                 capped at burst_rps).  First burst fires at t=20 s so that a
                 1-minute smoke run still exercises one.
Server RSS is sampled every 15 s.  Ctrl+C stops the run early and still
prints/writes the report.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import httpx

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None

CITIES = {"bengaluru": (12.97, 77.59), "kyoto": (35.01, 135.77)}

# (path, extra static query, takes lat/lon)
ROUTES = [
    ("/api/watchtower/forecast", {}, True),
    ("/api/watchtower/score", {}, True),
    ("/api/watchtower/light-pollution", {}, True),
    ("/api/watchtower/spots", {"radius_km": 60, "limit": 12}, True),
    ("/api/scroll/moon", {}, True),
    ("/api/scroll/sun", {}, True),
    ("/api/scroll/eclipses", {}, True),
    ("/api/scroll/meteors", {}, True),
    ("/api/scroll/passes", {"days": 3}, True),
    ("/api/scroll/launches", {}, True),
    ("/api/scroll/planets", {}, True),
    ("/api/scroll/calendar", {}, True),
    ("/api/scroll/events", {"days": 7}, True),
    ("/api/aurora", {}, True),
    ("/api/horizon/terrain", {}, True),
    ("/api/transients/recent",
     {"class_name": "SNIa", "min_probability": 0.7, "limit": 25}, False),
    ("/api/spectra/at", {"ra": 187.7059, "dec": 12.3911}, False),
    ("/api/honor/ranks", {}, False),
    ("/api/planner/targets", {}, True),
    ("/api/lens/samples", {}, False),
]

SLOW_P95_S = 2.0
MEM_GROWTH_FACTOR = 1.3
BURST_SECONDS = 5
BURST_PERIOD_S = 60
FIRST_BURST_AT_S = 20
STEADY_RPS = 2.0
MEM_PERIOD_S = 15


def build_targets():
    """All (route_path, city, params) combinations, interleaved so that a
    round-robin walks routes first and flips city on each lap."""
    out = []
    for city, (lat, lon) in CITIES.items():
        for path, extra, geo in ROUTES:
            params = dict(extra)
            if geo:
                params = {"lat": lat, "lon": lon, **params}
            out.append((path, city, params))
    return out


class Stats:
    def __init__(self):
        self.lat = defaultdict(list)           # route -> [seconds] (soak only)
        self.lat_by_phase = defaultdict(lambda: defaultdict(list))
        self.status = defaultdict(Counter)     # route -> Counter(status|ERR:x)
        self.bad502 = defaultdict(int)
        self.stale = defaultdict(int)
        self.cached_false = defaultdict(int)   # informational: cache miss
        self.ind429 = defaultdict(int)
        self.loose429 = defaultdict(int)       # raw "429" substring anywhere
        self.conn_err = Counter()
        self.err_examples = {}                 # route -> first 200 chars of 502
        self.other_examples = {}               # (route,status) -> body[:200]
        self.sources = defaultdict(Counter)
        self.count = Counter()
        self.warmup = []                       # rows
        self.mem = []                          # (t, rss_mb)
        self.mem_note = ""
        self.started = time.time()
        self.ended = None
        self.interrupted = False
        self.bursts_run = 0
        self.burst_requests = 0
        self.steady_requests = 0
        self.server_started_at_begin = None
        self.server_started_at_end = None


STATE = Stats()


def walk_provenance(obj, acc):
    """Collect provenance-ish dicts (have 'stale' or both 'source'+'cached')."""
    if isinstance(obj, dict):
        if "stale" in obj or ("source" in obj and "cached" in obj):
            acc.append(obj)
        for v in obj.values():
            walk_provenance(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            walk_provenance(v, acc)


def strings_in(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from strings_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings_in(v)


def analyse(route, status, text, phase):
    st = STATE
    if "429" in text:
        st.loose429[route] += 1
    ind = status == 429 or "HTTP 429" in text
    body = None
    try:
        body = json.loads(text)
    except Exception:
        pass
    if body is not None:
        provs = []
        walk_provenance(body, provs)
        for p in provs:
            if p.get("stale") is True:
                st.stale[route] += 1
            if p.get("cached") is False:
                st.cached_false[route] += 1
            if p.get("source") is not None:
                st.sources[route][str(p.get("source"))] += 1
            for s in strings_in(p):
                if "429" in s:
                    ind = True
        if status == 502 or status >= 500:
            pass
    if ind:
        st.ind429[route] += 1
    if status == 502:
        st.bad502[route] += 1
        st.err_examples.setdefault(route, text[:200])
    if status != 200:
        st.other_examples.setdefault((route, status), text[:200])


async def one_request(client, base, target, phase, sem=None):
    path, city, params = target
    st = STATE

    async def go():
        t0 = time.perf_counter()
        try:
            r = await client.get(base + path, params=params)
            dt = time.perf_counter() - t0
            return r.status_code, r.text, dt, None
        except asyncio.CancelledError:
            raise
        except Exception as e:  # connection errors, timeouts...
            dt = time.perf_counter() - t0
            return None, "", dt, f"{type(e).__name__}"

    if sem is not None:
        async with sem:
            code, text, dt, err = await go()
    else:
        code, text, dt, err = await go()

    st.count[path] += 1
    if err:
        st.status[path][f"ERR:{err}"] += 1
        st.conn_err[err] += 1
        st.lat_by_phase[path][phase].append(dt)
        st.lat[path].append(dt)
        return code, text, dt, err
    st.status[path][str(code)] += 1
    st.lat[path].append(dt)
    st.lat_by_phase[path][phase].append(dt)
    analyse(path, code, text, phase)
    return code, text, dt, err


async def warmup(client, base):
    print("== Phase 0: warm-up (sequential, both cities) ==")
    print(f"{'route':34s} {'city':10s} {'status':>6s} {'latency':>9s}  note")
    for target in build_targets():
        path, city, params = target
        t0 = time.perf_counter()
        note = ""
        try:
            r = await client.get(base + path, params=params)
            code, text = r.status_code, r.text
        except Exception as e:
            code, text, note = None, "", type(e).__name__
        dt = time.perf_counter() - t0
        if code is not None:
            analyse_warm(path, code, text)
            if code != 200:
                note = text[:100].replace("\n", " ")
        print(f"{path:34s} {city:10s} {str(code):>6s} {dt*1000:8.0f}ms  {note}")
        STATE.warmup.append({"route": path, "city": city, "status": code,
                             "latency_s": round(dt, 4), "note": note})
        if code is None:
            STATE.conn_err[note] += 1
    print()


def analyse_warm(route, code, text):
    """Warm-up responses count toward 429/502 indications but not latency."""
    st = STATE
    if code == 429 or "HTTP 429" in text:
        st.ind429[route] += 1
    try:
        body = json.loads(text)
        provs = []
        walk_provenance(body, provs)
        for p in provs:
            for s in strings_in(p):
                if "429" in s:
                    st.ind429[route] += 1
                    break
    except Exception:
        pass
    if code == 502:
        st.bad502[route] += 1
        st.err_examples.setdefault(route, text[:200])


def find_server_pid():
    if psutil is None:
        return None, "psutil not importable"
    cands = []
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            cmd = " ".join(p.info["cmdline"] or [])
            if ("python" in (p.info["name"] or "").lower()
                    and "uvicorn app.main:app" in cmd and "--port 8000" in cmd):
                cands.append(p)
        except Exception:
            continue
    if not cands:
        return None, "no uvicorn process found"
    # Windows venv launchers spawn a child: prefer the listener on :8000.
    for p in cands:
        try:
            for c in p.net_connections(kind="tcp"):
                if c.status == "LISTEN" and c.laddr.port == 8000:
                    return p.pid, f"pid {p.pid} (listener on :8000; {len(cands)} uvicorn procs)"
        except Exception:
            pass
    best = max(cands, key=lambda p: p.memory_info().rss)
    return best.pid, f"pid {best.pid} (largest RSS of {len(cands)} uvicorn procs)"


def sample_rss(pid):
    if pid is None:
        return None
    try:
        return psutil.Process(pid).memory_info().rss / (1024 * 1024)
    except Exception:
        return None


async def mem_sampler(pid, t_start, stop):
    if pid is None:
        return
    while not stop.is_set():
        v = sample_rss(pid)
        if v is not None:
            STATE.mem.append((round(time.time() - t_start, 1), round(v, 1)))
        try:
            await asyncio.wait_for(stop.wait(), MEM_PERIOD_S)
        except asyncio.TimeoutError:
            pass


async def steady_loop(client, base, targets, t_end, tasks, stop):
    interval = 1.0 / STEADY_RPS
    i = 0
    nxt = time.perf_counter()
    while time.time() < t_end and not stop.is_set():
        tgt = targets[i % len(targets)]
        i += 1
        STATE.steady_requests += 1
        tasks.add(asyncio.create_task(one_request(client, base, tgt, "steady")))
        tasks.difference_update({t for t in tasks if t.done()})
        nxt += interval
        delay = nxt - time.perf_counter()
        if delay > 0:
            await asyncio.sleep(delay)


async def burst_loop(client, base, targets, burst_rps, t_end, tasks, stop):
    sem = asyncio.Semaphore(burst_rps)
    # offset into the target list so bursts hit different routes than steady
    i = len(targets) // 3
    next_burst = time.time() + FIRST_BURST_AT_S
    while not stop.is_set():
        wait = next_burst - time.time()
        if wait > 0:
            try:
                await asyncio.wait_for(stop.wait(), wait)
                return
            except asyncio.TimeoutError:
                pass
        if time.time() >= t_end:
            return
        STATE.bursts_run += 1
        b0 = time.perf_counter()
        print(f"  [burst #{STATE.bursts_run}] {burst_rps} rps x {BURST_SECONDS}s "
              f"at +{time.time()-STATE.started:.0f}s", flush=True)
        for sec in range(BURST_SECONDS):
            for _ in range(burst_rps):
                tgt = targets[i % len(targets)]
                i += 1
                STATE.burst_requests += 1
                tasks.add(asyncio.create_task(
                    one_request(client, base, tgt, "burst", sem)))
            delay = b0 + sec + 1 - time.perf_counter()
            if delay > 0:
                await asyncio.sleep(delay)
        next_burst += BURST_PERIOD_S


async def run(args):
    st = STATE
    base = args.base.rstrip("/")
    limits = httpx.Limits(max_connections=args.burst_rps + 40,
                          max_keepalive_connections=args.burst_rps + 40)
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0), limits=limits) as client:
        try:
            h = (await client.get(base + "/api/health")).json()
            st.server_started_at_begin = h.get("started_at")
            print(f"server health ok, started_at={st.server_started_at_begin}")
        except Exception as e:
            print(f"health check failed: {type(e).__name__}: {e}")
            return
        pid, how = find_server_pid()
        print(f"server pid for RSS sampling: {how if pid else 'NOT FOUND (' + how + ') - no memory sampling'}")
        if pid is None:
            st.mem_note = f"server pid not found: {how}"
        else:
            st.mem_note = how
        t_start = time.time()
        st.started = t_start
        stop = asyncio.Event()
        mem_task = asyncio.create_task(mem_sampler(pid, t_start, stop))
        tasks: set[asyncio.Task] = set()
        try:
            await warmup(client, base)
            targets = build_targets()
            # interleave city: route0/bengaluru, route0/kyoto, route1/...
            n = len(ROUTES)
            targets = [t for pair in zip(targets[:n], targets[n:]) for t in pair]
            soak_start = time.time()
            t_end = soak_start + args.minutes * 60
            print(f"== Phase 1: soak for {args.minutes} min "
                  f"(steady {STEADY_RPS:g} rps; burst {args.burst_rps} rps x "
                  f"{BURST_SECONDS}s every {BURST_PERIOD_S}s) ==", flush=True)
            prog = asyncio.create_task(progress(t_end))
            await asyncio.gather(
                steady_loop(client, base, targets, t_end, tasks, stop),
                burst_loop(client, base, targets, args.burst_rps, t_end, tasks, stop),
            )
            prog.cancel()
        except (asyncio.CancelledError, KeyboardInterrupt):
            st.interrupted = True
            stop.set()
        finally:
            # let in-flight requests complete (bounded)
            pending = [t for t in tasks if not t.done()]
            if pending:
                done, still = await asyncio.wait(pending, timeout=65)
                for t in still:
                    t.cancel()
            stop.set()
            v = sample_rss(pid)
            if v is not None:
                st.mem.append((round(time.time() - t_start, 1), round(v, 1)))
            await asyncio.gather(mem_task, return_exceptions=True)
            try:
                h = (await client.get(base + "/api/health")).json()
                st.server_started_at_end = h.get("started_at")
            except Exception as e:
                st.server_started_at_end = f"health failed: {type(e).__name__}"


async def progress(t_end):
    while True:
        await asyncio.sleep(30)
        total = sum(STATE.count.values())
        bad = sum(c for r in STATE.status.values() for k, c in r.items() if k != "200")
        rss = STATE.mem[-1][1] if STATE.mem else None
        print(f"  ... +{time.time()-STATE.started:.0f}s requests={total} non200={bad} "
              f"rss={rss}MB", flush=True)


def pct(vals, q):
    if not vals:
        return None
    s = sorted(vals)
    k = max(0, min(len(s) - 1, int(round(q * (len(s) - 1)))))
    return s[k]


def build_report(args):
    st = STATE
    rows = []
    for path, _, _ in ROUTES:
        lats = st.lat.get(path, [])
        p50, p95, mx = pct(lats, 0.5), pct(lats, 0.95), (max(lats) if lats else None)
        ph = st.lat_by_phase.get(path, {})
        row = {
            "route": path,
            "count": st.count.get(path, 0),
            "status": dict(st.status.get(path, {})),
            "p50_s": p50, "p95_s": p95, "max_s": mx,
            "p95_steady_s": pct(ph.get("steady", []), 0.95),
            "p95_burst_s": pct(ph.get("burst", []), 0.95),
            "n502": st.bad502.get(path, 0),
            "stale": st.stale.get(path, 0),
            "cached_false": st.cached_false.get(path, 0),
            "n429_indications": st.ind429.get(path, 0),
            "raw_429_substring": st.loose429.get(path, 0),
            "sources": dict(st.sources.get(path, {})),
            "flags": [],
        }
        if p95 is not None and p95 > SLOW_P95_S:
            row["flags"].append("SLOW")
        rows.append(row)
    mem = [m for _, m in st.mem]
    memrep = {"note": st.mem_note, "samples": st.mem}
    if mem:
        memrep.update(first_mb=mem[0], last_mb=mem[-1], max_mb=max(mem), flags=[])
        if mem[-1] > mem[0] * MEM_GROWTH_FACTOR:
            memrep["flags"].append("MEMORY GROWTH")
    total429 = sum(st.ind429.values())
    return {
        "args": {"minutes": args.minutes, "burst_rps": args.burst_rps, "base": args.base},
        "interrupted": st.interrupted,
        "duration_s": round((st.ended or time.time()) - st.started, 1),
        "server_started_at_begin": st.server_started_at_begin,
        "server_started_at_end": st.server_started_at_end,
        "steady_requests": st.steady_requests,
        "burst_requests": st.burst_requests,
        "bursts_run": st.bursts_run,
        "total_requests": sum(st.count.values()),
        "connection_errors": dict(st.conn_err),
        "total_429_indications": total429,
        "total_502": sum(st.bad502.values()),
        "total_stale": sum(st.stale.values()),
        "routes": rows,
        "memory": memrep,
        "examples_502": dict(st.err_examples),
        "examples_non200": {f"{r} [{s}]": b for (r, s), b in st.other_examples.items()},
        "warmup": st.warmup,
    }


def fmt(v):
    return "   -  " if v is None else f"{v*1000:6.0f}"


def print_report(rep):
    print()
    print("=" * 118)
    print(f"SOAK RESULT  ({rep['duration_s']}s, {rep['total_requests']} requests: "
          f"{rep['steady_requests']} steady + {rep['burst_requests']} burst in "
          f"{rep['bursts_run']} bursts){'  [INTERRUPTED]' if rep['interrupted'] else ''}")
    print("=" * 118)
    print(f"{'route':32s} {'n':>5s} {'p50ms':>6s} {'p95ms':>6s} {'maxms':>6s} "
          f"{'p95 st':>6s} {'p95 bu':>6s} {'502':>4s} {'stale':>5s} {'429':>4s}  status / flags")
    for r in rep["routes"]:
        stat = " ".join(f"{k}:{v}" for k, v in sorted(r["status"].items()))
        flags = " ".join(r["flags"])
        print(f"{r['route']:32s} {r['count']:5d} {fmt(r['p50_s'])} {fmt(r['p95_s'])} "
              f"{fmt(r['max_s'])} {fmt(r['p95_steady_s'])} {fmt(r['p95_burst_s'])} "
              f"{r['n502']:4d} {r['stale']:5d} {r['n429_indications']:4d}  {stat} {flags}")
    print()
    print(f"429 indications total : {rep['total_429_indications']}  "
          f"({'OK' if rep['total_429_indications'] == 0 else 'FAIL: must be 0'})")
    print(f"502 total             : {rep['total_502']}")
    print(f"stale:true responses  : {rep['total_stale']}")
    print(f"connection errors     : {rep['connection_errors'] or 0}")
    print(f"server started_at     : begin={rep['server_started_at_begin']} "
          f"end={rep['server_started_at_end']}"
          f"{'  (RESTARTED?)' if rep['server_started_at_begin'] != rep['server_started_at_end'] else ''}")
    m = rep["memory"]
    if "first_mb" in m:
        print(f"memory RSS MB         : first={m['first_mb']} last={m['last_mb']} "
              f"max={m['max_mb']} ({len(m['samples'])} samples) {' '.join(m['flags'])}  [{m['note']}]")
    else:
        print(f"memory RSS            : not sampled ({m['note']})")
    if rep["examples_502"]:
        print("502 examples (first 200 chars):")
        for r, b in rep["examples_502"].items():
            print(f"  {r}: {b}")
    if rep["examples_non200"]:
        print("non-200 examples:")
        for r, b in rep["examples_non200"].items():
            print(f"  {r}: {b}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--minutes", type=float, default=30)
    ap.add_argument("--burst-rps", type=int, default=20)
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()

    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        STATE.interrupted = True
        print("\ninterrupted - reporting what was collected")
    STATE.ended = time.time()
    rep = build_report(args)
    print_report(rep)
    out = Path(__file__).resolve().parent / "soak-result.json"
    out.write_text(json.dumps(rep, indent=2))
    print(f"\nwrote {out}")
    return 0 if rep["total_429_indications"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
