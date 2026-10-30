"""Job store and the pipeline runner.

A job is an in-memory record plus `data/jobs/<id>/` on disk (the original upload, job.json, arrays.npz and
rendered PNGs). The pipeline runs in a small thread pool so the event loop stays free; stage status is updated
under a lock and can be read while the job is running. Stage names and order follow docs/API.md.
"""
from __future__ import annotations

import json
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from ..core.config import settings
from ..core.envelope import Trace
from . import detect as det
from . import honesty as hon
from . import psf as psfmod
from . import restore
from .detect import RawDetection
from .images import JobArrays
from .io import LoadedImage, load_image
from .models import (
    Counts, DeblurInfo, DenoiseInfo, Detection, ImageInfo, JobInfo, LensResult, NoiseInfo, PSFInfo,
    RestorationInfo, StageInfo, WCSInfo,
)
from .wcs import pixel_to_sky, wcs_from_avm, wcs_summary

STAGES = ("load", "background", "detect", "psf", "denoise", "deblur", "honesty", "classify", "wcs")
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="lens")


def now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Job:
    id: str
    created_at: datetime
    params: dict[str, Any]
    source_filename: str
    status: str = "queued"
    stages: list[StageInfo] = field(default_factory=lambda: [StageInfo(name=s, status="pending") for s in STAGES])
    error: str | None = None
    result: LensResult | None = None
    arrays: JobArrays | None = None
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def dir(self) -> Path:
        d = settings.data_path / "jobs" / self.id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def stage(self, name: str) -> StageInfo:
        return next(s for s in self.stages if s.name == name)

    def start(self, name: str, detail: str | None = None) -> None:
        with self.lock:
            s = self.stage(name)
            s.status, s.started_at, s.ended_at, s.detail = "running", now(), None, detail

    def finish(self, name: str, detail: str | None = None, status: str = "done") -> None:
        with self.lock:
            s = self.stage(name)
            s.status, s.ended_at, s.detail = status, now(), detail

    def info(self) -> JobInfo:
        with self.lock:
            return JobInfo(job_id=self.id, status=self.status, created_at=self.created_at,
                           stages=[s.model_copy() for s in self.stages], error=self.error, result=self.result)

    def persist(self) -> None:
        """Write job.json (and arrays.npz once the pipeline produced arrays)."""
        info = self.info()
        (self.dir / "job.json").write_text(info.model_dump_json(indent=1), encoding="utf-8")
        a = self.arrays
        if a is not None and not (self.dir / "arrays.npz").exists():
            np.savez_compressed(
                self.dir / "arrays.npz", lum=a.lum, rgb=a.rgb if a.rgb is not None else np.zeros(0, np.uint8),
                bkg_map=a.bkg_map, rms_map=a.rms_map, sub=a.sub, denoised=a.denoised, restored=a.restored,
                residual=a.residual, psf_kernel=a.psf_kernel if a.psf_kernel is not None else np.zeros(0),
            )
            meta = {
                "sigma": a.sigma, "bkg_median": a.bkg_median, "psf_fwhm": a.psf_fwhm, "psf_method": a.psf_method,
                "max_valid": a.max_valid, "detect_sigma": a.detect_sigma, "denoise_strength": a.denoise_strength,
                "deblur_iterations": a.deblur_iterations, "dets": [d.__dict__ for d in a.dets],
                "wcs_header": a.wcs.to_header().tostring() if a.wcs is not None else None,
            }
            (self.dir / "arrays.json").write_text(json.dumps(meta), encoding="utf-8")


_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()
_JOB_ID = re.compile(r"[0-9a-f]{12}")


def get_job(job_id: str) -> Job | None:
    if not _JOB_ID.fullmatch(job_id or ""):  # ids are 12 hex chars; anything else must never reach the filesystem
        return None
    with _jobs_lock:
        j = _jobs.get(job_id)
    if j is not None:
        return j
    return _load_from_disk(job_id)


