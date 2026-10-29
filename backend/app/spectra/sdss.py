"""SDSS spectra: find the nearest spectroscopic object to a sky position, fetch its spectrum FITS from the
SDSS Science Archive Server, and return a plot-ready spectrum with the pipeline's own measured emission lines."""
from __future__ import annotations

import io
from typing import Any

import numpy as np
from astropy.io import fits

from ..core.envelope import Provenance
from ..core.http import ProviderError, fetch

SQL_URL = "https://skyserver.sdss.org/dr18/SkyServerWS/SearchTools/SqlSearch"
SAS = "https://dr17.sdss.org/sas/dr17"

# rest-frame wavelengths (Å, vacuum) of lines worth labelling even when the pipeline did not fit them
REST_LINES = {
    "[O II] 3727": 3727.1, "Ca II K": 3934.8, "Ca II H": 3969.6, "Hδ": 4102.9, "Hγ": 4341.7, "Hβ": 4862.7,
    "[O III] 4959": 4960.3, "[O III] 5007": 5008.2, "Mg b": 5176.7, "Na D": 5895.6, "[N II] 6548": 6549.9, "Hα": 6564.6,
    "[N II] 6583": 6585.3, "[S II] 6716": 6718.3, "[S II] 6731": 6732.7,
}


async def nearest(ra: float, dec: float, radius_arcmin: float = 1.0, limit: int = 5) -> tuple[list[dict[str, Any]], Provenance]:
    sql = (
        f"SELECT TOP {limit} s.specObjID, s.plate, s.mjd, s.fiberID, s.class, s.subClass, s.z, s.zErr, s.ra, s.dec, s.survey, s.run2d, "
        f"s.snMedian, n.distance FROM SpecObj AS s JOIN dbo.fGetNearbySpecObjEq({ra:.6f}, {dec:.6f}, {radius_arcmin:.3f}) AS n "
        f"ON s.specObjID = n.specObjID ORDER BY n.distance"
    )
    f = await fetch("sdss-skyserver", SQL_URL, params={"cmd": sql, "format": "json"}, ttl=7 * 86400)
    rows = []
    try:
        rows = f.data[0]["Rows"]
    except (KeyError, IndexError, TypeError) as e:
        raise ProviderError("sdss-skyserver", f"unexpected reply: {e}") from e
    out = []
    for r in rows:
        out.append({
            "spec_obj_id": str(r["specObjID"]), "plate": int(r["plate"]), "mjd": int(r["mjd"]), "fiberid": int(r["fiberID"]),
            "class": (r.get("class") or "").strip(), "subclass": (r.get("subClass") or "").strip(), "z": float(r["z"]), "z_err": float(r["zErr"]) if r.get("zErr") is not None else None,
            "ra": float(r["ra"]), "dec": float(r["dec"]), "survey": (r.get("survey") or "").strip(), "run2d": str(r.get("run2d") or "").strip(),
            "sn_median": float(r["snMedian"]) if r.get("snMedian") is not None else None, "separation_arcsec": round(float(r["distance"]) * 60, 2),
        })
    return out, f.provenance


def fits_url(plate: int, mjd: int, fiberid: int, run2d: str, survey: str) -> str:
    branch = "sdss" if survey.lower() in ("sdss", "segue1", "segue2") or run2d.isdigit() else "eboss"
    return f"{SAS}/{branch}/spectro/redux/{run2d}/spectra/lite/{plate:04d}/spec-{plate:04d}-{mjd}-{fiberid:04d}.fits"


async def spectrum_fits(plate: int, mjd: int, fiberid: int, run2d: str, survey: str) -> tuple[bytes, Provenance]:
    url = fits_url(plate, mjd, fiberid, run2d, survey)
    f = await fetch("sdss-sas", url, ttl=30 * 86400, binary=True, cache_name="sdss-spectra", retries=1)
    return f.data, f.provenance


