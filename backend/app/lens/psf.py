"""PSF measurement from the image itself.

Isolated, unsaturated, star-like detections are cut out and combined into an effective PSF (photutils
`EPSFBuilder`). If that fails or too few stars qualify, a 2-D Gaussian is fitted to the median star cutout.
With no usable star at all the method is `none`, and deblurring is refused downstream.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
from astropy.modeling import fitting, models
from astropy.nddata import NDData
from astropy.table import Table
from photutils.psf import EPSFBuilder, extract_stars
from scipy.spatial import cKDTree

from .detect import RawDetection

MIN_STARS_EPSF = 8
MAX_STARS = 30
GAUSS_FWHM = 2.0 * np.sqrt(2.0 * np.log(2.0))  # 2.3548


@dataclass
class PSFResult:
    method: str                      # epsf | gaussian-fit | none
    fwhm_px: float | None
    n_stars_used: int
    kernel: np.ndarray | None        # normalised, odd-sized, sums to 1
    kernel_size: int
    note: str


def _select_stars(dets: list[RawDetection], shape: tuple[int, int], sat_level: float | None) -> tuple[list[RawDetection], int]:
    """Pick PSF stars: high SNR, round, not saturated, not at the edge, with no neighbour inside the cutout."""
    cands = [d for d in dets if d.snr > 15 and d.ellipticity < 0.25 and np.isfinite(d.fwhm) and d.fwhm > 0.8]
    if not cands:
        return [], 11
    fwhm_med = float(np.median([d.fwhm for d in cands[:60]]))
    size = int(np.clip(round(5 * fwhm_med), 11, 41)) | 1
    half = size // 2 + 1
    h, w = shape
    if sat_level is not None:
        cands = [d for d in cands if d.peak < 0.85 * sat_level]
    else:
        # Float data: treat a repeated flat maximum as saturation.
        peaks = np.array([d.peak for d in dets])
        top = peaks.max() if len(peaks) else 0.0
        cands = [d for d in cands if d.peak < 0.98 * top or (peaks >= 0.98 * top).sum() < 3]
    cands = [d for d in cands if 0.6 * fwhm_med <= d.fwhm <= 1.5 * fwhm_med]
    cands = [d for d in cands if half <= d.x < w - half and half <= d.y < h - half]
    if not cands:
        return [], size
    tree = cKDTree([(d.x, d.y) for d in dets])
    isolated: list[RawDetection] = []
    for d in cands:
        neigh = tree.query_ball_point((d.x, d.y), r=size)
        if len(neigh) == 1:
            isolated.append(d)
    isolated.sort(key=lambda d: d.snr, reverse=True)
    return isolated[:MAX_STARS], size


def _cutouts(data: np.ndarray, stars: list[RawDetection], size: int) -> np.ndarray:
    half = size // 2
    out = []
    for d in stars:
        xi, yi = int(round(d.x)), int(round(d.y))
        c = data[yi - half: yi + half + 1, xi - half: xi + half + 1].astype(np.float64)
        if c.shape == (size, size) and c.sum() > 0:
            out.append(c / c.sum())
    return np.array(out)


def _fit_gaussian(img: np.ndarray) -> tuple[float, float, float, float, float] | None:
    """Fit Gaussian2D(x_mean, y_mean, sx, sy, theta) to a square cutout; returns (sx, sy, theta, x0, y0)."""
    size = img.shape[0]
    yy, xx = np.mgrid[:size, :size]
    c = size // 2
    amp = float(img.max())
    g = models.Gaussian2D(amplitude=amp, x_mean=c, y_mean=c, x_stddev=1.5, y_stddev=1.5, theta=0.0)
    g.x_stddev.bounds = (0.4, size / 2)
    g.y_stddev.bounds = (0.4, size / 2)
    g.x_mean.bounds = (c - 3, c + 3)
    g.y_mean.bounds = (c - 3, c + 3)
    fitter = fitting.TRFLSQFitter()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fit = fitter(g, xx, yy, img, maxiter=200)
    except Exception:  # noqa: BLE001
        return None
    sx, sy = float(fit.x_stddev.value), float(fit.y_stddev.value)
    if not (np.isfinite(sx) and np.isfinite(sy)) or sx <= 0 or sy <= 0:
        return None
    return sx, sy, float(fit.theta.value), float(fit.x_mean.value), float(fit.y_mean.value)


def _gaussian_kernel(size: int, sx: float, sy: float, theta: float) -> np.ndarray:
    c = size // 2
    yy, xx = np.mgrid[:size, :size]
    g = models.Gaussian2D(amplitude=1.0, x_mean=c, y_mean=c, x_stddev=sx, y_stddev=sy, theta=theta)
    k = np.asarray(g(xx, yy), dtype=np.float64)
    return k / k.sum()


def measure_psf(data_sub: np.ndarray, dets: list[RawDetection], sat_level: float | None) -> PSFResult:
    """Measure the PSF: ePSF from >= 8 isolated stars, else a Gaussian fit to the median star, else none."""
    stars, size = _select_stars(dets, data_sub.shape, sat_level)
    if not stars:
        return PSFResult("none", None, 0, None, 0, "no isolated, unsaturated, star-like source with SNR > 15 was found")

    if len(stars) >= MIN_STARS_EPSF:
        try:
            res = _build_epsf(data_sub, stars, size)
            if res is not None:
                return res
        except Exception as e:  # noqa: BLE001 - fall back to the Gaussian fit
            note = f"EPSFBuilder failed ({type(e).__name__}); "
        else:
            note = "EPSF did not converge to a sane kernel; "
    else:
        note = f"only {len(stars)} usable stars (< {MIN_STARS_EPSF} needed for an ePSF); "

    cut = _cutouts(data_sub, stars, size)
    if len(cut) == 0:
        return PSFResult("none", None, 0, None, 0, note + "no clean cutouts")
    median = np.median(cut, axis=0)
    fit = _fit_gaussian(median)
    if fit is None:
        return PSFResult("none", None, 0, None, 0, note + "Gaussian fit to the median star failed")
    sx, sy, theta, _, _ = fit
    fwhm = GAUSS_FWHM * float(np.sqrt(sx * sy))
    if not (0.8 <= fwhm <= size):
        return PSFResult("none", None, 0, None, 0, note + f"fitted FWHM {fwhm:.2f} px is not plausible")
    ksize = int(np.clip(round(4 * fwhm), 7, 41)) | 1
    kernel = _gaussian_kernel(ksize, sx, sy, theta)
    return PSFResult("gaussian-fit", fwhm, len(cut), kernel, ksize,
                     note + f"2-D Gaussian fitted to the median of {len(cut)} star cutouts")


def _build_epsf(data_sub: np.ndarray, stars: list[RawDetection], size: int) -> PSFResult | None:
    tbl = Table({"x": [d.x for d in stars], "y": [d.y for d in stars]})
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        star_cuts = extract_stars(NDData(data=data_sub.astype(np.float64)), tbl, size=size)
        if len(star_cuts) < MIN_STARS_EPSF:
            return None
        builder = EPSFBuilder(oversampling=2, maxiters=6, progress_bar=False)
        epsf, fitted = builder(star_cuts)
        half = size // 2
        yy, xx = np.mgrid[-half: half + 1, -half: half + 1].astype(np.float64)
        kernel = np.asarray(epsf.evaluate(xx, yy, 1.0, 0.0, 0.0), dtype=np.float64)
    kernel = np.where(np.isfinite(kernel), kernel, 0.0)
    kernel[kernel < 0] = 0.0
    if kernel.sum() <= 0:
        return None
    kernel /= kernel.sum()
    fit = _fit_gaussian(kernel)
    if fit is None:
        return None
    sx, sy, _, x0, y0 = fit
    fwhm = GAUSS_FWHM * float(np.sqrt(sx * sy))
    if not (0.8 <= fwhm <= size / 1.5) or abs(x0 - half) > 1.5 or abs(y0 - half) > 1.5:
        return None
    n_used = int(getattr(fitted, "n_good_stars", len(stars)))
    return PSFResult("epsf", fwhm, n_used, kernel, size,
                     f"effective PSF built from {n_used} isolated stars (EPSFBuilder, oversampling 2)")