def _load_from_disk(job_id: str) -> Job | None:
    """Rehydrate a finished job after a restart (arrays included) so images and benchmarks keep working."""
    d = settings.data_path / "jobs" / job_id
    p = d / "job.json"
    if not p.exists():
        return None
    try:
        info = JobInfo.model_validate_json(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
    if info.status in ("running", "queued"):  # the worker that owned it died with the old process
        info.status, info.error = "failed", "server restarted before the job finished; submit it again"
    job = Job(id=info.job_id, created_at=info.created_at, params={}, source_filename=info.result.image.source_filename if info.result else "",
              status=info.status, stages=info.stages, error=info.error, result=info.result)
    try:
        if (d / "arrays.npz").exists() and (d / "arrays.json").exists():
            z = np.load(d / "arrays.npz")
            meta = json.loads((d / "arrays.json").read_text(encoding="utf-8"))
            wcs = None
            if meta.get("wcs_header"):
                from astropy.io import fits
                from astropy.wcs import WCS
                wcs = WCS(fits.Header.fromstring(meta["wcs_header"]))
            job.arrays = JobArrays(
                lum=z["lum"], rgb=z["rgb"] if z["rgb"].size else None, bkg_map=z["bkg_map"], rms_map=z["rms_map"],
                sigma=meta["sigma"], bkg_median=meta["bkg_median"], sub=z["sub"], denoised=z["denoised"],
                restored=z["restored"], residual=z["residual"], psf_kernel=z["psf_kernel"] if z["psf_kernel"].size else None,
                psf_fwhm=meta["psf_fwhm"], psf_method=meta["psf_method"], dets=[RawDetection(**x) for x in meta["dets"]],
                max_valid=meta["max_valid"], detect_sigma=meta["detect_sigma"], denoise_strength=meta["denoise_strength"],
                deblur_iterations=meta["deblur_iterations"], wcs=wcs,
            )
    except Exception:  # noqa: BLE001 - job info is still useful without arrays
        job.arrays = None
    with _jobs_lock:
        _jobs[job_id] = job
    return job


def active_count() -> int:
    """Jobs still waiting for or holding a worker; the router refuses new uploads past a small cap."""
    with _jobs_lock:
        return sum(1 for j in _jobs.values() if j.status in ("queued", "running"))


def submit(data: bytes, filename: str, params: dict[str, Any]) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], created_at=now(), params=params, source_filename=filename)
    with _jobs_lock:
        _jobs[job.id] = job
    suffix = Path(filename).suffix.lower() or ".bin"
    (job.dir / f"original{suffix}").write_bytes(data)
    job.persist()
    executor.submit(_run_safely, job, data, filename)
    return job


def _run_safely(job: Job, data: bytes, filename: str) -> None:
    try:
        run_pipeline(job, data, filename)
    except Exception as e:  # noqa: BLE001 - the job records the failure, the server keeps running
        with job.lock:
            job.status = "failed"
            job.error = f"{type(e).__name__}: {e}"
            for s in job.stages:
                if s.status == "running":
                    s.status, s.ended_at, s.detail = "failed", now(), job.error
        job.persist()


def _units_note(wcs_info: WCSInfo) -> str:
    if not wcs_info.solved:
        return ("No WCS: brightness is instrumental (relative, -2.5 log10 of background-subtracted counts in the processed "
                "frame; no zero-point) and sizes are in pixels. Plate-solve the image to get RA/Dec and arcseconds.")
    return (f"WCS from {wcs_info.method}: positions carry RA/Dec and the pixel scale is "
            f"{wcs_info.pixel_scale_arcsec:.3f} arcsec/px (multiply pixel sizes by it). Brightness stays instrumental "
            f"(relative, no photometric zero-point) until calibrated against a catalogue.")


