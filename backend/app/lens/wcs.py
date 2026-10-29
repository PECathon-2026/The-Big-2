"""Sky coordinates: FITS header WCS, AVM metadata in JPEG/PNG XMP, and nova.astrometry.net plate solving.

All WCS objects handed around here are in *image* pixel convention (x right, y down, 0-based when used with
astropy's `origin=0`) for the processed frame, so a detection's (x, y) maps straight to (RA, Dec).
"""
from __future__ import annotations

import asyncio
import io
import json
import re
import warnings
from collections.abc import Callable
from typing import Any

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales

from ..core.config import settings
from ..core.http import client
from .io import scale_wcs

ASTROMETRY_API = "https://nova.astrometry.net/api"
ASTROMETRY_WCS = "https://nova.astrometry.net/wcs_file"

_AVM_TAGS = (
    "Spatial.ReferenceValue", "Spatial.ReferencePixel", "Spatial.Scale", "Spatial.Rotation",
    "Spatial.ReferenceDimension", "Spatial.CoordsystemProjection", "Spatial.Equinox",
)


class AstrometryError(Exception):
    pass


# ----------------------------------------------------------------------------------------------- AVM

def extract_xmp(data: bytes) -> str | None:
    """Return the XMP packet text embedded in a JPEG/PNG/TIFF, if any."""
    start = data.find(b"<x:xmpmeta")
    if start < 0:
        return None
    end = data.find(b"</x:xmpmeta>", start)
    if end < 0:
        return None
    return data[start: end + len(b"</x:xmpmeta>")].decode("utf-8", errors="ignore")


def _avm_values(xmp: str, tag: str) -> list[float] | None:
    """Read one AVM tag either as an element with an rdf:Seq list or as an attribute with delimited values."""
    m = re.search(rf"<avm:{re.escape(tag)}(?:\s[^>]*)?>(.*?)</avm:{re.escape(tag)}>", xmp, re.S)
    raw: list[str] = []
    if m:
        inner = m.group(1)
        items = re.findall(r"<rdf:li[^>]*>(.*?)</rdf:li>", inner, re.S)
        raw = items if items else [re.sub(r"<[^>]+>", "", inner)]
    else:
        m = re.search(rf'avm:{re.escape(tag)}="([^"]*)"', xmp)
        if not m:
            return None
        raw = [m.group(1)]
    vals: list[float] = []
    for r in raw:
        for part in re.split(r"[;,]", r):
            part = part.strip()
            if part:
                try:
                    vals.append(float(part))
                except ValueError:
                    return None
    return vals or None


def parse_avm(data: bytes) -> dict[str, Any] | None:
    xmp = extract_xmp(data)
    if xmp is None or "avm:" not in xmp:
        return None
    out: dict[str, Any] = {}
    for tag in _AVM_TAGS:
        if tag == "Spatial.CoordsystemProjection":
            m = re.search(r"<avm:Spatial.CoordsystemProjection[^>]*>(.*?)</avm:Spatial.CoordsystemProjection>", xmp, re.S) \
                or re.search(r'avm:Spatial.CoordsystemProjection="([^"]*)"', xmp)
            if m:
                out[tag] = re.sub(r"<[^>]+>", "", m.group(1)).strip()
            continue
        v = _avm_values(xmp, tag)
        if v is not None:
            out[tag] = v
    return out or None


