"""Pydantic models for the Spirit Lens contract (docs/API.md, section "Spirit Lens").

Every number in `LensResult` is the output of a real computation on the uploaded pixels; nothing here is a
placeholder. Field names and nesting follow the API document exactly because the frontend is built against it.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from ..core.envelope import Trace


class ImageInfo(BaseModel):
    width: int = Field(description="Width of the processed frame in pixels (see trace.notes if it was downscaled)")
    height: int
    channels: int
    format: str
    is_fits: bool
    source_filename: str


class NoiseInfo(BaseModel):
    background_median: float
    background_sigma: float = Field(description="Background RMS (noise sigma) from photutils Background2D")
    method: str


class PSFInfo(BaseModel):
    fwhm_px: float | None
    method: Literal["epsf", "gaussian-fit", "none"]
    n_stars_used: int
    kernel_size: int


class DenoiseInfo(BaseModel):
    method: str
    strength: float


class DeblurInfo(BaseModel):
    method: str
    iterations: int
    applied: bool
    reason: str | None = None


class RestorationInfo(BaseModel):
    denoise: DenoiseInfo
    deblur: DeblurInfo


class ForwardModel(BaseModel):
    chi2_reduced: float
    residual_rms: float
    structure_score: float
    verdict: Literal["noise-like", "structured"]


class FluxConservation(BaseModel):
    n_stars: int = Field(description="Sources used (same as n_sources; kept for the contract)")
    n_sources: int = 0
    n_saturated_excluded: int = 0
    median_ratio: float | None
    max_abs_dev_pct: float | None
    within_5pct_fraction: float | None


class PositionShift(BaseModel):
    n_stars: int
    median_shift_px: float | None
    max_shift_px: float | None


class HonestyReport(BaseModel):
    ssim: float
    psnr_db: float
    forward_model: ForwardModel
    flux_conservation: FluxConservation
    position_shift: PositionShift
    invented_pixels: int
    notes: list[str]


class Detection(BaseModel):
    id: int
    x: float
    y: float
    flux: float
    peak: float
    snr: float
    fwhm_px: float
    a: float = Field(description="Semi-major axis (1-sigma length of the light distribution), pixels")
    b: float
    theta_deg: float
    ellipticity: float
    kind: Literal["star", "galaxy", "unknown"]
    mag_instrumental: float
    size_px: float = Field(description="2 x semi-major axis, pixels")
    ra: float | None = None
    dec: float | None = None
    name: str | None = None


class Counts(BaseModel):
    stars: int
    galaxies: int
    unknown: int


class WCSInfo(BaseModel):
    solved: bool
    method: Literal["fits-header", "avm", "astrometry.net"] | None = None
    ra_center: float | None = None
    dec_center: float | None = None
    fov_deg: float | None = None
    pixel_scale_arcsec: float | None = None
    orientation_deg: float | None = None


class LensResult(BaseModel):
    image: ImageInfo
    noise: NoiseInfo
    psf: PSFInfo
    restoration: RestorationInfo
    honesty: HonestyReport
    detections: list[Detection]
    counts: Counts
    wcs: WCSInfo
    units_note: str
    trace: Trace


class StageInfo(BaseModel):
    name: str
    status: Literal["pending", "running", "done", "failed", "skipped"]
    started_at: datetime | None = None
    ended_at: datetime | None = None
    detail: str | None = None


class JobInfo(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "failed"]
    created_at: datetime
    stages: list[StageInfo]
    error: str | None = None
    result: LensResult | None = None


class JobAccepted(BaseModel):
    job_id: str
    status: str


class BenchmarkResult(BaseModel):
    injected: int
    recovered: int
    recovery_rate: float
    false_positives: int
    baseline_detections: int = Field(0, description="Detections on the injected-but-unrestored copy")
    recovered_before_restoration: int = Field(0, description="Injected stars already found without restoration")
    magnitude_error_rms: float | None
    position_error_rms_px: float | None
    note: str


class SampleInfo(BaseModel):
    id: str
    name: str
    description: str
    kind: Literal["synthetic", "real"]
    has_wcs: bool
    credit: str | None = None


class CatalogMatch(BaseModel):
    detection_id: int
    name: str
    otype: str | None
    ra: float
    dec: float
    separation_arcsec: float


class CatalogResult(BaseModel):
    matches: list[CatalogMatch]
    queried: int
    note: str | None = None
