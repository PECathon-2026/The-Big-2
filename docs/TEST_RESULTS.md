# Tsukuyomi Watch — backend test results (2026-10-30)

> **Status (same day, later):** the server-stall fix (worker threads, vectorised ISS scan, memoised answers) and the
> unusable-200 fix (per-provider validators, self-cleaning cache) have landed on `main`; the chaos suite is now
> 204/204. Everything below is the picture as measured before those fixes, kept as the record of the run.

Run of `docs/TEST_PLAN.md` Part B against `main` at `0e81852`. Nothing in `app/` was changed. The six scripts
and the result JSON files are in the working tree, uncommitted. Every failure below is a result, not a fix.

## Summary

| Suite | Result | Verdict |
|---|---|---|
| `tests/test_contract.py` | 277 tests, 252 pass, 25 fail (6 min 27 s) | 7 real bugs, 1 replay gap, 2 plan-vs-app questions |
| `tests/test_chaos.py` | 204 tests, 164 pass, 40 fail (79 s) | 6 root causes, all real |
| `tests/test_lens_redteam.py` | 58 tests, 50 pass, 8 fail (3 min 12 s) | 6 real (1 intermittent), 2 plan-vs-app |
| `tests/test_state_machines.py` | 12 tests, 6 pass, 6 fail (57 s) | 6 real |

Counts are from my own sequential re-run after the agents finished (the agents' runs differed by one test each:
Hypothesis found an extra Sun case, and one Lens restart check is intermittent).
| `scripts/soak.py` (8 min) | 33 % of requests failed, every route p50 13–56 s | **server collapses under load** |
| `scripts/check_frontend_contract.py` | exit 1 | 1 field mismatch in both frontends, expected section gap |
| Ground truth (browser) | Moon/Sun/twilight match timeanddate to the minute, ISS pass matches heavens-above | 1 misleading "visible" flag |
| Fresh clone (Haiku) | 59/59 existing tests pass, replay-first fully offline | 12 documentation gaps |
| Live server during the run | hung after ~1,250 requests; py-spy shows CPU-bound astronomy on the event loop | same root cause as soak |

The existing 59 tests still pass on a fresh clone. The old suite tested each module's happy path; the new suites
test what happens between modules and under pressure, which is where every failure is.

## 1. The one that matters for the demo: the server stalls under concurrency

**Symptom.** With about two requests per second plus short bursts of twenty, every route (including `/api/health`
and `/api/honor/ranks`, which take 10 ms when idle) ends up waiting 13–56 s at the median and 80–110 s at p95;
a third of requests time out at 60 s; the server dropped 45 connections. Memory stays flat (221→239 MB), so it is
not a leak. Single requests are fast again once the queue drains.

**Cause (py-spy dump of the stuck process, three samples 4 s apart).** The main thread is always inside
pure-Python astronomy-engine code called synchronously from `async def` handlers
(`calendar_endpoint → month_calendar → moon_age_days → SearchMoonPhase / rise_set`). The four asyncio worker
threads are idle: nothing is offloaded with `to_thread`. One uvicorn worker, one event loop, so every concurrent
request serialises behind whatever is computing.

**Per-request CPU cost, caches warm, in-process (median of 3):**

| route | ms | route | ms |
|---|---|---|---|
| scroll/events | 7042 | horizon/terrain | 1048 |
| scroll/passes | 3108 | scroll/calendar | 712 |
| scroll/eclipses | 887 | scroll/planets | 151 |
| scroll/meteors | 106 | scroll/moon | 69 |
| watchtower/score | 66 | sun / aurora / forecast / light-pollution / health | 57 / 43 / 15 / 19 / 7 |

At an average of roughly 0.5 s per request the single worker saturates near 2 requests per second. Several judges
reloading the app, or the frontend's events feed plus a calendar, is enough to make everything time out.

Reproduce: `python scripts/soak.py --minutes 2 --burst-rps 20` against a running server, or open
`/api/scroll/events?lat=12.97&lon=77.59&days=7` in four tabs at once and then try `/api/health`.

## 2. Chaos: what happens when a provider answers garbage (`tests/test_chaos.py`)

Works: timeouts, 429 and 500 give `502 provider_unavailable` everywhere; fresh cache → `cached: true` with zero
upstream calls; stale cache → `stale: true` with a note; replay `off` / `fallback` / `first` behave as documented;
garbage files in `data/cache` and `data/replay` under other names are ignored; an Overpass `remark` reply is never
cached. Fails, by root cause:

1. **A 200 that cannot be parsed crashes to HTTP 500** instead of being treated as a failure. Only Overpass has a
   `validate` hook; binary upstreams are never checked; routers catch `ProviderError` only.
   `{}` from Open-Meteo → `KeyError 'hourly'` on forecast and score; HTML from GIBS → PIL error on light-pollution;
   truncated/empty TLE → "bad TLE" on passes; `{}` elevation → `KeyError 'elevation'` on terrain; HTML/empty FITS →
   astropy `OSError` on `/api/spectra/at` (`/spectrum` catches it, `/at` does not); score with a bad air-quality or
   ensemble reply → 500.
2. **A silent empty 200 with no note.** HTML parsed as a TLE → `passes: []`; `{}` from Launch Library → `launches:
   []`; `{}` from ALeRCE → `objects: []`; the events feed omits the note for a failed source.
3. **Planner blames the user:** SIMBAD answering `{}` → `400 "SIMBAD does not know 'North America Nebula'"`
   instead of 502.
4. **Bad payloads poison the cache and the replay recordings** for the full TTL (30 days for GIBS tiles and SDSS
   spectra, 6 h TLEs, 1 h Launch Library/ALeRCE): once a garbage 200 is stored, the route keeps failing after the
   provider recovers, served with `cached: true`.
5. **A good stale entry is overwritten by a garbage 200** on the binary routes (light-pollution, passes, spectra).
6. **A malformed cache file crashes the request:** `fetched_at: "yesterday"` → `TypeError` in `CacheEntry.fresh`
   → 500; a well-formed entry holding the wrong payload is served as fresh → 500.

Repro idea for all of them: point a mock for `api.open-meteo.com` at `{}` and call
`/api/watchtower/forecast?lat=12.97&lon=77.59`; the test file does exactly this with `httpx.MockTransport`.

## 3. Contract and validation (`tests/test_contract.py`)

All 57 (method, path) pairs are exercised; the Envelope shape holds everywhere it is documented; property tests
(Hypothesis, random lat/lon/time) pass for moon, planets, meteors, eclipses, calendar, season, aurora, events,
passes and the horizon mask. Fails:

1. `/api/transients/recent` and `/api/transients/{oid}` do not bound `lat`/`lon`: ±91, ±181, `nan`, `inf` → 500.
2. `POST /api/alerts/schedule-event` does not bound body `lat`/`lon` → 500.
3. `/api/scroll/calendar?year=99999` (or `-5`) → 500.
4. `/api/scroll/passes?sat=NOT-A-SATELLITE` → 500 (`int(sat)`).
5. `POST /api/horizon/mask` accepts 20 000 points; no cap.
6. **Sun times are invented where there is no astronomical night** (Hypothesis: lat −59 today): `night_bounds`
   falls back to `astronomical_dusk = sunset`, `dawn = sunrise`, so nautical dusk comes *after* astronomical dusk and
   `dark_hours` counts the whole night as dark. Should be null or "no dark hours". My re-run also found the polar
   case: at lat 78 today `dark_hours` is **−14.89**.
7. Replay gap: the Lens catalog tries `simbad.cds.unistra.fr` first, which is not in the seed, so an offline demo
   pays one connection timeout before the recorded Harvard mirror answers.
8. Plan vs app: `/api/watchtower/forecast` returns Open-Meteo's hourly series from local midnight (hours in the
   past); `/score` trims correctly. Decide whether to trim the raw forecast.
9. Spots at 0,0: Overpass itself returned 502, so the app's documented `provider_unavailable` is correct; note
   `SpotsResult` has no `message` field and `formula=""` when the list is empty.

Test-file notes: the plan's Moon-age bound of 29.6 d was relaxed to 29.85 (real lunations reach 29.83 d);
`test_scroll_upstream_routes` failed once in four runs (a pass at the edge of the window?), worth watching.

## 4. Spirit Lens red team (`tests/test_lens_redteam.py`)