def wcs_from_avm(data: bytes, actual_width: int | None = None, actual_height: int | None = None) -> WCS | None:
    """Build a TAN WCS from AVM Spatial.* tags.

    AVM follows the FITS convention (reference pixel 1-based, y up) for a frame of Spatial.ReferenceDimension
    pixels. The result is converted to image convention (y down) by flipping the second CD column and moving
    CRPIX2 to H + 1 - CRPIX2, then rescaled if the actual image size differs from the reference dimension.
    """
    avm = parse_avm(data)
    if not avm:
        return None
    try:
        crval = avm["Spatial.ReferenceValue"]
        crpix = avm["Spatial.ReferencePixel"]
        scale = avm["Spatial.Scale"]
        dim = avm.get("Spatial.ReferenceDimension")
    except KeyError:
        return None
    if len(crval) < 2 or len(crpix) < 2 or len(scale) < 1:
        return None
    sx = float(scale[0])
    sy = float(scale[1]) if len(scale) > 1 else abs(sx)
    if sx == 0 or sy == 0:
        return None
    rot = float(avm.get("Spatial.Rotation", [0.0])[0])
    th = np.deg2rad(rot)
    # CROTA2 -> CD (FITS paper II), then flip the y axis for image (top-down) coordinates.
    cd = np.array([[sx * np.cos(th), -sy * np.sin(th)], [sx * np.sin(th), sy * np.cos(th)]])
    cd[:, 1] *= -1.0
    if dim and len(dim) >= 2 and dim[1] > 0:
        ref_w, ref_h = float(dim[0]), float(dim[1])
    elif actual_width and actual_height:
        ref_w, ref_h = float(actual_width), float(actual_height)
    else:
        return None
    crpix2 = ref_h + 1.0 - float(crpix[1])
    proj = str(avm.get("Spatial.CoordsystemProjection", "TAN")).upper()[:3] or "TAN"
    if proj not in ("TAN", "SIN", "ARC", "CAR", "STG", "ZEA"):
        proj = "TAN"
    hdr = fits.Header()
    hdr["CTYPE1"], hdr["CTYPE2"] = f"RA---{proj}", f"DEC--{proj}"
    hdr["CRVAL1"], hdr["CRVAL2"] = float(crval[0]), float(crval[1])
    hdr["CRPIX1"], hdr["CRPIX2"] = float(crpix[0]), crpix2
    hdr["CD1_1"], hdr["CD1_2"], hdr["CD2_1"], hdr["CD2_2"] = cd[0, 0], cd[0, 1], cd[1, 0], cd[1, 1]
    hdr["EQUINOX"] = float(avm.get("Spatial.Equinox", [2000.0])[0])
    hdr["RADESYS"] = "FK5" if hdr["EQUINOX"] != 2000.0 else "ICRS"
    hdr["NAXIS1"], hdr["NAXIS2"] = int(round(ref_w)), int(round(ref_h))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        w = WCS(hdr)
    if actual_width and actual_height and abs(actual_width / ref_w - 1.0) > 1e-3:
        w = scale_wcs(w, actual_width / ref_w)
    return w


# ----------------------------------------------------------------------------------------------- helpers

