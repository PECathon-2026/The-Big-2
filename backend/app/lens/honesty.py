"""Proof of Honesty: did the restoration invent anything?

All checks run on the background-subtracted luminance arrays:
  * SSIM / PSNR between original and restored;
  * forward model: re-blur the restored image with the measured PSF and compare with the original; the residual
    should look like pure noise (reduced chi-squared ~ 1, no low-frequency structure);
  * flux conservation per detected source (aperture photometry before and after);
  * centroid shifts (re-detection on the restored frame, matched within 3 px);
  * "invented pixels": connected blobs (>= 4 px) of residual beyond 5 sigma.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
from photutils.aperture import ApertureStats, CircularAnnulus, CircularAperture, aperture_photometry
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree
from skimage.measure import label as cc_label
from skimage.metrics import peak_signal_noise_ratio, structural_similarity

from .detect import RawDetection, detect_sources_catalog
from .models import FluxConservation, ForwardModel, HonestyReport, PositionShift

STRUCTURE_THRESHOLD = 2.5
MATCH_RADIUS_PX = 3.0
MAX_PHOT_SOURCES = 40
MIN_PHOT_SOURCES = 5


@dataclass
class HonestyArrays:
    model: np.ndarray
    residual: np.ndarray


def structure_score(residual: np.ndarray, block: int = 4) -> float:
    """Low-frequency power fraction of the residual.

    Average the residual in block x block cells; for white noise the variance of the cell means is var/block^2,
    so var(block_mean) * block^2 / var(residual) ~ 1. Values well above 1 mean the residual has spatial
    structure (something was added or removed coherently), not just noise.
    """
    h, w = residual.shape
    h2, w2 = (h // block) * block, (w // block) * block
    r = residual[:h2, :w2].astype(np.float64)
    var = float(r.var())
    if var <= 0:
        return 0.0
    bm = r.reshape(h2 // block, block, w2 // block, block).mean(axis=(1, 3))
    return float(bm.var() * block * block / var)


def forward_model(original_sub: np.ndarray, restored: np.ndarray, psf: np.ndarray | None, rms_map: np.ndarray) -> tuple[ForwardModel, HonestyArrays]:
    """model = PSF (x) restored (or restored itself when no PSF), residual = original - model."""
    rest = restored.astype(np.float64)
    model = fftconvolve(rest, psf, mode="same") if psf is not None else rest
    residual = original_sub.astype(np.float64) - model
    sig = np.maximum(rms_map.astype(np.float64), 1e-9)
    chi2 = float(np.mean((residual / sig) ** 2))
    rms = float(np.sqrt(np.mean(residual ** 2)))
    score = structure_score(residual)
    verdict = "noise-like" if score < STRUCTURE_THRESHOLD else "structured"
    return (ForwardModel(chi2_reduced=chi2, residual_rms=rms, structure_score=score, verdict=verdict),
            HonestyArrays(model=model.astype(np.float32), residual=residual.astype(np.float32)))


def aperture_radius(fwhm: float) -> float:
    return max(2.0 * fwhm, 3.0)


def aperture_fluxes(img: np.ndarray, positions: np.ndarray, fwhm: float, radii: np.ndarray | None = None) -> np.ndarray:
    """Local-background-subtracted circular aperture flux at each position.

    Default radius r = 2 FWHM (annulus 2r..3r). With `radii`, each source gets its own aperture, so extended
    objects are measured whole: deconvolution conserves total flux, not the fraction inside a small circle.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if radii is None:
            r = aperture_radius(fwhm)
            ap = CircularAperture(positions, r=r)
            ann = CircularAnnulus(positions, r_in=2.0 * r, r_out=3.0 * r)
            bkg = np.nan_to_num(np.asarray(ApertureStats(img, ann).median, dtype=np.float64))
            return np.asarray(aperture_photometry(img, ap)["aperture_sum"], dtype=np.float64) - bkg * ap.area
        out = np.zeros(len(positions), dtype=np.float64)
        for i, ((x, y), r) in enumerate(zip(positions, radii)):
            ap = CircularAperture((float(x), float(y)), r=float(r))
            ann = CircularAnnulus((float(x), float(y)), r_in=2.0 * float(r), r_out=3.0 * float(r))
            bkg = float(np.nan_to_num(ApertureStats(img, ann).median))
            out[i] = float(aperture_photometry(img, ap)["aperture_sum"][0]) - bkg * ap.area
        return out


