# Tsukuyomi Watch — The Samurai's Celestial Guide

PECathon 2026 · Team **The Big 2** · Problem statement PS-002

A web platform that finds the best stargazing spots, tracks cosmic events, restores astronomical images honestly with AI, and presents everything inside a samurai-and-moon-themed, Japanese ink-wash interface.

**Rule of the codebase: nothing on screen is faked.** Every number comes from a real computation or a real data source, and every API response carries where it came from and when it was fetched.

---

## Repository layout

| Folder | Owner | What it is |
|---|---|---|
| `frontend-main/` | Frontend teammate | The real product UI: Living Sky dome, sumi-e dusk, ink-and-paper interactions. |
| `frontend-basic/` | Backend owner | A small themed test UI that calls every backend endpoint so the backend can be verified end to end. Also the reference API client for `frontend-main`. |
| `backend/` | Backend owner | FastAPI service: weather and Night Honor Score, spots, events, satellite passes, launches, lunar calendar, image restoration, detection, honesty proof, plate-solving, SkyView. |
| `docs/` | Everyone | `tsukuyomi-final-guideline.md` (the full feature and design guideline, also reproduced below) and `living-sky-demo.html` (the approved visual concept demo). |

## Quick start

### Backend (Python 3.12+)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   ·   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env      # cp on macOS/Linux; fill in optional keys
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive OpenAPI docs.

### Basic test frontend (Node 20+)

```bash
cd frontend-basic
npm install
npm run dev
```

Open `http://localhost:5173`. It expects the backend at `http://localhost:8000` (change `VITE_API_BASE` in `.env` if needed).

### Main frontend

See `frontend-main/README.md`. It talks to the same backend; copy `frontend-basic/src/api.ts` as the starting client.

## What the backend does today

| Endpoint group | Status | Highlights |
|---|---|---|
| `/api/watchtower/*` | working | Open-Meteo forecast, **Night Honor Score** with hourly trace and best window, VIIRS light-pollution sampling, OpenStreetMap spot discovery and ranking |
| `/api/scroll/*` | working | Moon (phase, Japanese name, libration, rise/set), Sun, eclipses with local circumstances, meteor showers with expected rate from here, ISS passes (SGP4 + shadow test), launches, planets, 旧暦 calendar with 24 sekki / 72 kō, unified events feed, .ics export |
| `/api/alerts/*` | working | Web Push: VAPID keys, subscriptions, scheduled alerts ("The Moon rises tonight at 20:14") delivered by a background worker, test alerts, .ics export lives under `/api/scroll/ics` |
| `/api/lens/*` | working | Upload or sample → background → detection → measured PSF → wavelet denoise → Richardson-Lucy deblur → **Proof of Honesty** (forward-model χ², SSIM/PSNR, flux conservation, position shift, invented pixels) → star/galaxy classification → WCS (FITS header or AVM) → SkyView cutout, SIMBAD matches, synthetic-star benchmark |

Full contract: [`docs/API.md`](docs/API.md). Tests: `cd backend && python -m pytest -q`.

### Verifying it yourself (5 minutes)

1. Start the backend and the basic frontend (above).
2. **Tonight**: the Moon card must show today's real phase and the moonrise alert; compare with any almanac.
3. **Watchtower**: hover an hour in the chart to see the score breakdown; the spots list should name real hills near the chosen city (Bengaluru: Savanadurga, Nandi Hill).
4. **Scroll**: the lunar calendar's new-moon days must match a published 旧暦 calendar; ISS passes marked *visible* are only those where you are dark and the station is sunlit.
5. **Lens**: restore the synthetic sample. Expect a `noise-like` honesty verdict, χ² ≈ 1, SSIM > 0.95, and the benchmark recovering > 85 % of injected stars. Then restore the Andromeda sample: the WCS panel should read the coordinates from the image's AVM metadata and show the SkyView cutout of the same field.
6. **Science**: call any endpoint and read the raw JSON, including `provenance` and `trace`. Press **Send test alert now**, allow notifications, and a push notification arrives from the backend; **Notify me** on any Scroll event schedules its alert 15 minutes before it starts.

## Environment variables (backend/.env)

| Variable | Needed for | Default |
|---|---|---|
| `TSUKUYOMI_ASTROMETRY_API_KEY` | Plate-solving uploads via nova.astrometry.net | empty (plate-solve disabled, AVM metadata still read) |
| `TSUKUYOMI_LAUNCH_LIBRARY_KEY` | Higher Launch Library 2 rate limit | empty (15 calls/hour, cached 60 min) |
| `TSUKUYOMI_DEMO_REPLAY` | Serve recorded responses when upstream APIs are down | `0` |
| `TSUKUYOMI_CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173,http://localhost:3000` |

No keys are needed for Open-Meteo, CelesTrak, Overpass, NASA SkyView or ALeRCE.

## Conventions

- **Trace everything.** Any computed score returns a `trace` with each factor's value, weight and contribution. The frontend's ⓘ popovers are driven by it; never hard-code an explanation.
- **Stamp everything.** Responses are wrapped as `{ data, provenance: [{ source, url, fetched_at, stale, cached, note }], computed_at }` (see `docs/API.md`).
- **Cache everything.** Each provider adapter has its own TTL. Launch Library 2 is limited to 15 calls/hour unauthenticated, so it is cached server-side and never called from the browser.
- **Honest units.** For plain JPEG/PNG uploads, report relative brightness and pixel sizes. Magnitudes and arcseconds appear only after a plate-solve.
- **No invented detail.** Image restoration uses a measured PSF and deterministic deconvolution plus a denoiser that cannot hallucinate. Every restoration ships with its honesty metrics.
- Branches: work on feature branches, open PRs into `main`, keep `main` runnable.

## Team split

- **Frontend teammate:** `frontend-main/` (guideline sections 7–8, the demo in `docs/`).
- **Backend owner:** `backend/` and `frontend-basic/` (guideline sections 1–6 and 9).

---

# The guideline

The full feature, design and architecture guideline follows. The canonical copy is `docs/tsukuyomi-final-guideline.md`.


> The single reference for building the project. It merges three independent plans: **Fable** (this session, including the Living Sky visual demo in `design-ref/living-sky-demo.html`), **Codex** (the "continuous journey" plan) and **Opus** (`research/tsukuyomi-watch-research.md`, the 80-feature bank). Duplicates are merged into one feature each; every distinct input from the three plans is kept inside that feature.
>
> Use this file as the brief for build sessions. Each feature has two parts: **In plain words** (what the user gets) and **How we build it** (the technical reference for the implementing chat).