def parse(data: bytes, max_points: int = 900) -> dict[str, Any]:
    """FITS lite → {wavelength, flux, model, ...} binned to ~max_points, plus the pipeline's measured lines."""
    with fits.open(io.BytesIO(data)) as h:
        coadd = h["COADD"].data
        lam = 10 ** np.asarray(coadd["loglam"], dtype=float)
        flux = np.asarray(coadd["flux"], dtype=float)
        model = np.asarray(coadd["model"], dtype=float)
        ivar = np.asarray(coadd["ivar"], dtype=float)
        hdr0 = h[0].header
        meta_hdu = next((h[n] for n in ("SPECOBJ", "SPALL") if n in h), h[2])  # legacy SDSS vs eBOSS naming
        so = meta_hdu.data[0]
        z = float(so["Z"])
        meta = {
            "plate": int(hdr0.get("PLATEID", 0)), "mjd": int(hdr0.get("MJD", 0)), "fiberid": int(hdr0.get("FIBERID", 0)),
            "ra": float(hdr0.get("RA", 0.0)), "dec": float(hdr0.get("DEC", 0.0)), "class": str(so["CLASS"]).strip(), "subclass": str(so["SUBCLASS"]).strip(),
            "z": z, "z_err": float(so["Z_ERR"]), "sn_median": float(so["SN_MEDIAN_ALL"]) if "SN_MEDIAN_ALL" in meta_hdu.columns.names else None,
            "exptime_s": float(hdr0.get("EXPTIME", 0.0)), "flux_unit": str(hdr0.get("BUNIT", "1E-17 erg/cm^2/s/Ang")).strip(),
        }
        lines = []
        if "SPZLINE" in h:
            for r in h["SPZLINE"].data:
                area, err = float(r["LINEAREA"]), float(r["LINEAREA_ERR"])
                if err <= 0 or abs(area) < 3 * err:
                    continue
                rest = float(r["LINEWAVE"])
                lines.append({
                    "name": str(r["LINENAME"]).strip().replace("_", " "), "rest_wavelength": round(rest, 1),
                    "observed_wavelength": round(rest * (1 + float(r["LINEZ"])), 1), "z": round(float(r["LINEZ"]), 5),
                    "area": round(area, 2), "area_err": round(err, 2), "sigma_kms": round(float(r["LINESIGMA"]), 1), "equivalent_width": round(float(r["LINEEW"]), 2),
                    "emission": area > 0, "significance": round(abs(area) / err, 1),
                })
    # bin to a manageable size, keeping the median in each bin (robust to spikes)
    good = ivar > 0
    n = len(lam)
    step = max(1, -(-n // max_points))  # ceil, so the output never exceeds max_points
    w, fl, md = [], [], []
    for i in range(0, n, step):
        sl = slice(i, i + step)
        g = good[sl]
        if not g.any():
            continue
        w.append(round(float(np.median(lam[sl][g])), 2))
        fl.append(round(float(np.median(flux[sl][g])), 3))
        md.append(round(float(np.median(model[sl][g])), 3))
    # expected positions of the familiar lines at this redshift (labels, not measurements)
    expected = [{"name": k, "rest_wavelength": v, "observed_wavelength": round(v * (1 + z), 1)} for k, v in REST_LINES.items() if lam[0] <= v * (1 + z) <= lam[-1]]
    return {
        **meta,
        "wavelength": w, "flux": fl, "model": md, "n_pixels": int(n), "binned_to": len(w),
        "wavelength_range": [round(float(lam[0]), 1), round(float(lam[-1]), 1)],
        "lines_measured": sorted(lines, key=lambda l: -l["significance"]),
        "lines_expected": expected,
        "note": "SDSS coadded spectrum (flux in 1e-17 erg/cm²/s/Å), binned by median. Measured lines come from the SDSS pipeline fits (spZline), kept when the line area exceeds 3σ; expected lines are rest-frame wavelengths shifted by the pipeline redshift.",
    }
