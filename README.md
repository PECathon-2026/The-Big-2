# Tsukuyomi Watch · 月読の見張り

**The samurai's celestial guide.** PECathon 2026 · Team The Big 2 · Problem statement PS-002

One app for one night under the sky: should you go out tonight, where should you stand, what will happen
overhead, and then an honest clean-up of the photo you bring back, with proof that nothing was invented.

**Rule of the codebase: nothing on screen is faked.** Every number comes from a real computation or a real
data source, and every API response says where it came from and when (provenance). When a provider is down
the app says so (stale, replayed or error) instead of making numbers up.

---

## The product

The app opens on your real sky, computed in the browser for your place and time: 5,044 catalogue stars,
89 constellations with Japanese names, the Milky Way, the Moon lit by the real Sun, planets and the ISS. A
time compass (和時計) moves the sky ±72 h. Each chapter on the right-hand rail is a camera dive from that sky
into a page.

| Chapter | What it does |
|---|---|
| 一 **Sky** 空 | Living 3D sky at your location and time; click an object to dive into its chapter. |
| 二 **Watchtower** 見張り | Go / Maybe / Stay-in verdict and a 0–100 **Night Honor Score** with a "why this score" breakdown, best dark window, hourly forecast, light pollution (Bortle estimate from NASA VIIRS night lights), nearby shrines, peaks and viewpoints ranked on an ink-wash map. Also the **Observing Planner** (best time for a target, the binding constraint per 15 minutes, what-if answers), the **horizon mask** from terrain elevation, and the **aurora** outlook from NOAA's Kp index. |
| 三 **Celestial Scroll** 巻物 | Moon phase with Japanese moon names, a draggable 旧暦 lunar calendar with the 24 sekki and 72 kō, meteor showers with local hourly rates, solar and lunar eclipses, ISS passes (SGP4 with an Earth-shadow test), planets and rocket launches; filters by type and date, `.ics` export and **Web Push reminders** ("the Moon rises at 8:14 PM"). |
| 四 **Spirit Lens** 鏡 | Upload a sky photo (JPG, PNG, TIFF, FITS) or pick a sample. A 9-stage pipeline measures the noise and the blur (PSF) from your own stars, denoises with wavelets, deblurs with Richardson–Lucy, detects and classifies stars and galaxies, and finds sky coordinates. The katana slider cuts between before and after, and the **heat difference** view shows where the image changed. |
| 五 **Dojo** 道場 | Every restoration kept by the server. Per job: original / restored / honesty modes, detection overlays with an inspector, the **Proof of Honesty** (re-blur the result with the measured PSF and compare: residual map, χ², SSIM, PSNR, flux conservation, invented-pixel count), a synthetic-star benchmark, plate solving, SIMBAD names, the NASA SkyView image of the same field and ZTF transients inside it. |
| 六 **Honor** 誉 | Log what you observed; the server checks the claim against the real sky (was the Moon up there and then?) and awards points and ranks, or a 否 seal with the reason. |
| 学 **Science** | Formulas, live traces and the provenance of every source; SDSS spectra with emission lines, ZTF transient search and our own two-image subtraction (align, match the blur, subtract, find what appeared). |

The image restoration is classical, deterministic image processing, not generative AI, so it cannot
hallucinate detail. The honesty metrics are diagnostics, not an absolute guarantee.

## Repository

```
backend/          FastAPI service: all the science, data providers, Lens pipeline, alerts, honor ledger
  app/<module>/   watchtower · scroll · lens · alerts · honor · transients · planner · horizon · spectra · aurora
  data/           meteor shower table, Lens sample images, replay recordings for an offline demo
  tests/          pytest suite (unit, contract, property-based and adversarial tests)
frontend-main/    the product: React 19, Three.js (react-three-fiber), GSAP, Leaflet, PWA
frontend-basic/   a plain test UI that calls every backend endpoint
```

## Run it locally

**Backend** (Python 3.12+), on port 8000:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # every key is optional
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

**Frontend** (Node 20+), on port 3000:

```bash
cd frontend-main
npm install
npm run dev
```

Open http://localhost:3000. It calls the backend at `http://localhost:8000`; set `VITE_API_BASE` to point it
elsewhere. The test UI in `frontend-basic/` runs the same way on port 5173.

**Tests:** `cd backend && pytest -q`

## Configuration

Backend variables (in `backend/.env`):

| Variable | Purpose |
|---|---|
| `TSUKUYOMI_CORS_ORIGINS` | comma-separated frontend origins allowed to call the API |
| `TSUKUYOMI_ASTROMETRY_API_KEY` | enables blind plate solving through nova.astrometry.net |
| `TSUKUYOMI_LAUNCH_LIBRARY_KEY` | higher rate limit for Launch Library 2 |
| `TSUKUYOMI_REPLAY_MODE` | `off`, `fallback` (recordings only when a provider fails) or `first` (fully offline demo) |
| `TSUKUYOMI_DATA_DIR` | where caches, Lens jobs, recordings and the SQLite files live |

Frontend: `VITE_API_BASE`, the backend URL, read at build time.

## Deployment

- **Frontend:** a static Vite build (`npm run build` → `dist/`), served from the site root so the service
  worker and Web Push work. Set `VITE_API_BASE` to the backend URL.
- **Backend:** one long-running Python process with a writable disk (Lens jobs, caches, SQLite) and a
  background alert worker. `backend/Dockerfile` builds it; give it about 1 GB of memory and add the
  frontend's URL to `TSUKUYOMI_CORS_ORIGINS`.

## Data sources

Open-Meteo (weather, air quality, elevation) · NASA VIIRS Black Marble via GIBS (light pollution) ·
OpenStreetMap Overpass (spots) · CelesTrak (satellite orbits) · Launch Library 2 (launches) · NOAA SWPC
(Kp index) · ALeRCE / ZTF (transients) · SDSS SkyServer (spectra) · SIMBAD (object names) · NASA SkyView
(survey images) · astrometry.net (plate solving) · ESA/Hubble (sample images) · astronomy-engine (Sun,
Moon, planets, eclipses).

## Honest limits

- The Night Honor Score weights are engineering choices, not a calibrated probability of clear sky.
- Bortle class is an estimate from satellite imagery, not a meter reading.
- Spots are ranked by straight-line distance, with no road, access or safety check.
- Honor checks that a claim is astronomically plausible, not that the person was there.
- Lens honesty metrics are diagnostics, not an absolute guarantee.
