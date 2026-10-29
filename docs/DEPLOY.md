# Deploying Tsukuyomi Watch

## The shape

- **Backend**: one FastAPI process (`backend/`), stateless except for small SQLite files (alerts, honor) and the on-disk cache. One instance is enough for a demo.
- **Frontends**: static builds (`frontend-main/dist`, `frontend-basic/dist`). Host anywhere static (Vercel, Netlify, GitHub Pages) with `VITE_API_BASE` pointing at the backend.

## Backend options

### A. Laptop on the venue Wi-Fi (safest for a hackathon)

```bash
cd backend
.venv\Scripts\activate
set TSUKUYOMI_REPLAY_MODE=fallback      # live data, recordings if a provider dies
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Put the laptop's LAN IP (or a Cloudflare quick tunnel: `cloudflared tunnel --url http://localhost:8000`) in the frontend's `VITE_API_BASE` and in `TSUKUYOMI_CORS_ORIGINS`.

### B. Docker (Render, Fly.io, Railway, any VPS)

```bash
cd backend
docker build -t tsukuyomi-backend .
docker run -p 8000:8000 -e TSUKUYOMI_CORS_ORIGINS=https://your-frontend.example -e TSUKUYOMI_ASTROMETRY_API_KEY=... tsukuyomi-backend
```

The image bundles the sample images and the committed replay seed. Give it a persistent volume at `/app/data` if you want alerts, honor ledgers and caches to survive restarts. Memory: 1 GB is comfortable (the Lens pipeline peaks around 500 MB on a 2048 px image).

### Environment variables

| Variable | Purpose |
|---|---|
| `TSUKUYOMI_CORS_ORIGINS` | comma-separated frontend origins |
| `TSUKUYOMI_ASTROMETRY_API_KEY` | enables plate-solving via nova.astrometry.net |
| `TSUKUYOMI_LAUNCH_LIBRARY_KEY` | higher Launch Library 2 rate limit |
| `TSUKUYOMI_REPLAY_MODE` | `off` · `fallback` (recordings only when a provider fails) · `first` (recordings win; fully offline demo) |
| `TSUKUYOMI_DATA_DIR` | where caches, jobs, recordings and SQLite files live |

## Demo-day checklist

1. **Seed the recordings** on a machine with internet, the day before: `python scripts/seed_replay.py` (from `backend/`). It calls every demo endpoint for Bengaluru and Kyoto, runs both Lens samples, pulls two transients with stamps, and copies the recordings into `backend/data/replay-seed/` (commit them). On a fresh clone they are copied into `data/replay` at startup.
2. **Pick the mode**: `fallback` when the venue has internet (live numbers, recordings only on failure); `first` when it does not (instant, deterministic, every response labelled `source: "replay"`).
3. **Pre-warm**: start the backend 5 minutes before the pitch; it pre-warms the Overpass spot queries for the demo cities on startup.
4. **Push alerts** need the frontend on HTTPS or localhost. Subscribe the judge's phone during the pitch and schedule a test alert 1 minute ahead.
5. **Lens**: the synthetic field finishes in ~5 s, the Andromeda JPEG in ~15 s on a laptop CPU. Start a job before you need it.
6. **Keep the Science page open** in a second tab: raw JSON with provenance answers "is this real?" in one click.

## Frontend

```bash
cd frontend-main   # or frontend-basic
npm ci
VITE_API_BASE=https://your-backend.example npm run build
```

Serve `dist/` statically. The service worker (`/sw.js`) must be served from the site root for Web Push to work.

## Known limits in production

- The public Overpass and Open-Meteo elevation services rate-limit bursts; both are cached (24 h and 30 d) and the backend backs off on 429.
- SIMBAD's main host may refuse connections from some networks; the Harvard mirror is tried automatically.
- ZTF/ALeRCE and SDSS are archival services with their own availability; their responses are cached and recordable.
