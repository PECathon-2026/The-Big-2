# Graph Report - Pecathon  (2026-10-30)

## Corpus Check
- 217 files · ~195,325 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: .css 13, (none) 4, .example 2)

## Summary
- 2135 nodes · 5874 edges · 98 communities (89 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 113 edges (avg confidence: 0.92)
- Token cost: unmetered agent extraction; actual input/output totals and monetary cost are unavailable. Stored zero counters mean unmeasured, not zero usage.

## Community Hubs (Navigation)
- Main API Client
- Transient Image Subtraction
- Journal API And Errors
- Event Response Provenance
- Lens Job Pipeline
- Basic API Client
- Provider Cache And Samples
- Ink And Cursor Effects
- Intro Loading Flow
- Lens And Dojo Pages
- Navigation And Audio
- Sky Overlay Painting
- Backend Route Composition
- Petal Star Introduction
- Provider Fetch Adapters
- Astronomy Time Compass
- Basic Frontend Dependencies
- Basic Observing Pages
- Celestial Scroll Page
- Honor Journal Interface
- Product And Pitch Guide
- Main Frontend Dependencies
- Sky Object Placement
- Camera Dive Navigation
- Sky Rendering Layers
- Moon Sun And Timezones
- Observing Score Model
- Sky Picking And Catalogue
- Backend Astronomy Helpers
- Basic Lens Interface
- Shared Tonight Data
- Image Sky Coordinates
- Push Alert API
- Frontend Build Dependencies
- Scene State And Quality
- Watchtower Interface
- Star Border Animation
- Shared Page Components
- Restoration And Benchmark
- Weather Forecast API
- Basic Science And Controls
- Horizon And Landmarks
- Location And Entry Gate
- Restoration Honesty Checks
- App Routes And Phases
- Number Counter Animation
- Image Stage Rendering
- Basic Frontend Shell
- Push Delivery Worker
- Observation Plausibility Rules
- Event Planning Contract
- Scientific Backend Dependencies
- Main TypeScript Configuration
- Image Input Loading
- Satellite Orbit Prediction
- Point Spread Measurement
- Alert Subscription Storage
- Observing Spot Ranking
- Frontend Decisions And History
- Basic TypeScript Configuration
- Astronomical Source Detection
- Application State Actions
- Liquid Ink Simulation
- Sky Catalogue Build
- Text Decryption Animation
- Basic Watchtower Interface
- Moon Rendering Materials
- Object Directory And Coordinates
- Scroll Reveal Animation
- SIMBAD Catalogue Matching
- Visual Concepts And Intent
- Basic Transient Interface
- Sky Clock And Colors
- Push Delivery Tests
- Meteor Rate Estimates
- Traditional Lunar Calendar
- Lens Pipeline Tests
- Tooling TypeScript Configuration
- Push Authentication Keys
- Gradual Blur Effects
- Calendar And Reminder Export
- Local Eclipse Calculations
- Spotlight Card Effects
- Vite And Offline Build
- Circular Text Animation
- Agent Graph Navigation
- Animated Content Effects
- Katana Image Comparison
- Backend Environment Settings
- Frontend Run Commands
- Scroll Expansion Effects
- TypeScript Project References
- Claude Skill Discovery
- Basic Vite Environment
- GSAP React Integration
- Main Vite Environment

## God Nodes (most connected - your core abstractions)
1. `useApp` - 83 edges
2. `Provenance` - 46 edges
3. `app()` - 42 edges
4. `fetch()` - 36 edges
5. `run_pipeline()` - 32 edges
6. `Kanji()` - 29 edges
7. `Envelope` - 28 edges
8. `Scroll()` - 28 edges
9. `compute_night_score()` - 27 edges
10. `ProviderError` - 26 edges

## Surprising Connections (you probably didn't know these)
- `Calendar export and Web Push reminders` --conceptually_related_to--> `pywebpush backend dependency`  [INFERRED]
  docs/JUDGES_PREP.md → backend/requirements.txt
- `FastAPI service and routers` --conceptually_related_to--> `fastapi backend dependency`  [INFERRED]
  docs/JUDGES_PREP.md → backend/requirements.txt
- `Satellite pass tracks and illumination visibility` --conceptually_related_to--> `sgp4 backend dependency`  [INFERRED]
  docs/API.md → backend/requirements.txt
- `Product-owner decision: no dome exterior` --references--> `Design intent: one continuous observing night`  [EXTRACTED]
  frontend-main/NOTES.md → docs/tsukuyomi-final-guideline.md
- `Historical brief: Lens described as mock-only` --conceptually_related_to--> `Spirit Lens asynchronous image pipeline`  [EXTRACTED]
  frontend-main/AGENT_BRIEF.md → docs/JUDGES_PREP.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Plan observe inspect record journey** — living_sky, watchtower, scroll, lens, dojo, honor [EXTRACTED 1.00]
- **Restoration model and diagnostic loop** — psf, denoise, deblur, honesty, residual, benchmark [EXTRACTED 1.00]
- **Graph-first agent navigation and maintenance** — graph_tooling, graph_queries, graph_updates, graph_trust [EXTRACTED 1.00]

## Communities (98 total, 9 thin omitted)

### Community 0 - "Main API Client"
Cohesion: 0.04
Nodes (53): ApiError, Benchmark, BestWindow, buildUrl(), CalendarDay, CatalogMatch, Contribution, Eclipse (+45 more)

### Community 1 - "Transient Image Subtraction"
Cohesion: 0.07
Nodes (20): get_job(), stamp(), classes(), field(), lightcurve(), near(), recent(), _stamp_array() (+12 more)

### Community 2 - "Journal API And Errors"
Cohesion: 0.07
Nodes (19): ProviderError, ledger(), observe(), ObserveBody, ranks(), rank_for(), add(), _db() (+11 more)

### Community 3 - "Event Response Provenance"
Cohesion: 0.09
Nodes (19): Envelope, now_utc(), Provenance, _dt(), _f(), haversine_km(), Launch, upcoming() (+11 more)

### Community 4 - "Lens Job Pipeline"
Cohesion: 0.12
Nodes (28): apply_wcs(), build_detections(), Job, now(), run_pipeline(), _run_safely(), submit(), _units_note() (+20 more)

### Community 5 - "Basic API Client"
Cohesion: 0.05
Nodes (45): BestWindow, buildUrl(), Eclipse, Forecast, get(), getRaw(), HonorRank, isEnvelope() (+37 more)

### Community 6 - "Provider Cache And Samples"
Cohesion: 0.09
Nodes (16): cache(), CacheEntry, replay_get(), replay_record(), TTLCache, _download_real(), ensure_samples(), ensure_synthetic() (+8 more)

### Community 7 - "Ink And Cursor Effects"
Cohesion: 0.07
Nodes (37): registerInk(), useInk, InkFlood(), InkLayers(), makeNoise(), rgba(), token(), buildPalette() (+29 more)

### Community 8 - "Intro Loading Flow"
Cohesion: 0.10
Nodes (30): loadCatalog(), isLit(), afterGate(), finishIntro(), introSeen(), markSeen(), startIntro(), FrameHandle (+22 more)

### Community 9 - "Lens And Dojo Pages"
Cohesion: 0.14
Nodes (34): Detection, LensJob, LensResult, LensSample, fmtDate(), fmtPct(), det(), makeMockLens() (+26 more)

### Community 10 - "Navigation And Audio"
Cohesion: 0.13
Nodes (31): CHAPTERS, isModulePath(), apply(), build(), cue, duck(), env(), INSEN (+23 more)

### Community 11 - "Sky Overlay Painting"
Cohesion: 0.10
Nodes (33): tier(), ArrivalHints(), Hint(), pickAnchor(), Spot, SPOTS, COMPASS, conEnd() (+25 more)

### Community 12 - "Backend Route Composition"
Cohesion: 0.10
Nodes (18): run_forever(), catalog(), create_job(), _ensure_samples(), _get(), _get_done(), get_image(), get_job() (+10 more)

### Community 13 - "Petal Star Introduction"
Cohesion: 0.15
Nodes (29): catalogSync(), StarTargets, canvasTex(), DuskLandscape(), fujiTex(), Layer, pagodaTex(), WHITE (+21 more)

### Community 14 - "Provider Fetch Adapters"
Cohesion: 0.11
Nodes (18): client(), _decode(), fetch(), Fetched, cone(), lightcurve(), mjd_to_dt(), obj() (+10 more)

### Community 15 - "Astronomy Time Compass"
Cohesion: 0.16
Nodes (30): astronomy-engine@2.1.19, SYNODIC, BodyPos, bodyPosition(), fmtClock(), introTimeline(), KOKU, kokuAt() (+22 more)

### Community 16 - "Basic Frontend Dependencies"
Cohesion: 0.08
Nodes (31): dependencies, leaflet@1.9.4, react@18.3.1, react-dom@18.3.1, react-leaflet@4.2.1, react-router-dom@6.28.0, devDependencies, @types/leaflet@1.9.12 (+23 more)

### Community 17 - "Basic Observing Pages"
Cohesion: 0.17
Nodes (24): api, CalendarDay, EVENT_KINDS, EventKind, Ledger, ObserveResult, Pass, Shower (+16 more)

### Community 18 - "Celestial Scroll Page"
Cohesion: 0.13
Nodes (22): api, API_BASE, EVENT_KINDS, EventKind, compass(), fmtTime(), kindGlyph(), ensureSubscribed() (+14 more)

### Community 19 - "Honor Journal Interface"
Cohesion: 0.12
Nodes (24): HonorRank, Ledger, Observation, ObserveResult, Trace, InfoCard(), Claim, Hanko() (+16 more)

### Community 20 - "Product And Pitch Guide"
Cohesion: 0.12
Nodes (29): Typed frontend API client, FastAPI service and routers, Known synthetic-star injection benchmark, Bortle proxy is not a ground measurement, Solar-altitude darkness gate, BayesShrink wavelet denoising, fastapi backend dependency, photutils backend dependency (+21 more)

### Community 21 - "Main Frontend Dependencies"
Cohesion: 0.07
Nodes (30): dependencies, @fontsource/cinzel@5.3.0, @fontsource/cormorant-garamond@5.3.0, @fontsource/shippori-mincho@5.3.0, @fontsource-variable/plus-jakarta-sans@5.3.0, leaflet@1.9.4, lenis@1.3.27, postprocessing@6.39.5 (+22 more)

### Community 22 - "Sky Object Placement"
Cohesion: 0.12
Nodes (26): altAzToVec(), raDecToEquatorial(), MOON_NAMES, moonName(), MoonNameInfo, Pass, Shower, meteorStats (+18 more)

### Community 23 - "Camera Dive Navigation"
Cohesion: 0.09
Nodes (19): dirToYawPitch(), Vec3, inkClose(), inkFade(), InkImpl, inkOpen(), ready(), waiters (+11 more)

### Community 24 - "Sky Rendering Layers"
Cohesion: 0.17
Nodes (24): R, useTier(), Meteors(), MilkyWay(), MilkyWayInner(), MwJson, Raster, rasterise() (+16 more)

### Community 25 - "Moon Sun And Timezones"
Cohesion: 0.11
Nodes (18): tz(), tz_name(), moon_info(), moon_name(), MoonInfo, phase_name(), Quarter, sun_info() (+10 more)

### Community 26 - "Observing Score Model"
Cohesion: 0.15
Nodes (18): Contribution, BestWindow, clamp(), compute_night_score(), darkness_gate(), factor_qualities(), HourScore, _nearest_index() (+10 more)

### Community 27 - "Sky Picking And Catalogue"
Cohesion: 0.12
Nodes (24): bvToRgb(), Catalog, ConstellationDef, DsoDef, getStarTargets(), HIP_POLARIS, RawCatalog, STAR_STRIDE (+16 more)

### Community 28 - "Backend Astronomy Helpers"
Cohesion: 0.21
Nodes (15): altaz(), from_time(), local(), moon_age_days(), moon_alt(), moon_illumination(), moon_phase_deg(), night_bounds() (+7 more)

### Community 29 - "Basic Lens Interface"
Cohesion: 0.15
Nodes (24): Benchmark, CatalogMatch, Detection, Envelope, LENS_STAGES, LensJob, LensResult, LensSample (+16 more)

### Community 30 - "Shared Tonight Data"
Cohesion: 0.12
Nodes (22): Envelope, Moon, NightScore, PlanetInfo, Provenance, SkyEvent, Sun, cached() (+14 more)

### Community 31 - "Image Sky Coordinates"
Cohesion: 0.13
Nodes (9): AstrometryError, _avm_values(), extract_xmp(), parse_avm(), pixel_to_sky(), solve_astrometry(), wcs_from_avm(), wcs_summary() (+1 more)

### Community 32 - "Push Alert API"
Cohesion: 0.13
Nodes (14): cancel(), schedule(), schedule_event(), ScheduleBody, scheduled(), ScheduleEventBody, stats(), _sub_or_404() (+6 more)

### Community 33 - "Frontend Build Dependencies"
Cohesion: 0.11
Nodes (25): devDependencies, r3f-perf@7.2.3, tailwindcss@4.3.3, @types/leaflet@1.9.22, @types/node@26.6.6, @types/react@19.3.0, @types/react-dom@19.3.0, @types/three@0.186.0 (+17 more)

### Community 34 - "Scene State And Quality"
Cohesion: 0.12
Nodes (22): damp(), nearestAngle(), CameraRig(), CanvasRoot(), clear, FrameloopSwitch(), SkyInput(), space (+14 more)

### Community 35 - "Watchtower Interface"
Cohesion: 0.17
Nodes (20): Spot, fmtNum(), Num(), Gauge(), Step, Timeline(), Waterfall(), glyphOf() (+12 more)

### Community 36 - "Star Border Animation"
Cohesion: 0.12
Nodes (25): clamp(), ease(), HOVERS, mix(), Mote, outline(), Palette, Point (+17 more)

### Community 37 - "Shared Page Components"
Cohesion: 0.21
Nodes (20): drawMoon(), fmtRelative(), Architecture(), Credits(), LICENCE, LongText(), Science(), Gloss() (+12 more)

### Community 38 - "Restoration And Benchmark"
Cohesion: 0.13
Nodes (9): _gaussian_kernel(), run_benchmark(), deblur(), chi2_of(), DeblurResult, denoise(), DenoiseResult, reduced_chi2() (+1 more)

### Community 39 - "Weather Forecast API"
Cohesion: 0.16
Nodes (11): air_quality(), elevation(), ensemble_cloud_spread(), _fmt(), forecast(), _parse_times(), _td(), forecast() (+3 more)

### Community 40 - "Basic Science And Controls"
Cohesion: 0.16
Nodes (13): API_BASE, ApiError, Controls(), JsonView(), NotifyButton(), State, useApp(), CallState (+5 more)

### Community 41 - "Horizon And Landmarks"
Cohesion: 0.14
Nodes (21): DEG, fade(), fbm1(), fbm2(), n1(), n2(), perm, Horizon() (+13 more)

### Community 42 - "Location And Entry Gate"
Cohesion: 0.21
Nodes (20): round2(), CityHit, DEFAULT_PLACE, geolocationGranted(), gpsPosition(), ipPlace(), locate(), PRESETS (+12 more)

### Community 43 - "Restoration Honesty Checks"
Cohesion: 0.16
Nodes (9): aperture_fluxes(), aperture_radius(), evaluate(), flux_conservation(), forward_model(), HonestyArrays, invented_pixels(), position_shift() (+1 more)

### Community 44 - "App Routes And Phases"
Cohesion: 0.19
Nodes (15): App(), PhaseSync(), initLenis(), lenis(), releaseScroll(), Chapter, Dojo, Honor (+7 more)

### Community 45 - "Number Counter Animation"
Cohesion: 0.15
Nodes (21): buildRoll(), clamp01(), Column, CountUp(), CountUpProps, Easing, EASINGS, getDecimalPlaces() (+13 more)

### Community 46 - "Image Stage Rendering"
Cohesion: 0.24
Nodes (12): _ellipse_points(), JobArrays, _limits(), render(), render_luminance(), render_noise(), render_overlay(), render_psf() (+4 more)

### Community 47 - "Basic Frontend Shell"
Cohesion: 0.14
Nodes (15): Basic API test frontend, Health, App(), TABS, TopBar(), AppProvider(), AppState, Ctx (+7 more)

### Community 48 - "Push Delivery Worker"
Cohesion: 0.14
Nodes (5): deliver_due(), test_cancel_prevents_delivery(), test_gone_subscription_is_removed(), test_schedule_event_uses_the_event_alert_text(), test_schedule_then_deliver_when_due()

### Community 49 - "Observation Plausibility Rules"
Cohesion: 0.13
Nodes (8): angular_separation(), verify(), _compass(), Event, events(), PlanetInfo, planets(), test_planets_have_sane_magnitudes()

### Community 50 - "Event Planning Contract"
Cohesion: 0.16
Nodes (17): Traditional lunar calendar and seasons, SIMBAD brightest-source catalogue lookup, API data provenance computed_at envelope, Computed score trace and contribution fields, Local eclipse circumstances, Unified locally timed events feed, Launch timing and visibility hints, Lens job status stages and image endpoints (+9 more)

### Community 51 - "Scientific Backend Dependencies"
Cohesion: 0.10
Nodes (19): Richardson-Lucy iterative deconvolution, astronomy-engine backend dependency, astropy backend dependency, astroquery backend dependency, httpx backend dependency, numpy backend dependency, pillow backend dependency, pydantic backend dependency (+11 more)

### Community 52 - "Main TypeScript Configuration"
Cohesion: 0.10
Nodes (19): compilerOptions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 53 - "Image Input Loading"
Cohesion: 0.16
Nodes (8): _downscale(), _first_2d_hdu(), _is_fits(), _load_fits(), load_image(), _load_pillow(), LoadedImage, scale_wcs()

### Community 54 - "Satellite Orbit Prediction"
Cohesion: 0.24
Nodes (11): _altaz(), _compass(), _finish(), _gmst_rad(), _observer_ecef(), Pass, passes(), PassPoint (+3 more)

### Community 55 - "Point Spread Measurement"
Cohesion: 0.22
Nodes (8): RawDetection, _build_epsf(), _cutouts(), _fit_gaussian(), _gaussian_kernel(), measure_psf(), PSFResult, _select_stars()

### Community 56 - "Alert Subscription Storage"
Cohesion: 0.24
Nodes (12): cancel(), _db(), delete_subscription(), due(), get_alert(), get_subscription(), list_alerts(), mark() (+4 more)

### Community 57 - "Observing Spot Ranking"
Cohesion: 0.20
Nodes (11): NightScore, _float(), haversine_km(), _kind(), overpass(), _proxy(), _query(), rank_spots() (+3 more)

### Community 58 - "Frontend Decisions And History"
Cohesion: 0.14
Nodes (14): Horizontal coordinates east/up/north convention, Design rationale: spectacle needs escape hatches, Design intent: ink paper gold crimson visual vocabulary, Single camera Director and dive navigation, Product-owner decision: no dome exterior, Status report: real Lens and Dojo backend integration, Historical brief: Lens described as mock-only, Design intent: one persistent R3F canvas (+6 more)

### Community 59 - "Basic TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 60 - "Astronomical Source Detection"
Cohesion: 0.14
Nodes (6): BackgroundResult, classify(), detect_sources_catalog(), estimate_background(), instrumental_mag(), _val()

### Community 62 - "Liquid Ink Simulation"
Cohesion: 0.19
Nodes (16): buildPalette(), clamp(), compile(), keepFor(), link(), LiquidEther(), LiquidEtherProps, parseColor() (+8 more)

### Community 63 - "Sky Catalogue Build"
Cohesion: 0.17
Nodes (11): constellations, dir, dsoList, flat, lineById, names, out, r4() (+3 more)

### Community 64 - "Text Decryption Animation"
Cohesion: 0.17
Nodes (15): advance(), DecryptedText(), DecryptedTextProps, Engine, flipFrames(), FontMetrics, Frame, glyphWidths (+7 more)

### Community 65 - "Basic Watchtower Interface"
Cohesion: 0.24
Nodes (13): Contribution, HourScore, NightScore, Spot, fmtNum(), Detections(), Contributions(), glyphIcon() (+5 more)

### Community 66 - "Moon Rendering Materials"
Cohesion: 0.13
Nodes (14): back, basis, f, haloTexture(), MOON_DIST, MOON_SCALE, moonDraw, ncp (+6 more)

### Community 67 - "Object Directory And Coordinates"
Cohesion: 0.23
Nodes (10): compass16, eqToHorizontal(), vecToAltAz(), Directory(), GLYPH, ORDER, KIND, num() (+2 more)

### Community 68 - "Scroll Reveal Animation"
Cohesion: 0.23
Nodes (13): clamp01(), clampToScroll(), easeBack(), easeOut(), glowAt(), paintPiece(), RevealEffect, RevealLook (+5 more)

### Community 69 - "SIMBAD Catalogue Matching"
Cohesion: 0.24
Nodes (7): _angular_sep_arcsec(), _cone(), _find_mirror(), _params(), _radius_deg(), simbad_matches(), CatalogMatch

### Community 70 - "Visual Concepts And Intent"
Cohesion: 0.24
Nodes (9): Three-concept visual reference demo, Concept demo: Ink and Paper, Concept demo: Living Sky, Concept demo: Sumi-e Dusk, Planned terrain-aware observing horizon, Design intent: one continuous observing night, Planned counterfactual observing planner, Planned quests streaks and shareable scroll (+1 more)

### Community 71 - "Basic Transient Interface"
Cohesion: 0.31
Nodes (11): SubtractionResult, TransientDetail, TransientObject, Card(), KV(), Label(), Section(), fmtDate() (+3 more)

### Community 72 - "Sky Clock And Colors"
Cohesion: 0.24
Nodes (10): eqToHorizontalMatrix(), lstDeg(), skyPalette, smoothstep(), STOPS, toHex(), sunMoonPlanets, init (+2 more)

### Community 73 - "Push Delivery Tests"
Cohesion: 0.17
Nodes (7): PushGone, send(), reset_for_tests(), client(), isolated_store(), sent(), fake()

### Community 74 - "Meteor Rate Estimates"
Cohesion: 0.32
Nodes (7): Trace, active_showers(), _date(), HourRate, limiting_magnitude(), _load(), Shower

### Community 75 - "Traditional Lunar Calendar"
Cohesion: 0.30
Nodes (7): CalendarDay, lunar_month_number(), LunarCalendar, month_calendar(), sekki_for(), sun_longitude(), test_lunar_month_numbers_2026()

### Community 76 - "Lens Pipeline Tests"
Cohesion: 0.24
Nodes (5): client(), test_full_pipeline_on_synthetic_sample(), test_samples_listed(), test_unknown_job_and_bad_upload(), _wait()

### Community 77 - "Tooling TypeScript Configuration"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 78 - "Push Authentication Keys"
Cohesion: 0.25
Nodes (4): key_dir(), load_or_create(), private_key_path(), public_key_b64url()

### Community 79 - "Gradual Blur Effects"
Cohesion: 0.25
Nodes (10): clamp01(), CURVES, DIRECTIONS, findScroller(), GradualBlur(), GradualBlurCurve, GradualBlurPosition, GradualBlurProps (+2 more)

### Community 80 - "Calendar And Reminder Export"
Cohesion: 0.31
Nodes (6): VAPID subscriptions and scheduled alerts, _esc(), _fmt(), make_ics(), pywebpush backend dependency, Calendar export and Web Push reminders

### Community 81 - "Local Eclipse Calculations"
Cohesion: 0.44
Nodes (5): Eclipse, eclipses(), _fmt(), lunar_eclipses(), solar_eclipses()

### Community 82 - "Spotlight Card Effects"
Cohesion: 0.27
Nodes (9): clamp(), falloff(), Palette, Settings, SHAPES, SpotlightCard(), SpotlightCardProps, SpotlightShape (+1 more)

### Community 83 - "Vite And Offline Build"
Cohesion: 0.25
Nodes (4): @tailwindcss/vite@4.3.3, vite-plugin-pwa@2.0.0, @tailwindcss/vite, vite-plugin-pwa

### Community 84 - "Circular Text Animation"
Cohesion: 0.25
Nodes (8): motion@14.8.0, CircularText(), CircularTextProps, clamp(), HOVER_SPEED, HoverMode, SpinState, motion

### Community 85 - "Agent Graph Navigation"
Cohesion: 0.43
Nodes (6): graphifyy[mcp] 0.9.97 developer tooling, Optional graph stdio MCP access, Graphify query path explain affected navigation, Graphify developer-only codebase index with persisted corpus exclusions, Source authority; CSS omitted and six AST files without symbols, Structural updates and semantic re-extraction

### Community 86 - "Animated Content Effects"
Cohesion: 0.25
Nodes (6): gsap@3.15.0, AnimatedContentProps, AnimatedContentStaggerFrom, AnimatedContentWipe, WIPES, gsap

### Community 87 - "Katana Image Comparison"
Cohesion: 0.43
Nodes (6): capture(), clamp(), clampView(), easeKatana(), KatanaSlider(), KatanaSliderProps

### Community 89 - "Frontend Run Commands"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, rb, typecheck

### Community 90 - "Scroll Expansion Effects"
Cohesion: 0.53
Nodes (5): clamp(), ConfigKey, ScrollExpand(), ScrollExpandProps, smoothstep()

## Knowledge Gaps
- **17 isolated node(s):** `Production PWA cached offline content`, `uvicorn[standard] backend dependency`, `httpx backend dependency`, `pydantic backend dependency`, `pydantic-settings backend dependency` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 665 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FastAPI service and routers` connect `Product And Pitch Guide` to `Backend Route Composition`, `Provider Cache And Samples`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `Provenance` (e.g. with `Fetched` and `catalog()`) actually correct?**
  _`Provenance` has 24 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Production PWA cached offline content`, `uvicorn[standard] backend dependency`, `httpx backend dependency` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main API Client` be split into smaller, more focused modules?**
  _Cohesion score 0.04476709013914096 - nodes in this community are weakly interconnected._
- **Why does `Shared place, timezone and time offset` connect `Frontend Decisions And History` to `Scene State And Quality`, `Product And Pitch Guide`, `App Routes And Phases`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Should `Transient Image Subtraction` be split into smaller, more focused modules?**
  _Cohesion score 0.07180851063829788 - nodes in this community are weakly interconnected._
- **Why does `Basic API test frontend` connect `Basic Frontend Shell` to `Basic Lens Interface`, `Product And Pitch Guide`, `Basic API Client`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
## Extraction Audit

- Scope explicitly approved by the project owner: source/configuration and documentation across both frontends and backend (217 files), despite the default 200-file prompt threshold.
- One sensitive file was skipped. Screenshots, generated presentations, public assets, backend data and copied skill source are excluded via `.graphifyignore`.
- CSS is unclassified in this extractor version; styling is not fully mapped. Public sky catalogues/textures and sample data are intentionally outside the corpus.
- Six code files yielded no symbols: frontend-basic/src/main.tsx, frontend-basic/vite.config.ts, frontend-main/scripts/rb.mjs, frontend-main/src/app/main.tsx, frontend-main/src/ui/index.ts, and frontend-main/vite.config.ts. This is incomplete structural coverage, not a claim those files are empty.
- Semantic extraction: 18 documentation inputs processed by one agent. Combined raw records are retained in `extraction.json`; the built graph can normalize/deduplicate nodes and collapse multiple relations between a pair of nodes.
- Explicit documentation references to code files are joined to matching AST file nodes. Inferred relationships retain their confidence tags; this index is a navigation aid, not a runtime execution trace.
- Historical plans are labelled as design intent or superseded decisions. Current source remains the authority.
- Automatic “surprising connections” and suggested refactoring questions are graph heuristics, not verified discoveries or recommendations.
- Token benchmark reports context-size estimates for graph retrieval versus reading the whole corpus; it does not measure answer accuracy, latency or billing savings.
