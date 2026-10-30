# Graph Report - Pecathon  (2026-10-30)

## Corpus Check
- 241 files · ~213,947 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 23 file(s) not represented in the graph (top: .css 13, (none) 7, .example 2)

## Summary
- 2379 nodes · 6413 edges · 106 communities (94 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 145 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9e14ae62`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- data/api.ts
- test_transients.py
- honor/store.py
- Envelope
- jobs.py
- src/api.ts
- TTLCache
- GlowCursor.tsx
- skytime.ts
- dojo/index.tsx
- HudRoot.tsx
- OverlayPainter.tsx
- Gate.tsx
- IntroScroll.tsx
- Provenance
- space_weather.py
- frontend-basic/package.json
- Scroll.tsx
- http.py
- scroll/index.tsx
- docs/JUDGES_PREP.md
- dependencies
- coords.ts
- Director.ts
- app
- meteors.py
- test_watchtower.py
- terrain.py
- astro.py
- Lens.tsx
- tonight.ts
- samples.py
- test_alert
- frontend-main/package.json
- store.ts
- watchtower/index.tsx
- StarBorder.tsx
- useApp
- benchmark.py
- spots.py
- ref_react
- sky/Horizon.tsx
- ProviderError
- honesty.py
- app/App.tsx
- CountUp.tsx
- images.py
- compute_night_score
- test_alerts.py
- events
- docs/API.md
- backend/requirements.txt
- compilerOptions
- wcs.py
- passes
- psf.py
- alerts/store.py
- Part A — manual test cases (happy path + edge cases)
- frontend-main/NOTES.md
- compilerOptions
- make_plan
- AppState
- detect.py
- build-sky.mjs
- envelope.py
- Watchtower.tsx
- Moon.tsx
- index.ts
- devDependencies
- targets.py
- docs/tsukuyomi-final-guideline.md
- pages/Transients.tsx
- skyClock.ts
- reset_for_tests
- engine.ts
- calendar_lunar.py
- LiquidEther.tsx
- compilerOptions
- vapid.py
- GradualBlur.tsx
- ics.py
- eclipses.py
- SpotlightCard.tsx
- frontend-main/vite.config.ts
- sender.py
- docs/AGENT_GRAPH.md
- Notify.tsx
- app/main.tsx
- Settings
- scripts
- IntroFrame.tsx
- frontend-main/tsconfig.json
- frontend-basic/src/vite-env.d.ts
- honor/index.tsx
- frontend-main/src/vite-env.d.ts
- vapid_public_key
- ScrollReveal.tsx
- SpotsMap.tsx
- Deploying Tsukuyomi Watch
- moon.py
- Design intent: ink paper gold crimson visual vocabulary
- delete_subscription

## God Nodes (most connected - your core abstractions)
1. `useApp` - 83 edges
2. `Provenance` - 72 edges
3. `fetch()` - 51 edges
4. `app()` - 45 edges
5. `ProviderError` - 41 edges
6. `Envelope` - 40 edges
7. `run_pipeline()` - 28 edges
8. `Scroll()` - 28 edges
9. `compute_night_score()` - 27 edges
10. `Kanji()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Operational gotchas (Windows + OneDrive)` --references--> `fetch()`  [INFERRED]
  docs/PROJECT_STATE.md → backend/app/core/http.py
- `B1. Scripts, written in the normal confirm-and-commit cycle (one file per step)` --references--> `fetch()`  [INFERRED]
  docs/TEST_PLAN.md → backend/app/core/http.py
- `Repo map` --references--> `fetch()`  [INFERRED]
  docs/PROJECT_STATE.md → backend/app/core/http.py
- `Repo map` --references--> `aurora()`  [INFERRED]
  docs/PROJECT_STATE.md → backend/app/aurora/router.py
- `Working agreements` --references--> `main()`  [INFERRED]
  docs/PROJECT_STATE.md → backend/scripts/seed_replay.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graph-first agent navigation and maintenance** — graph_tooling, graph_queries, graph_updates, graph_trust [EXTRACTED 1.00]
- **Plan observe inspect record journey** — living_sky, watchtower, scroll, lens, dojo, honor [EXTRACTED 1.00]
- **Restoration model and diagnostic loop** — psf, denoise, deblur, honesty, residual, benchmark [EXTRACTED 1.00]

## Communities (106 total, 12 thin omitted)

### Community 0 - "data/api.ts"
Cohesion: 0.04
Nodes (51): ApiError, BestWindow, buildUrl(), CatalogMatch, Contribution, Counterfactual, EVENT_KINDS, EventKind (+43 more)

### Community 1 - "test_transients.py"
Cohesion: 0.15
Nodes (10): difference(), _fwhm_estimate(), _mad_sigma(), png_b64(), _field(), test_faded_known_source_is_flagged_not_called_new(), test_identical_epochs_give_no_candidates(), test_mjd_conversion() (+2 more)

### Community 2 - "honor/store.py"
Cohesion: 0.15
Nodes (11): ledger(), observe(), ObserveBody, ranks(), rank_for(), add(), _db(), ledger() (+3 more)

### Community 3 - "Envelope"
Cohesion: 0.08
Nodes (20): Envelope, calendar_endpoint(), eclipses_endpoint(), events_endpoint(), ics_endpoint(), launches_endpoint(), meteors_endpoint(), moon_endpoint() (+12 more)

### Community 4 - "jobs.py"
Cohesion: 0.06
Nodes (41): Trace, apply_wcs(), build_detections(), get_job(), Job, _load_from_disk(), now(), run_pipeline() (+33 more)

### Community 5 - "src/api.ts"
Cohesion: 0.04
Nodes (57): ApiError, Aurora, BestWindow, buildUrl(), Counterfactual, Eclipse, Forecast, get() (+49 more)

### Community 7 - "GlowCursor.tsx"
Cohesion: 0.17
Nodes (15): SkyCursor(), token(), TIERS, clamp(), compile(), fromHsv(), GlowCursor(), GlowCursorProps (+7 more)

### Community 8 - "skytime.ts"
Cohesion: 0.06
Nodes (72): loadCatalog(), altAzToVec(), isLit(), MOON_NAMES, moonName(), MoonNameInfo, SYNODIC, BodyPos (+64 more)

### Community 9 - "dojo/index.tsx"
Cohesion: 0.11
Nodes (32): Benchmark, Detection, LENS_STAGES, LensJob, LensResult, LensSample, LensStage, fmtPct() (+24 more)

### Community 10 - "HudRoot.tsx"
Cohesion: 0.17
Nodes (20): CHAPTERS, compass16, vecToAltAz(), ChapterRail(), Countdown(), Next, ROUTE, Directory() (+12 more)

### Community 11 - "OverlayPainter.tsx"
Cohesion: 0.10
Nodes (31): tier(), Hint(), pickAnchor(), Spot, SPOTS, COMPASS, conEnd(), F (+23 more)

### Community 12 - "Gate.tsx"
Cohesion: 0.18
Nodes (21): round2(), CityHit, geolocationGranted(), gpsPosition(), ipPlace(), locate(), PRESETS, reverseLabel() (+13 more)

### Community 13 - "IntroScroll.tsx"
Cohesion: 0.09
Nodes (56): bvToRgb(), catalogSync(), cameraAt(), Cap, keys(), EYE, rig, backdrop (+48 more)

### Community 14 - "Provenance"
Cohesion: 0.07
Nodes (29): Provenance, _decode(), fetch(), Fetched, tle(), at(), near(), spectrum() (+21 more)

### Community 15 - "space_weather.py"
Cohesion: 0.12
Nodes (13): aurora(), Aurora, chance_word(), current_kp(), g_scale_now(), geomagnetic_latitude(), kp_forecast(), KpPoint (+5 more)

### Community 16 - "frontend-basic/package.json"
Cohesion: 0.06
Nodes (31): dependencies, leaflet, react, react-dom, react-leaflet, react-router-dom, devDependencies, @types/leaflet (+23 more)

### Community 17 - "Scroll.tsx"
Cohesion: 0.19
Nodes (23): CalendarDay, EVENT_KINDS, EventKind, Pass, Shower, AuroraCard(), TONE, Card() (+15 more)

### Community 18 - "http.py"
Cohesion: 0.14
Nodes (9): cache(), replay_get(), replay_record(), isolated(), _key(), test_fallback_mode_uses_recording_only_after_failure(), test_first_mode_serves_recording_without_network(), test_off_mode_raises_when_provider_is_unreachable() (+1 more)

### Community 19 - "scroll/index.tsx"
Cohesion: 0.15
Nodes (23): api, API_BASE, compass(), fmtTime(), kindGlyph(), ensureSubscribed(), pushSupported(), unsubscribe() (+15 more)

### Community 20 - "docs/JUDGES_PREP.md"
Cohesion: 0.12
Nodes (29): Typed frontend API client, FastAPI service and routers, Known synthetic-star injection benchmark, Bortle proxy is not a ground measurement, Solar-altitude darkness gate, BayesShrink wavelet denoising, astropy backend dependency, fastapi backend dependency (+21 more)

### Community 21 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, astronomy-engine, @fontsource/cinzel, @fontsource/cormorant-garamond, @fontsource/shippori-mincho, @fontsource-variable/plus-jakarta-sans, gsap, @gsap/react (+13 more)

### Community 22 - "coords.ts"
Cohesion: 0.08
Nodes (43): Catalog, ConstellationDef, DsoDef, getStarTargets(), HIP_POLARIS, RawCatalog, StarName, StarTargets (+35 more)

### Community 23 - "Director.ts"
Cohesion: 0.12
Nodes (18): dirToYawPitch(), Vec3, closePanels(), openPanels(), reduced(), run(), screen(), CamState (+10 more)

### Community 24 - "app"
Cohesion: 0.17
Nodes (25): STAR_STRIDE, INTRO_REVEAL_GLSL, useTier(), Meteors(), MilkyWay(), MilkyWayInner(), MwJson, Raster (+17 more)

### Community 25 - "meteors.py"
Cohesion: 0.14
Nodes (11): active_showers(), _date(), HourRate, limiting_magnitude(), _load(), Shower, test_geminids_peak_night_has_high_rate_at_dark_site(), test_lunar_eclipse_search_returns_sorted_future_events() (+3 more)

### Community 26 - "test_watchtower.py"
Cohesion: 0.17
Nodes (13): brightness_to_bortle(), clamp(), darkness_gate(), factor_qualities(), score_hour(), _forecast(), test_bortle_mapping_is_monotonic(), test_darkness_gate_edges() (+5 more)

### Community 27 - "terrain.py"
Cohesion: 0.08
Nodes (21): get_terrain(), mask(), MaskBody, path(), PathBody, _terrain(), build(), Crossing (+13 more)

### Community 28 - "astro.py"
Cohesion: 0.20
Nodes (11): altaz(), from_time(), local(), moon_age_days(), moon_illumination(), moon_phase_deg(), rise_set(), search_altitude() (+3 more)

### Community 29 - "Lens.tsx"
Cohesion: 0.13
Nodes (27): Basic API test frontend, Benchmark, CatalogMatch, Detection, Envelope, LENS_STAGES, LensJob, LensResult (+19 more)

### Community 30 - "tonight.ts"
Cohesion: 0.10
Nodes (25): Envelope, Moon, NightScore, Pass, PlanetInfo, Provenance, Shower, SkyEvent (+17 more)

### Community 31 - "samples.py"
Cohesion: 0.08
Nodes (24): _download_real(), ensure_samples(), ensure_synthetic(), generate_synthetic(), load_manifest(), _manifest_path(), sample_path(), samples_dir() (+16 more)

### Community 32 - "test_alert"
Cohesion: 0.17
Nodes (9): schedule(), schedule_event(), ScheduleBody, ScheduleEventBody, _sub_or_404(), subscribe(), SubscribeBody, test_alert() (+1 more)

### Community 33 - "frontend-main/package.json"
Cohesion: 0.07
Nodes (27): leaflet, react, react-dom, react-leaflet, @types/leaflet, @types/react, @types/react-dom, typescript (+19 more)

### Community 34 - "store.ts"
Cohesion: 0.13
Nodes (21): damp(), nearestAngle(), CameraRig(), CanvasRoot(), clear, FrameloopSwitch(), SkyInput(), space (+13 more)

### Community 35 - "watchtower/index.tsx"
Cohesion: 0.22
Nodes (23): fmtDate(), fmtNum(), Lens(), FieldTransients(), ObjectList(), RecentSupernovae(), Stamps(), DataState() (+15 more)

### Community 36 - "StarBorder.tsx"
Cohesion: 0.12
Nodes (25): clamp(), ease(), HOVERS, mix(), Mote, outline(), Palette, Point (+17 more)

### Community 37 - "useApp"
Cohesion: 0.14
Nodes (26): drawMoon(), CalendarDay, Eclipse, LunarCalendar, fmtRelative(), Architecture(), Credits(), LICENCE (+18 more)

### Community 38 - "benchmark.py"
Cohesion: 0.13
Nodes (9): _gaussian_kernel(), run_benchmark(), deblur(), chi2_of(), DeblurResult, denoise(), DenoiseResult, reduced_chi2() (+1 more)

### Community 39 - "spots.py"
Cohesion: 0.08
Nodes (25): sample(), tile_xy(), air_quality(), elevation(), ensemble_cloud_spread(), _fmt(), forecast(), _parse_times() (+17 more)

### Community 40 - "ref_react"
Cohesion: 0.09
Nodes (32): api, Health, Horizon, MaskPoint, PathReport, Plan, PlanCandidate, PlannerTarget (+24 more)

### Community 41 - "sky/Horizon.tsx"
Cohesion: 0.23
Nodes (13): fade(), fbm2(), n1(), n2(), perm, Horizon(), RidgeDef, ridgeGeometry() (+5 more)

### Community 42 - "ProviderError"
Cohesion: 0.05
Nodes (18): seed_replay_from_repo(), ProviderError, reset_for_tests(), fetch_cutout(), _fits_to_png(), health(), lifespan(), provider_error_handler() (+10 more)

### Community 43 - "honesty.py"
Cohesion: 0.13
Nodes (13): aperture_fluxes(), aperture_radius(), evaluate(), flux_conservation(), forward_model(), HonestyArrays, invented_pixels(), position_shift() (+5 more)

### Community 44 - "app/App.tsx"
Cohesion: 0.22
Nodes (17): App(), PhaseSync(), releaseScroll(), Chapter, Dojo, Honor, isModulePath(), Lens (+9 more)

### Community 45 - "CountUp.tsx"
Cohesion: 0.10
Nodes (28): CircularText(), CircularTextProps, clamp(), HOVER_SPEED, HoverMode, SpinState, buildRoll(), clamp01() (+20 more)

### Community 46 - "images.py"
Cohesion: 0.23
Nodes (11): _ellipse_points(), JobArrays, _limits(), render(), render_luminance(), render_noise(), render_overlay(), render_psf() (+3 more)

### Community 47 - "compute_night_score"
Cohesion: 0.16
Nodes (12): moon_alt(), night_bounds(), observer(), radec_to_altaz(), sun_alt(), verify(), sun_info(), SunInfo (+4 more)

### Community 48 - "test_alerts.py"
Cohesion: 0.15
Nodes (6): deliver_due(), run_forever(), test_cancel_prevents_delivery(), test_gone_subscription_is_removed(), test_schedule_event_uses_the_event_alert_text(), test_schedule_then_deliver_when_due()

### Community 49 - "events"
Cohesion: 0.17
Nodes (7): angular_separation(), _compass(), Event, events(), PlanetInfo, planets(), test_planets_have_sane_magnitudes()

### Community 50 - "docs/API.md"
Cohesion: 0.16
Nodes (17): Traditional lunar calendar and seasons, SIMBAD brightest-source catalogue lookup, API data provenance computed_at envelope, Computed score trace and contribution fields, Local eclipse circumstances, Unified locally timed events feed, Launch timing and visibility hints, Lens job status stages and image endpoints (+9 more)

### Community 51 - "backend/requirements.txt"
Cohesion: 0.10
Nodes (19): Richardson-Lucy iterative deconvolution, astronomy-engine backend dependency, astroquery backend dependency, httpx backend dependency, numpy backend dependency, photutils backend dependency, pillow backend dependency, pydantic backend dependency (+11 more)

### Community 52 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 53 - "wcs.py"
Cohesion: 0.06
Nodes (17): client(), _downscale(), _first_2d_hdu(), _is_fits(), _load_fits(), load_image(), _load_pillow(), LoadedImage (+9 more)

### Community 54 - "passes"
Cohesion: 0.23
Nodes (10): _altaz(), _compass(), _finish(), _gmst_rad(), _observer_ecef(), Pass, passes(), PassPoint (+2 more)

### Community 55 - "psf.py"
Cohesion: 0.22
Nodes (8): RawDetection, _build_epsf(), _cutouts(), _fit_gaussian(), _gaussian_kernel(), measure_psf(), PSFResult, _select_stars()

### Community 56 - "alerts/store.py"
Cohesion: 0.26
Nodes (11): cancel(), _db(), due(), get_alert(), get_subscription(), list_alerts(), mark(), _now() (+3 more)

### Community 57 - "Part A — manual test cases (happy path + edge cases)"
Cohesion: 0.10
Nodes (19): A0. Cross-cutting (check on every response), A10. Aurora, A11. Replay and deploy, A1. Watchtower, A2. Celestial Scroll, A3. Alerts (Web Push), A4. Spirit Lens, A5. Honor Points (+11 more)

### Community 58 - "frontend-main/NOTES.md"
Cohesion: 0.19
Nodes (11): Horizontal coordinates east/up/north convention, Single camera Director and dive navigation, Product-owner decision: no dome exterior, Status report: real Lens and Dojo backend integration, Historical brief: Lens described as mock-only, Design intent: one persistent R3F canvas, Design rationale: avoid React rerenders per frame, Sky selection to Director dive and route contract (+3 more)

### Community 59 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 60 - "make_plan"
Cohesion: 0.19
Nodes (11): Candidate, Counterfactual, _evaluate(), make_plan(), evaluate_all(), _moon_blocks(), _moon_quality(), Step (+3 more)

### Community 62 - "detect.py"
Cohesion: 0.14
Nodes (6): BackgroundResult, classify(), detect_sources_catalog(), estimate_background(), instrumental_mag(), _val()

### Community 63 - "build-sky.mjs"
Cohesion: 0.17
Nodes (11): constellations, dir, dsoList, flat, lineById, names, out, r4() (+3 more)

### Community 64 - "envelope.py"
Cohesion: 0.09
Nodes (12): Contribution, now_utc(), Plan, _dt(), _f(), haversine_km(), Launch, upcoming() (+4 more)

### Community 65 - "Watchtower.tsx"
Cohesion: 0.26
Nodes (12): Contribution, HourScore, NightScore, Spot, fmtNum(), Contributions(), glyphIcon(), Recenter() (+4 more)

### Community 66 - "Moon.tsx"
Cohesion: 0.13
Nodes (14): back, basis, f, haloTexture(), MOON_DIST, MOON_SCALE, moonDraw, ncp (+6 more)

### Community 67 - "index.ts"
Cohesion: 0.20
Nodes (14): eqToHorizontal(), Trace, InfoCard(), KIND, num(), InfoPopoverProps, BrushLine(), Button (+6 more)

### Community 68 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, r3f-perf, tailwindcss, @tailwindcss/vite, @types/leaflet, @types/node, @types/react, @types/react-dom (+5 more)

### Community 69 - "targets.py"
Cohesion: 0.10
Nodes (15): _angular_sep_arcsec(), _cone(), _find_mirror(), _params(), _radius_deg(), simbad_matches(), CatalogMatch, Detection (+7 more)

### Community 70 - "docs/tsukuyomi-final-guideline.md"
Cohesion: 0.24
Nodes (9): Three-concept visual reference demo, Concept demo: Ink and Paper, Concept demo: Living Sky, Concept demo: Sumi-e Dusk, Planned terrain-aware observing horizon, Design intent: one continuous observing night, Planned counterfactual observing planner, Planned quests streaks and shareable scroll (+1 more)

### Community 71 - "pages/Transients.tsx"
Cohesion: 0.27
Nodes (14): TransientDetail, TransientObject, Chip(), Label(), Section(), ProvenanceFooter(), Chart(), PICKS (+6 more)

### Community 72 - "skyClock.ts"
Cohesion: 0.14
Nodes (20): eqToHorizontalMatrix(), lstDeg(), skyPalette, smoothstep(), STOPS, toHex(), sunMoonPlanets, DEFAULT_PLACE (+12 more)

### Community 73 - "reset_for_tests"
Cohesion: 0.29
Nodes (4): reset_for_tests(), client(), isolated_store(), sent()

### Community 74 - "engine.ts"
Cohesion: 0.21
Nodes (14): apply(), build(), cue, duck(), env(), INSEN, noise(), ramp() (+6 more)

### Community 75 - "calendar_lunar.py"
Cohesion: 0.30
Nodes (7): CalendarDay, lunar_month_number(), LunarCalendar, month_calendar(), sekki_for(), sun_longitude(), test_lunar_month_numbers_2026()

### Community 76 - "LiquidEther.tsx"
Cohesion: 0.19
Nodes (16): buildPalette(), clamp(), compile(), keepFor(), link(), LiquidEther(), LiquidEtherProps, parseColor() (+8 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 78 - "vapid.py"
Cohesion: 0.25
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
Cohesion: 0.33
Nodes (7): API_BASE, NotifyButton(), State, ensureSubscribed(), pushSupported(), unsubscribe(), urlBase64ToUint8Array()

### Community 87 - "app/main.tsx"
Cohesion: 0.15
Nodes (9): initLenis(), lenis(), initialQuality(), AnimatedContentProps, AnimatedContentStaggerFrom, AnimatedContentWipe, WIPES, gsap (+1 more)

### Community 89 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, rb, typecheck

### Community 90 - "IntroFrame.tsx"
Cohesion: 0.26
Nodes (8): FrameHandle, IntroFrame, clamp(), ConfigKey, ScrollExpand, ScrollExpandHandle, ScrollExpandProps, smoothstep()

### Community 94 - "honor/index.tsx"
Cohesion: 0.18
Nodes (12): HonorRank, Ledger, Observation, ObserveResult, Claim, Hanko(), Honor(), KIND_EN (+4 more)

### Community 98 - "vapid_public_key"
Cohesion: 0.40
Nodes (3): scheduled(), stats(), vapid_public_key()

### Community 99 - "ScrollReveal.tsx"
Cohesion: 0.23
Nodes (13): clamp01(), clampToScroll(), easeBack(), easeOut(), glowAt(), paintPiece(), RevealEffect, RevealLook (+5 more)

### Community 100 - "SpotsMap.tsx"
Cohesion: 0.29
Nodes (8): Spot, glyphOf(), KIND_GLYPH, Fit(), FlyTo(), icon(), originIcon, SpotsMap()

### Community 101 - "Deploying Tsukuyomi Watch"
Cohesion: 0.20
Nodes (9): A. Laptop on the venue Wi-Fi (safest for a hackathon), B. Docker (Render, Fly.io, Railway, any VPS), Backend options, Demo-day checklist, Deploying Tsukuyomi Watch, Environment variables, Frontend, Known limits in production (+1 more)

### Community 102 - "moon.py"
Cohesion: 0.39
Nodes (5): moon_info(), moon_name(), MoonInfo, phase_name(), Quarter

### Community 103 - "Design intent: ink paper gold crimson visual vocabulary"
Cohesion: 0.50
Nodes (3): Design rationale: spectacle needs escape hatches, Design intent: ink paper gold crimson visual vocabulary, Crimson Sakura Night product-owner palette override

### Community 104 - "delete_subscription"
Cohesion: 0.50
Nodes (3): cancel(), unsubscribe(), delete_subscription()

## Knowledge Gaps
- **466 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+461 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 831 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Basic API test frontend` connect `Lens.tsx` to `ref_react`, `docs/JUDGES_PREP.md`, `src/api.ts`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `FastAPI service and routers` connect `docs/JUDGES_PREP.md` to `ProviderError`, `http.py`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `Shared place, timezone and time offset` connect `frontend-main/NOTES.md` to `store.ts`, `docs/JUDGES_PREP.md`, `app/App.tsx`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Are the 32 inferred relationships involving `Provenance` (e.g. with `current_kp()` and `g_scale_now()`) actually correct?**
  _`Provenance` has 32 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `fetch()` (e.g. with `Operational gotchas (Windows + OneDrive)` and `Repo map`) actually correct?**
  _`fetch()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _466 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `data/api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._