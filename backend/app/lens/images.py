"""PNG rendering of every stage for the Dojo: original, denoised, restored, residual, psf, noise, overlay.

Display stretches never touch the measured data. Luminance is mapped with the same black/white points for
original, denoised and restored so the three are comparable; colour sources keep their original chroma
(each channel is scaled by the ratio of stretched to linear luminance, so restored luminance wears the
original colour and nothing is tinted in).
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
from astropy.wcs import WCS
from PIL import Image, ImageDraw

from .detect import RawDetection

KINDS = ("original", "denoised", "restored", "residual", "psf", "noise", "overlay")
COLOURS = {"star": (230, 184, 60), "galaxy": (170, 170, 175), "unknown": (220, 70, 60)}


@dataclass
class JobArrays:
    """Everything the renderer and the benchmark need, kept in memory per job (and in arrays.npz on disk)."""

    lum: np.ndarray
    rgb: np.ndarray | None
    bkg_map: np.ndarray
    rms_map: np.ndarray
    sigma: float
    bkg_median: float
    sub: np.ndarray
    denoised: np.ndarray
    restored: np.ndarray
    residual: np.ndarray
    psf_kernel: np.ndarray | None
    psf_fwhm: float | None
    psf_method: str
    dets: list[RawDetection]
    max_valid: float | None
    detect_sigma: float
    denoise_strength: float
    deblur_iterations: int
    wcs: WCS | None = None
    extra: dict = field(default_factory=dict)


def _stretch_fn(mode: str):
    a = 0.1
    if mode == "linear":
        return lambda v: v
    return lambda v: np.arcsinh(v / a) / np.arcsinh(1.0 / a)


def _limits(sub: np.ndarray, sigma: float) -> tuple[float, float]:
    """Display range for a background-subtracted frame.

    The lower limit must not sit at -1σ for images whose 'background' is the object itself (a press JPEG of a
    galaxy): dust lanes are legitimately below the fitted background and would clip to black. Use the darker of
    -1σ and the 0.2th percentile so every real pixel keeps some tone.
    """
    lo = min(-1.0 * sigma, float(np.percentile(sub, 0.2)))
    hi = float(np.percentile(sub, 99.5))
    hi = max(hi, lo + 10.0 * sigma, lo + 1e-6)
    return lo, hi


def _to_png(arr8: np.ndarray) -> bytes:
    im = Image.fromarray(arr8, mode="RGB" if arr8.ndim == 3 else "L")
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def render_luminance(sub: np.ndarray, a: JobArrays, stretch: str) -> np.ndarray:
    """Map a background-subtracted luminance frame to display values; returns uint8 (HxW or HxWx3)."""
    lo, hi = _limits(a.sub, a.sigma)
    f = _stretch_fn(stretch)
    v = np.clip((sub.astype(np.float64) - lo) / (hi - lo), 0.0, 1.0)
    s = f(v)
    if a.rgb is None:
        return (s * 255.0 + 0.5).astype(np.uint8)
    # colour: keep the original chroma, scale each pixel by (stretched / original) luminance; cap the gain so
    # near-black pixels cannot blow up into saturated colour noise
    v0 = np.clip((a.sub.astype(np.float64) - lo) / (hi - lo), 1e-3, None)
    ratio = np.clip(s / v0, 0.0, 4.0)[..., None]
    out = np.clip(a.rgb.astype(np.float64) / 255.0 * ratio, 0.0, 1.0)
    return (out * 255.0 + 0.5).astype(np.uint8)


def render_residual(a: JobArrays) -> np.ndarray:
    """Signed residual in units of 3 sigma: red positive, blue negative, black at zero (sqrt-compressed)."""
    r = np.clip(a.residual.astype(np.float64) / (3.0 * np.maximum(a.rms_map, 1e-9)), -1.0, 1.0)
    s = np.sign(r) * np.sqrt(np.abs(r))
    pos, neg = np.clip(s, 0, 1), np.clip(-s, 0, 1)
    out = np.zeros(r.shape + (3,), dtype=np.float64)
    out[..., 0] = pos
    out[..., 1] = 0.25 * (pos + neg)
    out[..., 2] = neg
    return (out * 255.0 + 0.5).astype(np.uint8)


def render_psf(a: JobArrays, size: int = 256) -> np.ndarray:
    if a.psf_kernel is None:
        img = np.zeros((size, size), dtype=np.uint8)
        im = Image.fromarray(img, mode="L")
        ImageDraw.Draw(im).text((10, size // 2 - 6), "PSF not measured", fill=200)
        return np.asarray(im)
    k = a.psf_kernel / max(float(a.psf_kernel.max()), 1e-12)
    s = np.arcsinh(k / 0.02) / np.arcsinh(1 / 0.02)
    im = Image.fromarray((s * 255.0 + 0.5).astype(np.uint8), mode="L").resize((size, size), Image.NEAREST)
    return np.asarray(im)


def render_noise(a: JobArrays) -> np.ndarray:
    m = a.rms_map.astype(np.float64)
    lo, hi = float(m.min()), float(m.max())
    v = (m - lo) / max(hi - lo, 1e-9) if hi > lo else np.full_like(m, 0.5)
    return (v * 255.0 + 0.5).astype(np.uint8)


def _ellipse_points(cx: float, cy: float, sa: float, sb: float, theta_deg: float, n: int = 40) -> list[tuple[float, float]]:
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    th = np.deg2rad(theta_deg)
    x = cx + sa * np.cos(t) * np.cos(th) - sb * np.sin(t) * np.sin(th)
    y = cy + sa * np.cos(t) * np.sin(th) + sb * np.sin(t) * np.cos(th)
    return list(zip(x.tolist(), y.tolist()))


def render_overlay(a: JobArrays, stretch: str) -> np.ndarray:
    base = render_luminance(a.sub, a, stretch)
    if base.ndim == 2:
        base = np.repeat(base[..., None], 3, axis=2)
    im = Image.fromarray(base, mode="RGB")
    draw = ImageDraw.Draw(im)
    for d in a.dets:
        sa, sb = max(2.0 * d.a, 2.5), max(2.0 * d.b, 2.5)
        draw.polygon(_ellipse_points(d.x, d.y, sa, sb, d.theta_deg), outline=COLOURS.get(d.kind, COLOURS["unknown"]))
    return np.asarray(im)


def render(a: JobArrays, kind: str, stretch: str = "asinh") -> bytes:
    """Render one `kind` to PNG bytes."""
    if kind not in KINDS:
        raise ValueError(f"unknown image kind {kind!r}")
    stretch = "linear" if stretch == "linear" else "asinh"
    if kind == "original":
        arr = render_luminance(a.sub, a, stretch)
    elif kind == "denoised":
        arr = render_luminance(a.denoised, a, stretch)
    elif kind == "restored":
        arr = render_luminance(a.restored, a, stretch)
    elif kind == "residual":
        arr = render_residual(a)
    elif kind == "psf":
        arr = render_psf(a)
    elif kind == "noise":
        arr = render_noise(a)
    else:
        arr = render_overlay(a, stretch)
    return _to_png(arr)