**Tags**
- `[R]` required by the problem statement · `[B]` bonus named in the problem statement · `[+]` our innovation
- `[3/3]` proposed by all three plans · `[2/3]` by two · `[F]` `[C]` `[O]` = Fable / Codex / Opus origin of a specific detail
- `★` signature feature: the ones that win the "technical depth" and "innovation" criteria

---

## 0. The product in one paragraph

Tsukuyomi Watch is one continuous night, not four pages. The app opens on the user's **real sky for tonight, here**, and everything else is a camera move on that sky: tilt down to find a spot (Watchtower), pan along the ecliptic to see what is coming (Scroll), zoom into a patch to restore and identify an image (Lens and Dojo), stamp the night into a journal (Honor). The journey loop is: **choose something worth seeing → find the right window → observe → recover the image → understand what you captured → plan the next observation** `[C]`. The north star: **every pixel on screen is backed by a real computation we can open and show** `[O]`, and every recommendation and every restored detail is **explainable** `[C]`.

Anti-goals (failure even if it "works") `[O]`: any restored image with structure not supported by the data; any number on screen we cannot explain; a theme that slows the app or hides information; a demo that dies because a free API rate-limited us.

---

## 1. Shared foundation (cross-cutting)

### A1 · One shared "now, here": location + the Kage time dial `[3/3] [+]`
**In plain words.** The whole app runs off one clock and one location. Drag the time dial and the Moon, the stars, the ISS arc, the cloud forecast, the Honor Score and the spot rankings all change together. Pick a different city or let the app use your location and everything re-computes instantly.

**How we build it.**
- A global store (Zustand or a React context) holds `{ lat, lon, elevation, time }`. Every module subscribes; nothing keeps its own clock `[O]`.
- Time dial UI: a horizontal "Kage dial" spanning tonight (astronomical dusk → dawn) with a drag handle; keyboard arrows step 15 minutes. Default: now, or the next dark hour if the sun is up `[F]` (search in 15-minute steps until sun altitude < −12°).
- All astronomy that can run in the browser does, so scrubbing is instant: `astronomy-engine` for Sun, Moon, planets, rise/set, phases, eclipses; `satellite.js` for satellites; sidereal time from Julian date `[F][O]`. The Python service is only for image science (Approach B in Opus) `[O]`.
- Weather and events are fetched once per location and cached client-side with timestamps; the dial only indexes into hourly arrays.
- Location: browser geolocation with manual search fallback (Nominatim/Photon geocoder, cached). Coordinates rounded to 2 decimals before leaving the device `[O]`.
- Codex's "shared time dial" and Opus's X3 are the same feature; the Living Sky demo already implements the dial as a slider driving sidereal rotation and moon position.

### A2 · "The Science" panel: every number is explainable `[3/3] [+] ★`
**In plain words.** Every score, time, and detection has a small ⓘ. Tap it and the app shows the formula, the inputs, the data source and when it was fetched. There is also a `/science` page with the whole architecture. This is the answer to the skeptical judge asking "is this real?".

**How we build it.**
- A `<Science id="honor-score">` popover component fed by a `science.json` registry: `{ id, title, formula (KaTeX), inputs[], sources[], lastUpdated, deepLink }` `[O]`.
- Each computation returns a **trace object** alongside its result (e.g. the Honor Score returns `{ score, contributions: [{factor, value, weight, contribution}] }`) so the popover and the breakdown chart are driven by the same data, never hard-coded `[F][O]`.
- The planner (W7) and the restoration (L3) extend this with "what would change this result" explanations `[C]`.
- `/science` page: architecture diagram, every formula, every API with rate limits and cache TTL, honesty methodology, known limitations `[O]`.

### A3 · Resilient data layer and demo replay `[3/3]`
**In plain words.** Free APIs fail and rate-limit. The app caches everything, shows "last updated" stamps, and has a recorded demo mode that replays real data through the same code, so the pitch survives bad Wi-Fi.

**How we build it.**
- Provider adapters in the API layer, one per source, each with its own cache TTL (weather 15 min, launches 60 min, TLEs 6 h, catalog lookups 7 days) `[C][O]`.
- Launch Library 2 is 15 unauthenticated calls per hour: cache centrally, never call from the browser `[3/3]`.
- Every response carries `{ data, fetchedAt, source, stale: boolean }`; UI shows a stamp and a "stale" chip `[C][O]`.
- `demo/` folder with seeded JSON for every provider and a bundled sample image set; `?demo=1` switches adapters to the replay source with a fixed timestamp `[3/3]`.
- Provider-failure tests: each adapter has a test where the upstream returns 429/500 and the UI still renders from cache `[C]`.

### A4 · PWA, offline field mode and red night vision `[3/3] [R]`
**In plain words.** Install it on a phone. One tap switches to a dim red interface that protects night vision, with big directional guidance and tonight's plan downloaded so it works without signal on a hilltop.

**How we build it.**
- Vite PWA plugin, service worker caching the shell plus tonight's forecast, events and plan `[C][O]`.
- "Field mode" toggle: a CSS token remap of the whole palette to `#3A0000`–`#FF3B30`, larger type, compass arrows for the chosen target, animations off `[O][C]`.
- Night mode is already the default theme; field mode is the stricter red variant required for real observing.

### A5 · Alerts: Web Push and calendar export `[3/3] [R]`
**In plain words.** "The Moon rises tonight at 8:14 PM." Subscribe on your phone during the demo and the notification arrives. Every event can also be added to your calendar.

**How we build it.**
- Service worker + Push API; VAPID keys on the FastAPI service; a small scheduler table `{ subscription, eventId, fireAt }` polled every minute `[F][O]`.
- Events are computed locally (moonrise, ISS pass start, shower peak) and registered with the service as absolute UTC times.
- `.ics` generation per event (`ics` npm package or a template) `[O]`; Notification API fallback when push is unavailable.
- Demo: schedule a Moon-rise alert two minutes ahead so a judge receives it live `[F]`.

---

## 2. Module 1 · The Watchtower (where and whether)

### W1 · Night Honor Score `[3/3] [R]`
**In plain words.** One number from 0 to 100 that says how good tonight is for stargazing at a place, and a one-line reason. It is a physics model, not a vibe.

