# frontend-basic — the test frontend

A small themed Vite + React 18 + TypeScript app whose only job is to exercise every backend endpoint in `docs/API.md` so the backend can be verified end to end. It follows the palette and type of the guideline (ink, paper, vermilion, gold; Shippori Mincho + Cormorant Garamond) but has none of the heavy visuals: no WebGL, no animation libraries. Dependencies: react, react-dom, react-router-dom, leaflet, react-leaflet.

## Run

```bash
cd frontend-basic
cp .env.example .env        # VITE_API_BASE=http://localhost:8000 (default if unset)
npm install
npm run dev                 # http://localhost:5173 (the backend's CORS allow-list includes this origin)
npm run build               # tsc --noEmit + vite build → dist/
```

The backend must be running on port 8000 (`uvicorn app.main:app --port 8000` from `backend/`). The top bar polls `/api/health` every 30 s and shows a green/red dot.

## Layout

- `src/api.ts` — the typed client. Types for every response in `docs/API.md`; `get<T>(path, params)` returns the `{ data, provenance, computed_at }` envelope with `data` typed as `T`; `getRaw<T>` for unwrapped endpoints (health, lens jobs); `post<T>`; an `api.*` object with one function per endpoint. Failed providers (HTTP 502 `provider_unavailable`) throw `ApiError` with the body kept on `.body`. The main frontend can copy this file as is.
- `src/context/AppContext.tsx` — global location (presets Bengaluru / Kyoto / Delhi / Mumbai, custom lat/lon, browser geolocation) and reference time (`datetime-local`, "Now", "Tonight 21:00"). Every page re-fetches when these change.
- `src/hooks/useApi.ts` — `useApi(fetcher, deps)` with abort on change, loading / error / ok states; `describeError` turns an `ApiError` into a readable panel.
- `src/components/` — `Controls` (the picker), `Card`/`Label`/`Chip`/`KV`/`Section`, `Status` (loading, error, empty, `Await`), `ProvenanceFooter`, `MoonGlyph` (SVG phase from `phase_deg`), `JsonView`, `TopBar`.
- `src/pages/` — one file per route. `src/theme.css` — the single stylesheet with the design tokens.

## Pages

**Tonight (`/`).** The at-a-glance night: the Moon card (phase glyph, illumination, age, Japanese name with kanji / romaji / meaning, rise and set, libration numbers, the `alert` line), the Sun card (sunset, every twilight, sunrise, dark hours), the Night Honor card (verdict chip, headline, reason, score, best window, warnings), today's sekki and kō from `/api/scroll/season`, and the first five events from `/api/scroll/events?days=3`. A provenance footer lists every source with fetched time and cached/stale chips.

**Watchtower (`/watchtower`).** The Night Honor Score hour by hour: an SVG bar chart of `hours[].score` with local-time labels, the best window in gold and a dashed low-cloud line; hovering or clicking a bar shows that hour's `contributions` as gold (contribution) / vermilion (penalty) bars with the raw inputs. The trace formula, inputs and notes; the light-pollution result (Bortle, radiance, layer, tile); and the observing spots (`/api/watchtower/spots`) as a sepia OpenStreetMap map with glyph markers (山 ⛩ 寺 湖 望) hover-linked to the ranked list (name, kind, distance, Bortle, night score, best window, rank score; click a row for the `rank_trace`). Radius and limit are selectable; the spots call can take a minute or more on the backend.

**Scroll (`/scroll`).** The unified event list with kind filter chips (moon, meteor, eclipse, satellite, launch, planet) and a days selector; each event has an "Add to calendar" link that downloads from `/api/scroll/ics`. Collapsible sub-sections call each detailed endpoint: meteor showers (table with best hour, rate and a rate-per-hour sparkline), satellite passes (ISS / Tiangong / Hubble table plus SVG polar sky plots of the first three tracks, sunlit part in gold), launches (cards), planets (table), eclipses (table), and the lunisolar calendar for the reference month (7-column grid, moon glyph drawn from `phase_deg`, lunar month/day, hover for the moon name, sekki and kō; previous/next month buttons).

**Lens (`/lens`).** The Spirit Lens pipeline: pick a sample from `/api/lens/samples` or upload a file, set `denoise_strength`, `deblur_iterations` and `detect_sigma`, press Restore. The page POSTs to `/api/lens/jobs` and polls `/api/lens/jobs/{id}` every 800 ms, showing the nine stages as status chips. When done: a before/after comparison with a draggable gold blade (pointer events, keyboard arrows), toggles for the overlay and residual images, the Proof of Honesty panel (SSIM, PSNR, reduced χ², structure score and verdict chip, flux conservation, position shift, invented pixels, notes, trace), the PSF thumbnail with FWHM, counts, a Run benchmark button (`POST /benchmark`), the WCS panel with a Solve button (`POST /solve`, polling resumes while the `wcs` stage runs) and, once solved, the SkyView DSS2 Red cutout beside the original plus the SIMBAD catalogue matches; the detections table sortable by flux and other columns with kind chips and RA/Dec when present; the raw job JSON; and the `units_note`.

**Science (`/science`).** Every GET endpoint with a Call button (and Call all) that shows the HTTP status, latency and the raw pretty-printed JSON (or the `.ics` text) for the current location and time, so any response can be inspected. Includes `/api/health`.

## Notes

- All numbers use tabular numerals; the theme is dark only.
- Error states: a 502 `provider_unavailable` body is shown with its source and detail; a network failure says the backend is unreachable; empty lists show an empty state.
- State persists the chosen location in `localStorage`; the reference time resets to now on reload.