Holds up well: false positives 0–0.2 % on every synthetic field; χ² 0.99–1.03 (1.02 on pure noise); no invented
structure (restored pixels above 3σ in empty sky: 0–10 vs 387–1042 in the original; zero detections in empty sky);
pure noise, saturated, JPEG q15, 4000×40, 40×4000, 6000² (processed at 2048², 11.7 s), 16-bit and float FITS,
RGB and RGBA all finish cleanly and deterministically; 10 concurrent jobs finish in 49.5 s with the manifest intact.
Fails:

1. **Hot pixels are counted as sources:** a dark 16-bit frame with 50 single bright pixels → 49 detections
   (48 "unknown"). The 3σ threshold, smoothing and 5-pixel minimum area do not reject one-pixel spikes.
2. **A garbage WCS is reported as solved:** `CD1_1='garbage'`, `CD1_2=1e30`… → `method=fits-header`, pixel scale
   3.6e33 arcsec/px, field of view 5e32°. No sanity check on the CD matrix or pixel scale (all-zero CD is handled).
3. **Flux conservation 0.963–0.967 at 2× noise** (limit ±2 %; other fields 0.995–1.014). Not a trend, worth a look.
4. **Benchmark overstates completeness:** 1.000 on the 3× noise field where real completeness above the 5σ limit is
   0.902, because injected stars land in empty, isolated spots. Its recovery counts themselves are correct.
5. **After a restart a job is correctly `failed` but its `psf` stage stays `running`** forever
   (`_load_from_disk` never closes open stages).
6. **Intermittent:** in my re-run a finished job's image endpoint answered **409** after the simulated restart
   ("done job lost its arrays across the restart"); the agent's run passed the same check. Worth a second look at
   how finished jobs rehydrate their arrays.
7. Plan vs app: a text file renamed `.jpg` gets 202 then a clean `failed` (the plan said 400; the existing
   `test_lens.py` expects 202-then-failed). The error text leaks `<_io.BytesIO object at 0x…>`.

Timings: synthetic field 14 s (deblur 6, PSF 4, honesty 2.5), potw2048a 31 s (deblur 23), benchmark ≈6 s.

## 5. Honor and Alerts state machines (`tests/test_state_machines.py`)

Holds: no points for a claim the sky forbids (independent check with `astro`); totals equal the ledger; ledger
never loses rows; ranks monotonic; alerts deliver exactly once at the first due tick in 600 fuzzed steps; cancel,
unsubscribe, 410 Gone, fail-once and restarts behave; 20 threads, no "database is locked". Fails:

1. **No duplicate or cooldown rule:** the same Moon claim twice → 5 then 10 points.
2. **Ledger order is wrong across UTC offsets:** `claimed_at` is stored with the client's offset and sorted as text,
   so `2026-10-30T00:30+05:30` (19:00Z) lists above `2026-10-29T20:00Z`.
3. **`POST /api/alerts/schedule` accepts a `fire_at` in the past** (201).
4. **Crash between the push and `mark("sent")` → delivered again after restart** (no "sending" state).
5. **`store.due` has `LIMIT 50`:** 60 due alerts → 50 now, 10 on the next tick (low severity).
6. **Two overlapping `deliver_due` runs push the same alerts repeatedly** (98 of 100 alerts pushed up to 20×).
   Live trigger: `POST /api/alerts/test` calls `deliver_due()` directly while the worker ticks.

## 6. Frontend contract (`scripts/check_frontend_contract.py`)

No missing routes, no parameter mismatches. One real field mismatch in **both** frontends:
`GET /api/lens/jobs/{id}/catalog` is typed `getRaw<CatalogMatch[]>` but the server returns `{matches, queried,
note}`, so `Array.isArray` never matches and the SIMBAD table never renders (basic falls back to raw JSON).
Informational: `SkyEvent.visible_from_here` is typed `boolean` but is `null` for Moon-quarter events; `GET
/api/lens/status` and `/api/transients/{oid}/lightcurve` are called by neither UI; 40 route/type pairs are
unverifiable because the server returns untyped dicts (health, forecast, light-pollution, season, alerts,
transients, honor, planner targets, spectra, horizon path, and nested `Moon.name`, `Plan.window`…). Section gap
confirmed: frontend-main lacks horizon, spectra and aurora (7 routes, 8 types); shared types are identical.

## 7. Ground truth