def pixel_to_sky(w: WCS, xs: np.ndarray, ys: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sky = w.pixel_to_world(xs, ys)
    return np.asarray(sky.ra.deg, dtype=float), np.asarray(sky.dec.deg, dtype=float)


def wcs_summary(w: WCS, width: int, height: int) -> dict[str, float]:
    """Field centre, field of view (long side, degrees), pixel scale (arcsec/px) and orientation (deg E of N)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ra, dec = pixel_to_sky(w, np.array([(width - 1) / 2.0]), np.array([(height - 1) / 2.0]))
        scales = proj_plane_pixel_scales(w)  # degrees per pixel
        pix = float(np.sqrt(abs(scales[0] * scales[1])))
        cd = w.pixel_scale_matrix
        # Orientation: angle of the +y pixel axis measured east of north on the sky.
        north = np.rad2deg(np.arctan2(cd[0, 1], cd[1, 1]))
    return {
        "ra_center": float(ra[0]), "dec_center": float(dec[0]), "fov_deg": float(pix * max(width, height)),
        "pixel_scale_arcsec": float(pix * 3600.0), "orientation_deg": float(north),
    }


# ----------------------------------------------------------------------------------------------- astrometry.net

def _xylist_fits(xs: np.ndarray, ys: np.ndarray, fluxes: np.ndarray) -> bytes:
    """Astrometry.net accepts a FITS binary table of X, Y (1-based, brightest first) and FLUX."""
    order = np.argsort(-fluxes)
    cols = fits.ColDefs([
        fits.Column(name="X", format="E", array=(xs[order] + 1.0).astype(np.float32)),
        fits.Column(name="Y", format="E", array=(ys[order] + 1.0).astype(np.float32)),
        fits.Column(name="FLUX", format="E", array=fluxes[order].astype(np.float32)),
    ])
    hdul = fits.HDUList([fits.PrimaryHDU(), fits.BinTableHDU.from_columns(cols)])
    buf = io.BytesIO()
    hdul.writeto(buf)
    return buf.getvalue()


async def solve_astrometry(
    xs: np.ndarray, ys: np.ndarray, fluxes: np.ndarray, width: int, height: int,
    on_progress: Callable[[str], None] | None = None, timeout_s: float = 300.0,
) -> tuple[WCS, bytes]:
    """Plate-solve a source list with nova.astrometry.net. Returns the WCS (image convention) and the raw header.

    login -> upload the x,y,flux list -> poll the submission for a job id -> poll the job -> fetch wcs.fits.
    The API key never leaves the server. Polling is live (no caching) because the state changes.
    """
    key = settings.astrometry_api_key
    if not key:
        raise AstrometryError("no astrometry.net API key configured (TSUKUYOMI_ASTROMETRY_API_KEY)")
    if len(xs) < 5:
        raise AstrometryError(f"only {len(xs)} sources; a plate solve needs at least 5 (ideally 20+)")
    c = client()
    say = on_progress or (lambda _m: None)

    say("logging in to nova.astrometry.net")
    r = await c.post(f"{ASTROMETRY_API}/login", data={"request-json": json.dumps({"apikey": key})})
    r.raise_for_status()
    login = r.json()
    if login.get("status") != "success":
        raise AstrometryError(f"login failed: {login.get('errormessage', login)}")
    session = login["session"]

    n = min(len(xs), 300)
    payload = {
        "session": session, "allow_commercial_use": "n", "allow_modifications": "n", "publicly_visible": "n",
        "image_width": int(width), "image_height": int(height), "crpix_center": True, "tweak_order": 2,
    }
    say(f"uploading {n} sources (x, y, flux)")
    files = {"file": ("sources.fits", _xylist_fits(xs[:n], ys[:n], fluxes[:n]), "application/octet-stream")}
    r = await c.post(f"{ASTROMETRY_API}/upload", data={"request-json": json.dumps(payload)}, files=files)
    r.raise_for_status()
    up = r.json()
    if up.get("status") != "success":
        raise AstrometryError(f"upload rejected: {up.get('errormessage', up)}")
    subid = up["subid"]

    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_s
    job_id: int | None = None
    while loop.time() < deadline:
        r = await c.get(f"{ASTROMETRY_API}/submissions/{subid}")
        if r.status_code == 200:
            jobs = [j for j in (r.json().get("jobs") or []) if j]
            if jobs:
                job_id = jobs[0]
                break
        say(f"submission {subid} queued, waiting for a job")
        await asyncio.sleep(5)
    if job_id is None:
        raise AstrometryError("timed out waiting for astrometry.net to start the job")

    while loop.time() < deadline:
        r = await c.get(f"{ASTROMETRY_API}/jobs/{job_id}")
        status = r.json().get("status") if r.status_code == 200 else None
        say(f"job {job_id}: {status}")
        if status == "success":
            break
        if status == "failure":
            raise AstrometryError("astrometry.net could not solve this field (too few stars, wrong scale, or not a sky image)")
        await asyncio.sleep(5)
    else:
        raise AstrometryError("timed out waiting for the astrometry.net job")

    r = await c.get(f"{ASTROMETRY_WCS}/{job_id}")
    r.raise_for_status()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        hdr = fits.Header.fromstring(r.content.decode("latin-1") if r.content[:6] == b"SIMPLE" else r.content, sep="")
        try:
            with fits.open(io.BytesIO(r.content)) as hdul:
                hdr = hdul[0].header
        except Exception:  # noqa: BLE001 - keep the string parse
            pass
        w = WCS(hdr).celestial
    return w, r.content
