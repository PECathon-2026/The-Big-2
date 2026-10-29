# Tsukuyomi Watch — project state (backend owner's log)

> Durable context for any session continuing this work. Updated 2026-10-30. Pair it with `docs/tsukuyomi-final-guideline.md` (the plan) and `docs/API.md` (the contract).

## The problem statement (PECathon 2026, PS-002)

Build "Tsukuyomi Watch: The Samurai's Celestial Guide", a web platform with a Japanese-inspired mystic interface that:
1. **Watchtower** finds the best stargazing spots: real-time weather (cloud cover, humidity, visibility) from open APIs, a "Night Honor Score", optional light pollution, an interactive scroll-style map with shrine/mountain/temple markers.
2. **Celestial Scroll** tracks events: meteor showers, eclipses, moon phases, ISS passes, rocket launches; filter by type and date on a lunar-calendar UI; alerts like "The Moon rises tonight at 8:14 PM".
3. **Spirit Lens** restores astronomical images with AI (denoise, deblur; pre-trained allowed; **no invented detail**) and detects stars/galaxies with brightness and size.
4. **Dojo Dashboard** shows before/after with a slider, zoom and detection overlays.
Theme: ink-wash, torii, cherry blossom, katana, red/black/gold, moon-centric, night mode. Bonus: NASA SkyView, spectral/time-domain transient detection, Honor Points gamification. Judges score innovation, technical knowledge, codebase awareness, deliverables.

## Our solution in one paragraph

One continuous night, not four pages: the app opens on the user's real sky (frontend-main's Living Sky), and every module is a camera move on it. The backend computes everything for real and explains every number (provenance + trace on each response). The signature piece is the Lens's **Proof of Honesty**: restoration uses the image's own measured PSF and a non-generative denoiser, then re-blurs the result and shows the residual, χ², SSIM/PSNR, flux conservation and a synthetic-star benchmark, so "no invented detail" is proven, not promised.

## Repo map

- `backend/` FastAPI (Python 3.14 venv at `backend/.venv`; run `uvicorn app.main:app --port 8000`; tests `python -m pytest -q`, 55 passing). Modules: `core` (settings, TTL cache, `fetch()` with stale fallback + replay + `validate`, Provenance/Trace, astronomy helpers), `watchtower`, `scroll`, `alerts`, `lens`, `honor`, `transients`, `planner`, `horizon`, `spectra`, `aurora`.
- `frontend-basic/` Vite + React 18 test UI on port 5173 (one page per module; `src/api.ts` is the typed client the main app copies).
- `frontend-main/` the teammate's real product (Vite + React 19 + R3F, port 3000). Their plan is `frontend-main/AGENT_BRIEF.md`, their status `frontend-main/NOTES.md`. They do not edit backend/, frontend-basic/ or docs/; we do not edit their src.
- `docs/` guideline, API contract, this file, judges prep, the Living Sky demo HTML.

## What is built (backend) and how it is verified