**How we build it.**
- Inputs per hour from **Open-Meteo** forecast: `cloud_cover_low / mid / high`, `relative_humidity_2m`, `visibility`, `wind_speed_10m`, `temperature_2m`, `dew_point_2m`; from the **Open-Meteo Air Quality** endpoint: `aerosol_optical_depth` (transparency) `[F]`.
- Astronomical inputs computed locally: Sun altitude (astronomical darkness when < −18°), Moon illumination × Moon altitude (moonlight term), darkness duration tonight `[3/3]`.
- Light pollution term from W4 (Bortle estimate at the point) `[3/3]`.
- Weighted model (starting weights, to be tuned): low cloud 0.30, mid cloud 0.15, high cloud 0.08 (high cloud hurts less `[O]`), humidity/dew risk 0.12, visibility + AOD 0.10, moonlight 0.15, light pollution 0.10. Output 0–100 plus a trace object (A2) `[F][O]`.
- Seeing and transparency for astrophotographers: **7Timer! ASTRO** product (seeing, transparency, lifted index) and jet-stream wind at 250 hPa from Open-Meteo pressure levels; shown as a secondary "Seeing" badge `[O]`.
- Forecast confidence: Open-Meteo multi-model/ensemble (ECMWF, GFS, ICON) spread for cloud cover → a confidence band around the hourly score; label it "model agreement", not a calibrated probability `[O][C]`.
- Formula and weights are exposed through A2.

### W2 · Score breakdown and "best window tonight" `[3/3] [+] ★`
**In plain words.** Why 82? A waterfall shows how much each factor added or removed. The score is computed hour by hour and the app highlights the best two-hour window, e.g. "23:40 → 01:40, after moonset".

**How we build it.**
- Run W1 for every hour between dusk and dawn; find the maximum-sum window of configurable length (default 2 h) `[F][O]`.
- Waterfall chart (SVG, brush-textured bars in the ink style) from the trace object `[O]`.
- Confidence band drawn as a translucent range around the hourly line `[C]`.
- Timeline reshapes live when the dial or a constraint changes (feeds W7) `[C]`.

### W3 · Go / No-go verdict, dew and cold warnings `[O] [+]`
**In plain words.** A card that answers in one sentence: "Go. Clear after 23:00, lens will fog after 1 AM, bring a dew heater."

**How we build it.**
- Rule engine over W1 and W2 outputs: verdict thresholds (Go ≥ 70, Maybe 45–70, Stay in < 45), reason = the single largest contribution in the trace `[O]`.
- Dew warning: dew-point spread (`temperature − dew_point`) < 2 °C → "optics will fog at HH:MM" `[O]`.
- Cold warning from temperature and wind chill.

### W4 · Light-pollution layer and Bortle estimate `[3/3] [R-optional, we include it]`
**In plain words.** A toggle paints how bright the night sky is everywhere on the map, and each spot gets a Bortle class (1 = pristine, 9 = city centre).

**How we build it.**
- Raster source: NASA Black Marble VIIRS nighttime-lights tiles via GIBS WMTS (no key) `[F]`, or World Atlas 2015 tiles (lightpollutionmap.info, key) `[O]`. Prefer GIBS for the demo.
- Sample the raster value at each candidate spot (fetch the tile, read the pixel in a canvas) and map radiance to an approximate Bortle class with a published lookup `[F][O]`.
- Overlay rendered as a MapLibre raster layer with a `multiply` blend so it reads as ink wash on paper.
- Also overlay International Dark Sky Places and show "nearest certified dark site" `[O]`.

### W5 · Scroll map with real landmarks `[3/3] [R]`
**In plain words.** The map looks like an old hand-painted scroll on washi paper. Shrines, temples, mountains and viewpoints are the markers, and they are real places pulled from OpenStreetMap, sized by their score. Clouds drift over the map as ink mist.

**How we build it.**
- **MapLibre GL** with a custom vector style: paper background, ink contour lines, muted roads, labels in Shippori Mincho; loaded only when the Watchtower opens `[3/3]`.
- **Overpass API** query within the search radius for `natural=peak`, `tourism=viewpoint`, `amenity=place_of_worship` (shrine/temple), `leisure=park`, `natural=water` lakeshores; cached per rounded location `[F][O]`.
- Marker glyphs: 山 mountain, ⛩ shrine, 寺 temple, drawn as small ink SVGs; size and ink darkness follow the Honor Score `[O]`.
- Hourly cloud-cover grid (Open-Meteo at a few grid points) animated as translucent mist blobs moving over the scroll `[O]`.
- Map and the ranked list are hover-linked; selecting a spot opens its hourly chart `[O]`.

### W6 · Spot discovery and ranking `[3/3] [R]`
**In plain words.** Top spots near you, discovered from real geography, ranked by tonight's conditions, darkness, elevation and how far you have to travel.

**How we build it.**
- Candidates from W5's Overpass results plus the user's saved spots `[F]`.
- Score = Honor Score (W1 at the spot) × darkness factor (W4) × elevation bonus (open horizon) − travel penalty (haversine distance or OpenRouteService drive time) `[F][O]`.
- Codex upgrade: rank by **expected usable observing minutes** tonight (sum over hours of (score > threshold)) with travel time and forecast uncertainty penalties `[C]`.
- Each spot card: score, best window, Bortle, distance, dew warning, horizon profile (W8).

### W7 · Observing planner that explains what would change its answer `[C] [+] ★`
**In plain words.** Tell it what you want to see, what gear you have, how many hours you have and how far you will drive. It picks the best place and time and can answer "Would leaving later help more than driving farther?" and show exactly which factor flipped the recommendation.

**How we build it.**
- Inputs: target (object from the Scroll or the Lens), equipment class (eyes / binoculars / telescope / camera), available hours, travel limit `[C]`.
- Constraints evaluated per candidate spot per hour: target altitude above the horizon mask (W8), twilight, Moon separation and illumination, obstructions, cloud forecast `[C]`. Server-side with **astroplan** (`Observer`, `AltitudeConstraint`, `MoonSeparationConstraint`, `AtNightConstraint`) or client-side with astronomy-engine for speed.
- Rank by expected usable minutes with travel and uncertainty penalties (W6).
- Equipment matters: lunar observing tolerates moonlight; a faint galaxy needs Bortle ≤ 4 and Moon below the horizon `[C]`.
- Counterfactual explanation: re-run the ranking with one constraint changed (leave 1 h later / drive 20 km farther) and diff the result; show "leaving later gains 40 min; driving farther gains 15 min" `[C]`.
- Visual payoff: the timeline (W2) reshapes when a constraint changes, highlighting the factor that caused the change `[C]`.
- When a transient candidate is found (L10), it is fed here: "When can I observe this again?" `[C]`.

### W8 · A horizon that understands your actual spot `[2/3] [+] ★`
**In plain words.** Mountains, roofs and trees block the sky. The app knows the real skyline at your spot, so it can say "This target clears your roof at 22:18" instead of the textbook rise time. Blocked parts of a target's path vanish behind the skyline in the sky view.