| place | quantity | ours | timeanddate / heavens-above | diff |
|---|---|---|---|---|
| Bengaluru | moonset / moonrise 30 Oct | 10:19 / 21:56 | 10:20 / 21:56 | ≤1 min |
| Bengaluru | sunrise 30 Oct / sunset 29 Oct | 06:12:42 / 17:54:08 | 06:12 / 17:54 | 0 |
| Bengaluru | astronomical dawn / dusk | 05:00:37 / 19:06:08 | 05:00 / 19:06 | 0 |
| Bengaluru | illumination ≈05:40 IST | 80.6 % | 80.5 % | 0.1 pt |
| Kyoto | moonset / moonrise 30 Oct | 10:47 / 20:23 | 10:47 / 20:23 | 0 |
| Kyoto | sunset 30 Oct / sunrise 31 Oct | 17:05:07 / 06:16:33 | 17:05 / 06:16 | 0 |
| Kyoto | astronomical dusk / dawn | 18:30:27 / 04:51:03 | 18:30 / 04:51 | 0 |
| Bengaluru | first visible ISS pass | 4 Nov 00:10Z rise, max 16.0° | 4 Nov 00:12:40 at 10° N, max 16° NE | match |

One discrepancy: we flag the 3 Nov 14:15Z pass as **visible** for 80 s, with the alert "max 42° · 1 min visible",
but the ISS is sunlit only while between 0.6° and 5.6° above the horizon; the 42° maximum is in shadow.
heavens-above does not list it (its rule: ≥10° while sunlit). `/passes` also returns daytime passes with
`visible: false`; the UI must filter. Not done: Tromsø, Sydney, Cape Town, Ushuaia and the November/December dates
(timeanddate returns 403 to scripted fetches; the Haiku agent then hit the server hang). Planet alt/az has no
fetchable reference.

## 8. Fresh clone (Haiku, following the docs literally)

Outcome: pytest 59/59 in 252 s; replay-first served score, spots, events, passes, aurora, spectra, transients and
samples with `replay`/`computed` provenance only; no errors in the log. Documentation gaps found on the way:

1. `python -m venv .venv` fails (ensurepip, WinError 3) when the repo sits under a long path (LongPathsEnabled=0);
   the `&&` chain in `backend/README.md` stops there.
2. Activation shown only for cmd and macOS; Git Bash needs `source .venv/Scripts/activate`.
3. `copy .env.example .env` is cmd-only; `backend/README.md` and `DEPLOY.md` never mention creating `.env`.
4. The bare `uvicorn` launcher fails in Git Bash ("Permission denied"); `python -m uvicorn` is undocumented.
5. **Replay variable conflict:** `backend/README.md` and the `cache.py` docstring still say
   `TSUKUYOMI_DEMO_REPLAY=1`; everything else uses `TSUKUYOMI_REPLAY_MODE`; `.env.example` has both.
6. `set TSUKUYOMI_REPLAY_MODE=fallback` in `DEPLOY.md` is cmd-only; that the env var overrides `.env` is undocumented.
7. Port 8000 is hard-coded; the CORS default lacks 5174/5175, so a test UI on another port is blocked.
8. Python version disagrees: root README 3.12+, Dockerfile 3.12, PROJECT_STATE 3.14; `requirements.txt` has lower
   bounds only.
9. `.env` and `data/` resolve relative to the working directory; running from `backend/` is a silent requirement.
10. frontend-basic port override only via `npm run dev -- --port N`; npm audit reports 5 vulnerabilities.
11. **Starting the backend rewrites a tracked file:** `backend/data/samples/samples.json` comes back with CRLF
    endings, so a fresh clone shows a dirty tree.
12. `PROJECT_STATE.md` says 55 tests; there are 59, and the suite takes about 4 minutes.

Also observed: `seed_replay_from_repo()` looks for the seed under `<data_dir>/replay-seed`, so any custom
`TSUKUYOMI_DATA_DIR` gets no seed and replay-first still goes online. CelesTrak was unreachable from this network
for part of the run (curl timeout), which the app reported honestly as 502.

## Housekeeping left by the run

- New, uncommitted: the four test files, `scripts/soak.py`, `scripts/check_frontend_contract.py`, two result JSONs.
- `backend/.hypothesis/` (own `.gitignore`) and a `backend/.env` equal to `.env.example` appeared during the run.
- Outside the repo: `C:\Users\gupta\tsuk-venv` and the scratchpad `fresh-clone` folder, both deletable.
- `hypothesis`, `psutil` and `py-spy` were installed into `backend/.venv` and are not in `requirements.txt`.
