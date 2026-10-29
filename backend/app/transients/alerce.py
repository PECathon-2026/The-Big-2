"""ALeRCE broker adapter: ZTF alert objects, light curves, classifier probabilities and alert stamps."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from ..core.envelope import Provenance
from ..core.http import fetch

API = "https://api.alerce.online/ztf/v1"
STAMPS = "https://avro.alerce.online/get_stamp"
BANDS = {1: "g", 2: "r", 3: "i"}
MJD_EPOCH = datetime(1858, 11, 17, tzinfo=timezone.utc)

CLASSES = ["SNIa", "SNIbc", "SNII", "SLSN", "CV/Nova", "AGN", "Blazar", "QSO", "YSO", "LPV", "RRL", "CEP", "DSCT", "E", "Periodic-Other"]


def mjd_to_dt(mjd: float) -> datetime:
    return MJD_EPOCH + timedelta(days=mjd)


def _obj(o: dict[str, Any]) -> dict[str, Any]:
    return {
        "oid": o["oid"],
        "ra": o.get("meanra"),
        "dec": o.get("meandec"),
        "ndet": o.get("ndet"),
        "first_detection": mjd_to_dt(o["firstmjd"]).isoformat() if o.get("firstmjd") else None,
        "last_detection": mjd_to_dt(o["lastmjd"]).isoformat() if o.get("lastmjd") else None,
        "days_active": round(o["deltajd"], 1) if o.get("deltajd") is not None else None,
        "class": o.get("class"),
        "classifier": o.get("classifier"),
        "probability": o.get("probability"),
        "stellar": o.get("stellar"),
        "alerce_url": f"https://alerce.online/object/{o['oid']}",
    }


async def cone(ra: float, dec: float, radius_arcsec: float = 600, limit: int = 20) -> tuple[list[dict[str, Any]], Provenance]:
    params = {"ra": ra, "dec": dec, "radius": radius_arcsec, "page_size": limit, "order_by": "ndet", "order_mode": "DESC"}
    f = await fetch("alerce", f"{API}/objects/", params=params, ttl=6 * 3600)
    return [_obj(o) for o in f.data.get("items", [])], f.provenance


async def recent(class_name: str = "SNIa", min_probability: float = 0.5, limit: int = 20, classifier: str = "lc_classifier") -> tuple[list[dict[str, Any]], Provenance]:
    params = {"classifier": classifier, "class": class_name, "probability": min_probability, "page_size": limit, "order_by": "lastmjd", "order_mode": "DESC"}
    f = await fetch("alerce", f"{API}/objects/", params=params, ttl=3600)
    return [_obj(o) for o in f.data.get("items", [])], f.provenance


async def obj(oid: str) -> tuple[dict[str, Any], Provenance]:
    f = await fetch("alerce", f"{API}/objects/{oid}", ttl=6 * 3600)
    return _obj(f.data), f.provenance


async def lightcurve(oid: str) -> tuple[dict[str, Any], Provenance]:
    f = await fetch("alerce", f"{API}/objects/{oid}/lightcurve", ttl=6 * 3600)
    dets = []
    for d in f.data.get("detections", []):
        if d.get("magpsf") is None:
            continue
        dets.append({
            "mjd": d["mjd"],
            "date": mjd_to_dt(d["mjd"]).isoformat(),
            "band": BANDS.get(d.get("fid"), str(d.get("fid"))),
            "mag": round(d["magpsf"], 3),
            "err": round(d.get("sigmapsf") or 0.0, 3),
            "candid": str(d.get("candid")),
            "has_stamp": bool(d.get("has_stamp")),
            "real_bogus": d.get("rb"),
        })
    nondets = [
        {"mjd": n["mjd"], "date": mjd_to_dt(n["mjd"]).isoformat(), "band": BANDS.get(n.get("fid"), str(n.get("fid"))), "limit": round(n["diffmaglim"], 3)}
        for n in f.data.get("non_detections", [])
        if n.get("diffmaglim") is not None
    ]
    dets.sort(key=lambda x: x["mjd"])
    by_band: dict[str, dict[str, Any]] = {}
    for d in dets:
        b = by_band.setdefault(d["band"], {"n": 0, "brightest": 99.0, "faintest": -99.0})
        b["n"] += 1
        b["brightest"] = min(b["brightest"], d["mag"])
        b["faintest"] = max(b["faintest"], d["mag"])
    peak = min(dets, key=lambda d: d["mag"]) if dets else None
    return {
        "oid": oid,
        "detections": dets,
        "non_detections": nondets,
        "bands": by_band,
        "peak": peak,
        "note": "ZTF PSF magnitudes on difference images (magpsf); non-detections give the limiting magnitude of each visit.",
    }, f.provenance


async def probabilities(oid: str) -> tuple[list[dict[str, Any]], Provenance]:
    f = await fetch("alerce", f"{API}/objects/{oid}/probabilities", ttl=24 * 3600)
    rows = [p for p in f.data if p.get("classifier_name") == "lc_classifier"]
    rows.sort(key=lambda p: -p.get("probability", 0))
    return [{"class": p["class_name"], "probability": round(p["probability"], 4), "classifier": p["classifier_name"], "version": p.get("classifier_version")} for p in rows[:5]], f.provenance


async def stamp(oid: str, candid: str, kind: str = "science", fmt: str = "png") -> tuple[bytes, Provenance]:
    f = await fetch("alerce-stamps", STAMPS, params={"oid": oid, "candid": candid, "format": fmt, "type": kind}, ttl=30 * 24 * 3600, binary=True)
    return f.data, f.provenance