**How we build it.**
- Automatic terrain horizon: sample a digital elevation model (Open-Meteo Elevation API, or Mapbox/AWS Terrain tiles) along each bearing out to ~30 km, compute the maximum elevation angle per azimuth (1° steps) → a 360-value horizon mask `[O]`.
- Manual tracing for balconies and rooftops: the user traces buildings and trees on a photo panorama, calibrates north and elevation, and the outline becomes obstruction height per compass direction; manual beats automatic segmentation for accuracy `[C]`.
- Intersect celestial trajectories (Moon, planets, targets, ISS) with the mask to get true "clears at" times `[C][O]`.
- The mask is drawn as the foreground ridge line in the Living Sky dome (X1), so the theme's mountains become the user's real horizon `[C][F]`.

---

## 3. Module 2 · The Celestial Scroll (what and when)

### S1 · Moon phases, rise and set, with Japanese moon names `[3/3] [R]`
**In plain words.** Tonight's Moon: phase, illumination, rise and set times for your location, and its traditional Japanese name (三日月 Mikazuki, 十五夜 Jūgoya, 十六夜 Izayoi, 立待月, 居待月, 寝待月, 更待月…), which also becomes the page title each night.

**How we build it.**
- `astronomy-engine`: `MoonPhase`, `Illumination`, `SearchRiseSet`, `SearchMoonQuarter` `[F][O]`.
- Moon name table keyed on lunar day (age + 1); already implemented in the demo (`TK.moonName`) with a one-line poetic description per name `[F][O]`.
- Rendered in the 3D moon (X3) and as glyphs in the calendar (S6).

### S2 · Eclipses with local visibility `[3/3] [R]`
**In plain words.** Upcoming lunar and solar eclipses, with whether and when you can see them from where you are.

**How we build it.**
- `astronomy-engine`: `SearchLunarEclipse`, `NextLunarEclipse`, `SearchGlobalSolarEclipse`, `SearchLocalSolarEclipse` for local circumstances (partial begin, maximum, end, obscuration) `[O]`.
- Cross-check against the NASA eclipse catalogue for the demo year `[C]`.

### S3 · Meteor showers with expected rate from here `[3/3] [R]`
**In plain words.** Not just "Orionids peak tonight" but "about 12 per hour from your spot after 1 AM", because the radiant has to be up and the Moon hurts.

**How we build it.**
- Static **IMO** shower calendar JSON (name, radiant RA/Dec, active dates, peak, ZHR, population index) `[3/3]`.
- Expected hourly rate = ZHR × sin(radiant altitude) × limiting-magnitude factor from Moon illumination and Bortle (standard formula with population index r) `[O]`.
- The Living Sky fires shooting stars at a rate tied to tonight's expected rate `[F]`.

### S4 · ISS and bright satellite passes, computed locally `[3/3] [R]`
**In plain words.** The next ISS passes over your spot with rise direction, maximum altitude and duration, drawn as an arc across the sky dome. Works offline once the orbit data is cached.

**How we build it.**
- TLEs from **CelesTrak** (ISS, Tiangong, Hubble; optionally Starlink trains) cached 6 h server-side `[3/3]`.
- `satellite.js` SGP4 in a Web Worker: propagate at 10 s steps over the next 3 days; a pass is visible only when the observer is in darkness **and** the satellite is sunlit (Earth-shadow test) `[F][O]`.
- Alternative: Skyfield on the server if the team prefers Python for this `[C]`.
- Output: list of passes `{ start, startAz, maxAlt, maxTime, end, endAz, magnitude estimate }`; arc drawn on the dome (X1) and on a compass rose in the card `[F]`.

### S5 · Rocket launches `[3/3] [R]`
**In plain words.** Upcoming launches worldwide with local time, and for nearby launch sites an estimate of whether the trail might be visible from you.

**How we build it.**
- **Launch Library 2** `/launches/upcoming` cached on the server (15 calls/hour unauthenticated; get a key for more) `[3/3]`.
- Local time conversion; launch-site distance; "visible trail" heuristic when within ~800 km and launch is in darkness `[O]`.

### S6 · Traditional lunisolar calendar (旧暦), 24 sekki and 72 micro-seasons `[3/3] [R]`
**In plain words.** The calendar follows the old Japanese lunar calendar: months start at the new Moon, each day shows its Moon glyph, and each day carries its season name from the 72 micro-seasons, e.g. 霜降 "frost descends". It unrolls horizontally like an emakimono scroll.

**How we build it.**
- New moons from `astronomy-engine` (`SearchMoonPhase(0, …)`) define lunar months; the 24 solar terms from the Sun's ecliptic longitude in 15° steps, the 72 kō in 5° steps `[F][O]`.
- Each cell: moon glyph drawn with the phase-correct `drawMoon` routine from the demo, day number, event seals (gold = meteor, grey = ISS, red = eclipse) `[F]`.
- Validate one month against a published 旧暦 calendar `[O]`.

### S7 · Filter by event type and date `[3/3] [R]`
**In plain words.** Chips for Moon, Meteors, Eclipses, ISS, Launches, Planets; pick a day on the lunar calendar to see that night.

**How we build it.** A unified `Event` type `{ kind, startLocal, endLocal, altitudeSeries, direction, visibleFromHere, source }` so all kinds filter and sort the same way; filter state lives in the URL hash for sharing `[C][O]`.

### S8 · Event localization: "can I see it from here?" `[2/3] [+]`
**In plain words.** Every event says yes or no for your location, with a direction compass and an altitude graph through the night.

**How we build it.** Every event carries an altitude-vs-time series computed locally and intersected with the horizon mask (W8); the card shows direction, peak altitude and a yes/no with the reason `[C][O]`.

### S9 · Planets, conjunctions and aurora chance `[O] [+]`
**In plain words.** Which planets are up tonight and how bright; close pairings of the Moon and planets; and a simple aurora-chance badge from space-weather data.

**How we build it.**
- `astronomy-engine` planet altitudes, magnitudes, elongations; angular-separation search for Moon–planet conjunctions under 3° `[O]`.
- NOAA SWPC Kp forecast and NASA DONKI events → aurora probability by latitude `[O]`.

---

## 4. Module 3 · The Spirit Lens (honest restoration)

### L1 · Denoise with a model that cannot invent `[3/3] [R]`
**In plain words.** Upload a space image and the noise goes away. We use a model type that learns what noise looks like, not what galaxies look like, so it cannot paint in things that are not there. No GAN upscalers.

