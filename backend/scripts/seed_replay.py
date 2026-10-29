"""Record a demo-ready set of provider responses and copy them into data/replay-seed (committed).

Run from backend/ with the venv:  python scripts/seed_replay.py
It drives the app in-process (no server needed), calls the endpoints the demo uses for the demo cities and the
Lens samples, then copies every recording written during this run into data/replay-seed/.
With TSUKUYOMI_REPLAY_MODE=first a fresh clone then serves these recordings without the network.
"""
from __future__ import annotations

import os
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("TSUKUYOMI_REPLAY_MODE", "off")  # record live answers, never replay while seeding

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

CITIES = {"bengaluru": (12.97, 77.59), "kyoto": (35.01, 135.77)}


def main() -> None:
    replay = BACKEND / "data" / "replay"
    replay.mkdir(parents=True, exist_ok=True)
    # Recordings are written only on live calls, so clear the provider cache first: every call below then
    # reaches the provider and leaves a fresh recording.
    cache_dir = BACKEND / "data" / "cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    seed = BACKEND / "data" / "replay-seed"
    seed.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    calls: list[tuple[str, dict]] = []
    for name, (lat, lon) in CITIES.items():
        q = {"lat": lat, "lon": lon}
        calls += [
            ("/api/watchtower/forecast", q), ("/api/watchtower/score", q), ("/api/watchtower/light-pollution", q),
            ("/api/watchtower/spots", {**q, "radius_km": 60, "limit": 12}),
            ("/api/scroll/moon", q), ("/api/scroll/sun", q), ("/api/scroll/eclipses", q), ("/api/scroll/meteors", q),
            ("/api/scroll/passes", {**q, "days": 3}), ("/api/scroll/launches", q), ("/api/scroll/planets", q),
            ("/api/scroll/calendar", q), ("/api/scroll/events", {**q, "days": 7}),
            ("/api/aurora", q), ("/api/horizon/terrain", q),
            ("/api/transients/recent", {"class_name": "SNIa", "min_probability": 0.7, "limit": 25, **q}),
            ("/api/transients/near", {"ra": 10.68, "dec": 41.27, "radius_arcsec": 600, "limit": 25}),
            ("/api/spectra/at", {"ra": 214.4981, "dec": 25.1368}), ("/api/spectra/at", {"ra": 187.7059, "dec": 12.3911}),
        ]
    with TestClient(app) as c:
        for path, params in calls:
            t = time.time()
            r = c.get(path, params=params)
            print(f"{r.status_code} {path} {params} {time.time() - t:.1f}s")
        # the Lens: run the samples so SkyView/SIMBAD lookups for them are recorded too
        for sid in ("synthetic_field", "heic1502a"):
            r = c.post("/api/lens/jobs", data={"sample_id": sid})
            jid = r.json()["job_id"]
            for _ in range(120):
                j = c.get(f"/api/lens/jobs/{jid}").json()
                if j["status"] in ("done", "failed"):
                    break
                time.sleep(0.5)
            print(f"lens {sid}: {j['status']}")
            if j["status"] == "done" and j["result"]["wcs"]["solved"]:
                c.get(f"/api/lens/jobs/{jid}/skyview", params={"survey": "DSS2 Red"})
                c.get(f"/api/lens/jobs/{jid}/catalog")
                c.get(f"/api/transients/field/{jid}")
        # a transient's light curve, stamps and our subtraction
        objs = c.get("/api/transients/recent", params={"class_name": "SNIa", "min_probability": 0.7, "limit": 3}).json()["data"]["objects"]
        for o in objs[:2]:
            d = c.get(f"/api/transients/{o['oid']}", params={"lat": 12.97, "lon": 77.59}).json()["data"]
            det = next((x for x in reversed(d["lightcurve"]["detections"]) if x["has_stamp"]), d["lightcurve"]["detections"][-1] if d["lightcurve"]["detections"] else None)
            if det:
                for kind in ("science", "template", "difference"):
                    c.get(f"/api/transients/{o['oid']}/stamps/{det['candid']}/{kind}.png")
                c.post(f"/api/transients/{o['oid']}/subtract", params={"candid": det["candid"]})
    n = 0
    total = 0
    for p in replay.glob("*.json"):
        if p.stat().st_mtime >= t0 - 1:
            shutil.copy2(p, seed / p.name)
            n += 1
            total += p.stat().st_size
    print(f"seeded {n} recordings ({total / 1e6:.1f} MB) into {seed}")


if __name__ == "__main__":
    main()
