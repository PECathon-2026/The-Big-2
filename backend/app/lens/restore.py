"""Restoration: wavelet denoising and Richardson-Lucy deconvolution with the measured PSF.

Both steps are deterministic and classical. Nothing here can invent structure that is not supported by the
pixels: the denoiser shrinks wavelet coefficients below the noise level, and the deconvolution redistributes
flux under the measured PSF kernel (flux conservation is checked afterwards in honesty.py).
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
from scipy.signal import fftconvolve
from skimage.restoration import denoise_wavelet

AUTO_CHECKPOINTS = (5, 10, 15, 20, 25, 30)
CHI2_FLOOR = 1.05  # stop once the forward model is within 5 % of the noise floor; beyond that RL fits noise


@dataclass
class DenoiseResult:
    image: np.ndarray
    method: str
    strength: float
    sigma_used: float


@dataclass
class DeblurResult:
    image: np.ndarray
    method: str
    iterations: int
    applied: bool
    reason: str | None
    chi2_track: list[tuple[int, float]]


def denoise(data_sub: np.ndarray, sigma: float, strength: float) -> DenoiseResult:
    """BayesShrink wavelet denoising (skimage), with the noise sigma scaled by the strength slider.

    strength 0.5 passes the measured background sigma unchanged; 1.0 doubles it (more aggressive);
    0 skips denoising. The image is normalised to [0, 1] so the wavelet thresholds are well conditioned.
    """
    if strength <= 0 or sigma <= 0:
        return DenoiseResult(data_sub.astype(np.float32).copy(), "wavelet-bayesshrink", 0.0, 0.0)
    lo, hi = float(data_sub.min()), float(data_sub.max())
    span = max(hi - lo, 1e-6)
    norm = (data_sub.astype(np.float64) - lo) / span
    sigma_eff = sigma * 2.0 * strength
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        out = denoise_wavelet(norm, sigma=sigma_eff / span, wavelet="db2", mode="soft",
                              method="BayesShrink", rescale_sigma=True)
    return DenoiseResult((out * span + lo).astype(np.float32), "wavelet-bayesshrink", float(strength), float(sigma_eff))


def _rl_iterations(image: np.ndarray, psf: np.ndarray, n: int, start: np.ndarray | None = None) -> np.ndarray:
    """Richardson-Lucy update as in skimage.restoration.richardson_lucy, resumable from a previous estimate.

    est <- est * (psf* (x) (image / (psf (x) est))) / w, where w = psf* (x) 1 is the boundary window: near the
    edges the mirrored PSF only partly overlaps the image, and dividing by w stops flux piling up there.
    FFT convolution; eps guards the division.
    """
    eps = np.finfo(np.float64).eps
    est = np.full(image.shape, 0.5, dtype=np.float64) if start is None else start.copy()
    psf_mirror = np.flip(psf)
    window = np.maximum(fftconvolve(np.ones_like(image), psf_mirror, mode="same"), 1e-3)
    for _ in range(n):
        conv = fftconvolve(est, psf, mode="same") + eps
        est *= fftconvolve(image / conv, psf_mirror, mode="same") / window
        np.maximum(est, 0.0, out=est)
    return est


def reduced_chi2(data: np.ndarray, model: np.ndarray, sigma_map: np.ndarray) -> float:
    """mean((data - model)^2 / sigma^2): 1 means the residual is exactly as large as the noise."""
    r = (data.astype(np.float64) - model.astype(np.float64)) / np.maximum(sigma_map, 1e-9)
    return float(np.mean(r * r))


def deblur(
    denoised: np.ndarray, original_sub: np.ndarray, psf: np.ndarray | None, psf_method: str,
    rms_map: np.ndarray, bkg_median: float, iterations: int = 0, max_valid: float | None = None,
) -> DeblurResult:
    """Richardson-Lucy deconvolution with the measured kernel.

    The data are offset by a positive pedestal (the real background level, at least 5 sigma) because RL needs
    non-negative intensities. `iterations == 0` is auto: evaluate the forward-model reduced chi-squared
    (PSF (x) estimate against the ORIGINAL data, in units of the noise) every 5 iterations between 5 and 30, and
    stop when it is within 5 % of the noise floor (chi2 <= 1.05), improves by less than 2 %, or rises. The output is clipped at
    zero intensity only: a deconvolved star is legitimately sharper and taller than in the blurred source, so
    the source format's maximum is not imposed (that would discard flux and fake the forward model).
    """
    if psf is None or psf_method == "none":
        return DeblurResult(denoised.copy(), "richardson-lucy", 0, False,
                            "PSF could not be measured from this image, so the blur is unknown; deblurring skipped", [])
    sigma = float(np.median(rms_map))
    pedestal = max(float(bkg_median), 5.0 * sigma, 1e-3)
    work = np.clip(denoised.astype(np.float64) + pedestal, 0.0, None)
    scale = max(float(work.max()), 1e-9)
    work /= scale
    # Reflect-pad so the FFT's zero padding does not darken the borders (RL runs in pedestal space, where the
    # background is far from zero); the padding is cropped from the estimate and from the forward model.
    pad = psf.shape[0] // 2 + 2
    work_p = np.pad(work, pad, mode="reflect")
    crop = (slice(pad, -pad), slice(pad, -pad))
    truth = (original_sub.astype(np.float64) + pedestal) / scale
    sig_map = rms_map.astype(np.float64) / scale

    def chi2_of(est_p: np.ndarray) -> float:
        return reduced_chi2(truth, fftconvolve(est_p, psf, mode="same")[crop], sig_map)

    track: list[tuple[int, float]] = []
    if iterations > 0:
        n_iter = int(min(iterations, 100))
        est = _rl_iterations(work_p, psf, n_iter)
        track.append((n_iter, chi2_of(est)))
        chosen = est
    else:
        est = None
        best: np.ndarray | None = None
        prev_chi2 = np.inf
        done = 0
        n_iter = 0
        for cp in AUTO_CHECKPOINTS:
            est = _rl_iterations(work_p, psf, cp - done, est)
            done = cp
            chi2 = chi2_of(est)
            track.append((cp, chi2))
            if chi2 >= prev_chi2:
                break
            best, n_iter, prev_chi2 = est, cp, chi2
            if chi2 <= CHI2_FLOOR or (len(track) >= 2 and (track[-2][1] - chi2) / track[-2][1] < 0.02):
                break
        chosen = best if best is not None else est
    out = np.clip(chosen[crop] * scale - pedestal, -pedestal, None)
    return DeblurResult(out.astype(np.float32), "richardson-lucy", int(n_iter), True, None, track)