**How we build it.**
- Model choice: a compact astronomy-trained denoiser (Noise2Void / Noise2Astro style, self-supervised) or a small NAFNet/DnCNN exported to ONNX `[3/3]`. Never Real-ESRGAN or any GAN `[F][O]`.
- Classical fallback that needs no model: wavelet or BM3D denoising via `scikit-image`/`bm3d` `[O]`.
- Two execution paths: in-browser with `onnxruntime-web` (WebGPU provider, WASM fallback) inside a Web Worker for instant demos on JPG/PNG `[F]`; server worker with ONNX Runtime for large or FITS images, bounded and tiled `[C]`.
- Strength slider with live stats: iterations/strength ↔ honesty score trade-off shown as you drag (L3) `[O]`.

### L2 · Deblur with a PSF measured from the image itself `[3/3] [R]`
**In plain words.** Blur is removed by first measuring how a single star is smeared in this exact image, then undoing that smear mathematically. It is deterministic, and it refuses to deblur when it cannot measure the blur.

**How we build it.**
- Build an effective PSF from isolated stars with `photutils.psf.EPSFBuilder` `[O]`; fall back to a Gaussian/Moffat fit of the median star FWHM.
- Richardson-Lucy deconvolution (`skimage.restoration.richardson_lucy`) with a small iteration count and a stop rule on residual χ² `[F][O]`.
- "Restrained when the image supports estimating the blur" — if fewer than N isolated stars, skip deblurring and say why `[C]`.
- FITS input keeps the true dynamic range (Astropy); JPG/PNG/TIFF supported with an asinh stretch for display `[O][F]`.

### L3 · Proof of Honesty `[3/3] [+] ★★ (signature feature)`
**In plain words.** After restoration the app proves it invented nothing. It re-blurs the restored image with the measured blur and compares it with the original; the leftover should look like pure noise. It shows that residual as a heat map, reports a χ² score and SSIM/PSNR, checks that every star kept its brightness and position, and can inject fake known stars to prove it recovers them without inventing extras.

**How we build it.**
- **Forward-model check** `[O]`: `residual = original − PSF ⊗ restored`; show the residual map; report reduced χ² against the noise model; structure in the residual means something was invented.
- **Honesty map / "What changed?" view** `[F][C]`: residual heat layer, SSIM and PSNR between input and output, list of shifted star centroids (> 0.3 px) and brightness changes `[C]`.
- **Flux conservation** `[O]`: aperture photometry per detected star before and after (`photutils.aperture`); total flux preserved within X%, shown as a table.
- **Synthetic-star injection test** `[C]`: inject known synthetic stars (`photutils.datasets.make_model_image`) into test copies, run the pipeline, measure recovery rate, false detections and magnitude error; show the benchmark on `/science` and in the restoration report.
- **Multi-exposure support** `[C]`: when several frames are uploaded, align (`astroalign`) and stack, then compare detections across independent subsets; a faint object seen independently has stronger support than one appearing only after restoration.
- Rendered in the Dojo as the third mode "Honesty" with kintsugi gold seams tracing where pixels changed (D5/X5).
- Quantitative measurements always come from the original calibrated data, never the restored image `[C]`.

### L4 · Star and galaxy detection with brightness and size `[3/3] [R]`
**In plain words.** The app finds every star and galaxy-like smudge, draws its true shape, and reports brightness and size. For an ordinary JPEG it says "relative brightness" and "pixels"; real magnitudes and arcseconds appear only once the image is plate-solved.

**How we build it.**
- **SEP** (Source Extractor) or `photutils` `DAOStarFinder` + segmentation: position, flux, FWHM, semi-axes, ellipticity `[3/3]`.
- Star vs galaxy: FWHM ratio to the PSF and elongation (CLASS_STAR-style heuristic) `[F][O]`.
- Units honesty: instrumental magnitude and pixel size for JPEGs; calibrated magnitude (zero-point from catalog matches) and arcseconds after plate-solving `[C][O]`.
- In-browser fallback implementation (background sigma-clip, threshold, connected components, centroids) for the instant path `[F]`.

### L5 · Plate-solve and name every object `[3/3] [+] ★`
**In plain words.** Upload a blurry photo and the app says "This is the Andromeda Galaxy, field of view 2.1°", labels every bright star by name, and lets you click a smudge to learn it is a galaxy 60 million light-years away. The photo becomes a map.

**How we build it.**
- Read **AVM metadata** first: many NASA/ESA press JPGs embed sky coordinates in XMP; parse with `exiftool`/`python-xmp` or a small XMP reader `[O]`.
- Otherwise **nova.astrometry.net** API: log in with the key, upload the **source list** (x, y, flux from L4) rather than the image, poll the job, receive the WCS header `[F][C]`. Keys stay on the server; solving is asynchronous and can fail on sparse images, so unknown stays unknown `[C]`.
- Cross-match detections with **Gaia DR3 / SIMBAD / NED** through `astroquery`; attach name, type, distance, magnitude `[3/3]`.
- "Where is this in the sky?": draw the solved field on the all-sky dome with its constellation `[O]`, the camera flying from the photo into the sky `[C][F]`.
- **Aladin Lite** opens for survey exploration of the solved field, loaded lazily `[C]`.
- Object inspector drawer (D4) shows the matched record and tabs for spectrum (L7) and light curve (L8).

### L6 · Mirror of the Heavens: survey imagery and the wavelength lantern `[3/3] [B]`
**In plain words.** Once the app knows where your photo is, it pulls the same patch of sky from NASA's archive and lays it under your image. Slide to compare, or move a round lantern over an object to see it in infrared, X-ray or radio, with the survey name and date shown. Honest wording: SkyView is archival survey imagery, not a live telescope feed.

**How we build it.**
- **NASA SkyView** via `astroquery.skyview` or the `runquery.pl` endpoint with `Position`, `survey` (DSS2 Red, 2MASS-J, WISE 3.4, ROSAT, NVSS), `pixels`, `coordinates` `[3/3]`.
- Reproject the user's image onto the SkyView cutout with the WCS (`reproject` package) and show an opacity slider `[F]`.
- Wavelength lantern: circular clip-path following the pointer over the stacked survey layers; a label shows wavelength and observation date `[C]`.
- Multi-wavelength blend slider across surveys `[O]`.

### L7 · Spectrum on click `[O] [B]`
**In plain words.** Click a matched galaxy or star and see its real spectrum with the main lines labelled (Hα, [OIII], Ca II).

**How we build it.** `astroquery.sdss` `get_spectra` by coordinates; plot with labelled rest-frame lines shifted by redshift; cached per object `[O]`.

