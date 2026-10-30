"""Spirit Lens router: honest image restoration. Contract in docs/API.md, section "Spirit Lens"."""
from __future__ import annotations

import asyncio
import threading
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response

from ..core.config import settings
from ..core.envelope import Envelope, Provenance
from ..core.http import ProviderError
from . import benchmark as bench
from . import catalog as cat
from . import images
from . import jobs as jobstore
from . import samples
from . import skyview as sv
from .models import BenchmarkResult, CatalogResult, JobAccepted, JobInfo, JobSummary, SampleInfo
from .wcs import AstrometryError, solve_astrometry

router = APIRouter()
MAX_UPLOAD_BYTES = 120 * 1024 * 1024
_solving: set[str] = set()
_samples_ready = threading.Event()


def _ensure_samples() -> None:
    if not _samples_ready.is_set():
        samples.ensure_samples(download=True)
        _samples_ready.set()


@router.get("/status")
async def status():
    return {"status": "ok", "astrometry_enabled": bool(settings.astrometry_api_key), "stages": list(jobstore.STAGES)}


# ---------------------------------------------------------------------------------------------- samples

@router.get("/samples", response_model=list[SampleInfo])
async def list_samples():
    """Sample images: the synthetic field with known truth, plus real ESA/Hubble images when the download worked."""
    await asyncio.to_thread(_ensure_samples)
    out = []
    for s in samples.load_manifest():
        if (samples.samples_dir() / s["file"]).exists():
            out.append(SampleInfo(id=s["id"], name=s["name"], description=s["description"], kind=s["kind"],
                                  has_wcs=bool(s.get("has_wcs")), credit=s.get("credit")))
    return out


@router.get("/samples/{sample_id}")
async def get_sample(sample_id: str):
    await asyncio.to_thread(_ensure_samples)
    p = samples.sample_path(sample_id)
    if p is None:
        raise HTTPException(404, f"unknown sample {sample_id!r}")
    return FileResponse(p)


# ---------------------------------------------------------------------------------------------- jobs

@router.post("/jobs", status_code=202, response_model=JobAccepted)
async def create_job(
    file: UploadFile | None = File(None),
    denoise_strength: float = Form(0.5, ge=0.0, le=1.0),
    deblur_iterations: int = Form(0, ge=0, le=100),
    detect_sigma: float = Form(3.0, ge=1.0, le=20.0),
    sample_id: str | None = Form(None),
):
    """Upload an image (JPG/PNG/TIFF/FITS) or name a sample; the pipeline runs asynchronously."""
    if file is None and not sample_id:
        raise HTTPException(400, "provide a file or a sample_id")
    if sample_id:
        await asyncio.to_thread(_ensure_samples)
        p = samples.sample_path(sample_id)
        if p is None:
            raise HTTPException(404, f"unknown sample {sample_id!r}")
        data, filename = p.read_bytes(), p.name
    else:
        assert file is not None
        data = await file.read()
        filename = Path(file.filename or "upload").name
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"file larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    if not data:
        raise HTTPException(400, "empty file")
    job = jobstore.submit(data, filename, {
        "denoise_strength": denoise_strength, "deblur_iterations": deblur_iterations, "detect_sigma": detect_sigma,
        "sample_id": sample_id,
    })
    return JobAccepted(job_id=job.id, status=job.status)


