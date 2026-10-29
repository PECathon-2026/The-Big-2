"""Light pollution estimate from NASA GIBS VIIRS Black Marble night-lights tiles.

We fetch the Web-Mercator PNG tile that contains the point, read the rendered brightness around it, and map that
to an approximate Bortle class. The mapping is monotonic and documented but NOT radiometrically calibrated:
the layer is a visual rendering, so treat the result as an estimate and say so in the UI.
"""
from __future__ import annotations

import io
import math
from datetime import date

from PIL import Image

from ..core.envelope import Provenance
from ..core.http import fetch

GIBS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/{tms}/{z}/{y}/{x}.png"
LAYER = "VIIRS_Black_Marble"
TMS = "GoogleMapsCompatible_Level8"
ZOOM = 8
DATE = "2016-01-01"  # Black Marble annual composite available in GIBS (moon- and atmosphere-corrected)
SAMPLE_RADIUS_PX = 3  # ~1.8 km at zoom 8 near the equator


def tile_xy(lat: float, lon: float, z: int) -> tuple[int, int, float, float]:
    n = 2**z
    xt = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    yt = (1.0 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2.0 * n
    return int(xt), int(yt), (xt - int(xt)) * 256, (yt - int(yt)) * 256


def brightness_to_bortle(b: float) -> float:
    """Map 0..255 rendered brightness to an approximate Bortle class 1..9 (monotonic, uncalibrated).

    Breakpoints chosen so that fully dark pixels are class 1-2, faint glow class 3-4, towns 5-6, cities 7-9.
    """
    pts = [(0, 1.5), (4, 2.5), (12, 3.5), (30, 4.5), (60, 5.5), (100, 6.5), (150, 7.5), (210, 8.5), (255, 9.0)]
    for (b0, c0), (b1, c1) in zip(pts, pts[1:]):
        if b <= b1:
            return round(c0 + (c1 - c0) * (b - b0) / (b1 - b0), 1)
    return 9.0


async def sample(lat: float, lon: float) -> tuple[dict, Provenance]:
    x, y, px, py = tile_xy(lat, lon, ZOOM)
    url = GIBS_URL.format(layer=LAYER, date=DATE, tms=TMS, z=ZOOM, y=y, x=x)
    f = await fetch("nasa-gibs", url, ttl=30 * 24 * 3600, binary=True, cache_name="gibs-tiles")
    img = Image.open(io.BytesIO(f.data)).convert("RGB")
    w, h = img.size
    cx, cy = int(px), int(py)
    vals = []
    for dx in range(-SAMPLE_RADIUS_PX, SAMPLE_RADIUS_PX + 1):
        for dy in range(-SAMPLE_RADIUS_PX, SAMPLE_RADIUS_PX + 1):
            xx, yy = min(w - 1, max(0, cx + dx)), min(h - 1, max(0, cy + dy))
            r, g, b = img.getpixel((xx, yy))
            vals.append(0.299 * r + 0.587 * g + 0.114 * b)
    vals.sort()
    median = vals[len(vals) // 2]
    peak = vals[-1]
    return (
        {
            "brightness": round(median, 1),
            "brightness_peak": round(peak, 1),
            "bortle": brightness_to_bortle(median),
            "layer": LAYER,
            "date": DATE,
            "tile": {"z": ZOOM, "x": x, "y": y},
            "note": "Bortle class estimated from rendered VIIRS Black Marble radiance; monotonic but uncalibrated.",
        },
        f.provenance,
    )