### L8 · Transient detection, light curves and the live feed `[3/3] [B] ★`
**In plain words.** Compare two images of the same field from different dates and the app finds what changed, shows before/after/difference, draws a brightness-over-time curve, and checks catalogues so it does not cry wolf. It also shows recent real alerts (supernovae, variable stars) inside your field, and any candidate becomes a new observing mission in the planner.

**How we build it.**
- Two-epoch pipeline `[O][C]`: align by WCS or `astroalign` → PSF-match (`photutils` or `hotpants`-style kernel) → normalize flux and subtract backgrounds → subtract → detect residual sources with SEP → reject artifacts (edges, saturated stars, dipoles) → check known objects (SIMBAD, Minor Planet Center) before flagging.
- Demo data: SkyView DSS1 vs DSS2 of a known supernova field, or ZTF reference vs science cutouts; same filter only, never different wavelengths `[C][O]`.
- Light curves: **ALeRCE** API (`survey="ztf"`) `query_objects` by cone, `query_lightcurve` by object id; plot g and r detections and non-detections `[F][O]`.
- Live feed: ALeRCE recent classified alerts (and Transient Name Server if an account is available) plotted on the sky dome and listed with class probabilities `[F][O]`.
- Closing the loop: "Observe this again" sends the candidate to the planner (W7) `[C]`.

### L9 · Restoration report `[O] [+]`
**In plain words.** One click exports everything: parameters, the measured PSF, every metric, the honesty results and catalogue matches, as JSON and a printable PDF, so anyone can reproduce it.

**How we build it.** The job record already holds all of it; render a PDF with `reportlab` or a print stylesheet; JSON is the raw job document `[O]`.

---

## 5. Module 4 · The Dojo Dashboard (explore)

### D1 · Katana before/after slider `[3/3] [R]`
**In plain words.** Drag a blade across the image: left of the cut is the original, right is the restored, with a gold edge and a flash on release.

**How we build it.** Two stacked canvases, the top one clipped with `clip-path: inset(0 0 0 var(--cx))`; blade handle with pointer events and a slash animation (already in the demo) `[F]`; detections render only on the restored side `[F]`.

### D2 · Deep zoom with synchronized pan `[3/3] [R]`
**In plain words.** Zoom into a huge JWST image smoothly; both sides of the slider and all overlays stay aligned.

**How we build it.** **OpenSeadragon** with a tiled pyramid (DZI generated by the worker with `pyvips` or `deepzoom.py`), two synchronized viewers or one viewer with a clip overlay; overlays in the viewer's coordinate space `[O][C]`.

### D3 · Detection overlays `[3/3] [R]`
**In plain words.** Ellipses drawn around every detected object in their true shape and orientation, coloured by type, toggleable by class and magnitude.

**How we build it.** SEP ellipse parameters (a, b, theta) → SVG ellipses in the zoom viewer; filter chips for stars / galaxies / candidates; labels flip side near the edge `[F][O]`.

### D4 · Object inspector `[3/3] [R]`
**In plain words.** Click any object: magnitude, size, coordinates, catalogue name and type, then tabs for its spectrum and light curve.

**How we build it.** Right drawer bound to the selected detection id; data from L4, L5, L7, L8; "Observe this" button into the planner `[C][O]`.

### D5 · Three-way view: Original · Restored · Honesty, with kintsugi seams `[3/3] [+]`
**In plain words.** A third mode shows the honesty residual as a heat map, and the places where pixels changed are traced in gold, like kintsugi: repaired, not replaced.

**How we build it.** Residual from L3 colour-mapped; threshold the |change| map, extract contours (`skimage.measure.find_contours`), draw as gold strokes with glow over black lacquer `[O][F]`.

### D6 · Processing stages shown live `[O] [+]`
**In plain words.** While an image is processed you watch the real stages happen: measure PSF → denoise → deconvolve → detect → plate-solve → cross-match, each showing its intermediate output (the PSF image itself, the noise map), with gold kintsugi cracks growing as the loading animation.

**How we build it.** Job status streamed by Server-Sent Events from FastAPI; each stage posts a thumbnail URL; the kintsugi loader from the demo plays until completion `[O][F]`.

### D7 · Histogram and stretch controls `[O] [+]`
**In plain words.** Asinh and log stretch sliders like real astronomy software, so faint detail becomes visible without changing the data.

**How we build it.** Stretch applied in the display shader/canvas only; exports use the untouched data `[O]`.

---

## 6. Module 5 · Honor (ritual and gamification)

### H1 · Honor Points, ranks and verified observations `[3/3] [B]`
**In plain words.** Log a night and earn Honor. Rarer events earn more. Ranks climb Ashigaru → Samurai → Daimyō → Shōgun. You can only claim an event while it is actually visible from where you are, and a photo claim is verified by plate-solving it.

**How we build it.**
- Points ledger in local storage, optional anonymous sync (Supabase) `[O]`.
- Anti-cheat: a claim is accepted only inside the computed visibility window at the user's location; photo claims must plate-solve to the claimed object `[O]`.
- Rank thresholds over the ledger; hanko seal animation on each claim (already in the demo) `[F][O]`.

### H2 · Observation journal as a growing celestial scroll `[3/3] [+]`
**In plain words.** Every completed observation adds a red seal and the real captured object to your personal scroll, with the conditions that night filled in automatically. Export it as an image.

**How we build it.** Journal entries `{ time, spot, target, conditions snapshot from W1, image id, seal }`; rendered as a horizontal emakimono with hanko seals; export via canvas `toDataURL` `[C][O][F]`.

### H3 · Quests, fair streaks and the shareable scroll `[O] [+]`
**In plain words.** Seasonal quests like "observe all named moons of a lunar month"; streaks only break on nights the score said were observable, so cloudy nights don't punish you; a shareable "Tonight's Sky" card and an Honor certificate.

**How we build it.** Quest definitions over S1/S6 data; streak logic reads the historical Honor Score; server-rendered OG image (Satori or Playwright) with moon phase, score and top event `[O]`.

---

## 7. Module 6 · The visual experience (theme that carries data)

### X1 · The Living Sky dome: the sky is the app `[3/3] [+] ★` (chosen base, see demo)
**In plain words.** The whole app sits inside a real-time rendering of your actual sky. Stars are real stars for your location and minute; constellations are drawn as brush strokes; the Moon shows its true phase; the ISS crosses as an arc; shooting stars fall at tonight's real rate; the mountain silhouette is your real horizon. Each module is a camera move on this one scene.

