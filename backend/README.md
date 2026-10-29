# backend — FastAPI service

Everything here is real computation against real data. No mocked numbers reach the API unless `TSUKUYOMI_DEMO_REPLAY=1` is set, and then every response is marked `source: "replay"`.

See the root README for setup, and `app/` for the modules:

- `app/watchtower/` weather, Night Honor Score, spots, light pollution
- `app/scroll/` moon, sun, eclipses, meteor showers, satellite passes, launches, lunar calendar
- `app/lens/` image restoration (denoise, PSF deblur), detection, honesty proof, plate-solve, SkyView
- `app/core/` settings, caching, provider adapters, trace objects
