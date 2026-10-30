# Graph Report - Pecathon  (2026-10-30)

## Corpus Check
- 259 files · ~255,435 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: .css 14, (none) 7, .example 2)

## Summary
- 3021 nodes · 8142 edges · 132 communities (119 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 216 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f4c8269e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- data/api.ts
- subtract.py
- check_frontend_contract.py
- Envelope
- jobs.py
- src/api.ts
- Tsukuyomi Watch — backend test results (2026-10-30)
- GlowCursor.tsx
- preload.ts
- ref_react
- HudRoot.tsx
- OverlayPainter.tsx
- Gate.tsx
- DuskLandscape.tsx
- main.py
- Provenance
- frontend-basic/package.json
- Scroll.tsx
- fetch
- scroll/index.tsx
- docs/JUDGES_PREP.md
- dependencies
- skyData.ts
- Director.ts
- Stars.tsx
- meteors.py
- score.py
- http.py
- astro.py
- Lens.tsx
- tonight.ts
- samples.py
- alerts/router.py
- frontend-main/package.json
- CanvasRoot.tsx
- watchtower/index.tsx
- StarBorder.tsx
- useApp
- benchmark.py
- forecast
- Planner.tsx
- Landmarks.tsx
- ProviderError
- honesty.py
- app/App.tsx
- CountUp.tsx
- images.py
- observer
- test_alerts.py
- AlertsMachine
- docs/API.md
- backend/requirements.txt
- compilerOptions
- io.py
- satellites.py
- detect.py
- alerts/store.py
- Part A — manual test cases (happy path + edge cases)
- frontend-main/NOTES.md
- compilerOptions
- soak.py
- AppState
- test_lens_redteam.py
- build-sky.mjs
- test_state_machines.py
- Watchtower.tsx
- test_contract.py
- hit
- devDependencies
- make_plan
- docs/tsukuyomi-final-guideline.md
- pages/Transients.tsx
- skyClock.ts
- deliver_due
- app
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
- AnimatedContent.tsx
- Settings
- scripts
- IntroScroll.tsx
- frontend-main/tsconfig.json
- frontend-basic/src/vite-env.d.ts
- honor/index.tsx
- frontend-main/src/vite-env.d.ts
- vapid_public_key
- ScrollReveal.tsx
- SpotsMap.tsx
- Deploying Tsukuyomi Watch
- test_chaos.py
- Design intent: ink paper gold crimson visual vocabulary
- show
- skytime.ts
- wcs.py
- _check_outcome
- security.py
- truth_runs
- _offline
- Tsukuyomi Watch: product overview (study guide)
- AppContext.tsx
- rank_spots
- test_lens.py
- Job
- _GuardClient
- catalog
- parse_dt
- DecryptedText.tsx
- Env
- lifespan
- TTLMemo
- pathlib
- Tsukuyomi Watch — project state (backend owner's log)
- Num
- CircularText.tsx
- Route
- assert_stale
- test_null_island_spots
- test_meteors_need_no_upstream

## God Nodes (most connected - your core abstractions)
1. `useApp` - 90 edges
2. `Provenance` - 72 edges
3. `fetch()` - 52 edges
4. `ProviderError` - 51 edges
5. `app()` - 45 edges
6. `Envelope` - 40 edges
7. `Card()` - 35 edges
8. `fmtNum()` - 33 edges
9. `Kanji()` - 31 edges
10. `Scroll()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `Operational gotchas (Windows + OneDrive)` --references--> `fetch()`  [INFERRED]
  docs/PROJECT_STATE.md → backend/app/core/http.py
- `B1. Scripts, written in the normal confirm-and-commit cycle (one file per step)` --references--> `fetch()`  [INFERRED]
  docs/TEST_PLAN.md → backend/app/core/http.py
- `4. Spirit Lens red team (`tests/test_lens_redteam.py`)` --references--> `_load_from_disk()`  [INFERRED]
  docs/TEST_RESULTS.md → backend/app/lens/jobs.py
- `5. Honor and Alerts state machines (`tests/test_state_machines.py`)` --references--> `deliver_due()`  [INFERRED]
  docs/TEST_RESULTS.md → backend/app/alerts/worker.py
- `3. Contract and validation (`tests/test_contract.py`)` --references--> `night_bounds()`  [INFERRED]
  docs/TEST_RESULTS.md → backend/app/core/astro.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graph-first agent navigation and maintenance** — graph_tooling, graph_queries, graph_updates, graph_trust [EXTRACTED 1.00]
- **Plan observe inspect record journey** — living_sky, watchtower, scroll, lens, dojo, honor [EXTRACTED 1.00]
- **Restoration model and diagnostic loop** — psf, denoise, deblur, honesty, residual, benchmark [EXTRACTED 1.00]

## Communities (132 total, 13 thin omitted)

### Community 0 - "data/api.ts"
Cohesion: 0.04
Nodes (56): ApiError, BestWindow, buildUrl(), CalendarDay, CatalogMatch, Counterfactual, Eclipse, EVENT_KINDS (+48 more)

### Community 1 - "subtract.py"
Cohesion: 0.11
Nodes (13): _stamp_array(), subtract_jobs(), subtract_stamps(), difference(), _fwhm_estimate(), _mad_sigma(), png_b64(), _field() (+5 more)

### Community 2 - "check_frontend_contract.py"
Cohesion: 0.07
Nodes (35): api_member_headers(), build_routes(), Call, Cmp, collect_types(), deref(), extract_ancillary_calls(), extract_api_calls() (+27 more)

### Community 3 - "Envelope"
Cohesion: 0.09
Nodes (19): in_thread(), Envelope, get_terrain(), mask(), MaskBody, path(), PathBody, _terrain() (+11 more)

### Community 4 - "jobs.py"
Cohesion: 0.15
Nodes (23): Trace, apply_wcs(), build_detections(), list_jobs(), run_pipeline(), _units_note(), BenchmarkResult, CatalogResult (+15 more)

### Community 5 - "src/api.ts"
Cohesion: 0.04
Nodes (54): Aurora, BestWindow, buildUrl(), Counterfactual, Eclipse, Forecast, get(), getRaw() (+46 more)

### Community 6 - "Tsukuyomi Watch — backend test results (2026-10-30)"
Cohesion: 0.18
Nodes (9): 1. The one that matters for the demo: the server stalls under concurrency, 2. Chaos: what happens when a provider answers garbage (`tests/test_chaos.py`), 3. Contract and validation (`tests/test_contract.py`), 4. Spirit Lens red team (`tests/test_lens_redteam.py`), 6. Frontend contract (`scripts/check_frontend_contract.py`), 7. Ground truth, Housekeeping left by the run, Summary (+1 more)

### Community 7 - "GlowCursor.tsx"
Cohesion: 0.21
Nodes (12): clamp(), compile(), fromHsv(), GlowCursor(), GlowCursorProps, Pair, Pass, Quality (+4 more)

### Community 8 - "preload.ts"
Cohesion: 0.08
Nodes (45): ConstellationDef, DsoDef, getStarTargets(), loadCatalog(), RawCatalog, STAR_STRIDE, StarName, StarTargets (+37 more)

### Community 9 - "ref_react"
Cohesion: 0.09
Nodes (37): PageCrash(), Props, Benchmark, CatalogResult, Detection, LENS_STAGES, LensJob, LensJobSummary (+29 more)

### Community 10 - "HudRoot.tsx"
Cohesion: 0.17
Nodes (23): CHAPTERS, compass16, eqToHorizontal(), lstDeg(), vecToAltAz(), ChapterRail(), Directory(), GLYPH (+15 more)

### Community 11 - "OverlayPainter.tsx"
Cohesion: 0.05
Nodes (79): Catalog, HIP_POLARIS, ArrivalHints(), Hint(), pickAnchor(), Spot, SPOTS, ConGeom (+71 more)

### Community 12 - "Gate.tsx"
Cohesion: 0.17
Nodes (21): round2(), CityHit, DEFAULT_PLACE, geolocationGranted(), gpsPosition(), ipPlace(), locate(), PRESETS (+13 more)

### Community 13 - "DuskLandscape.tsx"
Cohesion: 0.11
Nodes (48): catalogSync(), backdrop, DuskAtmosphere(), canvasTex(), cedars(), crest(), DuskLandscape(), farRangeTex() (+40 more)

### Community 14 - "main.py"
Cohesion: 0.06
Nodes (26): body_too_large_handler(), health(), provider_error_handler(), at(), near(), spectrum(), fits_url(), nearest() (+18 more)

### Community 15 - "Provenance"
Cohesion: 0.08
Nodes (21): aurora(), Aurora, chance_word(), current_kp(), g_scale_now(), geomagnetic_latitude(), kp_forecast(), KpPoint (+13 more)

### Community 16 - "frontend-basic/package.json"
Cohesion: 0.06
Nodes (31): dependencies, leaflet, react, react-dom, react-leaflet, react-router-dom, devDependencies, @types/leaflet (+23 more)

### Community 17 - "Scroll.tsx"
Cohesion: 0.19
Nodes (25): CalendarDay, EVENT_KINDS, EventKind, Pass, Shower, AuroraCard(), TONE, Card() (+17 more)

### Community 18 - "fetch"
Cohesion: 0.07
Nodes (21): cache(), CacheEntry, replay_get(), replay_record(), TTLCache, client(), _decode(), fetch() (+13 more)

### Community 19 - "scroll/index.tsx"
Cohesion: 0.14
Nodes (25): api, API_BASE, compass(), fmtPct(), fmtTime(), kindGlyph(), ensureSubscribed(), pushSupported() (+17 more)

### Community 20 - "docs/JUDGES_PREP.md"
Cohesion: 0.12
Nodes (29): Typed frontend API client, FastAPI service and routers, Known synthetic-star injection benchmark, Bortle proxy is not a ground measurement, Solar-altitude darkness gate, BayesShrink wavelet denoising, astropy backend dependency, fastapi backend dependency (+21 more)

### Community 21 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, astronomy-engine, @fontsource/cinzel, @fontsource/cormorant-garamond, @fontsource/shippori-mincho, @fontsource-variable/plus-jakarta-sans, gsap, @gsap/react (+13 more)

### Community 22 - "skyData.ts"
Cohesion: 0.29
Nodes (10): altAzToVec(), Pass, Shower, buildPasses(), buildShower(), IssArc, METEOR_SCALE, MeteorShower (+2 more)

### Community 23 - "Director.ts"
Cohesion: 0.11
Nodes (19): dirToYawPitch(), Vec3, closePanels(), openPanels(), reduced(), run(), screen(), CamState (+11 more)

### Community 24 - "Stars.tsx"
Cohesion: 0.17
Nodes (18): bvToRgb(), R, raDecToEquatorial(), INTRO_REVEAL_GLSL, introRevealProgress(), MilkyWay(), MilkyWayInner(), MwJson (+10 more)

### Community 25 - "meteors.py"
Cohesion: 0.14
Nodes (11): active_showers(), _date(), HourRate, limiting_magnitude(), _load(), Shower, test_geminids_peak_night_has_high_rate_at_dark_site(), test_lunar_eclipse_search_returns_sorted_future_events() (+3 more)

### Community 26 - "score.py"
Cohesion: 0.13
Nodes (20): brightness_to_bortle(), BestWindow, clamp(), compute_night_score(), darkness_gate(), factor_qualities(), HourScore, _nearest_index() (+12 more)

### Community 27 - "http.py"
Cohesion: 0.07
Nodes (24): now_utc(), build(), Crossing, destination(), elevation_angle(), Horizon, manual_grid(), mask_at() (+16 more)

### Community 28 - "astro.py"
Cohesion: 0.18
Nodes (12): _culmination(), from_time(), local(), moon_age_days(), moon_illumination(), moon_phase_deg(), night_bounds(), NightBounds (+4 more)

### Community 29 - "Lens.tsx"
Cohesion: 0.12
Nodes (21): Basic API test frontend, Benchmark, CatalogMatch, Detection, Envelope, LENS_STAGES, LensJob, LensResult (+13 more)

### Community 30 - "tonight.ts"
Cohesion: 0.11
Nodes (24): Envelope, Moon, NightScore, PlanetInfo, Provenance, SkyEvent, Sun, Trace (+16 more)

### Community 31 - "samples.py"
Cohesion: 0.11
Nodes (19): active_count(), create_job(), _ensure_samples(), get_sample(), list_samples(), _looks_like_image(), _sample_preview(), status() (+11 more)

### Community 32 - "alerts/router.py"
Cohesion: 0.17
Nodes (10): _is_push_service(), schedule(), schedule_event(), ScheduleBody, ScheduleEventBody, _sub_or_404(), subscribe(), SubscribeBody (+2 more)

### Community 33 - "frontend-main/package.json"
Cohesion: 0.07
Nodes (26): leaflet, react, react-dom, react-leaflet, @types/leaflet, @types/react, @types/react-dom, typescript (+18 more)

### Community 34 - "CanvasRoot.tsx"
Cohesion: 0.15
Nodes (18): damp(), nearestAngle(), CameraRig(), CanvasRoot(), clear, FrameloopSwitch(), SkyInput(), space (+10 more)

### Community 35 - "watchtower/index.tsx"
Cohesion: 0.12
Nodes (51): AuroraReport, HorizonProfile, Plan, PlannerTarget, PlanStep, TransientDetail, TransientObject, fmtDate() (+43 more)

### Community 36 - "StarBorder.tsx"
Cohesion: 0.12
Nodes (25): clamp(), ease(), HOVERS, mix(), Mote, outline(), Palette, Point (+17 more)

### Community 37 - "useApp"
Cohesion: 0.11
Nodes (33): drawMoon(), sourceGlyph(), CitySearch(), fmtLatLon(), LocationChip(), Architecture(), LICENCE, fmtDay() (+25 more)

### Community 38 - "benchmark.py"
Cohesion: 0.12
Nodes (9): _gaussian_kernel(), run_benchmark(), deblur(), chi2_of(), DeblurResult, denoise(), DenoiseResult, reduced_chi2() (+1 more)

### Community 39 - "forecast"
Cohesion: 0.10
Nodes (16): _is_image(), sample(), tile_xy(), air_quality(), elevation(), ensemble_cloud_spread(), _fmt(), forecast() (+8 more)

### Community 40 - "Planner.tsx"
Cohesion: 0.11
Nodes (25): api, Health, Horizon, MaskPoint, PathReport, Plan, PlanCandidate, PlannerTarget (+17 more)

### Community 41 - "Landmarks.tsx"
Cohesion: 0.17
Nodes (18): DEG, fbm2(), n2(), Horizon(), RidgeDef, ridgeGeometry(), ridgeHeight(), RIDGES (+10 more)

### Community 42 - "ProviderError"
Cohesion: 0.05
Nodes (27): ProviderError, ledger(), observe(), ObserveBody, ranks(), rank_for(), add(), _db() (+19 more)

### Community 43 - "honesty.py"
Cohesion: 0.15
Nodes (13): aperture_fluxes(), aperture_radius(), evaluate(), flux_conservation(), forward_model(), HonestyArrays, invented_pixels(), position_shift() (+5 more)

### Community 44 - "app/App.tsx"
Cohesion: 0.13
Nodes (19): App(), PhaseSync(), ErrorBoundary, initLenis(), lenis(), releaseScroll(), Chapter, Dojo (+11 more)

### Community 45 - "CountUp.tsx"
Cohesion: 0.15
Nodes (21): buildRoll(), clamp01(), Column, CountUp(), CountUpProps, Easing, EASINGS, getDecimalPlaces() (+13 more)

### Community 46 - "images.py"
Cohesion: 0.23
Nodes (11): _ellipse_points(), JobArrays, _limits(), render(), render_luminance(), render_noise(), render_overlay(), render_psf() (+3 more)

### Community 47 - "observer"
Cohesion: 0.11
Nodes (16): altaz(), angular_separation(), moon_alt(), observer(), sun_alt(), verify(), _evaluate(), _moon_blocks() (+8 more)

### Community 48 - "test_alerts.py"
Cohesion: 0.18
Nodes (5): client(), isolated_store(), sent(), test_schedule_event_uses_the_event_alert_text(), test_schedule_then_deliver_when_due()

### Community 49 - "AlertsMachine"
Cohesion: 0.06
Nodes (10): AlertsMachine, expected_rank(), _fmt(), HonorMachine, _parse(), ProcessKilled, Recorder, test_ledger_is_newest_first_across_utc_offsets() (+2 more)

### Community 50 - "docs/API.md"
Cohesion: 0.16
Nodes (17): Traditional lunar calendar and seasons, SIMBAD brightest-source catalogue lookup, API data provenance computed_at envelope, Computed score trace and contribution fields, Local eclipse circumstances, Unified locally timed events feed, Launch timing and visibility hints, Lens job status stages and image endpoints (+9 more)

### Community 51 - "backend/requirements.txt"
Cohesion: 0.10
Nodes (19): Richardson-Lucy iterative deconvolution, astronomy-engine backend dependency, astroquery backend dependency, httpx backend dependency, numpy backend dependency, photutils backend dependency, pillow backend dependency, pydantic backend dependency (+11 more)

### Community 52 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 53 - "io.py"
Cohesion: 0.11
Nodes (11): _downscale(), _first_2d_hdu(), _is_fits(), _load_fits(), load_image(), _load_pillow(), LoadedImage, scale_wcs() (+3 more)

### Community 54 - "satellites.py"
Cohesion: 0.17
Nodes (15): floor_time(), _altaz(), _compass(), _finish(), _gmst_rad(), _observer_ecef(), Pass, passes() (+7 more)

### Community 55 - "detect.py"
Cohesion: 0.09
Nodes (14): BackgroundResult, classify(), detect_sources_catalog(), estimate_background(), instrumental_mag(), RawDetection, _val(), _build_epsf() (+6 more)

### Community 56 - "alerts/store.py"
Cohesion: 0.15
Nodes (15): cancel(), scheduled(), unsubscribe(), cancel(), _db(), delete_subscription(), due(), get_alert() (+7 more)

### Community 57 - "Part A — manual test cases (happy path + edge cases)"
Cohesion: 0.11
Nodes (18): A10. Aurora, A11. Replay and deploy, A1. Watchtower, A2. Celestial Scroll, A3. Alerts (Web Push), A4. Spirit Lens, A5. Honor Points, A6. Transients (+10 more)

### Community 58 - "frontend-main/NOTES.md"
Cohesion: 0.19
Nodes (11): Horizontal coordinates east/up/north convention, Single camera Director and dive navigation, Product-owner decision: no dome exterior, Status report: real Lens and Dojo backend integration, Historical brief: Lens described as mock-only, Design intent: one persistent R3F canvas, Design rationale: avoid React rerenders per frame, Sky selection to Director dive and route contract (+3 more)

### Community 59 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 60 - "soak.py"
Cohesion: 0.11
Nodes (20): analyse(), analyse_warm(), build_report(), build_targets(), burst_loop(), find_server_pid(), fmt(), main() (+12 more)

### Community 62 - "test_lens_redteam.py"
Cohesion: 0.13
Nodes (18): _completeness(), _empty_mask(), _flux_limit(), _fp_stats(), _in_galaxy_zone(), Run, _run_benchmark(), test_A1_false_positive_rate_reported_detections() (+10 more)

### Community 63 - "build-sky.mjs"
Cohesion: 0.17
Nodes (11): constellations, dir, dsoList, flat, lineById, names, out, r4() (+3 more)

### Community 64 - "test_state_machines.py"
Cohesion: 0.07
Nodes (11): memoize_async(), _compass(), _computed_events(), Event, events(), _events_key(), _loc(), loc() (+3 more)

### Community 65 - "Watchtower.tsx"
Cohesion: 0.29
Nodes (13): Contribution, HourScore, NightScore, Spot, fmtNum(), verdictClass(), Contributions(), glyphIcon() (+5 more)

### Community 66 - "test_contract.py"
Cohesion: 0.10
Nodes (16): _fill(), inv_planets(), _required_cases(), _routes(), walk(), scan(), test_absurd_query_values_give_422(), test_bad_latlon_gives_422() (+8 more)

### Community 67 - "hit"
Cohesion: 0.15
Nodes (22): check_envelope(), check_json(), check_plain(), check_png(), hit(), inv_horizon(), net_calls_since(), test_alerts_lifecycle() (+14 more)

### Community 68 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, r3f-perf, tailwindcss, @tailwindcss/vite, @types/leaflet, @types/node, @types/react, @types/react-dom (+5 more)

### Community 69 - "make_plan"
Cohesion: 0.08
Nodes (20): _angular_sep_arcsec(), _cone(), _find_mirror(), _params(), _radius_deg(), simbad_matches(), tap_ok(), CatalogMatch (+12 more)

### Community 70 - "docs/tsukuyomi-final-guideline.md"
Cohesion: 0.24
Nodes (9): Three-concept visual reference demo, Concept demo: Ink and Paper, Concept demo: Living Sky, Concept demo: Sumi-e Dusk, Planned terrain-aware observing horizon, Design intent: one continuous observing night, Planned counterfactual observing planner, Planned quests streaks and shareable scroll (+1 more)

### Community 71 - "pages/Transients.tsx"
Cohesion: 0.25
Nodes (12): Spectrum, SubtractionResult, TransientDetail, TransientObject, Label(), Chart(), PICKS, SpectrumView() (+4 more)

### Community 72 - "skyClock.ts"
Cohesion: 0.19
Nodes (13): eqToHorizontalMatrix(), skyPalette, smoothstep(), STOPS, toHex(), sunMoonPlanets, finishIntro(), markSeen() (+5 more)

### Community 73 - "deliver_due"
Cohesion: 0.17
Nodes (10): reset_for_tests(), upsert_subscription(), deliver_due(), test_cancel_prevents_delivery(), _hammer(), sub_json(), test_backlog_beyond_batch_limit_is_delivered_on_the_first_due_tick(), test_concurrent_ticks_never_deliver_an_alert_twice() (+2 more)

### Community 74 - "app"
Cohesion: 0.18
Nodes (20): apply(), build(), cue, duck(), env(), INSEN, noise(), ramp() (+12 more)

### Community 75 - "calendar_lunar.py"
Cohesion: 0.15
Nodes (15): tz(), tz_name(), _calendar_key(), CalendarDay, lunar_month_number(), LunarCalendar, month_calendar(), sekki_for() (+7 more)

### Community 76 - "LiquidEther.tsx"
Cohesion: 0.19
Nodes (16): buildPalette(), clamp(), compile(), keepFor(), link(), LiquidEther(), LiquidEtherProps, parseColor() (+8 more)

### Community 77 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 78 - "vapid.py"
Cohesion: 0.23
Nodes (4): key_dir(), load_or_create(), private_key_path(), public_key_b64url()

### Community 79 - "GradualBlur.tsx"
Cohesion: 0.25
Nodes (10): clamp01(), CURVES, DIRECTIONS, findScroller(), GradualBlur(), GradualBlurCurve, GradualBlurPosition, GradualBlurProps (+2 more)

### Community 80 - "ics.py"
Cohesion: 0.29
Nodes (6): VAPID subscriptions and scheduled alerts, _esc(), _fmt(), make_ics(), pywebpush backend dependency, Calendar export and Web Push reminders

### Community 81 - "eclipses.py"
Cohesion: 0.32
Nodes (7): memoize(), Eclipse, _eclipse_key(), eclipses(), _fmt(), lunar_eclipses(), solar_eclipses()

### Community 82 - "SpotlightCard.tsx"
Cohesion: 0.27
Nodes (9): clamp(), falloff(), Palette, Settings, SHAPES, SpotlightCard(), SpotlightCardProps, SpotlightShape (+1 more)

### Community 84 - "sender.py"
Cohesion: 0.18
Nodes (3): PushGone, send(), send_with_headers()

### Community 85 - "docs/AGENT_GRAPH.md"
Cohesion: 0.43
Nodes (6): graphifyy[mcp] 0.9.97 developer tooling, Optional graph stdio MCP access, Graphify query path explain affected navigation, Graphify developer-only codebase index with persisted corpus exclusions, Source authority; CSS omitted and six AST files without symbols, Structural updates and semantic re-extraction

### Community 86 - "Notify.tsx"
Cohesion: 0.33
Nodes (7): API_BASE, NotifyButton(), State, ensureSubscribed(), pushSupported(), unsubscribe(), urlBase64ToUint8Array()

### Community 87 - "AnimatedContent.tsx"
Cohesion: 0.29
Nodes (5): AnimatedContentProps, AnimatedContentStaggerFrom, AnimatedContentWipe, WIPES, gsap

### Community 89 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, rb, typecheck

### Community 90 - "IntroScroll.tsx"
Cohesion: 0.15
Nodes (13): FrameHandle, IntroFrame, cameraAt(), Cap, keys(), EYE, lerp(), clamp() (+5 more)

### Community 94 - "honor/index.tsx"
Cohesion: 0.18
Nodes (12): HonorRank, Ledger, Observation, ObserveResult, Claim, Hanko(), Honor(), KIND_EN (+4 more)

### Community 98 - "vapid_public_key"
Cohesion: 0.33
Nodes (4): stats(), vapid_public_key(), stats(), test_concurrent_schedule_and_deliver_no_lock_errors_and_totals_consistent()

### Community 99 - "ScrollReveal.tsx"
Cohesion: 0.23
Nodes (13): clamp01(), clampToScroll(), easeBack(), easeOut(), glowAt(), paintPiece(), RevealEffect, RevealLook (+5 more)

### Community 100 - "SpotsMap.tsx"
Cohesion: 0.29
Nodes (8): Spot, glyphOf(), KIND_GLYPH, Fit(), FlyTo(), icon(), originIcon, SpotsMap()

### Community 101 - "Deploying Tsukuyomi Watch"
Cohesion: 0.20
Nodes (9): A. Laptop on the venue Wi-Fi (safest for a hackathon), B. Docker (Render, Fly.io, Railway, any VPS), Backend options, Demo-day checklist, Deploying Tsukuyomi Watch, Environment variables, Frontend, Known limits in production (+1 more)

### Community 102 - "test_chaos.py"
Cohesion: 0.19
Nodes (19): classify(), empty_payload(), fault_response(), healthy_air(), healthy_alerce(), healthy_celestrak(), healthy_elevation(), healthy_ensemble() (+11 more)

### Community 103 - "Design intent: ink paper gold crimson visual vocabulary"
Cohesion: 0.50
Nodes (3): Design rationale: spectacle needs escape hatches, Design intent: ink paper gold crimson visual vocabulary, Crimson Sakura Night product-owner palette override

### Community 104 - "show"
Cohesion: 0.15
Nodes (21): assert_honest_failure(), assert_provider_unavailable(), _poisoned_value(), prov_for(), _record_then_forget_cache(), show(), test_corrupted_files_at_the_exact_key_are_ignored_or_rebuilt(), test_corrupted_replay_in_first_mode_falls_back_to_live() (+13 more)

### Community 106 - "skytime.ts"
Cohesion: 0.20
Nodes (23): BodyPos, fmtClock(), KOKU, kokuAt(), LatLon, localHours(), nextRiseSet(), observer() (+15 more)

### Community 107 - "wcs.py"
Cohesion: 0.12
Nodes (9): _run(), AstrometryError, _avm_values(), extract_xmp(), parse_avm(), pixel_to_sky(), solve_astrometry(), wcs_summary() (+1 more)

### Community 108 - "_check_outcome"
Cohesion: 0.17
Nodes (20): _assert_readable(), _check_outcome(), _fits(), _jpeg(), _png8(), _post_file(), _scan_finite(), test_A4_chi2_reduced_near_one_on_pure_gaussian_noise() (+12 more)

### Community 109 - "security.py"
Cohesion: 0.12
Nodes (9): BodyTooLarge, _Buckets, _capped(), wrapped(), client_ip(), GuardMiddleware, _send_json(), Tier (+1 more)

### Community 110 - "truth_runs"
Cohesion: 0.12
Nodes (15): client(), no_network(), crop(), _generate(), _png16(), png16_crop_job(), _post_sample(), restarted() (+7 more)

### Community 111 - "_offline"
Cohesion: 0.23
Nodes (14): inv_calendar(), _offline(), _q(), test_prop_aurora(), test_prop_calendar(), test_prop_eclipses(), test_prop_events_offline_types(), test_prop_meteors() (+6 more)

### Community 112 - "Tsukuyomi Watch: product overview (study guide)"
Cohesion: 0.10
Nodes (20): 1. The idea in one breath, 2. How the pieces fit, 3.1 Watchtower (見張り): "Should I go out tonight, and where?", 3.2 Celestial Scroll (巻物): "What is happening in the sky?", 3.3 Alerts: "The Moon rises tonight at 8:14 PM", 3.4 Spirit Lens (鏡): "Clean up my space photo, honestly", 3.5 Dojo Dashboard (道場): "Show me what changed", 3.6 Honor (誉): the gamification bonus (+12 more)

### Community 113 - "AppContext.tsx"
Cohesion: 0.16
Nodes (15): ApiError, Controls(), AppProvider(), AppState, Ctx, loadSaved(), localInputToIso(), pad() (+7 more)

### Community 114 - "rank_spots"
Cohesion: 0.13
Nodes (13): _float(), haversine_km(), _kind(), overpass(), _overpass_ok(), _proxy(), _query(), rank_spots() (+5 more)

### Community 115 - "test_lens.py"
Cohesion: 0.17
Nodes (7): client(), test_full_pipeline_on_synthetic_sample(), test_jobs_list_for_the_dojo(), test_press_jpeg_display_keeps_dust_lanes(), test_samples_listed(), test_unknown_job_and_bad_upload(), _wait()

### Community 116 - "Job"
Cohesion: 0.18
Nodes (6): get_job(), Job, _load_from_disk(), now(), _run_safely(), submit()

### Community 117 - "_GuardClient"
Cohesion: 0.14
Nodes (6): client(), _fake_push(), _GuardClient, lens_jobs(), online(), _wait_job()

### Community 118 - "catalog"
Cohesion: 0.16
Nodes (9): catalog(), _get(), _get_done(), get_image(), get_job(), list_jobs(), run_benchmark(), skyview() (+1 more)

### Community 119 - "parse_dt"
Cohesion: 0.26
Nodes (14): assert_monotonic(), inv_aurora(), inv_eclipses(), inv_events(), inv_meteors(), inv_moon(), inv_passes(), inv_score() (+6 more)

### Community 120 - "DecryptedText.tsx"
Cohesion: 0.17
Nodes (15): advance(), DecryptedText(), DecryptedTextProps, Engine, flipFrames(), FontMetrics, Frame, glyphWidths (+7 more)

### Community 122 - "lifespan"
Cohesion: 0.17
Nodes (6): run_forever(), seed_replay_from_repo(), clear_all(), lifespan(), forget_memoised_answers(), 8. Fresh clone (Haiku, following the docs literally)

### Community 123 - "TTLMemo"
Cohesion: 0.24
Nodes (4): deco(), deco(), wrapper(), TTLMemo

### Community 124 - "pathlib"
Cohesion: 0.22
Nodes (3): parse(), test_fits_url_branches(), test_parse_m87_spectrum()

### Community 125 - "Tsukuyomi Watch — project state (backend owner's log)"
Cohesion: 0.25
Nodes (7): Frontend-main review summary (2026-10-30), Operational gotchas (Windows + OneDrive), Our solution in one paragraph, The problem statement (PECathon 2026, PS-002), Tsukuyomi Watch — project state (backend owner's log), What is built (backend) and how it is verified, Working agreements

### Community 126 - "Num"
Cohesion: 0.36
Nodes (7): Contribution, HourScore, LongText(), Num(), useCalm(), Gauge(), Step

### Community 127 - "CircularText.tsx"
Cohesion: 0.29
Nodes (7): CircularText(), CircularTextProps, clamp(), HOVER_SPEED, HoverMode, SpinState, motion

### Community 128 - "Route"
Cohesion: 0.33
Nodes (4): assert_cached(), Route, test_fresh_cache_survives_a_fault_without_calling_out(), A0. Cross-cutting (check on every response)

### Community 129 - "assert_stale"
Cohesion: 0.40
Nodes (4): assert_stale(), test_overpass_remark_with_stale_cache_serves_stale(), test_stale_cache_is_served_and_marked_when_upstream_fails(), test_unusable_200_with_stale_cache_serves_stale()

## Knowledge Gaps
- **492 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+487 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1011 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FastAPI service and routers` connect `docs/JUDGES_PREP.md` to `fetch`, `main.py`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **Why does `Typed frontend API client` connect `docs/JUDGES_PREP.md` to `data/api.ts`, `app/App.tsx`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `Shared place, timezone and time offset` connect `frontend-main/NOTES.md` to `docs/JUDGES_PREP.md`, `useApp`, `app/App.tsx`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `Provenance` (e.g. with `current_kp()` and `g_scale_now()`) actually correct?**
  _`Provenance` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `fetch()` (e.g. with `Operational gotchas (Windows + OneDrive)` and `Repo map`) actually correct?**
  _`fetch()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `ProviderError` (e.g. with `g_scale_now()` and `observe()`) actually correct?**
  _`ProviderError` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _492 weakly-connected nodes found - possible documentation gaps or missing edges._