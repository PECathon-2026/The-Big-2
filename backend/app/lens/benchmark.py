"""Synthetic-star injection benchmark.

Known stars (the measured PSF kernel, or a Gaussian of the measured FWHM) are added to a copy of the original
at random empty positions, with fluxes spanning ~4 magnitudes down to a ~5 sigma peak. The copy goes through
detect -> denoise -> deblur -> detect; recovered stars are matched within 2 px and their aperture flux and
centroid compared with the truth. False positives are detections that match neither an injected star nor a
source already present in the original.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import shift as nd_shift
from scipy.spatial import cKDTree

from .detect import detect_sources_catalog
from .honesty import aperture_fluxes
from .images import JobArrays
from .models import BenchmarkResult
from .restore import deblur, denoise

MATCH_PX = 2.0
SUPPORT_SIGMA = 2.5


def _gaussian_kernel(fwhm: float) -> np.ndarray:
    s = fwhm / 2.3548
    size = int(np.clip(round(4 * fwhm), 7, 41)) | 1
    c = size // 2
    yy, xx = np.mgrid[:size, :size]
    k = np.exp(-((xx - c) ** 2 + (yy - c) ** 2) / (2 * s * s))
    return k / k.sum()


def run_benchmark(a: JobArrays, n_stars: int = 40, seed: int = 42) -> BenchmarkResult:
    """Inject `n_stars` synthetic stars and measure how many come back unchanged."""
    if a.psf_kernel is not None:
        kernel = a.psf_kernel / a.psf_kernel.sum()
        fwhm = a.psf_fwhm or 3.0
        kind = f"measured {a.psf_method} kernel"
    else:
        fwhm = float(np.median([d.fwhm for d in a.dets])) if a.dets else 3.0
        kernel = _gaussian_kernel(fwhm)
        kind = f"Gaussian of median detection FWHM {fwhm:.2f} px (no PSF was measured)"
    ks = kernel.shape[0]
    half = ks // 2
    h, w = a.sub.shape
    rng = np.random.default_rng(seed)

    # Flux range: faint end gives a peak of ~5 sigma; bright end is 4 magnitudes (x39.8) brighter.
    peak_per_flux = float(kernel.max())
    f_min = 5.0 * a.sigma / peak_per_flux
    f_max = f_min * 10 ** (4.0 / 2.5)
    fluxes = 10 ** rng.uniform(np.log10(f_min), np.log10(f_max), n_stars)

    occupied = cKDTree([(d.x, d.y) for d in a.dets]) if a.dets else None
    placed: list[tuple[float, float]] = []
    margin = half + 4
    min_sep = max(4.0 * fwhm, ks)
    tries = 0
    while len(placed) < n_stars and tries < 50 * n_stars:
        tries += 1
        x, y = rng.uniform(margin, w - margin), rng.uniform(margin, h - margin)
        if occupied is not None and occupied.query_ball_point((x, y), r=min_sep):
            continue
        if placed and cKDTree(placed).query_ball_point((x, y), r=min_sep):
            continue
        placed.append((x, y))
    n_inj = len(placed)
    fluxes = fluxes[:n_inj]

    injected = a.sub.astype(np.float64).copy()
    yy, xx = np.mgrid[-half: half + 1, -half: half + 1].astype(np.float64)
    for (x, y), f in zip(placed, fluxes):
        xi, yi = int(round(x)), int(round(y))
        dx, dy = x - xi, y - yi
        # sub-pixel placement: shift the kernel grid by bilinear interpolation
        k = nd_shift(kernel, (dy, dx), order=1, mode="constant", cval=0.0)
        k = np.clip(k, 0, None)
        k /= k.sum()
        injected[yi - half: yi + half + 1, xi - half: xi + half + 1] += f * k
    injected = injected.astype(np.float32)

    before = detect_sources_catalog(injected, a.rms_map, a.detect_sigma)
    n_before = len(before)
    dn = denoise(injected, a.sigma, a.denoise_strength)
    db = deblur(dn.image, injected, a.psf_kernel, a.psf_method, a.rms_map, a.bkg_median, a.deblur_iterations, a.max_valid)
    after = detect_sources_catalog(db.image, a.rms_map, a.detect_sigma)

    if not after:
        return BenchmarkResult(injected=n_inj, recovered=0, recovery_rate=0.0, false_positives=0, magnitude_error_rms=None,
                               position_error_rms_px=None, note="no sources detected on the restored copy")
    after_pos = np.array([(d.x, d.y) for d in after])
    tree_after = cKDTree(after_pos)
    truth = np.array(placed)
    dist, idx = tree_after.query(truth, distance_upper_bound=MATCH_PX)
    rec = np.isfinite(dist)
    n_rec = int(rec.sum())

    # Baseline: detections on the injected-but-unrestored copy. Injected stars already found there did not need
    # the restoration; restored-copy detections matching neither an injected star nor a baseline detection
    # (2 px) are what the restoration added on its own: the false positives.
    base_pos = np.array([(d.x, d.y) for d in before]) if before else np.zeros((0, 2))
    base_tree = cKDTree(base_pos) if len(base_pos) else None
    if base_tree is not None:
        bdist, _ = base_tree.query(truth, distance_upper_bound=MATCH_PX)
        rec_before = int(np.isfinite(bdist).sum())
    else:
        rec_before = 0
    matched_after = set(idx[rec].tolist())
    new_pos = [tuple(after_pos[j]) for j in range(len(after_pos))
               if j not in matched_after and not (base_tree is not None and base_tree.query_ball_point(tuple(after_pos[j]), r=MATCH_PX))]
    fp = len(new_pos)
    # How many of those show a real excess in the ORIGINAL pixels (aperture r = FWHM, >= 2.5 sigma)? Those are
    # most likely faint sources below the detection threshold that the restoration lifted, not inventions.
    supported = 0
    if new_pos:
        support = aperture_fluxes(a.sub, np.array(new_pos), fwhm / 2.0)
        ap_noise = a.sigma * np.sqrt(np.pi * max(fwhm, 1.5) ** 2)
        supported = int(np.sum(support >= SUPPORT_SIGMA * ap_noise))
    mag_rms = pos_rms = None
    if n_rec:
        pos_rms = float(np.sqrt(np.mean(dist[rec] ** 2)))
        meas = aperture_fluxes(db.image, after_pos[idx[rec]], fwhm)
        ok = meas > 0
        if ok.any():
            dm = -2.5 * np.log10(meas[ok]) - (-2.5 * np.log10(fluxes[rec][ok]))
            mag_rms = float(np.sqrt(np.mean(dm ** 2)))
    note = (f"{n_inj} stars injected with the {kind}, fluxes {f_min:.0f}..{f_max:.0f} counts (peak 5 sigma to ~4 mag "
            f"brighter). Baseline: {n_before} sources detected on the injected copy before restoration, which already "
            f"found {rec_before} of the injected stars; after denoise + deblur {n_rec} are recovered within {MATCH_PX:.0f} px. "
            f"{fp} detections on the restored copy match neither an injected star nor a baseline detection (false "
            f"positives); of these, {supported} show a >= {SUPPORT_SIGMA:g} sigma excess in the original pixels (likely real "
            f"faint sources below the detection threshold) and {fp - supported} have no support in the original. "
            f"Magnitude error is aperture flux (r = 2 FWHM) on the restored copy vs injected flux.")
    return BenchmarkResult(injected=n_inj, recovered=n_rec, recovery_rate=(n_rec / n_inj if n_inj else 0.0),
                           false_positives=fp, baseline_detections=n_before, recovered_before_restoration=rec_before,
                           magnitude_error_rms=mag_rms, position_error_rms_px=pos_rms, note=note)
