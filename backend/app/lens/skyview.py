"""NASA SkyView cutout of the same field (archival survey imagery, not a live feed).

`runquery.pl` is asked for a PNG at the solved centre and field of view; if the service answers with FITS
instead, the FITS is converted here with an asinh stretch. Responses are cached for seven days through
core.http.fetch, so the demo never hammers the service.
"""
from __future__ import annotations

import io
import warnings

import numpy as np
from astropy.io import fits
from PIL import Image

from ..core.envelope import Provenance
from ..core.http import ProviderError, fetch
def _png_or_fits(b: bytes) -> bool:
    return b[:8] == b"\x89PNG\r\n\x1a\n" or b[:6] == b"SIMPLE"


SKYVIEW_URL = "https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl"
TTL_7_DAYS = 7 * 86400


def _fits_to_png(data: bytes) -> bytes:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with fits.open(io.BytesIO(data), memmap=False) as hdul:
            arr = None
            for hdu in hdul:
                if hdu.data is not None and getattr(hdu.data, "ndim", 0) >= 2:
                    arr = np.asarray(hdu.data, dtype=np.float64)
                    break
    if arr is None:
        raise ProviderError("skyview", "FITS response contained no image")
    while arr.ndim > 2:
        arr = arr[0]
    arr = np.nan_to_num(arr)
    lo, hi = np.percentile(arr, [1.0, 99.7])
    v = np.clip((arr - lo) / max(hi - lo, 1e-9), 0, 1)
    a = 0.1
    s = np.arcsinh(v / a) / np.arcsinh(1 / a)
    im = Image.fromarray((s * 255).astype(np.uint8)[::-1], mode="L")  # FITS rows are bottom-up
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


async def fetch_cutout(ra: float, dec: float, fov_deg: float, survey: str = "DSS2 Red", pixels: int = 512) -> tuple[bytes, Provenance]:
    """Return PNG bytes of a `survey` cutout centred on (ra, dec) with `fov_deg` on a side."""
    fov = float(np.clip(fov_deg, 0.01, 10.0))
    params = {
        "Position": f"{ra:.6f},{dec:.6f}", "Survey": survey, "Pixels": str(pixels), "Size": f"{fov:.5f}",
        "Coordinates": "J2000", "Projection": "Tan", "Return": "PNG",
    }
    got = await fetch("skyview", SKYVIEW_URL, params=params, ttl=TTL_7_DAYS, binary=True, retries=1, validate=_png_or_fits)
    data: bytes = got.data
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return data, got.provenance
    if data[:6] == b"SIMPLE":
        return _fits_to_png(data), got.provenance
    # PNG not honoured: ask for FITS explicitly and convert.
    params["Return"] = "FITS"
    got = await fetch("skyview", SKYVIEW_URL, params=params, ttl=TTL_7_DAYS, binary=True, retries=1, validate=_png_or_fits)
    if got.data[:6] == b"SIMPLE":
        return _fits_to_png(got.data), got.provenance
    raise ProviderError("skyview", "unexpected response (neither PNG nor FITS); the survey name may be invalid")
