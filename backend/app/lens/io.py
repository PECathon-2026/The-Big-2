"""Image loading: JPG/PNG/TIFF through Pillow, FITS through astropy.

Produces one float32 luminance array for every measurement, an optional RGB copy for display, and the FITS WCS
when the header carries one. Very large frames are downscaled for processing (long side capped at MAX_SIDE) and
the scale factor is recorded so the caller can say so in the trace.
"""
from __future__ import annotations

import io
import warnings
from dataclasses import dataclass, field

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image
from skimage.transform import resize

MAX_SIDE = 2048

# Pillow can refuse huge images as a decompression-bomb guard; astronomical press images are legitimately large.
Image.MAX_IMAGE_PIXELS = 400_000_000


@dataclass
class LoadedImage:
    lum: np.ndarray                 # float32, 2D, processing frame (background NOT subtracted)
    rgb: np.ndarray | None          # uint8 HxWx3 at the processing scale, None for FITS / grayscale sources
    width: int                      # processing-frame width
    height: int
    orig_width: int
    orig_height: int
    channels: int
    format: str
    is_fits: bool
    source_filename: str
    scale: float                    # processing px per original px (1.0 = no downscale)
    max_valid: float | None         # saturation level of the source format (255, 65535) or None for floats
    wcs: WCS | None = None          # WCS in processing-frame pixel coordinates (0-based)
    header: fits.Header | None = None
    raw_bytes: bytes = field(default=b"", repr=False)


def _is_fits(data: bytes, filename: str) -> bool:
    return data[:6] == b"SIMPLE" or filename.lower().endswith((".fits", ".fit", ".fts", ".fits.gz", ".fz"))


def _first_2d_hdu(hdul: fits.HDUList) -> fits.ImageHDU | fits.PrimaryHDU:
    for hdu in hdul:
        if hdu.data is not None and getattr(hdu.data, "ndim", 0) >= 2:
            return hdu
    raise ValueError("FITS file contains no 2-D image HDU")


def scale_wcs(w: WCS, s: float) -> WCS:
    """Rescale a WCS to a frame resampled by factor `s` (new = old * s).

    With 1-based FITS pixels the mapping is p' = (p - 0.5) * s + 0.5, so CRPIX moves accordingly and the
    CD matrix (degrees per pixel) grows by 1/s.
    """
    if s == 1.0:
        return w
    w2 = w.deepcopy()
    w2.wcs.crpix = [(c - 0.5) * s + 0.5 for c in w.wcs.crpix]
    if w2.wcs.has_cd():
        w2.wcs.cd = w2.wcs.cd / s
    else:
        w2.wcs.cdelt = w2.wcs.cdelt / s
    return w2


def _downscale(arr: np.ndarray, s: float, order: int = 1) -> np.ndarray:
    h, w = arr.shape[:2]
    out_shape = (max(1, int(round(h * s))), max(1, int(round(w * s))))
    if arr.ndim == 3:
        out_shape = out_shape + (arr.shape[2],)
    return resize(arr, out_shape, order=order, anti_aliasing=True, preserve_range=True).astype(np.float32)


def load_image(data: bytes, filename: str) -> LoadedImage:
    """Decode an upload into a LoadedImage. Raises ValueError for unreadable files."""
    if _is_fits(data, filename):
        return _load_fits(data, filename)
    return _load_pillow(data, filename)


def _load_fits(data: bytes, filename: str) -> LoadedImage:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with fits.open(io.BytesIO(data), memmap=False) as hdul:
            hdu = _first_2d_hdu(hdul)
            arr = np.asarray(hdu.data, dtype=np.float64)
            header = hdu.header.copy()
    while arr.ndim > 2:  # take the first plane of a cube
        arr = arr[0]
    arr = np.nan_to_num(arr, nan=float(np.nanmedian(arr)), posinf=0.0, neginf=0.0)
    oh, ow = arr.shape
    s = min(1.0, MAX_SIDE / max(oh, ow))
    lum = _downscale(arr, s) if s < 1.0 else arr.astype(np.float32)
    wcs: WCS | None = None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            w = WCS(header, naxis=2)
        if w.has_celestial:
            wcs = scale_wcs(w.celestial, s)
    except Exception:  # noqa: BLE001 - a broken header just means "no WCS"
        wcs = None
    bitpix = int(header.get("BITPIX", -32))
    max_valid = {8: 255.0, 16: 65535.0 if header.get("BZERO", 0) else 32767.0}.get(bitpix)
    return LoadedImage(
        lum=lum, rgb=None, width=lum.shape[1], height=lum.shape[0], orig_width=ow, orig_height=oh,
        channels=1, format="FITS", is_fits=True, source_filename=filename, scale=s, max_valid=max_valid,
        wcs=wcs, header=header, raw_bytes=data,
    )


def _load_pillow(data: bytes, filename: str) -> LoadedImage:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:  # noqa: BLE001
        raise ValueError("cannot decode this image: the file is damaged or not a JPG, PNG, TIFF or FITS") from e
    fmt = (im.format or "unknown").upper()
    ow, oh = im.size
    mode = im.mode
    # Decide the numeric range of the source so later clipping knows what "valid" means.
    if mode in ("I;16", "I;16B", "I;16L", "I;16N"):
        arr = np.asarray(im, dtype=np.float64)
        max_valid = 65535.0
        rgb_arr = None
        channels = 1
    elif mode == "I":
        arr = np.asarray(im, dtype=np.float64)
        max_valid = float(arr.max()) if arr.max() > 255 else 255.0
        rgb_arr = None
        channels = 1
    elif mode == "F":
        arr = np.asarray(im, dtype=np.float64)
        max_valid = None
        rgb_arr = None
        channels = 1
    elif mode in ("L", "P", "1", "LA"):
        arr = np.asarray(im.convert("L"), dtype=np.float64)
        max_valid = 255.0
        rgb_arr = None
        channels = 1
    else:
        rgb8 = np.asarray(im.convert("RGB"), dtype=np.float64)
        # Rec. 709 luminance keeps the measurement photometric-ish while the RGB copy keeps colour for display.
        arr = 0.2126 * rgb8[..., 0] + 0.7152 * rgb8[..., 1] + 0.0722 * rgb8[..., 2]
        max_valid = 255.0
        rgb_arr = rgb8
        channels = 3
    s = min(1.0, MAX_SIDE / max(oh, ow))
    if s < 1.0:
        lum = _downscale(arr, s)
        rgb = np.clip(_downscale(rgb_arr, s), 0, 255).astype(np.uint8) if rgb_arr is not None else None
    else:
        lum = arr.astype(np.float32)
        rgb = rgb_arr.astype(np.uint8) if rgb_arr is not None else None
    return LoadedImage(
        lum=lum, rgb=rgb, width=lum.shape[1], height=lum.shape[0], orig_width=ow, orig_height=oh,
        channels=channels, format=fmt, is_fits=False, source_filename=filename, scale=s, max_valid=max_valid,
        raw_bytes=data,
    )