def flux_conservation(original_sub: np.ndarray, restored: np.ndarray, dets: list[RawDetection], fwhm: float | None,
                      sigma: float, sat_level: float | None = None) -> FluxConservation:
    """Ratio restored/original aperture flux for the brightest 40 unsaturated detections (SNR > 10), any class.

    Aperture flux conservation is meaningful for extended sources too, so stars and galaxies are both used, each
    with an aperture of r = max(2 FWHM, 3 x semi-major axis) that contains the whole object.
    Saturated sources (peak >= 95 % of the format's clipping level) are excluded: their true flux is unknown.
    With fewer than 5 usable sources no fractions are reported.
    """
    cands = [d for d in dets if d.snr > 10]
    saturated = [d for d in cands if sat_level is not None and d.peak >= 0.95 * sat_level]
    use = [d for d in cands if d not in saturated][:MAX_PHOT_SOURCES]
    empty = FluxConservation(n_stars=0, n_sources=0, n_saturated_excluded=len(saturated), median_ratio=None,
                             max_abs_dev_pct=None, within_5pct_fraction=None)
    if len(use) < MIN_PHOT_SOURCES:
        return empty
    f = fwhm if fwhm else float(np.median([d.fwhm for d in use]))
    pos = np.array([(d.x, d.y) for d in use])
    radii = np.array([max(aperture_radius(f), 3.0 * d.a) for d in use])  # whole object, also for galaxies
    f0 = aperture_fluxes(original_sub, pos, f, radii)
    f1 = aperture_fluxes(restored, pos, f, radii)
    ok = f0 > 0
    if ok.sum() < MIN_PHOT_SOURCES:
        return empty
    ratio = f1[ok] / f0[ok]
    dev = np.abs(ratio - 1.0) * 100.0
    n = int(ok.sum())
    return FluxConservation(
        n_stars=n, n_sources=n, n_saturated_excluded=len(saturated), median_ratio=float(np.median(ratio)),
        max_abs_dev_pct=float(dev.max()), within_5pct_fraction=float(np.mean(dev <= 5.0)),
    )


def position_shift(dets: list[RawDetection], restored: np.ndarray, rms_map: np.ndarray, detect_sigma: float) -> tuple[PositionShift, list[RawDetection]]:
    """Re-detect on the restored frame and match to the original detections within 3 px."""
    rest_dets = detect_sources_catalog(restored, rms_map, detect_sigma)
    if not dets or not rest_dets:
        return PositionShift(n_stars=0, median_shift_px=None, max_shift_px=None), rest_dets
    tree = cKDTree([(d.x, d.y) for d in rest_dets])
    dist, _ = tree.query([(d.x, d.y) for d in dets], distance_upper_bound=MATCH_RADIUS_PX)
    m = np.isfinite(dist)
    if m.sum() == 0:
        return PositionShift(n_stars=0, median_shift_px=None, max_shift_px=None), rest_dets
    return PositionShift(n_stars=int(m.sum()), median_shift_px=float(np.median(dist[m])), max_shift_px=float(dist[m].max())), rest_dets


def invented_pixels(residual: np.ndarray, rms_map: np.ndarray, n_sigma: float = 5.0, min_blob: int = 4) -> int:
    """Pixels where |residual| > 5 sigma that sit in connected blobs of >= 4 pixels (structured excursions)."""
    mask = np.abs(residual) > n_sigma * rms_map
    if not mask.any():
        return 0
    lab = cc_label(mask, connectivity=2)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    big = counts >= min_blob
    return int(counts[big].sum())