def run_pipeline(job: Job, data: bytes, filename: str) -> None:
    """Execute the nine stages, filling stage details and the final LensResult."""
    p = job.params
    detect_sigma = float(p.get("detect_sigma", 3.0))
    denoise_strength = float(p.get("denoise_strength", 0.5))
    deblur_iterations = int(p.get("deblur_iterations", 0))
    t_start = time.perf_counter()
    with job.lock:
        job.status = "running"
    notes: list[str] = []

    # 1. load
    job.start("load")
    img: LoadedImage = load_image(data, filename)
    detail = f"{img.format} {img.orig_width}x{img.orig_height}, {img.channels} channel(s)"
    if img.scale < 1.0:
        detail += f"; downscaled x{img.scale:.3f} to {img.width}x{img.height} for processing"
        notes.append(f"The image was downscaled by {img.scale:.3f} for processing; every pixel quantity refers to the "
                     f"{img.width}x{img.height} processed frame.")
    if img.is_fits:
        detail += "; FITS header WCS present" if img.wcs is not None else "; no WCS in header"
    job.finish("load", detail)

    # 2. background
    job.start("background")
    bg = det.estimate_background(img.lum)
    sub = (img.lum - bg.bkg_map).astype(np.float32)
    job.finish("background", f"median {bg.median:.4g}, noise sigma {bg.sigma:.4g} (Background2D, {bg.box_size} px boxes)")

    # 3. detect
    job.start("detect")
    dets = det.detect_sources_catalog(sub, bg.rms_map, detect_sigma)
    job.finish("detect", f"{len(dets)} sources above {detect_sigma:g} sigma")

    # 4. psf
    job.start("psf")
    sat_level = (img.max_valid - bg.median) if img.max_valid is not None else None
    pr = psfmod.measure_psf(sub, dets, sat_level)
    job.finish("psf", f"{pr.method}: FWHM {pr.fwhm_px:.2f} px from {pr.n_stars_used} stars" if pr.fwhm_px else f"none: {pr.note}")
    notes.append(f"PSF: {pr.note}.")
    if pr.fwhm_px and len(dets) >= 20:
        sharp = float(np.percentile([d.fwhm for d in dets if d.snr > 10] or [pr.fwhm_px], 10))
        if sharp < 0.75 * pr.fwhm_px:
            notes.append(f"Caution: 10% of sources are sharper (FWHM {sharp:.2f} px) than the measured PSF ({pr.fwhm_px:.2f} px), "
                         f"so the PSF stars may be blends or unresolved clusters and the kernel too wide; deconvolution "
                         f"may over-sharpen. The honesty checks below will show it if so.")

    # 5. denoise
    job.start("denoise")
    dn = restore.denoise(sub, bg.sigma, denoise_strength)
    job.finish("denoise", f"{dn.method}, strength {dn.strength:g} (sigma used {dn.sigma_used:.3g})")

    # 6. deblur
    job.start("deblur")
    db = restore.deblur(dn.image, sub, pr.kernel, pr.method, bg.rms_map, bg.median, deblur_iterations, img.max_valid)
    if db.applied:
        track = ", ".join(f"{i}:{c:.3f}" for i, c in db.chi2_track)
        job.finish("deblur", f"Richardson-Lucy {db.iterations} iterations" + (" (auto)" if deblur_iterations == 0 else "") + f"; chi2 by iteration {track}")
        notes.append(f"Deblur auto-stop track (iterations: reduced chi2): {track}." if deblur_iterations == 0 else
                     f"Deblur ran the requested {db.iterations} iterations (reduced chi2 {db.chi2_track[-1][1]:.3f}).")
    else:
        job.finish("deblur", f"skipped: {db.reason}", status="skipped")
        notes.append(f"Deblurring was not applied: {db.reason}.")

    # 7. honesty
    job.start("honesty")
    report, arrs = hon.evaluate(sub, db.image, pr.kernel, pr.fwhm_px, bg.rms_map, dets, detect_sigma, db.applied, sat_level)
    fm = report.forward_model
    job.finish("honesty", f"chi2 {fm.chi2_reduced:.3f}, structure {fm.structure_score:.2f} -> {fm.verdict}; SSIM {report.ssim:.3f}, PSNR {report.psnr_db:.1f} dB")

    # 8. classify
    job.start("classify")
    counts = det.classify(dets, pr.fwhm_px, pr.method)
    job.finish("classify", f"{counts['stars']} stars, {counts['galaxies']} galaxies, {counts['unknown']} unknown")

    # 9. wcs (FITS header or AVM; astrometry.net only on request)
    job.start("wcs")
    wcs = img.wcs
    method: str | None = "fits-header" if wcs is not None else None
    if wcs is None and not img.is_fits:
        try:
            wcs = wcs_from_avm(img.raw_bytes, img.width, img.height)
            method = "avm" if wcs is not None else None
        except Exception as e:  # noqa: BLE001
            notes.append(f"AVM metadata could not be used: {e}")
    wcs_info = WCSInfo(solved=False)
    if wcs is not None:
        try:
            wcs_info = WCSInfo(solved=True, method=method, **wcs_summary(wcs, img.width, img.height))
            job.finish("wcs", f"{method}: centre RA {wcs_info.ra_center:.4f}, Dec {wcs_info.dec_center:+.4f}; "
                              f"FOV {wcs_info.fov_deg:.3f} deg; {wcs_info.pixel_scale_arcsec:.3f} arcsec/px")
        except Exception as e:  # noqa: BLE001
            wcs, wcs_info = None, WCSInfo(solved=False)
            job.finish("wcs", f"WCS present but unusable ({e}); POST /solve to plate-solve", status="skipped")
    else:
        job.finish("wcs", "no WCS in the file (no FITS header WCS, no AVM metadata); POST /jobs/{id}/solve to plate-solve"
                   + ("" if settings.astrometry_api_key else " (astrometry.net key not configured)"), status="skipped")

    detections = build_detections(dets, wcs)
    elapsed = time.perf_counter() - t_start
    trace = Trace(
        formula=("background = Background2D(median, sigma-clip); detect = threshold(detect_sigma * RMS) -> segmentation + deblend; "
                 "PSF = ePSF(isolated stars) | Gaussian fit; denoise = BayesShrink wavelet(sigma * 2 * strength); "
                 "deblur = Richardson-Lucy(PSF); residual = original - PSF (x) restored; chi2_red = mean(residual^2 / sigma^2); "
                 "structure = var(4x4 block mean) * 16 / var(residual); mag_instr = -2.5 log10(flux)"),
        inputs={
            "detect_sigma": detect_sigma, "denoise_strength": denoise_strength, "deblur_iterations_requested": deblur_iterations,
            "deblur_iterations_used": db.iterations, "background_sigma": bg.sigma, "psf_fwhm_px": pr.fwhm_px,
            "psf_method": pr.method, "n_detections": len(dets), "processing_scale": img.scale, "elapsed_s": round(elapsed, 2),
        },
        notes=notes + [f"Pipeline finished in {elapsed:.1f} s on CPU."],
    )
    result = LensResult(
        image=ImageInfo(width=img.width, height=img.height, channels=img.channels, format=img.format, is_fits=img.is_fits,
                        source_filename=img.source_filename),
        noise=NoiseInfo(background_median=bg.median, background_sigma=bg.sigma, method="photutils Background2D (sigma-clipped median)"),
        psf=PSFInfo(fwhm_px=pr.fwhm_px, method=pr.method, n_stars_used=pr.n_stars_used, kernel_size=pr.kernel_size),
        restoration=RestorationInfo(denoise=DenoiseInfo(method=dn.method, strength=dn.strength),
                                    deblur=DeblurInfo(method=db.method, iterations=db.iterations, applied=db.applied, reason=db.reason)),
        honesty=report, detections=detections, counts=Counts(**counts), wcs=wcs_info, units_note=_units_note(wcs_info), trace=trace,
    )
    job.arrays = JobArrays(
        lum=img.lum, rgb=img.rgb, bkg_map=bg.bkg_map, rms_map=bg.rms_map, sigma=bg.sigma, bkg_median=bg.median, sub=sub,
        denoised=dn.image, restored=db.image, residual=arrs.residual, psf_kernel=pr.kernel, psf_fwhm=pr.fwhm_px,
        psf_method=pr.method, dets=dets, max_valid=img.max_valid, detect_sigma=detect_sigma,
        denoise_strength=denoise_strength, deblur_iterations=deblur_iterations, wcs=wcs,
    )
    with job.lock:
        job.result = result
        job.status = "done"
    job.persist()


