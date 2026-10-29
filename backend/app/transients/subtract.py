"""Two-epoch image subtraction: align → match blur → match flux → subtract → find what changed → reject artefacts.

Works on any pair of float arrays of the same field: two Lens jobs, or a ZTF science/template stamp pair.
"""
from __future__ import annotations

import base64
import io
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.registration import phase_cross_correlation


def _mad_sigma(a: np.ndarray) -> float:
    m = np.nanmedian(a)
    return float(1.4826 * np.nanmedian(np.abs(a - m)) + 1e-9)


def _fwhm_estimate(a: np.ndarray) -> float:
    """Rough PSF width from the brightest isolated peak's second moments (good enough to match blur)."""
    a = a - np.nanmedian(a)
    y, x = np.unravel_index(int(np.nanargmax(a)), a.shape)
    r = 6
    cut = a[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1]
    cut = np.clip(cut, 0, None)
    if cut.sum() <= 0:
        return 2.5
    yy, xx = np.mgrid[: cut.shape[0], : cut.shape[1]]
    cy, cx = (cut * yy).sum() / cut.sum(), (cut * xx).sum() / cut.sum()
    var = ((cut * ((yy - cy) ** 2 + (xx - cx) ** 2)).sum() / cut.sum()) / 2
    return float(max(1.5, min(8.0, 2.3548 * np.sqrt(max(var, 0.3)))))