**How we build it.**
- three.js (react-three-fiber) with a custom star shader (per-vertex size from magnitude, twinkle, additive blending); ~9,000 Yale Bright Star Catalog stars shipped as a typed-array binary (~300 KB) replacing the demo's procedural field; named stars with Japanese names; constellation lines drawn on a 2D overlay canvas as layered brush strokes `[F]`.
- Milky Way as a galactic-plane point cloud; Moon sphere lit by a directional light at the real Sun direction so the phase is automatic `[F]`; upgrade to the 3D Moon with libration (X3).
- Stations as camera tweens (time-based easing): Watchtower tilts to the horizon and opens the map; Scroll pans along the dotted ecliptic with the event strip; Lens narrows the FOV onto a target with a reticle `[F][C]`.
- Codex's Moon Observatory flow mapped onto the stations: selecting an object opens its observing window; the landscape becomes the location map; the selected target carries into the image workspace and journal `[C]`.
- Horizon mask (W8) replaces the procedural ridges; blocked trajectories disappear behind it `[C]`.
- Forecast clouds obscure the corresponding part of the sky view; uncertainty shown as a translucent range on the timeline `[C]`.
- Phone AR mode: DeviceOrientation drives the camera (stretch) `[O][F]`.
- Performance: only the active heavy visualization animates; dpr capped at 2; `prefers-reduced-motion` turns off twinkle and meteors; transitions interruptible `[C][F]`.

### X2 · The sumi-e dusk opening and sky-synced colour `[2/3] [+]`
**In plain words.** The first visit opens on a daytime ink-wash landscape. Scrolling pulls the sun down, ink bleeds across the paper, stars ignite brightest first, the torii appears and the Moon rises at tonight's real phase, with the traditional hour name in the corner. After that, the app's background colour always follows the real Sun altitude: dusk, blue hour, night.

**How we build it.** Canvas scroll-driven scene from the demo (`Stages.dusk`): ridges with bleed passes, star ignition thresholds, phase-correct Moon, petals, paper grain; shown once per device (flag in localStorage), skippable; background gradient tokens driven by Sun altitude everywhere else `[F][O]`.

### X3 · 3D Moon at true phase and true libration `[3/3] [R]`
**In plain words.** The Moon on the Tonight page is a real 3D Moon with NASA's surface textures, lit exactly as tonight, and slightly turned the way the real Moon wobbles (libration). Drag the time dial and it re-lights.

**How we build it.** NASA CGI Moon Kit colour + displacement textures (LOD, 2k for web) on a three.js sphere; Sun direction from astronomy-engine; libration from `astronomy-engine` `Libration()` applied as rotation; validate against a NASA phase image for a given date; target 60 fps `[O][F]`.

### X4 · The ink-and-paper interaction language `[3/3] [R]`
**In plain words.** Every interaction is ink and paper: tabs flood with ink from where you clicked and dry to reveal the next pane; confirmations stamp a red hanko; titles draw themselves as brush strokes; the before/after handle is a katana; loading is gold kintsugi cracks on black lacquer; a paper lantern cursor lights the page in lantern mode.

**How we build it.** All implemented in the demo (`Stages.ink`): ink-spread canvas transition with noise-deformed blobs, SVG `feTurbulence` roughness on seals and strokes, stroke-dashoffset ensō, CSS mask lantern, kintsugi random-walk cracks. Keep motifs sparing (torii, blossom, katana used where they mean something) `[C]`; keep navigation explicit and usable with animation disabled `[C]`.

### X5 · Theme that carries data `[3/3] [+]`
**In plain words.** The decoration is information: cherry-blossom density rises with the Honor Score and the air is still when the night is bad; humidity softens the ink edges and cloud cover fogs the scene; kintsugi gold marks exactly the restored pixels; forecast clouds shade the real sky view.

**How we build it.** Petal count and drift speed bound to the score; ridge blur and mist alpha bound to humidity and cloud cover; gold seams from D5; cloud masks on the dome from the hourly forecast `[F][O][C]`. Narrate the link in the pitch so judges notice it `[O]`.

### X6 · Torii navigation and Japanese naming `[3/3] [R]`
**In plain words.** Each module is entered through a torii with a camera move through the gate; every section has a Japanese name with romaji and an English gloss; the night's Moon name and the day's micro-season are the page titles.

**How we build it.** Gate tween in the dome; i18n table of names (見張り Watchtower, 巻物 Scroll, 鏡 Lens, 道場 Dojo, 誉 Honor); titles from S1 and S6 `[F][O]`.

### X7 · Ambient sound (optional) `[2/3] [+]`
**In plain words.** A shakuhachi wind bed whose volume follows the wind speed, one koto pluck on hover, a furin chime only on clear nights. Off by default, one tap to enable.

**How we build it.** Web Audio API with small loops; gain mapped to `wind_speed_10m`; starts only after a user gesture `[F][O]`.

### X8 · Accessibility and performance guarantees `[3/3]`
**In plain words.** It works on an ordinary phone, with a keyboard, with a screen reader, and with animation turned off.

**How we build it.** Reduced-motion variants for every animation; keyboard navigation and focus states; screen-reader text for every chart; initial JavaScript ≤ 250 KB compressed before optional viewers; preview images first, full-resolution work in the worker; LCP ≤ 2.5 s and INP < 200 ms measured on a mid-range phone `[C][O]`.

---

## 8. Design: the one experience

**Chosen direction.** The **Living Sky dome (X1)** is the spine, as demonstrated and approved. The **sumi-e dusk (X2)** is the first-visit opening. The **ink-and-paper language (X4)** is how every control behaves. Codex's **Moon Observatory** journey and Opus's **Tonight page** are folded into the dome's stations rather than built as separate pages.

**Information architecture** (Opus, adapted to the dome):

```
/            Tonight: the dome · 3D Moon with name · verdict card · best window · next 3 events · Kage dial · torii entrances
/watchtower  dome tilts to horizon → scroll map (70%) + ranked spots (30%) · breakdown · confidence · dew · horizon · planner
/scroll      dome pans along the ecliptic → emakimono lunar calendar · filter chips · event cards · notify / add to calendar
/lens        upload onto a misted mirror · live stages · strength slider · honesty proof          ┐ one flow
/dojo/:id    katana slider · deep zoom · overlays · inspector · Original | Restored | Honesty       ┘
             tabs: Objects · Spectrum · SkyView wavelengths · Transients · Report
/honor       rank banner with seal · ledger · journal scroll · quests · share
/science     architecture · every formula · every API · honesty methodology · limitations
Global: location chip · Kage dial · field (red) mode · alerts bell · ⓘ popovers
```

**Visual system** (merged tokens):

