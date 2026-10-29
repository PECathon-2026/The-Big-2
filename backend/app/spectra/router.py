"""Spectra endpoints: SDSS spectrum nearest to a sky position, with measured emission/absorption lines."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query

from ..core.envelope import Envelope, Provenance
from . import sdss

router = APIRouter()


@router.get("/near")
async def near(ra: float = Query(..., ge=0, le=360), dec: float = Query(..., ge=-90, le=90), radius_arcmin: float = Query(1.0, ge=0.05, le=10), limit: int = Query(5, ge=1, le=20)):
    """Spectroscopic objects SDSS has observed within the cone (nearest first)."""
    objs, prov = await sdss.nearest(ra, dec, radius_arcmin, limit)
    return Envelope(data={"ra": ra, "dec": dec, "radius_arcmin": radius_arcmin, "objects": objs}, provenance=[prov])


@router.get("/spectrum/{plate}/{mjd}/{fiberid}")
async def spectrum(plate: int, mjd: int, fiberid: int, run2d: str = Query(..., description="e.g. 26 for legacy SDSS, v5_13_2 for eBOSS"), survey: str = Query("sdss")):
    """One SDSS spectrum, binned for plotting, with the pipeline's measured lines and the expected positions of familiar lines."""
    data, prov = await sdss.spectrum_fits(plate, mjd, fiberid, run2d, survey)
    try:
        spec = await asyncio.to_thread(sdss.parse, data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"could not parse the SDSS spectrum: {e}") from e
    return Envelope(data=spec, provenance=[prov, Provenance(source="computed", note="app/spectra/sdss.py parse: median binning, 3σ line filter")])


@router.get("/at")
async def at(ra: float = Query(..., ge=0, le=360), dec: float = Query(..., ge=-90, le=90), radius_arcmin: float = Query(1.0, ge=0.05, le=10)):
    """Convenience: nearest spectrum to a position in one call (404 when SDSS never observed a spectrum there)."""
    objs, p1 = await sdss.nearest(ra, dec, radius_arcmin, 1)
    if not objs:
        raise HTTPException(404, f"no SDSS spectrum within {radius_arcmin}′ of ({ra:.4f}, {dec:+.4f}); SDSS covers mainly the northern sky away from the Milky Way")
    o = objs[0]
    data, p2 = await sdss.spectrum_fits(o["plate"], o["mjd"], o["fiberid"], o["run2d"], o["survey"])
    spec = await asyncio.to_thread(sdss.parse, data)
    spec["separation_arcsec"] = o["separation_arcsec"]
    return Envelope(data=spec, provenance=[p1, p2])
