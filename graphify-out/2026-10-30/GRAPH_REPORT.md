# Graph Report - Pecathon  (2026-10-30)

## Corpus Check
- 227 files · ~205,677 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: .css 13, (none) 5, .example 2)

## Summary
- 2272 nodes · 6111 edges · 99 communities (90 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 125 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `931b7674`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- data/api.ts
- subtract.py
- honor/router.py
- Envelope
- jobs.py
- src/api.ts
- http.py
- InkFlood.tsx
- Gate.tsx
- dojo/index.tsx
- HudRoot.tsx
- OverlayPainter.tsx
- lens/router.py
- Petals.tsx
- fetch
- TimeCompass.tsx
- frontend-basic/package.json
- Scroll.tsx
- parts.tsx
- scroll/index.tsx
- docs/JUDGES_PREP.md
- dependencies
- Objects.tsx
- Director.ts
- coords.ts
- meteors.py
- score.py
- terrain.py
- astro.py
- Lens.tsx
- tonight.ts
- samples.py
- alerts/router.py
- frontend-main/package.json
- store.ts
- watchtower/index.tsx
- StarBorder.tsx
- useApp
- benchmark.py
- Provenance
- ref_react
- Landmarks.tsx
- main.py
- honesty.py
- app/App.tsx
- CountUp.tsx
- images.py
- src/App.tsx
- test_alerts.py
- events.py
- docs/API.md
- backend/requirements.txt
- compilerOptions
- wcs.py
- satellites.py
- detect.py
- alerts/store.py
- spots.py
- frontend-main/NOTES.md
- compilerOptions
- plan.py
- AppState
- skytime.ts
- build-sky.mjs
- envelope.py
- Watchtower.tsx
- Moon.tsx
- InfoCard.tsx
- devDependencies
- ProviderError
- docs/tsukuyomi-final-guideline.md
- pages/Transients.tsx
- IntroScroll.tsx
- reset_for_tests
- engine.ts
- calendar_lunar.py
- test_lens.py
- compilerOptions
- config.py
- GradualBlur.tsx
- ics.py
- eclipses.py
- SpotlightCard.tsx
- frontend-main/vite.config.ts
- sender.py
- docs/AGENT_GRAPH.md
- Notify.tsx
- data/format.ts
- Settings
- scripts
- IntroFrame.tsx
- frontend-main/tsconfig.json
- frontend-basic/src/vite-env.d.ts
- FastAPI service and routers
- frontend-main/src/vite-env.d.ts
- vapid_public_key

## God Nodes (most connected - your core abstractions)
1. `useApp` - 84 edges
2. `Provenance` - 58 edges
3. `app()` - 45 edges
4. `fetch()` - 38 edges
5. `ProviderError` - 37 edges
6. `Envelope` - 34 edges
7. `run_pipeline()` - 28 edges
8. `Scroll()` - 28 edges
9. `compute_night_score()` - 27 edges
10. `Kanji()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `FastAPI service and routers` --conceptually_related_to--> `fastapi backend dependency`  [INFERRED]
  docs/JUDGES_PREP.md → backend/requirements.txt
- `Satellite pass tracks and illumination visibility` --conceptually_related_to--> `sgp4 backend dependency`  [INFERRED]
  docs/API.md → backend/requirements.txt
- `Calendar export and Web Push reminders` --conceptually_related_to--> `pywebpush backend dependency`  [INFERRED]
  docs/JUDGES_PREP.md → backend/requirements.txt
- `Historical brief: Lens described as mock-only` --conceptually_related_to--> `Spirit Lens asynchronous image pipeline`  [EXTRACTED]
  frontend-main/AGENT_BRIEF.md → docs/JUDGES_PREP.md
- `Product-owner decision: no dome exterior` --references--> `Design intent: one continuous observing night`  [EXTRACTED]
  frontend-main/NOTES.md → docs/tsukuyomi-final-guideline.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graph-first agent navigation and maintenance** — graph_tooling, graph_queries, graph_updates, graph_trust [EXTRACTED 1.00]
- **Plan observe inspect record journey** — living_sky, watchtower, scroll, lens, dojo, honor [EXTRACTED 1.00]
- **Restoration model and diagnostic loop** — psf, denoise, deblur, honesty, residual, benchmark [EXTRACTED 1.00]

## Communities (99 total, 9 thin omitted)

### Community 0 - "data/api.ts"
Cohesion: 0.04
Nodes (55): ApiError, BestWindow, buildUrl(), CalendarDay, CatalogMatch, Counterfactual, Eclipse, EVENT_KINDS (+47 more)

### Community 1 - "subtract.py"
Cohesion: 0.12
Nodes (12): difference(), _fwhm_estimate(), _mad_sigma(), png_b64(), _field(), test_faded_known_source_is_flagged_not_called_new(), test_identical_epochs_give_no_candidates(), test_mjd_conversion() (+4 more)

### Community 2 - "honor/router.py"
Cohesion: 0.08
Nodes (15): ledger(), observe(), ObserveBody, ranks(), rank_for(), add(), _db(), ledger() (+7 more)

### Community 3 - "Envelope"
Cohesion: 0.17
Nodes (12): Envelope, calendar_endpoint(), eclipses_endpoint(), events_endpoint(), ics_endpoint(), launches_endpoint(), meteors_endpoint(), moon_endpoint() (+4 more)

### Community 4 - "jobs.py"
Cohesion: 0.11
Nodes (26): apply_wcs(), build_detections(), get_job(), Job, _load_from_disk(), now(), run_pipeline(), _run_safely() (+18 more)

### Community 5 - "src/api.ts"
Cohesion: 0.05
Nodes (50): BestWindow, buildUrl(), Counterfactual, Eclipse, Forecast, get(), getRaw(), HonorRank (+42 more)

### Community 6 - "http.py"
Cohesion: 0.13
Nodes (6): cache(), CacheEntry, replay_get(), replay_record(), TTLCache, Provider cache retry and recorded fallback

### Community 7 - "InkFlood.tsx"
Cohesion: 0.06
Nodes (44): inkClose(), inkFade(), InkImpl, inkOpen(), ready(), registerInk(), useInk, waiters (+36 more)

### Community 8 - "Gate.tsx"
Cohesion: 0.06
Nodes (59): loadCatalog(), round2(), MOON_NAMES, moonName(), MoonNameInfo, SYNODIC, build(), unlockAudio() (+51 more)

### Community 9 - "dojo/index.tsx"
Cohesion: 0.10
Nodes (31): api, Benchmark, Detection, LENS_STAGES, LensJob, LensResult, LensSample, LensStage (+23 more)

### Community 10 - "HudRoot.tsx"
Cohesion: 0.17
Nodes (22): CHAPTERS, setSound(), ChapterRail(), Countdown(), Next, ROUTE, Directory(), GLYPH (+14 more)

### Community 11 - "OverlayPainter.tsx"
Cohesion: 0.07
Nodes (47): Catalog, HIP_POLARIS, ArrivalHints(), Hint(), pickAnchor(), Spot, SPOTS, ConGeom (+39 more)

### Community 12 - "lens/router.py"
Cohesion: 0.10
Nodes (16): CatalogResult, catalog(), create_job(), _get(), _get_done(), get_image(), get_job(), run_benchmark() (+8 more)

### Community 13 - "Petals.tsx"
Cohesion: 0.17
Nodes (31): catalogSync(), DuskAtmosphere(), canvasTex(), DuskLandscape(), fujiTex(), Layer, pagodaTex(), intro (+23 more)

### Community 14 - "fetch"
Cohesion: 0.09
Nodes (22): client(), _decode(), fetch(), Fetched, cone(), lightcurve(), mjd_to_dt(), obj() (+14 more)

### Community 15 - "TimeCompass.tsx"
Cohesion: 0.28
Nodes (15): fmtClock(), KOKU, kokuAt(), localHours(), TimeBand(), arc(), f1(), Mark (+7 more)

### Community 16 - "frontend-basic/package.json"
Cohesion: 0.06
Nodes (31): dependencies, leaflet, react, react-dom, react-leaflet, react-router-dom, devDependencies, @types/leaflet (+23 more)

### Community 17 - "Scroll.tsx"
Cohesion: 0.19
Nodes (23): CalendarDay, EVENT_KINDS, EventKind, Pass, Shower, Card(), Chip(), Label() (+15 more)

### Community 18 - "parts.tsx"
Cohesion: 0.31
Nodes (8): ensureSubscribed(), pushSupported(), unsubscribe(), urlBase64ToUint8Array(), Countdown(), parts(), RemindMe(), RState

### Community 19 - "scroll/index.tsx"
Cohesion: 0.15
Nodes (41): HonorRank, Ledger, Observation, ObserveResult, compass(), fmtDate(), fmtNum(), fmtTime() (+33 more)

### Community 20 - "docs/JUDGES_PREP.md"
Cohesion: 0.12
Nodes (29): Known synthetic-star injection benchmark, Bortle proxy is not a ground measurement, Solar-altitude darkness gate, Richardson-Lucy iterative deconvolution, BayesShrink wavelet denoising, astropy backend dependency, photutils backend dependency, scikit-image backend dependency (+21 more)

### Community 21 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, astronomy-engine, @fontsource/cinzel, @fontsource/cormorant-garamond, @fontsource/shippori-mincho, @fontsource-variable/plus-jakarta-sans, gsap, @gsap/react (+13 more)

### Community 22 - "Objects.tsx"
Cohesion: 0.14
Nodes (24): altAzToVec(), Pass, Shower, Meteors(), meteorStats, rad, Streak, fmt1() (+16 more)

### Community 23 - "Director.ts"
Cohesion: 0.11
Nodes (13): dirToYawPitch(), DOME_POS, EYE, FOV_MAX, FOV_MIN, onModulePath(), PITCH_MAX, PITCH_MIN (+5 more)

### Community 24 - "coords.ts"
Cohesion: 0.11
Nodes (26): bvToRgb(), ConstellationDef, DsoDef, getStarTargets(), RawCatalog, STAR_STRIDE, StarName, StarTargets (+18 more)

### Community 25 - "meteors.py"
Cohesion: 0.13
Nodes (12): active_showers(), _date(), HourRate, limiting_magnitude(), _load(), Shower, test_geminids_peak_night_has_high_rate_at_dark_site(), test_lunar_eclipse_search_returns_sorted_future_events() (+4 more)

### Community 26 - "score.py"
Cohesion: 0.14
Nodes (19): Contribution, Trace, BestWindow, clamp(), compute_night_score(), darkness_gate(), factor_qualities(), HourScore (+11 more)

### Community 27 - "terrain.py"
Cohesion: 0.08
Nodes (21): get_terrain(), mask(), MaskBody, path(), PathBody, _terrain(), build(), Crossing (+13 more)

### Community 28 - "astro.py"
Cohesion: 0.15
Nodes (20): altaz(), from_time(), local(), moon_age_days(), moon_alt(), moon_illumination(), moon_phase_deg(), night_bounds() (+12 more)

### Community 29 - "Lens.tsx"
Cohesion: 0.11
Nodes (33): Basic API test frontend, Benchmark, CatalogMatch, Detection, Envelope, LENS_STAGES, LensJob, LensResult (+25 more)

### Community 30 - "tonight.ts"
Cohesion: 0.12
Nodes (21): Envelope, Moon, NightScore, PlanetInfo, Provenance, SkyEvent, Sun, cached() (+13 more)

### Community 31 - "samples.py"
Cohesion: 0.17
Nodes (15): _ensure_samples(), get_sample(), list_samples(), status(), _download_real(), ensure_samples(), ensure_synthetic(), generate_synthetic() (+7 more)

### Community 32 - "alerts/router.py"
Cohesion: 0.16
Nodes (11): cancel(), schedule(), schedule_event(), ScheduleBody, ScheduleEventBody, _sub_or_404(), subscribe(), SubscribeBody (+3 more)

### Community 33 - "frontend-main/package.json"
Cohesion: 0.07
Nodes (26): leaflet, react, react-dom, react-leaflet, @types/leaflet, @types/react, @types/react-dom, typescript (+18 more)

### Community 34 - "store.ts"
Cohesion: 0.15
Nodes (20): damp(), nearestAngle(), CameraRig(), CanvasRoot(), clear, FrameloopSwitch(), SkyInput(), space (+12 more)

### Community 35 - "watchtower/index.tsx"
Cohesion: 0.14
Nodes (22): Contribution, HourScore, Spot, VerdictKind, Num(), useCalm(), Gauge(), Step (+14 more)

### Community 36 - "StarBorder.tsx"
Cohesion: 0.12
Nodes (25): clamp(), ease(), HOVERS, mix(), Mote, outline(), Palette, Point (+17 more)

### Community 37 - "useApp"
Cohesion: 0.12
Nodes (30): drawMoon(), API_BASE, sourceGlyph(), CitySearch(), fmtLatLon(), LocationChip(), Architecture(), LICENCE (+22 more)

### Community 38 - "benchmark.py"
Cohesion: 0.13
Nodes (9): _gaussian_kernel(), run_benchmark(), deblur(), chi2_of(), DeblurResult, denoise(), DenoiseResult, reduced_chi2() (+1 more)

### Community 39 - "Provenance"
Cohesion: 0.13
Nodes (15): Provenance, sample(), air_quality(), elevation(), ensemble_cloud_spread(), _fmt(), forecast(), _parse_times() (+7 more)

### Community 40 - "ref_react"
Cohesion: 0.12
Nodes (22): ApiError, Horizon, MaskPoint, PathReport, Controls(), JsonView(), AppProvider(), AppState (+14 more)

### Community 41 - "Landmarks.tsx"
Cohesion: 0.14
Nodes (23): DEG, DEFAULT_PLACE, fade(), fbm1(), fbm2(), n1(), n2(), perm (+15 more)

### Community 42 - "main.py"
Cohesion: 0.12
Nodes (5): health(), provider_error_handler(), list_targets(), make_plan(), PlanBody

### Community 43 - "honesty.py"
Cohesion: 0.14
Nodes (12): aperture_fluxes(), aperture_radius(), evaluate(), flux_conservation(), forward_model(), HonestyArrays, invented_pixels(), position_shift() (+4 more)

### Community 44 - "app/App.tsx"
Cohesion: 0.19
Nodes (17): App(), PhaseSync(), initLenis(), lenis(), releaseScroll(), Chapter, Dojo, Honor (+9 more)

### Community 45 - "CountUp.tsx"
Cohesion: 0.06
Nodes (43): CircularText(), CircularTextProps, clamp(), HOVER_SPEED, HoverMode, SpinState, buildRoll(), clamp01() (+35 more)

### Community 46 - "images.py"
Cohesion: 0.25
Nodes (11): _ellipse_points(), JobArrays, _limits(), render(), render_luminance(), render_noise(), render_overlay(), render_psf() (+3 more)

### Community 47 - "src/App.tsx"
Cohesion: 0.21
Nodes (7): api, API_BASE, Health, App(), TABS, TopBar(), react-router-dom

### Community 48 - "test_alerts.py"
Cohesion: 0.12
Nodes (7): deliver_due(), run_forever(), lifespan(), test_cancel_prevents_delivery(), test_gone_subscription_is_removed(), test_schedule_event_uses_the_event_alert_text(), test_schedule_then_deliver_when_due()

### Community 49 - "events.py"
Cohesion: 0.10
Nodes (11): angular_separation(), verify(), _compass(), Event, events(), MoonInfo, phase_name(), Quarter (+3 more)

### Community 50 - "docs/API.md"
Cohesion: 0.18
Nodes (15): Traditional lunar calendar and seasons, SIMBAD brightest-source catalogue lookup, API data provenance computed_at envelope, Computed score trace and contribution fields, Local eclipse circumstances, Unified locally timed events feed, Launch timing and visibility hints, Lens job status stages and image endpoints (+7 more)

### Community 51 - "backend/requirements.txt"
Cohesion: 0.12
Nodes (15): astronomy-engine backend dependency, astroquery backend dependency, httpx backend dependency, numpy backend dependency, pillow backend dependency, pydantic backend dependency, pydantic-settings backend dependency, pytest backend dependency (+7 more)

### Community 52 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 53 - "wcs.py"
Cohesion: 0.09
Nodes (11): _downscale(), _first_2d_hdu(), _is_fits(), _load_fits(), load_image(), _load_pillow(), LoadedImage, scale_wcs() (+3 more)

### Community 54 - "satellites.py"
Cohesion: 0.24
Nodes (11): _altaz(), _compass(), _finish(), _gmst_rad(), _observer_ecef(), Pass, passes(), PassPoint (+3 more)

### Community 55 - "detect.py"
Cohesion: 0.09
Nodes (14): BackgroundResult, classify(), detect_sources_catalog(), estimate_background(), instrumental_mag(), RawDetection, _val(), _build_epsf() (+6 more)

### Community 56 - "alerts/store.py"
Cohesion: 0.24
Nodes (12): cancel(), _db(), delete_subscription(), due(), get_alert(), get_subscription(), list_alerts(), mark() (+4 more)

### Community 57 - "spots.py"
Cohesion: 0.11
Nodes (16): brightness_to_bortle(), tile_xy(), _float(), haversine_km(), _kind(), overpass(), _overpass_ok(), _proxy() (+8 more)

### Community 58 - "frontend-main/NOTES.md"
Cohesion: 0.17
Nodes (11): Horizontal coordinates east/up/north convention, Design rationale: spectacle needs escape hatches, Design intent: ink paper gold crimson visual vocabulary, Single camera Director and dive navigation, Status report: real Lens and Dojo backend integration, Historical brief: Lens described as mock-only, Design intent: one persistent R3F canvas, Design rationale: avoid React rerenders per frame (+3 more)

### Community 59 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 60 - "plan.py"
Cohesion: 0.22
Nodes (12): Candidate, Counterfactual, _evaluate(), make_plan(), evaluate_all(), _moon_blocks(), _moon_quality(), Plan (+4 more)

### Community 61 - "AppState"
Cohesion: 0.06
Nodes (19): AppState, AnimatedContentProps, AnimatedContentStaggerFrom, AnimatedContentWipe, WIPES, clamp01(), clampToScroll(), easeBack() (+11 more)

### Community 62 - "skytime.ts"
Cohesion: 0.24
Nodes (16): Vec3, BodyPos, bodyPosition(), introTimeline(), LatLon, moonState, nextRiseSet(), observer() (+8 more)

### Community 63 - "build-sky.mjs"
Cohesion: 0.17
Nodes (11): constellations, dir, dsoList, flat, lineById, names, out, r4() (+3 more)

### Community 64 - "envelope.py"
Cohesion: 0.23
Nodes (6): now_utc(), _dt(), _f(), haversine_km(), Launch, upcoming()

### Community 65 - "Watchtower.tsx"
Cohesion: 0.28
Nodes (14): Contribution, HourScore, NightScore, Spot, KV(), fmtNum(), verdictClass(), Contributions() (+6 more)

### Community 66 - "Moon.tsx"
Cohesion: 0.13
Nodes (20): back, basis, f, haloTexture(), MOON_DIST, MOON_SCALE, MoonAndSun(), ncp (+12 more)

### Community 67 - "InfoCard.tsx"
Cohesion: 0.48
Nodes (6): compass16, eqToHorizontal(), vecToAltAz(), InfoCard(), KIND, num()

### Community 68 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, r3f-perf, tailwindcss, @tailwindcss/vite, @types/leaflet, @types/node, @types/react, @types/react-dom (+5 more)

### Community 69 - "ProviderError"
Cohesion: 0.08
Nodes (21): ProviderError, _angular_sep_arcsec(), _cone(), _find_mirror(), _params(), _radius_deg(), simbad_matches(), CatalogMatch (+13 more)

### Community 70 - "docs/tsukuyomi-final-guideline.md"
Cohesion: 0.22
Nodes (10): Three-concept visual reference demo, Concept demo: Ink and Paper, Concept demo: Living Sky, Concept demo: Sumi-e Dusk, Product-owner decision: no dome exterior, Planned terrain-aware observing horizon, Design intent: one continuous observing night, Planned counterfactual observing planner (+2 more)

### Community 71 - "pages/Transients.tsx"
Cohesion: 0.39
Nodes (7): SubtractionResult, TransientDetail, TransientObject, fmtDate(), CLASSES, LightcurveSvg(), Transients()

### Community 72 - "IntroScroll.tsx"
Cohesion: 0.12
Nodes (18): eqToHorizontalMatrix(), skyPalette, smoothstep(), STOPS, toHex(), sunMoonPlanets, finishIntro(), markSeen() (+10 more)

### Community 73 - "reset_for_tests"
Cohesion: 0.29
Nodes (4): reset_for_tests(), client(), isolated_store(), sent()

### Community 74 - "engine.ts"
Cohesion: 0.29
Nodes (10): apply(), cue, duck(), env(), INSEN, noise(), ramp(), startBed() (+2 more)

### Community 75 - "calendar_lunar.py"
Cohesion: 0.32
Nodes (7): CalendarDay, lunar_month_number(), LunarCalendar, month_calendar(), sekki_for(), sun_longitude(), moon_name()

### Community 76 - "test_lens.py"
Cohesion: 0.22
Nodes (5): client(), test_full_pipeline_on_synthetic_sample(), test_samples_listed(), test_unknown_job_and_bad_upload(), _wait()

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 78 - "config.py"
Cohesion: 0.20
Nodes (4): key_dir(), load_or_create(), private_key_path(), public_key_b64url()

### Community 79 - "GradualBlur.tsx"
Cohesion: 0.25
Nodes (10): clamp01(), CURVES, DIRECTIONS, findScroller(), GradualBlur(), GradualBlurCurve, GradualBlurPosition, GradualBlurProps (+2 more)

### Community 80 - "ics.py"
Cohesion: 0.29
Nodes (6): VAPID subscriptions and scheduled alerts, _esc(), _fmt(), make_ics(), pywebpush backend dependency, Calendar export and Web Push reminders

### Community 81 - "eclipses.py"
Cohesion: 0.44
Nodes (5): Eclipse, eclipses(), _fmt(), lunar_eclipses(), solar_eclipses()

### Community 82 - "SpotlightCard.tsx"
Cohesion: 0.27
Nodes (9): clamp(), falloff(), Palette, Settings, SHAPES, SpotlightCard(), SpotlightCardProps, SpotlightShape (+1 more)

### Community 85 - "docs/AGENT_GRAPH.md"
Cohesion: 0.43
Nodes (6): graphifyy[mcp] 0.9.97 developer tooling, Optional graph stdio MCP access, Graphify query path explain affected navigation, Graphify developer-only codebase index with persisted corpus exclusions, Source authority; CSS omitted and six AST files without symbols, Structural updates and semantic re-extraction

### Community 86 - "Notify.tsx"
Cohesion: 0.39
Nodes (6): NotifyButton(), State, ensureSubscribed(), pushSupported(), unsubscribe(), urlBase64ToUint8Array()

### Community 87 - "data/format.ts"
Cohesion: 0.32
Nodes (4): Trace, fmtPct(), fmtRelative(), InfoPopoverProps

### Community 89 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, rb, typecheck

### Community 90 - "IntroFrame.tsx"
Cohesion: 0.26
Nodes (8): FrameHandle, IntroFrame, clamp(), ConfigKey, ScrollExpand, ScrollExpandHandle, ScrollExpandProps, smoothstep()

### Community 94 - "FastAPI service and routers"
Cohesion: 0.29
Nodes (7): Typed frontend API client, FastAPI service and routers, fastapi backend dependency, Main React TypeScript product frontend, Shared place, timezone and time offset, Shared sky clock and matrix-based catalogue rotation, SQLite alerts and journal storage

### Community 98 - "vapid_public_key"
Cohesion: 0.40
Nodes (3): scheduled(), stats(), vapid_public_key()

## Knowledge Gaps
- **438 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+433 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 783 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Basic API test frontend` connect `Lens.tsx` to `ref_react`, `docs/JUDGES_PREP.md`, `src/api.ts`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `FastAPI service and routers` connect `FastAPI service and routers` to `main.py`, `docs/JUDGES_PREP.md`, `http.py`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `Shared place, timezone and time offset` connect `FastAPI service and routers` to `store.ts`, `docs/JUDGES_PREP.md`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `Provenance` (e.g. with `Fetched` and `terrain_horizon()`) actually correct?**
  _`Provenance` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _438 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `data/api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04293785310734463 - nodes in this community are weakly interconnected._
- **Should `subtract.py` be split into smaller, more focused modules?**
  _Cohesion score 0.12307692307692308 - nodes in this community are weakly interconnected._