| Token | Value | Use |
|---|---|---|
| Ink | `#07070B` / `#0B0B0F` with ink-wash noise | background, night |
| Paper | `#E9E0CC` / `#EDE6D6` washi with grain | map, scroll, dashboard surfaces |
| Vermilion | `#B4282D` / `#C8372D` | primary actions, seals, torii |
| Gold | `#CFA84F` / `#C9A227` | highlights, kintsugi, honor, constellation names |
| Moonlight | `#F3EAD6` warm (Moon) · `#D9DEE8` cool silver (data text) | moon, numerals |
| Mist | `#8B94A7` | secondary text, ISS, galaxies |
| Night vision | palette remapped to `#3A0000`–`#FF3B30` | field mode |
| Display type | Shippori Mincho | Japanese and Latin headings |
| Body type | Cormorant Garamond (editorial) or Zen Kaku Gothic New (UI panels) | body and UI |
| Numerals | tabular figures everywhere | data honesty |
| Motion | slow ink easings for scenery; fast-out "katana" easing for interactions; reduced-motion respected | two motion personalities |

**Rules.** Theme elements must mean something (X5). Verdict first, depth one click later (progressive disclosure: verdict → breakdown → science). One shared clock and location (A1). Restrained vermilion and gold; silver moonlight; readable type `[C]`.

**Journey emotional curve** (Opus): doubt spikes at arrival and at upload; answer both with visible machinery, the real-phase Moon on arrival and the Proof of Honesty on upload.

---

## 9. Architecture (final)

One repository, a static PWA frontend, one API, one processing worker (the worker may be a background task in the same FastAPI process for the hackathon).

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + **Vite** PWA; Tailwind; Framer Motion for ink transitions | Static deploy (Vercel/Netlify). Next.js is an acceptable alternative if route handlers are wanted for caching `[F]`; Vite keeps the bundle leanest `[C]`. |
| Sky and astronomy (browser) | three.js / react-three-fiber, `astronomy-engine`, `satellite.js`, Web Workers | Instant time scrubbing, offline-capable `[3/3]` |
| Map | MapLibre GL, custom ink-wash vector style, lazy-loaded | Overpass landmarks, GIBS light-pollution raster |
| Image viewers | OpenSeadragon (deep zoom), Aladin Lite (survey exploration), both lazy | One heavy visualization active at a time |
| In-browser ML | `onnxruntime-web` (WebGPU → WASM) in a Worker | Instant denoise path for small images |
| API | **FastAPI**; provider adapters; normalized events; plans; job status via SSE; OpenAPI → generated TS types | Keys (astrometry.net, LL2, VAPID) live here |
| Scientific worker | Astropy, photutils, SEP, astroquery, astroalign, reproject, scikit-image (Richardson-Lucy), ONNX Runtime, astroplan; Skyfield optional | Bounded, tiled inference; DZI tiling with pyvips |
| Storage | SQLite (plans, jobs, journals, push subscriptions); local disk or S3-compatible bucket for originals and outputs | No user accounts; anonymous ids `[O]` |
| Data adapters | Open-Meteo (forecast, air quality, ensemble, elevation), 7Timer! ASTRO, CelesTrak, IMO calendar JSON, eclipse catalogue, Launch Library 2, NOAA SWPC, NASA DONKI, NASA SkyView, SDSS, ALeRCE, astrometry.net, SIMBAD/Gaia/NED, Overpass, GIBS | Each cached by its update frequency; all have demo replay JSON |
| Deploy | Frontend on Vercel; API + worker on Fly.io/Render (or a laptop with a tunnel for the demo) | Seeded fallback for every provider |

**Performance targets** `[C]`: ≤ 250 KB compressed initial JS before optional viewers; preview images first; LCP ≤ 2.5 s; INP < 200 ms on an ordinary phone; one active heavy visualization.

**Evidence for code review** `[C][O]`: deterministic astronomy tests (known moonrise, known ISS pass, known eclipse); image recovery benchmark (synthetic-star injection: recovery rate, false positives, magnitude error); provider-failure tests; a timestamped demo replay through the live pipeline; the `/science` page.

---

## 10. Action plan

**Day 0 · Spikes (answer the risky questions first)** `[O]`
1. Honesty spike (Python notebook): on 3 Hubble/JWST JPGs and 1 raw FITS, does the re-convolution residual look like noise? Is flux preserved within a few %?
2. Moon + dial spike: 60 fps with real phase, libration and dial scrubbing on a mid laptop?
3. Plate-solve path: run 5 NASA/ESA press images through the AVM reader; time an astrometry.net solve from a source list.
4. API checks: Open-Meteo ensemble and air-quality variables, GIBS Black Marble tile URL, LL2 throttle, ALeRCE cone search, SkyView cutout.

**Phase 1 · Foundation (shared)**
A1 store + Kage dial · A3 adapters with cache and demo replay · A2 Science registry · PWA shell · design tokens · the dome from the demo upgraded with the real star catalogue.

**Phase 2 · Must-ship (every `[R]`)**
W1 W2 W4 W5 W6 · S1 S2 S3 S4 S5 S6 S7 A5 · L1 L2 L4 · D1 D2 D3 D4 · X3 X4 X6 · H1.

**Phase 3 · Signature innovations (in this order)**
L3 Proof of Honesty → W2/W3 breakdown, best window, verdict → X1 stations + X3 libration → L5 plate-solve + names → S6 moon names and micro-seasons polish → X5 theme carries data → H1 verified observations → W1 confidence and seeing → L6 SkyView mirror and lantern → L8 transients and light curves.

**Phase 4 · Depth and bonus**
W7 planner with counterfactuals → W8 horizon mask → L7 spectra → H2/H3 journal, quests, share → S9 planets/aurora → L9 report → X2 dusk opening polish → X7 sound.

**Phase 5 · Demo hardening**
Seeded replay for every provider; sample image set with AVM metadata; live push alert rehearsal; hallway test (Opus §4.9: verdict + spot in < 20 s; next ISS pass; find the Honesty view unaided; name a bright object); `/science` page complete.

**Suggested split for a 4-person team**: Sky and theme (X1–X6, A1) · Watchtower and Scroll (W*, S*, A5) · Lens pipeline (L1–L5, L8, worker) · Dojo, Honor, API and data layer (D*, H*, A2–A4).

---

## 11. Open questions to settle before build

1. Hosting for the API and worker on demo day: Fly/Render vs a laptop with a tunnel.
2. The three demo images (with AVM metadata) and the demo city.
3. Honor storage: local-only or anonymous Supabase sync.
4. How much Japanese text in the UI: kanji with romaji and English glosses recommended.
5. Vite vs Next.js for the frontend (either works; decide on day 0 with the team's familiarity).
