"""Background estimation, source detection and star/galaxy classification (photutils).

Background: `Background2D` with a sigma-clipped median in boxes, giving a background map and an RMS (noise) map.
Detection: threshold at `detect_sigma x RMS` on a lightly smoothed image, connected components, deblending,
then `SourceCatalog` for centroid, flux, peak, FWHM, axes, orientation and ellipticity.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
from astropy.convolution import convolve as astro_convolve
from astropy.stats import SigmaClip
from photutils.background import Background2D, MedianBackground
from photutils.segmentation import SourceCatalog, deblend_sources, detect_sources, make_2dgaussian_kernel

MAX_DETECTIONS = 1500
MIN_PIXELS = 5


@dataclass
class BackgroundResult:
    median: float
    sigma: float
    bkg_map: np.ndarray
    rms_map: np.ndarray
    box_size: int


@dataclass
class RawDetection:
    id: int
    x: float
    y: float
    flux: float
    flux_err: float
    peak: float
    snr: float
    fwhm: float
    a: float
    b: float
    theta_deg: float
    ellipticity: float
    area: int
    kind: str = "unknown"


def estimate_background(lum: np.ndarray) -> BackgroundResult:
    """Sigma-clipped median background in boxes (Background2D), interpolated back to the image.

    The box is ~1/8 of the short side (clamped 16..96 px) so that stars never fill a box; the RMS map is the
    per-box standard deviation of the clipped background pixels, which is our noise sigma.
    """
    h, w = lum.shape
    box = int(np.clip(min(h, w) // 8, 16, 96))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        bkg = Background2D(
            lum, (box, box), filter_size=(3, 3), sigma_clip=SigmaClip(sigma=3.0, maxiters=5),
            bkg_estimator=MedianBackground(), exclude_percentile=25.0,
        )
    rms = np.asarray(bkg.background_rms, dtype=np.float32)
    rms = np.maximum(rms, 1e-6)
    return BackgroundResult(
        median=float(bkg.background_median), sigma=float(bkg.background_rms_median),
        bkg_map=np.asarray(bkg.background, dtype=np.float32), rms_map=rms, box_size=box,
    )


def detect_sources_catalog(
    data_sub: np.ndarray, rms_map: np.ndarray, detect_sigma: float = 3.0, smooth_fwhm: float = 3.0,
    max_detections: int = MAX_DETECTIONS,
) -> list[RawDetection]:
    """Detect sources on a background-subtracted image. Returns detections sorted by flux (brightest first).

    SNR is segment_flux / segment_flux_err where the error map is the background RMS. Deblending is skipped when
    the segmentation has thousands of blobs, to keep the stage bounded.
    """
    threshold = detect_sigma * rms_map
    kernel = make_2dgaussian_kernel(smooth_fwhm, size=5)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        convolved = astro_convolve(data_sub, kernel, normalize_kernel=True)
        segm = detect_sources(convolved, threshold, n_pixels=MIN_PIXELS)
        if segm is None:
            return []
        if segm.nlabels <= 2500:
            try:
                segm = deblend_sources(convolved, segm, n_pixels=MIN_PIXELS, n_levels=32, contrast=0.001,
                                       progress_bar=False)
            except Exception:  # noqa: BLE001 - keep the un-deblended segmentation
                pass
        cat = SourceCatalog(data_sub, segm, convolved_data=convolved, error=rms_map)
        tbl = cat.to_table(columns=[
            "label", "x_centroid", "y_centroid", "segment_flux", "segment_flux_err", "max_value", "fwhm",
            "semimajor_axis", "semiminor_axis", "orientation", "ellipticity", "area",
        ])
    out: list[RawDetection] = []
    for row in tbl:
        flux = float(row["segment_flux"])
        if not np.isfinite(flux) or flux <= 0:
            continue
        ferr = float(row["segment_flux_err"]) if np.isfinite(row["segment_flux_err"]) else 0.0
        fwhm = float(_val(row["fwhm"]))
        a = float(_val(row["semimajor_axis"]))
        b = float(_val(row["semiminor_axis"]))
        if not (np.isfinite(fwhm) and np.isfinite(a) and np.isfinite(b)):
            continue
        out.append(RawDetection(
            id=0, x=float(row["x_centroid"]), y=float(row["y_centroid"]), flux=flux, flux_err=ferr,
            peak=float(row["max_value"]), snr=flux / ferr if ferr > 0 else float("inf"), fwhm=fwhm, a=a, b=b,
            theta_deg=float(_val(row["orientation"])), ellipticity=float(row["ellipticity"]),
            area=int(_val(row["area"])),
        ))
    out.sort(key=lambda d: d.flux, reverse=True)
    out = out[:max_detections]
    for i, d in enumerate(out):
        d.id = i + 1
    return out


def _val(q) -> float:
    return float(getattr(q, "value", q))


def classify(dets: list[RawDetection], psf_fwhm: float | None, psf_method: str) -> dict[str, int]:
    """CLASS_STAR-style heuristic on the FWHM ratio to the PSF and the ellipticity.

    star: FWHM <= 1.4 x PSF FWHM and ellipticity < 0.3; galaxy: FWHM >= 1.8 x PSF FWHM, or ellipticity >= 0.35
    with SNR > 8; otherwise unknown. Without a PSF only clearly extended sources (ellipticity >= 0.35, SNR > 8,
    area well above the smoothing kernel) are called galaxies; everything else stays unknown.
    """
    counts = {"stars": 0, "galaxies": 0, "unknown": 0}
    for d in dets:
        kind = "unknown"
        if psf_method != "none" and psf_fwhm and psf_fwhm > 0:
            ratio = d.fwhm / psf_fwhm
            if ratio <= 1.4 and d.ellipticity < 0.3:
                kind = "star"
            elif ratio >= 1.8 or (d.ellipticity >= 0.35 and d.snr > 8):
                kind = "galaxy"
        else:
            if d.ellipticity >= 0.35 and d.snr > 8 and d.area > 40:
                kind = "galaxy"
        d.kind = kind
        counts["stars" if kind == "star" else "galaxies" if kind == "galaxy" else "unknown"] += 1
    return counts


def instrumental_mag(flux: float) -> float:
    """Instrumental magnitude -2.5 log10(flux): relative only, no zero-point without a catalogue."""
    return float(-2.5 * np.log10(max(flux, 1e-12)))
