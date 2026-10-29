import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import settings
from .alerts.router import router as alerts_router
from .core.http import ProviderError
from .honor.router import router as honor_router
from .horizon.router import router as horizon_router
from .lens.router import router as lens_router
from .planner.router import router as planner_router
from .scroll.router import router as scroll_router
from .transients.router import router as transients_router
from .watchtower.router import router as watchtower_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: make sure the Lens sample images exist, then warm the slow caches (Overpass spots for the
    demo cities) in the background; failures are harmless."""
    from .lens.router import _ensure_samples
    from .watchtower import spots

    await asyncio.to_thread(_ensure_samples)

    async def warm():
        # Gently: the public Overpass server rate-limits bursts (HTTP 429). 60 km for every demo city, the
        # planner's wider radius only for the first one, with a pause between cold queries.
        jobs = [(lat, lon, 60.0) for lat, lon in spots.DEMO_CITIES] + [(*spots.DEMO_CITIES[0], 110.0)]
        for lat, lon, radius in jobs:
            try:
                await spots.overpass(lat, lon, radius)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(5)

    from .alerts import worker as alert_worker

    tasks = [asyncio.create_task(warm()), asyncio.create_task(alert_worker.run_forever())]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(
    title="Tsukuyomi Watch API",
    version="0.1.0",
    description="The Samurai's Celestial Guide. Every response carries provenance and, for computed numbers, a trace.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ProviderError)
async def provider_error_handler(_, exc: ProviderError):
    return JSONResponse(status_code=502, content={"error": "provider_unavailable", "source": exc.source, "detail": exc.message})


STARTED_AT = datetime.now(timezone.utc)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
        "started_at": STARTED_AT.isoformat(),
        "version": app.version,
        "demo_replay": settings.demo_replay,
        "astrometry_enabled": bool(settings.astrometry_api_key),
    }


app.include_router(watchtower_router, prefix="/api/watchtower", tags=["watchtower"])
app.include_router(scroll_router, prefix="/api/scroll", tags=["scroll"])
app.include_router(lens_router, prefix="/api/lens", tags=["lens"])
app.include_router(alerts_router, prefix="/api/alerts", tags=["alerts"])
app.include_router(honor_router, prefix="/api/honor", tags=["honor"])
app.include_router(transients_router, prefix="/api/transients", tags=["transients"])
app.include_router(planner_router, prefix="/api/planner", tags=["planner"])
app.include_router(horizon_router, prefix="/api/horizon", tags=["horizon"])
