# Tsukuyomi Watch — backend test plan

Two halves: **manual checks** you do by hand in the test UI (http://localhost:5173) or by opening API URLs
(http://localhost:8000/...), and an **agentic plan** for automated, adversarial testing. Expected values are
stated so a wrong answer is obvious. Bengaluru = `lat=12.97&lon=77.59`, Kyoto = `lat=35.01&lon=135.77`.

Start the backend from `backend/` with `uvicorn app.main:app --port 8000`, then `GET /api/health` must show
`replay_mode` and a fresh `started_at`.

---

## Part A — manual test cases (happy path + edge cases)

### A0. Cross-cutting (check on every response)
- Every JSON answer has `data`, `provenance` (non-empty list, each with `source` and a fetched time or note) and `computed_at`.
- Numbers that are scores or rates come with a `trace` (`formula`, `inputs`, `contributions`).
- Edge: kill your Wi-Fi, repeat a request. You get either a cached answer whose provenance says stale/cache, a replay answer (`source: "replay"`), or HTTP 502 `provider_unavailable`. Never a silent fake number.
- Edge: `lat=91` or `lon=200` gives HTTP 422, not a crash. `lat=0&lon=0` (ocean) still answers; the spots list may be empty with a message.

### A1. Watchtower
- `/api/watchtower/forecast` Bengaluru: hourly rows start at the current hour (not in the past), cloud cover 0–100, times carry the local offset (+05:30).
- `/api/watchtower/score` Bengaluru: score 0–100, a verdict word, `best_window` inside tonight's dark period (after dusk, before dawn), `trace.contributions` sum to the score. Warnings appear when humidity is above 85 % or the Moon is bright.
- Edge: call at local noon. The score is still for tonight and hours before now are excluded.
- Edge: Tromsø in summer (`lat=69.65&lon=18.96`) has no astronomical darkness. Expect a clear message, not a division by zero (needs a date override or a note if none exists).
- `/api/watchtower/light-pollution` Bengaluru: bright, Bortle about 8–9 and labelled as an uncalibrated estimate. Savanadurga (`lat=12.92&lon=77.29`) is darker than the city. Open ocean is very dark.
- `/api/watchtower/spots?radius_km=60&limit=12` Bengaluru: Nandi Hills ranks near the top; each spot has elevation, distance, score and a reason; no city-centre spot gets a top rank.
- Edge: `radius_km=5` gives few or zero spots, no error. `radius_km=300` is rejected or capped by validation.
- Edge: Kyoto returns real temples and mountains with Japanese names.

### A2. Celestial Scroll
- `/api/scroll/moon` Bengaluru today (2026-10-30): phase and illumination plausible, Japanese name present, an alert sentence like "The Moon rises tonight at …" with a local time. Compare rise and set with timeanddate.com for Bengaluru (±2 min).
- Edge: a polar location in polar night. Rise and set may be null and the message explains why.
- `/api/scroll/sun`: sunset, dusk, dawn, sunrise in order; dusk after sunset.
- `/api/scroll/eclipses`: the list includes the 2027-08-02 total solar eclipse; each entry says whether it is visible from here.
- `/api/scroll/meteors`: active showers only; Orionids are active in late October; the rate is 0 while the radiant is below the horizon.
- `/api/scroll/passes?days=3`: every pass has rise, max and set, max altitude above 10°, and happens while the sky is dark and the ISS is sunlit. Cross-check one pass with heavens-above.com.
- Edge: `days=30` is rejected or capped. A location with no passes in the window gives an empty list, not an error.
- `/api/scroll/launches`: upcoming launches, future dates only, correct local time.
- `/api/scroll/planets`: each planet has alt/az now plus rise and set; Venus and Jupiter roughly match Stellarium.
- `/api/scroll/calendar` and `/api/scroll/season`: today's lunar month and day, the current sekki and kō (late October is 霜降 Sōkō).
- `/api/scroll/events?days=7`: a unified feed sorted by time, filterable by type, no duplicates.
- `/api/scroll/ics` downloads a `.ics`; imported into Google Calendar the events land at the right local times.

### A3. Alerts (Web Push)
- In the test UI enable notifications and click Test. A notification arrives.
- Schedule an alert 2 minutes ahead. It arrives within about 30 s of the due time (worker interval).
- Schedule from an event (Moon rise tonight). It arrives at the event time.
- Edge: a time in the past gives HTTP 400 with a clear message. Unsubscribe stops deliveries. Restarting the backend keeps scheduled alerts (SQLite).
- Edge: two browsers subscribed both receive.

### A4. Spirit Lens
- Run sample `synthetic_field`: the job goes queued, running, done; the detection count is close to the injected truth; the honesty panel shows residual, χ², SSIM/PSNR and flux conservation near 1.0.
- Run `heic1502a` (Andromeda): the result shows dust lanes, not black blobs; WCS is solved from metadata; the catalog names real Tycho stars; the SkyView overlay aligns.
- Upload your own night-sky JPEG: detections are stars, not JPEG noise; side by side, the restored image has no structure the original lacks.
- Edge: a text file renamed .jpg gives HTTP 400. A 30 MB image is rejected or finishes within the time limit. A dark empty frame gives zero detections, honesty is still computed, no crash.
- Edge: restart the backend while a job runs. The job becomes failed, the UI shows it, the samples manifest is intact.
- Benchmark: synthetic stars recovered at the stated completeness; false positives reported honestly.
- Plate-solve (only once the key is in `.env`): an image without metadata gets WCS from astrometry.net; a timeout is handled.

### A5. Honor Points
- Claim "Moon observed" while the Moon is up: points awarded and rank updated. The same claim while the Moon is down is rejected with the reason.
- A meteor-shower claim outside the shower's activity window is rejected.
- Edge: a future timestamp gives HTTP 400. A duplicate claim inside the cooldown is rejected or earns zero. The ledger lists every attempt with its verdict.

### A6. Transients
- Recent SNIa with probability at least 0.7: objects with ra/dec, class probability and last magnitude; clicking one opens its card with the light curve and science, template and difference stamps that look like real cutouts.
- Our own subtraction on one detection shows the transient as a residual and lists the steps.
- Cone search around M31 (`ra=10.68&dec=41.27&radius_arcsec=600`) returns results or an empty list, no error.
- Edge: a bogus object id gives HTTP 404. A detection without a stamp is said so in the UI.

### A7. Planner
- Plan the Orion Nebula tonight from Bengaluru with naked eye and with a telescope: different minimum altitudes and windows; a best spot and time with counterfactuals (what would change the answer).
- Polaris from Kyoto is always observable. The Southern Cross from Kyoto is not observable, with the reason that it never rises.
- Edge: a target name typo fails SIMBAD resolve with a clear 404/400. A target below the horizon all night gets an explanation, not an empty crash.

### A8. Horizon
- Terrain for Savanadurga shows a wall of about 35° on one side; Bengaluru city is mostly flat.
- Manual mask: a 20° obstruction at azimuth 90–120 marks the Moon's path tonight as blocked in that range.
- Edge: an ocean location gives a flat 0° horizon. A mountaintop gives a horizon mostly at or below 5°.

### A9. Spectra
- `/api/spectra/at?ra=187.7059&dec=12.3911` (M87): a spectrum with redshift about 0.0043 and detected lines. NGC 5548 (`ra=214.4981&dec=25.1368`) shows Seyfert broad lines.
- Edge: a position outside the SDSS footprint (for example `dec=-30`) says no spectrum nearby, not an error trace. `max_points` is respected.

### A10. Aurora
- Bengaluru: chance none, required Kp far above 9. Tromsø: low required Kp, chance depends on the current Kp. The Kp shown matches the NOAA SWPC page right now.
- Edge: the equator still answers; a southern high latitude (`lat=-70`) works with the southern geomagnetic latitude.

### A11. Replay and deploy
- Wi-Fi off, `TSUKUYOMI_REPLAY_MODE=first`, restart: all demo-city pages load and provenance says replay.
- `docker build` from `backend/` and run: `/api/health` answers on the mapped port.

---

## Part B — automated testing plan (token-efficient)

Principle: anything deterministic is a **script**, written once and run for free with `pytest`. Agents are used
only where judgment is needed, and then the cheapest model that can read a web page (Haiku), one at a time.
Fable reviews failures, never the whole codebase.

### B1. Scripts, written in the normal confirm-and-commit cycle (one file per step)
| File | What it checks | Run with |
|---|---|---|
| `tests/test_contract.py` | Every route in `app.main` (56 handlers): valid call gives 200 with the Envelope shape; missing or invalid params give 422; out-of-range lat/lon give 422; absurd `days`/`radius`/`limit` are capped or 422. `hypothesis` generates lat, lon and time. Invariants: scores 0–100 with contributions summing, times monotonic (sunset, dusk, dawn, sunrise), altitudes within ±90, illumination 0–1, rates non-negative, no NaN or Infinity anywhere (recursive scan). | `pytest tests/test_contract.py` |
| `tests/test_chaos.py` | A fixture monkeypatches `core.http.fetch` to return, per upstream (Open-Meteo, GIBS, Overpass, CelesTrak, Launch Library, ALeRCE, SDSS, SIMBAD, SWPC, SkyView): timeout, 429, 500, HTML instead of JSON, truncated JSON, empty list, Overpass `remark`-only. Expected: stale cache, then replay, then 502 `provider_unavailable`, provenance truthful. Fails if any endpoint answers 200 with zero-filled or fabricated data and no note. Corrupted files in `data/cache` and `data/replay` are ignored and rebuilt. | `pytest tests/test_chaos.py` |
| `tests/test_lens_redteam.py` | Synthetic fields with known truth: false positives below the stated rate, flux conservation within 2 %, re-blur SSIM above threshold, no structure above noise where truth is empty. Adversarial inputs: pure noise, saturated frame, hot pixels, JPEG block artefacts, extreme aspect ratios, 1×1 and very large images, 16-bit FITS, colour and mono, broken WCS header. Ten concurrent jobs; restart mid-run marks the right jobs failed. | `pytest tests/test_lens_redteam.py` |
| `tests/test_state_machines.py` | Fuzzed sequences of observe, schedule, unsubscribe, restart against a model of expected state with SQLite as oracle: no points for impossible claims, ledger never loses rows, each alert fires exactly once, past-due alerts across a restart deliver once or are marked missed. | `pytest tests/test_state_machines.py` |
| `scripts/soak.py` | Hits the demo-city routes at demo rate plus bursts of about 20 requests per second for 30 minutes with `httpx`; prints p95 per route (flag above 2 s), counts 429s from Overpass and elevation (must be 0), samples process memory (must stay flat). | `python scripts/soak.py` |
| `scripts/check_frontend_contract.py` | Loads `/openapi.json` and parses `frontend-basic/src/api.ts` and frontend-main's copy: every path the UI calls exists, every field it reads exists with the right type. Catches the horizon, spectra and aurora gap. | `python scripts/check_frontend_contract.py` |

Order of writing: contract, chaos, Lens red team (most likely to find real bugs), then state machines, soak, frontend contract.
Each file is one feature in the cycle: build, explain, you run it, confirm, commit.

### B2. Two cheap agents, sequential, Haiku
- **Ground truth.** Input: six locations across both hemispheres, three dates each, the three reference sites (timeanddate for rise/set, heavens-above for ISS passes, Stellarium Web for planet alt/az) and our endpoints. Output: one table of ours vs reference with tolerances (rise/set ±2 min, alt/az ±0.5°, phase ±1 %) and a list of rows outside tolerance. No code reading.
- **Fresh clone.** Clone into an empty directory, follow `README.md` and `docs/DEPLOY.md` literally, start with `TSUKUYOMI_REPLAY_MODE=first` and no network, run `pytest`, open the test UI. Output: every step that needed knowledge not in the docs.

### B3. Fable reviews failures only
Every red test, soak outlier, contract mismatch or Haiku finding comes to this session as a short list with a curl
reproduction. Fixes go through the normal feature-by-feature cycle, one commit each.

### Cost
Writing the six scripts is one session of output here; running them is free forever. The two Haiku runs are a
fraction of one Fable agent. Total is well under a tenth of eight parallel Fable agents, and the deterministic parts
cannot hallucinate a pass.