def difference(a: np.ndarray, b: np.ndarray, fwhm_a: float | None = None, fwhm_b: float | None = None, nsigma: float = 5.0) -> dict[str, Any]:
    """Returns the difference (b − a: new minus old) with candidates and the steps taken, all explainable."""
    a = np.nan_to_num(a.astype(np.float64))
    b = np.nan_to_num(b.astype(np.float64))
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
    a, b = a[:h, :w], b[:h, :w]
    steps: list[str] = []

    # 1. background
    a0 = a - np.median(a)
    b0 = b - np.median(b)
    steps.append("subtracted each epoch's median background")

    # 2. align (integer+subpixel shift by phase correlation)
    try:
        shift, err, _ = phase_cross_correlation(a0, b0, upsample_factor=10)  # shift to apply to `new` so it lands on `old`
        if np.all(np.abs(shift) < max(h, w) / 4):
            b0 = ndimage.shift(b0, shift, order=1, mode="nearest")
            steps.append(f"new epoch was offset by ({-shift[0]:+.2f}, {-shift[1]:+.2f}) px (y, x); corrected by phase correlation (error {err:.3f})")
        else:
            shift = np.zeros(2)
            steps.append("alignment shift implausible, left images as they are")
    except Exception as e:  # noqa: BLE001
        shift = np.zeros(2)
        steps.append(f"alignment skipped: {e}")

    # 3. PSF match: blur the sharper image to the wider one with a Gaussian of the quadrature difference
    fa = fwhm_a or _fwhm_estimate(a0)
    fb = fwhm_b or _fwhm_estimate(b0)
    if abs(fa - fb) > 0.2:
        extra = np.sqrt(abs(fa**2 - fb**2)) / 2.3548
        if fa < fb:
            a0 = ndimage.gaussian_filter(a0, extra)
            steps.append(f"blurred the old epoch (FWHM {fa:.2f} → {fb:.2f} px) to match the new one")
        else:
            b0 = ndimage.gaussian_filter(b0, extra)
            steps.append(f"blurred the new epoch (FWHM {fb:.2f} → {fa:.2f} px) to match the old one")
    else:
        steps.append(f"PSF widths already match ({fa:.2f} vs {fb:.2f} px)")
    fwhm = max(fa, fb)

    # 4. flux match: ratio of summed flux over the same bright blobs in both epochs (robust to PSF differences)
    sa, sb = _mad_sigma(a0), _mad_sigma(b0)
    labels, n = ndimage.label(a0 > 5 * sa)
    ratios = []
    for i in range(1, n + 1):
        pix = ndimage.binary_dilation(labels == i, iterations=2)
        fa_sum, fb_sum = float(a0[pix].sum()), float(b0[pix].sum())
        if fa_sum > 50 * sa and fb_sum > 0:
            ratios.append(fb_sum / fa_sum)
    if len(ratios) >= 2:
        k = float(np.clip(np.median(ratios), 0.2, 5.0))
        steps.append(f"scaled the old epoch by {k:.3f} (median flux ratio over {len(ratios)} matched sources)")
    else:
        k = 1.0
        steps.append("too few matched sources to scale flux; assumed equal depth")
    a0 = a0 * k

    # 5. subtract
    diff = b0 - a0
    sigma = _mad_sigma(diff)
    steps.append(f"difference noise σ = {sigma:.2f} (MAD)")

    # 6. candidates: connected blobs above nsigma, positive (brightened/appeared) or negative (faded/vanished)
    cands: list[dict[str, Any]] = []
    for sign, lab_img in (("positive", diff > nsigma * sigma), ("negative", diff < -nsigma * sigma)):
        labels, n = ndimage.label(lab_img)
        for i in range(1, n + 1):
            pix = labels == i
            npix = int(pix.sum())
            if npix < 3:
                continue
            yy, xx = np.nonzero(pix)
            wgt = np.abs(diff[pix])
            cy, cx = float((yy * wgt).sum() / wgt.sum()), float((xx * wgt).sum() / wgt.sum())
            peak = float(diff[pix][np.argmax(wgt)])
            cands.append({"x": round(cx, 2), "y": round(cy, 2), "sign": sign, "npix": npix, "peak": round(peak, 2), "snr": round(abs(peak) / sigma, 1), "flux": round(float(diff[pix].sum()), 1)})

    # 7. artefact rejection
    edge = int(np.ceil(fwhm))
    for c in cands:
        flags = []
        if c["x"] < edge or c["y"] < edge or c["x"] > w - 1 - edge or c["y"] > h - 1 - edge:
            flags.append("edge")
        # dipole: an opposite-sign candidate within 2 FWHM → residual misalignment, not a real change
        for d in cands:
            if d is not c and d["sign"] != c["sign"] and np.hypot(d["x"] - c["x"], d["y"] - c["y"]) < 2 * fwhm:
                flags.append("dipole")
                break
        # sits on a bright static source in both epochs → likely variability/saturation residual
        yi, xi = int(round(c["y"])), int(round(c["x"]))
        a_here = a0[max(0, yi - 1) : yi + 2, max(0, xi - 1) : xi + 2].max() if 0 <= yi < h and 0 <= xi < w else 0.0
        c["on_known_source"] = bool(a_here > 10 * sa)
        if c["on_known_source"] and c["sign"] == "negative":
            flags.append("fading known source")
        c["flags"] = flags
        c["real_candidate"] = not flags
    cands.sort(key=lambda c: -c["snr"])
    real = [c for c in cands if c["real_candidate"]]
    steps.append(f"{len(cands)} blobs above {nsigma:.0f}σ, {len(real)} survive the edge/dipole checks")

    return {
        "shape": [h, w],
        "shift_px": [round(float(-shift[0]), 2), round(float(-shift[1]), 2)],  # how far the new epoch was offset (y, x)
        "fwhm_px": {"old": round(fa, 2), "new": round(fb, 2), "matched": round(fwhm, 2)},
        "flux_scale": round(k, 3),
        "sigma": round(sigma, 3),
        "nsigma": nsigma,
        "candidates": cands,
        "real_candidates": len(real),
        "steps": steps,
        "arrays": {"old": a0, "new": b0, "diff": diff},
    }


def png_b64(a: np.ndarray, diverging: bool = False, size: int = 256) -> str:
    """Small PNG (base64) for the UI: asinh stretch, or a signed red/blue map for differences."""
    a = np.nan_to_num(a.astype(np.float64))
    if diverging:
        s = _mad_sigma(a) * 6 + 1e-9
        v = np.clip(a / s, -1, 1)
        rgb = np.zeros(a.shape + (3,), dtype=np.uint8)
        pos, neg = np.clip(v, 0, 1), np.clip(-v, 0, 1)
        rgb[..., 0] = (255 * pos).astype(np.uint8)
        rgb[..., 2] = (255 * neg).astype(np.uint8)
        rgb[..., 1] = (60 * (pos + neg)).astype(np.uint8)
        img = Image.fromarray(rgb)
    else:
        lo, hi = np.percentile(a, 1), np.percentile(a, 99.7)
        v = np.arcsinh(np.clip((a - lo) / max(hi - lo, 1e-9), 0, 1) * 10) / np.arcsinh(10)
        img = Image.fromarray((255 * v).astype(np.uint8))
    img = img.resize((size, int(size * a.shape[0] / a.shape[1])), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
