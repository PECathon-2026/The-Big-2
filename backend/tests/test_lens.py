"""End-to-end test of the Spirit Lens pipeline on the synthetic sample through the FastAPI TestClient.

Run from anywhere: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_lens.py -s`.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wait(client: TestClient, job_id: str, timeout: float = 60.0) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/api/lens/jobs/{job_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        if body["status"] in ("done", "failed"):
            return body
        time.sleep(0.25)
    raise AssertionError("job did not finish in time")


def test_samples_listed(client: TestClient):
    r = client.get("/api/lens/samples")
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert "synthetic_field" in ids
    r = client.get("/api/lens/samples/synthetic_field")
    assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_full_pipeline_on_synthetic_sample(client: TestClient):
    t0 = time.time()
    r = client.post("/api/lens/jobs", data={"sample_id": "synthetic_field", "denoise_strength": 0.5, "deblur_iterations": 0, "detect_sigma": 3.0})
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]

    # queryable while running
    r = client.get(f"/api/lens/jobs/{job_id}")
    assert r.status_code == 200
    assert [s["name"] for s in r.json()["stages"]] == ["load", "background", "detect", "psf", "denoise", "deblur", "honesty", "classify", "wcs"]

    body = _wait(client, job_id)
    elapsed = time.time() - t0
    assert body["status"] == "done", body.get("error")
    res = body["result"]
    assert res is not None
    assert all(s["status"] in ("done", "skipped") for s in body["stages"]), body["stages"]
    assert all(s["started_at"] and s["ended_at"] for s in body["stages"])

    h = res["honesty"]
    fm = h["forward_model"]
    print("\n--- Spirit Lens on synthetic_field ---")
    print(f"elapsed            {elapsed:.1f} s")
    print(f"detections         {len(res['detections'])}  counts={res['counts']}")
    print(f"noise sigma        {res['noise']['background_sigma']:.3f}  background {res['noise']['background_median']:.2f}")
    print(f"psf                {res['psf']}")
    print(f"deblur             {res['restoration']['deblur']}")
    print(f"ssim               {h['ssim']:.4f}")
    print(f"psnr_db            {h['psnr_db']:.2f}")
    print(f"chi2_reduced       {fm['chi2_reduced']:.4f}")
    print(f"structure_score    {fm['structure_score']:.4f}  verdict={fm['verdict']}")
    print(f"flux_conservation  {h['flux_conservation']}")
    print(f"position_shift     {h['position_shift']}")
    print(f"invented_pixels    {h['invented_pixels']}")
    for n in h["notes"]:
        print("  note:", n)

    assert len(res["detections"]) > 10
    assert res["psf"]["method"] in ("epsf", "gaussian-fit")
    assert res["restoration"]["deblur"]["applied"] is True
    assert fm["verdict"] == "noise-like"
    assert h["flux_conservation"]["within_5pct_fraction"] > 0.7
    assert h["position_shift"]["median_shift_px"] < 0.5
    assert res["wcs"]["solved"] is False
    assert "instrumental" in res["units_note"]
    assert elapsed < 20.0

    # every detection is a real measurement
    d0 = res["detections"][0]
    for key in ("x", "y", "flux", "peak", "snr", "fwhm_px", "a", "b", "theta_deg", "ellipticity", "kind", "mag_instrumental", "size_px"):
        assert key in d0
    assert d0["kind"] in ("star", "galaxy", "unknown")

    # images
    for kind in ("original", "denoised", "restored", "residual", "psf", "noise", "overlay"):
        r = client.get(f"/api/lens/jobs/{job_id}/image/{kind}")
        assert r.status_code == 200 and r.headers["content-type"] == "image/png", kind
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    r = client.get(f"/api/lens/jobs/{job_id}/image/original", params={"stretch": "linear"})
    assert r.status_code == 200

    # benchmark
    t1 = time.time()
    r = client.post(f"/api/lens/jobs/{job_id}/benchmark", params={"n_stars": 40})
    assert r.status_code == 200, r.text
    b = r.json()
    print(f"benchmark ({time.time() - t1:.1f} s) {b}")
    assert b["injected"] >= 30
    assert b["recovery_rate"] > 0.8
    assert b["baseline_detections"] > 0 and 0 <= b["recovered_before_restoration"] <= b["injected"]
    assert h["flux_conservation"]["n_sources"] >= 5 and "n_saturated_excluded" in h["flux_conservation"]
    assert b["position_error_rms_px"] is not None and b["position_error_rms_px"] < 1.0

    # endpoints that need a WCS answer 404 honestly
    assert client.get(f"/api/lens/jobs/{job_id}/skyview").status_code == 404
    assert client.get(f"/api/lens/jobs/{job_id}/catalog").status_code == 404
    r = client.post(f"/api/lens/jobs/{job_id}/solve")
    assert r.status_code in (400, 200)  # 400 without an astrometry.net key


def test_unknown_job_and_bad_upload(client: TestClient):
    assert client.get("/api/lens/jobs/nope").status_code == 404
    r = client.post("/api/lens/jobs", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 415  # refused at the door, before a worker is spent on it
    # a valid signature with a damaged body still fails inside the job, with a readable reason
    r = client.post("/api/lens/jobs", files={"file": ("x.png", b"\x89PNG\r\n\x1a\n" + b"garbage" * 20, "image/png")})
    assert r.status_code == 202
    body = _wait(client, r.json()["job_id"])
    assert body["status"] == "failed" and "cannot decode this image" in body["error"]


def test_press_jpeg_display_keeps_dust_lanes(client: TestClient):
    """A galaxy press JPEG: pixels darker than the fitted 'background' (dust lanes) must not clip to black."""
    import io

    import numpy as np
    from PIL import Image

    if client.get("/api/lens/samples/heic1502a").status_code != 200:
        pytest.skip("real sample not downloaded in this environment")
    r = client.post("/api/lens/jobs", data={"sample_id": "heic1502a", "denoise_strength": 0.5, "deblur_iterations": 0, "detect_sigma": 3.0})
    job = _wait(client, r.json()["job_id"], timeout=90)
    assert job["status"] == "done", job.get("error")
    png = client.get(f"/api/lens/jobs/{job['job_id']}/image/original", params={"stretch": "linear"}).content
    im = np.array(Image.open(io.BytesIO(png)))
    black = float((im.max(axis=2) == 0).mean())
    assert black < 0.01, f"{black:.1%} of the display is pure black"
    # the restored frame must wear the same colour: only the measured luminance change is added to each channel
    rest = np.array(Image.open(io.BytesIO(client.get(f"/api/lens/jobs/{job['job_id']}/image/restored", params={"stretch": "linear"}).content)))
    chroma_o = float((im.max(axis=2).astype(int) - im.min(axis=2)).mean())
    chroma_r = float((rest.max(axis=2).astype(int) - rest.min(axis=2)).mean())
    assert chroma_r > 0.7 * chroma_o, f"restored lost its colour: chroma {chroma_r:.1f} vs original {chroma_o:.1f}"


def test_jobs_list_for_the_dojo(client: TestClient):
    r = client.post("/api/lens/jobs", data={"sample_id": "synthetic_field", "denoise_strength": 0.5, "deblur_iterations": 0, "detect_sigma": 3.0})
    jid = r.json()["job_id"]
    _wait(client, jid, timeout=90)
    rows = client.get("/api/lens/jobs", params={"limit": 200}).json()
    row = next(x for x in rows if x["job_id"] == jid)
    assert row["status"] == "done" and row["stars"] > 0 and row["ssim"] is not None and row["verdict"]