def evaluate(
    original_sub: np.ndarray, restored: np.ndarray, psf: np.ndarray | None, psf_fwhm: float | None,
    rms_map: np.ndarray, dets: list[RawDetection], detect_sigma: float, deblur_applied: bool,
    sat_level: float | None = None,
) -> tuple[HonestyReport, HonestyArrays]:
    """Run every honesty check and write the plain-English notes."""
    o = original_sub.astype(np.float64)
    r = restored.astype(np.float64)
    data_range = float(max(o.max() - o.min(), 1e-6))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ssim = float(structural_similarity(o, r, data_range=data_range))
        psnr = float(peak_signal_noise_ratio(o, r, data_range=data_range))
    fm, arrays = forward_model(o, r, psf if deblur_applied else None, rms_map)
    sigma = float(np.median(rms_map))
    fc = flux_conservation(o, r, dets, psf_fwhm, sigma, sat_level)
    ps, _ = position_shift(dets, r, rms_map, detect_sigma)
    inv = invented_pixels(arrays.residual, rms_map)
    notes = [
        f"SSIM {ssim:.3f} and PSNR {psnr:.1f} dB compare original and restored luminance; they measure how much "
        f"changed, not whether the change is right.",
        (f"Forward model: the restored image re-blurred with the measured PSF differs from the original by "
         if deblur_applied else "Forward model (no deblur applied, so the model is the restored image itself): residual ")
        + f"RMS {fm.residual_rms:.3g} against noise sigma {sigma:.3g}; reduced chi-squared {fm.chi2_reduced:.2f} "
        + ("(<= 1: the residual is no larger than the noise)." if fm.chi2_reduced <= 1.0 else "(> 1: the residual exceeds the noise level)."),
        f"Structure score {fm.structure_score:.2f}: ratio of low-frequency residual power to that of white noise "
        f"(1 = noise-like; >= {STRUCTURE_THRESHOLD} = structured). Verdict: {fm.verdict}.",
    ]
    sat_note = (f" {fc.n_saturated_excluded} saturated sources were excluded (their true flux is unknown)."
                if fc.n_saturated_excluded else "")
    if fc.n_sources:
        notes.append(f"Flux conservation on the {fc.n_sources} brightest unsaturated sources (SNR > 10, stars and galaxies, "
                     f"aperture r = max(2 FWHM, 3a) with a local annulus): median restored/original flux ratio {fc.median_ratio:.3f}; "
                     f"{fc.within_5pct_fraction * 100:.0f}% within 5%; worst deviation {fc.max_abs_dev_pct:.1f}%. Faint sources "
                     f"carry their own photometric noise, so part of any scatter is measurement error, not restoration error."
                     + sat_note)
        if abs(fc.median_ratio - 1.0) > 0.10 and deblur_applied:
            notes.append(f"The median flux ratio deviates by {abs(fc.median_ratio - 1) * 100:.0f}%: deconvolution moved flux "
                         f"across aperture edges. This happens when the measured PSF is wider than the true blur of compact "
                         f"sources (e.g. a PSF built from unresolved clusters in a resampled press image): Richardson-Lucy "
                         f"then over-sharpens and rings. Treat the deblurred fluxes as unreliable; measure on the original "
                         f"or rerun with fewer iterations / denoise only.")
    else:
        notes.append("Flux conservation not reported: fewer than 5 unsaturated sources with SNR > 10, too few for a "
                     "meaningful fraction." + sat_note)
    if ps.n_stars:
        notes.append(f"Centroids of {ps.n_stars} re-detected sources moved by a median of {ps.median_shift_px:.2f} px "
                     f"(max {ps.max_shift_px:.2f} px) after restoration.")
    else:
        notes.append("Position shift could not be measured (no sources matched within 3 px).")
    notes.append(f"{inv} pixels lie in connected residual blobs (>= 4 px) beyond 5 sigma"
                 + (" — none; no structured excursion was introduced." if inv == 0 else "; inspect the residual map at those places."))
    report = HonestyReport(ssim=ssim, psnr_db=psnr, forward_model=fm, flux_conservation=fc, position_shift=ps,
                           invented_pixels=inv, notes=notes)
    return report, arrays
