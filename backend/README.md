# backend — FastAPI service

Everything here is real computation against real data. No mocked numbers reach the API. If an upstream provider fails, the response is served from the disk cache (marked `stale: true`) or, with `TSUKUYOMI_DEMO_REPLAY=1`, from a recorded response (marked `source: "replay"`). Otherwise the endpoint returns HTTP 502 `provider_unavailable` and says which provider failed.

```bash
python -m venv .venv && .venv\Scripts\activate      # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000             # docs at http://localhost:8000/docs
python -m pytest -q                                    # unit tests, no network needed for scroll/watchtower
```

Contract: `../docs/API.md`.

## Modules

| Path | What it does | Data |
|---|---|---|
| `app/core/config.py` | Settings from `TSUKUYOMI_*` env vars / `.env` | |
| `app/core/cache.py` | TTL cache (memory + `data/cache/*.json`), replay store (`data/replay/`) | |
| `app/core/http.py` | `fetch()`: fresh cache → live call with retries → stale cache → replay → `ProviderError` | |
| `app/core/envelope.py` | `Provenance`, `Trace`, `Contribution`, `Envelope` | |
| `app/core/astro.py` | astronomy-engine helpers: topocentric alt/az, rise/set, twilight, night bounds, moon age, time zones | astronomy-engine, timezonefinder |
| `app/watchtower/openmeteo.py` | Hourly forecast (multi-point), air quality (AOD), ensemble spread, elevation | Open-Meteo |
| `app/watchtower/score.py` | **Night Honor Score**: `darkness(sun alt) × 100 × Σ wᵢqᵢ` per hour; best window; verdict; dew/cold/wind warnings; full trace | computed |
| `app/watchtower/lightpollution.py` | Samples the VIIRS Black Marble tile at a point → brightness → approximate Bortle (monotonic, uncalibrated) | NASA GIBS |
| `app/watchtower/spots.py` | Peaks, viewpoints and hilltop temples from OpenStreetMap; each scored with the Night Honor model; ranked `night × darkness × elevation − travel` | Overpass, Open-Meteo, GIBS |
| `app/scroll/moon.py` | Phase, illumination, age, Japanese moon name, rise/set, next quarters, libration, alert text | computed |
| `app/scroll/sun.py` | Sunset, twilights, dark hours | computed |
| `app/scroll/eclipses.py` | Lunar and solar eclipses with local circumstances | computed |
| `app/scroll/meteors.py` | Active showers; `HR = ZHR_now · sin(h) / r^(6.5−LM)` hour by hour | IMO working list (`data/meteor_showers.json`) + computed |
| `app/scroll/satellites.py` | ISS/Tiangong/Hubble passes: SGP4 → ECEF → alt/az; visible only when observer dark and satellite sunlit | CelesTrak TLEs |
| `app/scroll/launches.py` | Upcoming launches with distance and trail-visibility hint | Launch Library 2 (cached 60 min) |
| `app/scroll/calendar_lunar.py` | 旧暦 months from true new moons; 24 sekki and 72 kō from the Sun's longitude | computed |
| `app/scroll/planets.py` | Planet alt/az, magnitude, rise/set, separation from the Moon | computed |
| `app/scroll/events.py` | One feed of everything above with local times and "visible from here" | |
| `app/scroll/ics.py` | iCalendar export | |
| `app/lens/` | Spirit Lens image pipeline: load → background → detect → PSF → denoise → deblur → honesty → classify → WCS; SkyView cutouts; SIMBAD matches; synthetic-star benchmark | photutils, scikit-image, astropy, NASA SkyView, astrometry.net, SIMBAD |

## Night Honor Score weights

| Factor | Weight | Quality q |
|---|---|---|
| Low cloud | 0.30 | 1 − cover/100 |
| Mid cloud | 0.15 | 1 − cover/100 |
| High cloud | 0.08 | 1 − 0.6·cover/100 |
| Humidity / dew risk | 0.12 | 1 up to 60 % RH, linear to 0 at 100 % |
| Transparency | 0.10 | mean of visibility/20 km and 1 − (AOD − 0.1)/0.6 |
| Moonlight | 0.15 | 1 − illumination·min(1, 1.4·sin(moon alt)) while the Moon is up |
| Light pollution | 0.10 | (9 − Bortle)/8 |

Darkness gate: 1 below −18° Sun altitude, 0 above −6°, linear between. Unknown factors are excluded and the remaining weights renormalised; the trace says so.

## Data folders

- `data/cache/` cached provider responses (ignored by git)
- `data/replay/` recorded responses for demo replay (ignored by git)
- `data/jobs/` Spirit Lens jobs: originals and rendered PNGs (ignored by git)
- `data/samples/` sample images for the Lens (synthetic field generated at startup; real ESA/Hubble images downloaded when possible)
- `data/meteor_showers.json` IMO shower table

## Known limits (said honestly in the UI)

- Bortle values are an estimate from a rendered radiance layer, not a calibrated sky-brightness measurement.
- Lunar month numbering follows the winter-solstice rule without leap-month insertion.
- Meteor radiants are fixed at their peak position (daily drift ignored).
- The public Overpass server can take a minute on a cold query; results are cached for a day and the demo cities are pre-warmed at startup.