| Area | Endpoints | Real data | Verified by |
|---|---|---|---|
| Watchtower | `/api/watchtower/{forecast,score,light-pollution,spots}` | Open-Meteo (forecast, air quality, ensemble), NASA GIBS VIIRS Black Marble tile sampling, OpenStreetMap Overpass | unit tests on the score model; live checks (Nandi Hills ranks above city peaks) |
| Scroll | `/api/scroll/{moon,sun,eclipses,meteors,passes,launches,planets,calendar,season,events,ics}` | astronomy-engine, CelesTrak TLEs + SGP4 with shadow test, Launch Library 2, IMO shower table | tests vs known dates (2026 Hunter's Moon, 2027-08-02 eclipse, lunar months, sekki) |
| Alerts | `/api/alerts/*` | Web Push (pywebpush, VAPID), SQLite, 30 s worker | real notification received on the user's browser |
| Lens | `/api/lens/*` | photutils detection, ePSF, wavelet denoise, Richardson-Lucy, honesty metrics, AVM/FITS WCS, astrometry.net (needs key), SkyView, SIMBAD, synthetic benchmark | end-to-end test on a synthetic field with known truth; Andromeda JPEG resolves to real Tycho stars |
| Honor | `/api/honor/{ranks,observe,ledger}` | claims verified against the sky before points | tests: Moon up vs down, event window, future refused |
| Transients | `/api/transients/*` | ALeRCE/ZTF alerts, light curves, stamps; our own two-epoch subtraction | tests recover an injected SN after shift/blur/flux change |
| Planner | `/api/planner/{targets,plan}` | constraints per 15 min per spot; counterfactuals | tests on Orion Nebula/Polaris/Moon from Bengaluru |
| Horizon | `/api/horizon/{terrain,mask,path}` | Open-Meteo elevation model, traced points | synthetic-hill tests; Savanadurga shows a 35° wall |
| Spectra | `/api/spectra/{near,spectrum,at}` | SDSS SkyServer + DR17 FITS | M87 fixture test; NGC 5548 shows Seyfert lines |
| Aurora | `/api/aurora` | NOAA SWPC Kp now/forecast/scales | threshold tests; Helsinki/Tromsø/Bengaluru live |

Demo replay: every successful provider call is recorded to `data/replay/`; `TSUKUYOMI_REPLAY_MODE=first` serves recordings without the network, `fallback` only when a provider fails. `backend/data/replay-seed/` (committed, ~7 MB, 158 recordings for Bengaluru/Kyoto and the samples) is copied into `data/replay` on first start; refresh it with `python scripts/seed_replay.py`. Deployment: `backend/Dockerfile` and `docs/DEPLOY.md`.

Left (backend): plate-solve verification once the astrometry.net key is in `backend/.env`; optional polish (tune Honor Score weights against real nights, Web Push on HTTPS for the deployed frontend, Overpass pre-warm for any extra demo city).

## Working agreements

- Feature by feature: build → pause with a plain-English explanation and test steps → the user confirms → commit (small, human-readable messages, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`) → push → next.
- Nothing faked. If a provider fails, the response says so (stale cache, replay, or HTTP 502 `provider_unavailable`). Approximations are labelled (Bortle estimate uncalibrated, planner Moon rules heuristic, meteor radiant drift ignored).
- Teammate workflow: they push to `main` too; always `git fetch` + rebase before pushing. Their open requests to the backend live in `frontend-main/NOTES.md` under "Requests" (answer them there).

## Operational gotchas (Windows + OneDrive)

- uvicorn `--reload` often misses edits made under OneDrive: restart with kill → wait until port 8000 is closed → start → poll `/api/health` for a new `started_at`.
- Public Overpass is slow (30–90 s cold) and rate-limits bursts (HTTP 429); results cached 24 h, demo cities pre-warmed at startup (60 km for all, 110 km for Bengaluru). A timed-out reply is never cached (`validate`).
- Open-Meteo elevation throttles bursts: `fetch()` backs off on 429; terrain cached 30 days.
- SIMBAD's CDS host refuses connections from this network; the Harvard mirror works (one 30 s timeout per process before it is remembered).
- `tzdata` is required on Windows (no system zone database). `sep` has no Python 3.14 wheel; photutils is used instead.
- npm installs under OneDrive can leave truncated files; `rm -rf node_modules && npm ci` fixes "'*/' expected" type errors.
- The Vite dev servers: frontend-basic on 5173, frontend-main on 3000; CORS allows both.

## Frontend-main review summary (2026-10-30)

Builds and typechecks after a clean install; uses the real backend everywhere (only a labelled Lens mock as fallback); astronomy maths verified; journey gate → loader → sakura dusk → sky with dives → pages implemented. Issues to fix on their side: Back button leaves the camera zoomed (no popstate), 587 KB gz main bundle vs 250 KB target, full-canvas CSS blur on module pages, overlay canvas repainted every frame at 2× dpr, undisposed GPU resources, dome residue in 17 files, five unused vendored components, their `api.ts` lacks the horizon/spectra/aurora sections (re-copy from frontend-basic). Overall 7.5/10.