def _get(job_id: str) -> jobstore.Job:
    job = jobstore.get_job(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job {job_id!r}")
    return job


def _get_done(job_id: str) -> jobstore.Job:
    job = _get(job_id)
    if job.status != "done" or job.result is None or job.arrays is None:
        raise HTTPException(409, f"job {job_id} is {job.status}; this endpoint needs a finished job")
    return job


@router.get("/jobs", response_model=list[JobSummary])
async def list_jobs(limit: int = Query(50, ge=1, le=200)):
    """The Dojo dashboard: past restoration jobs, newest first, with their honesty headline numbers."""
    return await asyncio.to_thread(jobstore.list_jobs, limit)


@router.get("/jobs/{job_id}", response_model=JobInfo)
async def get_job(job_id: str):
    return _get(job_id).info()


@router.get("/jobs/{job_id}/image/{kind}")
async def get_image(job_id: str, kind: str, stretch: str = Query("asinh", pattern="^(asinh|linear)$")):
    """PNG of one stage. `overlay` draws detection ellipses (gold stars, grey galaxies, red unknown)."""
    if kind not in images.KINDS:
        raise HTTPException(404, f"unknown image kind {kind!r}; one of {', '.join(images.KINDS)}")
    job = _get_done(job_id)
    cached = job.dir / f"image_{kind}_{stretch}.png"
    if cached.exists():
        return Response(cached.read_bytes(), media_type="image/png")
    assert job.arrays is not None
    png = await asyncio.to_thread(images.render, job.arrays, kind, stretch)
    try:
        cached.write_bytes(png)
    except OSError:
        pass
    return Response(png, media_type="image/png")


@router.post("/jobs/{job_id}/benchmark", response_model=BenchmarkResult)
async def run_benchmark(job_id: str, n_stars: int = Query(40, ge=5, le=200)):
    """Inject synthetic stars of the measured PSF and report how many the pipeline recovers without inventing extras."""
    job = _get_done(job_id)
    assert job.arrays is not None
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(jobstore.executor, bench.run_benchmark, job.arrays, n_stars)


# ---------------------------------------------------------------------------------------------- sky

@router.post("/jobs/{job_id}/solve")
async def solve(job_id: str):
    """Start a nova.astrometry.net plate solve from the detected source list. Progress shows in the `wcs` stage."""
    if not settings.astrometry_api_key:
        raise HTTPException(400, "plate solving needs an astrometry.net API key: set TSUKUYOMI_ASTROMETRY_API_KEY on the server")
    job = _get_done(job_id)
    if job.id in _solving:
        return {"job_id": job.id, "status": "solving", "wcs": job.stage("wcs").model_dump(mode="json")}
    assert job.arrays is not None and job.result is not None
    dets = job.arrays.dets
    if len(dets) < 5:
        raise HTTPException(400, f"only {len(dets)} sources detected; a plate solve needs at least 5")
    _solving.add(job.id)
    job.start("wcs", "astrometry.net: starting")
    job.persist()

    async def _run() -> None:
        import numpy as np
        try:
            xs = np.array([d.x for d in dets]); ys = np.array([d.y for d in dets]); fl = np.array([d.flux for d in dets])
            w, _hdr = await solve_astrometry(xs, ys, fl, job.result.image.width, job.result.image.height,
                                             on_progress=lambda m: job.start("wcs", f"astrometry.net: {m}"))
            info = jobstore.apply_wcs(job, w, "astrometry.net")
            job.finish("wcs", f"astrometry.net: centre RA {info.ra_center:.4f}, Dec {info.dec_center:+.4f}; FOV {info.fov_deg:.3f} deg; "
                              f"{info.pixel_scale_arcsec:.3f} arcsec/px")
        except (AstrometryError, Exception) as e:  # noqa: BLE001
            job.finish("wcs", f"astrometry.net failed: {e}", status="failed")
        finally:
            _solving.discard(job.id)
            job.persist()

    asyncio.create_task(_run())
    return {"job_id": job.id, "status": "solving", "wcs": job.stage("wcs").model_dump(mode="json")}


@router.get("/jobs/{job_id}/skyview")
async def skyview(job_id: str, survey: str = Query("DSS2 Red")):
    """Archival survey cutout of the same field from NASA SkyView (404 until the WCS is known)."""
    job = _get_done(job_id)
    assert job.result is not None
    w = job.result.wcs
    if not w.solved or w.ra_center is None:
        raise HTTPException(404, "WCS unknown for this job; plate-solve first")
    try:
        png, prov = await sv.fetch_cutout(w.ra_center, w.dec_center, w.fov_deg, survey)
    except ProviderError as e:
        raise HTTPException(502, f"SkyView unavailable: {e.message}") from e
    headers = {"X-Provenance-Source": prov.source, "X-Provenance-Cached": str(prov.cached).lower(),
               "X-Survey": survey, "Cache-Control": "public, max-age=604800"}
    return Response(png, media_type="image/png", headers=headers)


@router.get("/jobs/{job_id}/catalog", response_model=Envelope[CatalogResult])
async def catalog(job_id: str):
    """SIMBAD matches for the ten brightest detections (needs a WCS). Fails soft with an empty list."""
    job = _get_done(job_id)
    assert job.result is not None
    w = job.result.wcs
    if not w.solved or w.pixel_scale_arcsec is None:
        raise HTTPException(404, "WCS unknown for this job; plate-solve first")
    matches, note, prov = await cat.simbad_matches(job.result.detections, w.pixel_scale_arcsec, job.result.psf.fwhm_px)
    for m in matches:
        for d in job.result.detections:
            if d.id == m.detection_id:
                d.name = m.name
    job.persist()
    provs = [prov] if prov else [Provenance(source="simbad", note=note)]
    return Envelope(data=CatalogResult(matches=matches, queried=min(10, len(job.result.detections)), note=note), provenance=provs)
