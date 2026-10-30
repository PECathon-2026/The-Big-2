"""SIMBAD cross-match for the brightest detections of a plate-solved image.

One small cone query per target (TAP sync, JSON), issued concurrently: a single CONTAINS/CIRCLE uses SIMBAD's
spatial index and answers in about a second, whereas OR-chained cones take tens of seconds. The first reachable
mirror is probed once per process. Results are cached for seven days through core.http.fetch. Fails soft: an
unreachable SIMBAD yields an empty list and a note, never an error page.
"""
from __future__ import annotations

import asyncio

import numpy as np

from ..core.envelope import Provenance
from ..core.http import ProviderError, fetch
from .models import CatalogMatch, Detection
def tap_ok(d) -> bool:
    """A TAP JSON reply always has a `data` table (possibly empty); anything else is an error page or a stub."""
    return isinstance(d, dict) and isinstance(d.get("data"), list)


SIMBAD_MIRRORS = (  # Harvard first: it is the mirror the demo recordings hold, and the CDS hosts refuse some networks
    "https://simbad.harvard.edu/simbad/sim-tap/sync",
    "https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
    "https://simbad.u-strasbg.fr/simbad/sim-tap/sync",
)
TTL_7_DAYS = 7 * 86400
MAX_TARGETS = 10
_live_mirror: str | None = None


def _radius_deg(pixel_scale_arcsec: float, fwhm_px: float | None) -> float:
    r_arcsec = max(3.0 * pixel_scale_arcsec * (fwhm_px or 3.0), 5.0)
    return min(r_arcsec, 120.0) / 3600.0


def _angular_sep_arcsec(ra1: float, dec1: float, ra2: np.ndarray, dec2: np.ndarray) -> np.ndarray:
    """Haversine separation in arcseconds."""
    r1, d1, r2, d2 = map(np.deg2rad, (ra1, dec1, ra2, dec2))
    h = np.sin((d2 - d1) / 2) ** 2 + np.cos(d1) * np.cos(d2) * np.sin((r2 - r1) / 2) ** 2
    return np.rad2deg(2 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))) * 3600.0


def _params(adql: str) -> dict[str, str]:
    return {"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "MAXREC": "50", "QUERY": adql}


async def _find_mirror() -> tuple[str | None, list[str]]:
    """Return the first mirror that answers a trivial query (remembered for the process), plus the errors seen."""
    global _live_mirror
    if _live_mirror:
        return _live_mirror, []
    errors: list[str] = []
    for url in SIMBAD_MIRRORS:
        try:
            await fetch("simbad", url, params=_params("SELECT TOP 1 main_id FROM basic"), ttl=3600, retries=0, validate=tap_ok)
            _live_mirror = url
            return url, errors
        except ProviderError as e:
            errors.append(f"{url.split('/')[2]}: {e.message}")
    return None, errors


async def _cone(url: str, d: Detection, r: float):
    adql = (f"SELECT main_id, otype, ra, dec FROM basic WHERE CONTAINS(POINT('ICRS', ra, dec), "
            f"CIRCLE('ICRS', {d.ra:.6f}, {d.dec:.6f}, {r:.6f})) = 1")
    return await fetch("simbad", url, params=_params(adql), ttl=TTL_7_DAYS, retries=0, validate=tap_ok)


async def simbad_matches(dets: list[Detection], pixel_scale_arcsec: float, fwhm_px: float | None) -> tuple[list[CatalogMatch], str | None, Provenance | None]:
    """Query SIMBAD around the brightest detections (those with RA/Dec) and return the nearest object per cone."""
    targets = [d for d in dets if d.ra is not None and d.dec is not None][:MAX_TARGETS]
    if not targets:
        return [], "no detections with sky coordinates", None
    r = _radius_deg(pixel_scale_arcsec, fwhm_px)
    url, errors = await _find_mirror()
    if url is None:
        return [], "SIMBAD unreachable (" + "; ".join(errors) + ")", Provenance(source="simbad", url=SIMBAD_MIRRORS[0], note="; ".join(errors))
    results = await asyncio.gather(*(_cone(url, d, r) for d in targets), return_exceptions=True)
    out: list[CatalogMatch] = []
    failed = 0
    prov: Provenance | None = None
    for d, got in zip(targets, results):
        if isinstance(got, BaseException):
            failed += 1
            continue
        prov = prov or got.provenance
        rows = got.data.get("data") or []
        if not rows:
            continue
        ras = np.array([float(x[2]) for x in rows])
        decs = np.array([float(x[3]) for x in rows])
        sep = _angular_sep_arcsec(float(d.ra), float(d.dec), ras, decs)
        i = int(np.argmin(sep))
        out.append(CatalogMatch(detection_id=d.id, name=str(rows[i][0]).strip(), otype=str(rows[i][1]) if rows[i][1] is not None else None,
                                ra=float(ras[i]), dec=float(decs[i]), separation_arcsec=float(sep[i])))
    note = (f"search radius {r * 3600:.1f} arcsec around the {len(targets)} brightest detections via {url.split('/')[2]}; "
            f"nearest SIMBAD object per cone; {len(out)} matched")
    if failed:
        note += f"; {failed} cone queries failed"
    if prov is None:
        prov = Provenance(source="simbad", url=url, note=note)
    return out, note, prov
