import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import settings
from .core.http import ProviderError
from .lens.router import router as lens_router
from .scroll.router import router as scroll_router
from .watchtower.router import router as watchtower_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: make sure the Lens sample images exist, then warm the slow caches (Overpass spots for the
    demo cities) in the background; failures are harmless."""
    from .lens.router import _ensure_samples
    from .watchtower import spots

    await asyncio.to_thread(_ensure_samples)

    async def warm():
        for lat, lon in spots.DEMO_CITIES:
            try:
                await spots.overpass(lat, lon, 60.0)
            except Exception:  # noqa: BLE001
                pass

    task = asyncio.create_task(warm())
    yield
    task.cancel()


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


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
        "version": app.version,
        "demo_replay": settings.demo_replay,
        "astrometry_enabled": bool(settings.astrometry_api_key),
    }


app.include_router(watchtower_router, prefix="/api/watchtower", tags=["watchtower"])
app.include_router(scroll_router, prefix="/api/scroll", tags=["scroll"])
app.include_router(lens_router, prefix="/api/lens", tags=["lens"])