def build_detections(dets: list[RawDetection], wcs) -> list[Detection]:
    ra = dec = None
    if wcs is not None and dets:
        try:
            ra, dec = pixel_to_sky(wcs, np.array([d.x for d in dets]), np.array([d.y for d in dets]))
        except Exception:  # noqa: BLE001
            ra = dec = None
    out: list[Detection] = []
    for i, d in enumerate(dets):
        out.append(Detection(
            id=d.id, x=round(d.x, 3), y=round(d.y, 3), flux=float(d.flux), peak=float(d.peak),
            snr=float(d.snr) if np.isfinite(d.snr) else 1e9, fwhm_px=float(d.fwhm), a=float(d.a), b=float(d.b),
            theta_deg=float(d.theta_deg), ellipticity=float(d.ellipticity), kind=d.kind,
            mag_instrumental=det.instrumental_mag(d.flux), size_px=float(2.0 * d.a),
            ra=float(ra[i]) if ra is not None and np.isfinite(ra[i]) else None,
            dec=float(dec[i]) if dec is not None and np.isfinite(dec[i]) else None,
        ))
    return out


def apply_wcs(job: Job, wcs, method: str) -> WCSInfo:
    """Attach a WCS obtained after the pipeline (astrometry.net) to the job result and detections."""
    assert job.result is not None and job.arrays is not None
    w, h = job.result.image.width, job.result.image.height
    info = WCSInfo(solved=True, method=method, **wcs_summary(wcs, w, h))
    dets = build_detections(job.arrays.dets, wcs)
    with job.lock:
        job.arrays.wcs = wcs
        job.result = job.result.model_copy(update={"wcs": info, "detections": dets, "units_note": _units_note(info)})
    (job.dir / "arrays.json").unlink(missing_ok=True)
    (job.dir / "arrays.npz").unlink(missing_ok=True)
    job.persist()
    return info
