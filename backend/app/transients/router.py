"""Transients: live ZTF alerts near a field, light curves, real alert stamps, and our own two-epoch subtraction."""
from __future__ import annotations

import gzip
import io
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Response

from ..core import astro
from ..core.envelope import Envelope, Provenance
from ..lens import jobs as lens_jobs
from . import alerce, subtract

router = APIRouter()


def _visibility(ra: float, dec: float, lat: float, lon: float) -> dict:
    """Is this object observable tonight from here: max altitude between dusk and dawn, and when."""
    obs = astro.observer(lat, lon)
    sunset, dusk, dawn, sunrise = astro.night_bounds(lat, lon, datetime.now(timezone.utc))
    zone = astro.tz(lat, lon)
    best, best_t = -90.0, dusk
    t = dusk
    while t <= dawn:
        alt, _ = astro.radec_to_altaz(ra / 15.0, dec, t, obs)
        if alt > best:
            best, best_t = alt, t
        t += timedelta(minutes=20)
    return {"observable_tonight": best > 20, "max_altitude": round(best, 1), "at_local": best_t.astimezone(zone).strftime("%H:%M"), "dusk_local": dusk.astimezone(zone).strftime("%H:%M"), "dawn_local": dawn.astimezone(zone).strftime("%H:%M")}


@router.get("/classes")
async def classes():
    return {"classes": alerce.CLASSES, "classifier": "lc_classifier (ALeRCE light-curve classifier)"}


@router.get("/near")
async def near(ra: float = Query(..., ge=0, le=360), dec: float = Query(..., ge=-90, le=90), radius_arcsec: float = Query(600, ge=5, le=3600), limit: int = Query(20, ge=1, le=100)):
    """ZTF alert objects within a cone, most-detected first."""
    objs, prov = await alerce.cone(ra, dec, radius_arcsec, limit)
    return Envelope(data={"ra": ra, "dec": dec, "radius_arcsec": radius_arcsec, "objects": objs}, provenance=[prov])


@router.get("/recent")
async def recent(class_name: str = Query("SNIa"), min_probability: float = Query(0.5, ge=0, le=1), limit: int = Query(20, ge=1, le=100), lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180)):
    """Live feed: the most recently detected objects of a class, with visibility from the observer when lat/lon are given."""
    objs, prov = await alerce.recent(class_name, min_probability, limit)
    if lat is not None and lon is not None:
        for o in objs:
            if o["ra"] is not None and o["dec"] is not None:
                o["visibility"] = _visibility(o["ra"], o["dec"], lat, lon)
    return Envelope(data={"class": class_name, "min_probability": min_probability, "objects": objs}, provenance=[prov])


@router.get("/field/{job_id}")
async def field(job_id: str, limit: int = Query(20, ge=1, le=100)):
    """Alerts inside a plate-solved Lens job's field of view."""
    job = lens_jobs.get_job(job_id)
    if job is None or job.result is None:
        raise HTTPException(404, "unknown or unfinished Lens job")
    w = job.result.wcs
    if not w.solved:
        raise HTTPException(409, "this job has no WCS yet; solve it first")
    radius = min(3600.0, max(30.0, w.fov_deg * 3600 / 2))
    objs, prov = await alerce.cone(w.ra_center, w.dec_center, radius, limit)
    return Envelope(data={"job_id": job_id, "ra": w.ra_center, "dec": w.dec_center, "radius_arcsec": radius, "objects": objs}, provenance=[prov])


@router.get("/{oid}")
async def object_detail(oid: str, lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180)):
    """One object: record, light curve, top classifier probabilities, and whether it is observable tonight from here."""
    o, p0 = await alerce.obj(oid)
    lc, p1 = await alerce.lightcurve(oid)
    probs, p2 = await alerce.probabilities(oid)
    data = {**o, "lightcurve": lc, "probabilities": probs}
    if lat is not None and lon is not None and o["ra"] is not None:
        data["visibility"] = _visibility(o["ra"], o["dec"], lat, lon)
    return Envelope(data=data, provenance=[p0, p1, p2])


@router.get("/{oid}/lightcurve")
async def lightcurve(oid: str):
    lc, prov = await alerce.lightcurve(oid)
    return Envelope(data=lc, provenance=[prov])


@router.get("/{oid}/stamps/{candid}/{kind}.png")
async def stamp_png(oid: str, candid: str, kind: str):
    """Proxy of the real ZTF alert cutout (science, template or difference) so the UI can show it without CORS trouble."""
    if kind not in ("science", "template", "difference"):
        raise HTTPException(404, "kind must be science, template or difference")
    data, _ = await alerce.stamp(oid, candid, kind, "png")
    return Response(data, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


def _stamp_array(data: bytes) -> np.ndarray:
    from astropy.io import fits

    raw = gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data
    with fits.open(io.BytesIO(raw)) as hdul:
        for h in hdul:
            if h.data is not None and getattr(h.data, "ndim", 0) == 2:
                return np.array(h.data, dtype=np.float64)
    raise ValueError("no 2-D image in stamp")


@router.post("/{oid}/subtract")
async def subtract_stamps(oid: str, candid: str = Query(..., description="A detection's candid from the light curve")):
    """Run our own subtraction on the real ZTF science and template stamps and compare with ZTF's difference image."""
    sci, p1 = await alerce.stamp(oid, candid, "science", "fits")
    tmpl, p2 = await alerce.stamp(oid, candid, "template", "fits")
    try:
        a, b = _stamp_array(tmpl), _stamp_array(sci)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"could not read the FITS stamps: {e}") from e
    res = subtract.difference(a, b)
    arr = res.pop("arrays")
    data = {
        **res,
        "oid": oid,
        "candid": candid,
        "images": {
            "template": subtract.png_b64(arr["old"]),
            "science": subtract.png_b64(arr["new"]),
            "our_difference": subtract.png_b64(arr["diff"], diverging=True),
            "ztf_difference_url": f"/api/transients/{oid}/stamps/{candid}/difference.png",
        },
        "note": "Template = older reference epoch, science = the alert epoch. A real transient shows as a positive blob at the stamp centre in both our difference and ZTF's.",
    }
    return Envelope(data=data, provenance=[p1, p2, Provenance(source="computed", note="app/transients/subtract.py")])


@router.post("/subtract-jobs")
async def subtract_jobs(job_old: str = Query(...), job_new: str = Query(...), nsigma: float = Query(5.0, ge=3, le=20)):
    """Subtract two finished Lens jobs of the same field (old → new). Alignment by phase correlation; same filter expected."""
    ja, jb = lens_jobs.get_job(job_old), lens_jobs.get_job(job_new)
    if not ja or not jb or ja.arrays is None or jb.arrays is None:
        raise HTTPException(404, "both jobs must exist and be finished")
    res = subtract.difference(ja.arrays.lum, jb.arrays.lum, ja.arrays.psf_fwhm or None, jb.arrays.psf_fwhm or None, nsigma=nsigma)
    arr = res.pop("arrays")
    data = {**res, "job_old": job_old, "job_new": job_new, "images": {"old": subtract.png_b64(arr["old"], size=512), "new": subtract.png_b64(arr["new"], size=512), "difference": subtract.png_b64(arr["diff"], diverging=True, size=512)}}
    return Envelope(data=data, provenance=[Provenance(source="computed", note="app/transients/subtract.py")])
