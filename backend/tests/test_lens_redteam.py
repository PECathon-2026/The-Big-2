"""Spirit Lens red team (docs/TEST_PLAN.md, B1 row 3).

A. Truth-based: synthetic fields from `samples.generate_synthetic` (known star list) at three noise levels plus a
   crowded field (five generated fields summed). False positives, completeness against the benchmark, flux
   conservation, forward-model honesty and "no invented structure" in empty sky.
B. Adversarial uploads through the HTTP API: each must end in a clean `done` with finite numbers, or a clean
   `failed` / 4xx with a readable message. Never a 500, never a hang, never a traceback.
C. Ten concurrent jobs (determinism, samples manifest intact) and a simulated restart.

No network: `app.core.http.fetch` (and the names imported from it) raise ProviderError, `httpx.get` (used by the
sample downloader) raises, and the two real ESA/Hubble samples are copied from the repo's data/samples when present.

Run: `.venv/Scripts/python -m pytest tests/test_lens_redteam.py -q`
"""
from __future__ import annotations

import io
import json
import math
import os
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pytest

BACKEND = Path(__file__).resolve().parents[1]
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from astropy.io import fits  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402
from skimage.metrics import structural_similarity  # noqa: E402

from app.core import http as core_http  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.http import ProviderError  # noqa: E402
from app.lens import benchmark as bench  # noqa: E402
from app.lens import catalog as lens_catalog  # noqa: E402
from app.lens import honesty  # noqa: E402
from app.lens import images as lens_images  # noqa: E402
from app.lens import jobs as jobstore  # noqa: E402
from app.lens import router as lens_router  # noqa: E402
from app.lens import samples  # noqa: E402
from app.lens import skyview as lens_skyview  # noqa: E402
from app.lens.detect import detect_sources_catalog  # noqa: E402
from app.main import app  # noqa: E402
from app.watchtower import spots  # noqa: E402

JOB_TIMEOUT = 120.0
MATCH_PX = bench.MATCH_PX            # 2 px, the benchmark's own matching radius
STATED_FP_RATE = 0.05                # benchmark.py states no rate; the plan says use 5 %
AGREEMENT_PTS = 0.05                 # benchmark vs independent matching: +-5 points
FLUX_TOL = 0.02                      # 2 %
GAL_ZONE = 6.0                       # detections within 6 r_e of a truth galaxy belong to the galaxy
EMPTY_STAR_R = 12.0                  # px: farther than this from every truth star is empty sky
EMPTY_GAL_K = 10.0                   # and farther than 10 r_e from every truth galaxy
HOT_PIXEL_MAX_DETECTIONS = 3         # "a few"

TIMINGS: list[str] = []
METRICS: list[str] = []


# ------------------------------------------------------------------------------------------------ fixtures

@pytest.fixture(scope="module")
def client(tmp_path_factory, request):
    mp = pytest.MonkeyPatch()
    data = tmp_path_factory.mktemp("lens_redteam_data")
    (data / "samples").mkdir()
    for name in ("heic1502a.jpg", "potw2048a.jpg"):  # read-only copy; the downloader then skips the network
        src = BACKEND / "data" / "samples" / name
        if src.exists():
            shutil.copy2(src, data / "samples" / name)
    mp.setattr(settings, "data_dir", str(data))
    mp.setattr(settings, "astrometry_api_key", "")

    async def no_network(*a, **k):
        raise ProviderError("test", "network disabled in tests")

    mp.setattr(core_http, "fetch", no_network)
    for mod in (lens_catalog, lens_skyview, spots):
        mp.setattr(mod, "fetch", no_network)
    import httpx

    def no_httpx(*a, **k):
        raise httpx.ConnectError("network disabled in tests")

    mp.setattr(httpx, "get", no_httpx)
    lens_router._samples_ready.clear()  # samples must be generated under the temp data dir
    t0 = time.time()
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    lens_router._samples_ready.clear()
    mp.undo()
    tr = request.config.pluginmanager.get_plugin("terminalreporter")
    if tr is not None:
        tr.write_line("")
        tr.write_line(f"--- lens red team: module wall time {time.time() - t0:.1f} s ---")
        for line in METRICS:
            tr.write_line("metric  " + line)
        for line in TIMINGS:
            tr.write_line("timing  " + line)


# ------------------------------------------------------------------------------------------------ helpers

def _post_file(client: TestClient, name: str, data: bytes, mime: str = "application/octet-stream", **params):
    form = {"denoise_strength": 0.5, "deblur_iterations": 0, "detect_sigma": 3.0, **params}
    return client.post("/api/lens/jobs", files={"file": (name, data, mime)}, data={k: str(v) for k, v in form.items()})


def _post_sample(client: TestClient, sample_id: str):
    return client.post("/api/lens/jobs", data={"sample_id": sample_id, "denoise_strength": "0.5",
                                                "deblur_iterations": "0", "detect_sigma": "3.0"})


def _wait(client: TestClient, job_id: str, label: str = "", timeout: float = JOB_TIMEOUT, t_submit: float | None = None) -> dict:
    t0 = t_submit or time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/api/lens/jobs/{job_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        if body["status"] in ("done", "failed"):
            el = None
            if body.get("result"):
                el = body["result"]["trace"]["inputs"].get("elapsed_s")
            stage_s = []
            for s in body["stages"]:
                if s.get("started_at") and s.get("ended_at"):
                    from datetime import datetime
                    d = (datetime.fromisoformat(s["ended_at"]) - datetime.fromisoformat(s["started_at"])).total_seconds()
                    stage_s.append(f"{s['name']}={d:.2f}")
            TIMINGS.append(f"{label or job_id}: {body['status']} wall {time.time() - t0:.1f}s, reported elapsed_s={el}; "
                           + " ".join(stage_s))
            return body
        time.sleep(0.2)
    raise AssertionError(f"job {label or job_id} did not finish within {timeout:.0f} s (last status {body['status']})")


def _assert_readable(msg) -> None:
    assert isinstance(msg, str) and msg.strip(), f"empty error message: {msg!r}"
    assert "Traceback" not in msg and 'File "' not in msg, f"traceback leaked into the message: {msg[:400]}"
    assert len(msg) < 1000, f"message is {len(msg)} chars long: {msg[:300]}..."


def _scan_finite(obj, path: str = "result") -> list[str]:
    bad: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            bad += _scan_finite(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            bad += _scan_finite(v, f"{path}[{i}]")
    elif isinstance(obj, float) and not math.isfinite(obj):
        bad.append(f"{path}={obj}")
    return bad


def _check_outcome(client: TestClient, r, label: str, render: bool = True) -> dict | None:
    """Assert a clean outcome. Returns the finished job body, or None for a clean 4xx."""
    assert r.status_code < 500, f"{label}: HTTP {r.status_code}: {r.text[:500]}"
    if r.status_code != 202:
        assert 400 <= r.status_code < 500, f"{label}: unexpected HTTP {r.status_code}"
        detail = r.json().get("detail")
        if isinstance(detail, str):
            _assert_readable(detail)
        else:
            assert detail, f"{label}: 4xx without a detail"
        return None
    body = _wait(client, r.json()["job_id"], label)
    assert body["status"] in ("done", "failed")
    still_running = [s["name"] for s in body["stages"] if s["status"] == "running"]
    assert not still_running, f"{label}: job is {body['status']} but stages {still_running} are still 'running'"
    if body["status"] == "failed":
        _assert_readable(body["error"])
        for s in body["stages"]:
            if s["status"] == "failed":
                _assert_readable(s["detail"])
        return body
    res = body["result"]
    assert res is not None
    bad = _scan_finite(res)
    assert not bad, f"{label}: non-finite numbers in the result: {bad[:10]}"
    assert all(s["status"] in ("done", "skipped") for s in body["stages"]), body["stages"]
    if render:
        for kind in lens_images.KINDS:
            ir = client.get(f"/api/lens/jobs/{body['job_id']}/image/{kind}")
            assert ir.status_code == 200, f"{label}: image/{kind} -> HTTP {ir.status_code}: {ir.text[:300]}"
            assert ir.content[:8] == b"\x89PNG\r\n\x1a\n", f"{label}: image/{kind} is not a PNG"
    return body


def _png16(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.clip(np.round(arr), 0, 65535).astype(np.uint16)).save(buf, format="PNG")
    return buf.getvalue()


def _png8(arr: np.ndarray, mode: str = "L") -> bytes:
    a8 = np.clip(np.round(arr), 0, 255).astype(np.uint8)
    if mode == "RGB":
        im = Image.fromarray(np.dstack([a8, a8, a8]), mode="RGB")
    elif mode == "RGBA":
        alpha = np.full_like(a8, 255)
        alpha[: a8.shape[0] // 4] = 128  # partly transparent band
        im = Image.fromarray(np.dstack([a8, a8, a8, alpha]), mode="RGBA")
    else:
        im = Image.fromarray(a8, mode="L")
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg(arr: np.ndarray, quality: int) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), mode="L").save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _fits(arr: np.ndarray, header: fits.Header | None = None) -> bytes:
    buf = io.BytesIO()
    fits.PrimaryHDU(arr, header=header).writeto(buf)
    return buf.getvalue()


def _to8(img16: np.ndarray) -> np.ndarray:
    return np.clip((img16.astype(np.float64) - 180.0) / 1500.0 * 255.0, 0, 255)


def _generate(tmpdir: Path, seed: int) -> tuple[np.ndarray, dict]:
    p = tmpdir / f"field_{seed}.png"
    truth = samples.generate_synthetic(p, seed=seed)
    return np.asarray(Image.open(p), dtype=np.float64), truth


# ------------------------------------------------------------------------------------------------ truth fields

@dataclass
class Run:
    name: str
    truth_stars: np.ndarray          # (N, 3): x, y, flux
    galaxies: list[dict]
    body: dict
    arrays: object
    restored_dets: list = field(default_factory=list)
    bench: dict | None = None
    bench_independent: dict | None = None

    @property
    def res(self) -> dict:
        return self.body["result"]


FIELDS = ("base", "noise_x2", "noise_x3", "crowded")


@pytest.fixture(scope="module")
def truth_runs(client, tmp_path_factory) -> dict[str, Run]:
    tmp = tmp_path_factory.mktemp("truth_fields")
    base, truth = _generate(tmp, 7)
    sigma_base = math.sqrt(truth["background"] + truth["read_noise"] ** 2)
    rng = np.random.default_rng(123)
    frames: dict[str, tuple[bytes, np.ndarray, list[dict]]] = {}
    stars = np.array([(s["x"], s["y"], s["flux"]) for s in truth["stars"]])
    frames["base"] = (_png16(base), stars, truth["galaxies"])
    # Noise x2 / x3 in sigma: add independent Gaussian noise (plus a pedestal so nothing clips at 0).
    for name, k in (("noise_x2", 2.0), ("noise_x3", 3.0)):
        extra = sigma_base * math.sqrt(k * k - 1.0)
        frames[name] = (_png16(base + 1000.0 + rng.normal(0, extra, base.shape)), stars, truth["galaxies"])
    # Crowded: five generated fields summed (1100 stars); the galaxies sit at the same places with 5x flux.
    acc = base.copy()
    all_stars = [stars]
    for seed in (8, 9, 10, 11):
        img, t = _generate(tmp, seed)
        acc += img - t["background"]
        all_stars.append(np.array([(s["x"], s["y"], s["flux"]) for s in t["stars"]]))
    gals = [dict(g, flux=g["flux"] * 5) for g in truth["galaxies"]]
    frames["crowded"] = (_png16(acc), np.vstack(all_stars), gals)

    ids = {}
    t_sub = time.time()
    for name, (data, _, _) in frames.items():
        r = _post_file(client, f"{name}.png", data, "image/png")
        assert r.status_code == 202, r.text
        ids[name] = r.json()["job_id"]
    runs: dict[str, Run] = {}
    for name, jid in ids.items():
        body = _wait(client, jid, f"truth:{name}", timeout=JOB_TIMEOUT * 2, t_submit=t_sub)
        assert body["status"] == "done", f"{name}: {body.get('error')}"
        job = jobstore.get_job(jid)
        assert job is not None and job.arrays is not None
        a = job.arrays
        rd = detect_sources_catalog(a.restored, a.rms_map, a.detect_sigma)
        _, st, gl = frames[name]
        runs[name] = Run(name=name, truth_stars=st, galaxies=gl, body=body, arrays=a, restored_dets=rd)
        METRICS.append(f"{name}: sigma={a.sigma:.2f} dets={len(body['result']['detections'])} restored_dets={len(rd)} "
                       f"truth_stars={len(st)} psf={body['result']['psf']['method']} fwhm={body['result']['psf']['fwhm_px']}")
    return runs


def _in_galaxy_zone(xy: np.ndarray, galaxies: list[dict], k: float) -> np.ndarray:
    m = np.zeros(len(xy), dtype=bool)
    for g in galaxies:
        m |= np.hypot(xy[:, 0] - g["x"], xy[:, 1] - g["y"]) < k * g["r_e"]
    return m


def _fp_stats(det_xy: np.ndarray, run: Run) -> tuple[int, int, float]:
    if len(det_xy) == 0:
        return 0, 0, 0.0
    d, _ = cKDTree(run.truth_stars[:, :2]).query(det_xy)
    considered = ~_in_galaxy_zone(det_xy, run.galaxies, GAL_ZONE)
    n = int(considered.sum())
    fp = int(((d > MATCH_PX) & considered).sum())
    return fp, n, (fp / n if n else 0.0)


def _flux_limit(run: Run) -> float:
    """The benchmark's stated faint limit: a peak of 5 sigma under the measured PSF kernel."""
    a = run.arrays
    if a.psf_kernel is not None:
        kmax = float((a.psf_kernel / a.psf_kernel.sum()).max())
    else:
        s = 3.37 / 2.3548
        kmax = 1.0 / (2 * math.pi * s * s)
    return 5.0 * a.sigma / kmax


def _completeness(run: Run) -> tuple[float, int]:
    lim = _flux_limit(run)
    st = run.truth_stars
    sel = (st[:, 2] >= lim) & ~_in_galaxy_zone(st[:, :2], run.galaxies, GAL_ZONE)
    bright = st[sel, :2]
    if not run.restored_dets or len(bright) == 0:
        return 0.0, len(bright)
    d, _ = cKDTree([(q.x, q.y) for q in run.restored_dets]).query(bright)
    return float(np.mean(d <= MATCH_PX)), len(bright)


def _run_benchmark(client: TestClient, run: Run) -> tuple[dict, dict]:
    """POST /benchmark, spying on the benchmark's detector calls to rebuild the injected truth independently."""
    if run.bench is not None:
        return run.bench, run.bench_independent
    calls: list[tuple[np.ndarray, list]] = []
    real = bench.detect_sources_catalog

    def spy(data, rms, sig, *a, **k):
        out = real(data, rms, sig, *a, **k)
        calls.append((np.array(data, dtype=np.float64, copy=True), out))
        return out

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(bench, "detect_sources_catalog", spy)
        r = client.post(f"/api/lens/jobs/{run.body['job_id']}/benchmark", params={"n_stars": 40})
    assert r.status_code == 200, r.text
    b = r.json()
    assert len(calls) == 2, f"expected 2 detector calls (before/after), got {len(calls)}"
    injected, after = calls[0][0], calls[1][1]
    a = run.arrays
    diff = injected - a.sub.astype(np.float64)
    k = a.psf_kernel / a.psf_kernel.sum() if a.psf_kernel is not None else bench._gaussian_kernel(a.psf_fwhm or 3.0)
    ks, kh = k.shape[0], k.shape[0] // 2
    # Injected stars are >= ks apart, so each is the only local maximum of the (noise-free) difference image
    # within a ks window; the faintest has a peak of ~5 sigma, ePSF wing noise stays far below 1 sigma.
    peaks = (diff == ndimage.maximum_filter(diff, size=ks, mode="constant")) & (diff > a.sigma)
    pys, pxs = np.nonzero(peaks)
    rr = max(2, int(math.ceil(a.psf_fwhm or 3.0)))
    yy, xx = np.mgrid[-rr: rr + 1, -rr: rr + 1]
    kw = k[kh - rr: kh + rr + 1, kh - rr: kh + rr + 1]
    k_off = np.array([(kw * yy).sum() / kw.sum(), (kw * xx).sum() / kw.sum()])  # kernel's own centroid offset
    pts = []
    for py, px in zip(pys, pxs):
        win = np.clip(diff[max(py - rr, 0): py + rr + 1, max(px - rr, 0): px + rr + 1], 0, None)
        wy, wx = np.mgrid[max(py - rr, 0): py + rr + 1, max(px - rr, 0): px + rr + 1]
        tot = win.sum()
        pts.append(((wx * win).sum() / tot - k_off[1], (wy * win).sum() / tot - k_off[0]))
    n = len(pts)
    inj_xy = np.array(pts).reshape(-1, 2)
    if after:
        d, _ = cKDTree([(q.x, q.y) for q in after]).query(inj_xy)
        rec = int(np.sum(d <= MATCH_PX))
    else:
        rec = 0
    indep = {"n_blobs": int(n), "recovered": rec, "rate": rec / n if n else 0.0}
    run.bench, run.bench_independent = b, indep
    METRICS.append(f"{run.name}: benchmark injected={b['injected']} recovered={b['recovered']} rate={b['recovery_rate']:.3f} "
                   f"fp={b['false_positives']} | independent blobs={n} recovered={rec}")
    return b, indep


def _empty_mask(run: Run) -> np.ndarray:
    h, w = run.arrays.sub.shape
    yy, xx = np.mgrid[:h, :w]
    pts = np.column_stack([xx.ravel(), yy.ravel()]).astype(np.float64)
    d, _ = cKDTree(run.truth_stars[:, :2]).query(pts, distance_upper_bound=EMPTY_STAR_R + 1)
    m = d > EMPTY_STAR_R
    for g in run.galaxies:
        m &= np.hypot(pts[:, 0] - g["x"], pts[:, 1] - g["y"]) > EMPTY_GAL_K * g["r_e"]
    return m.reshape(h, w)


# ------------------------------------------------------------------------------------------------ A. truth-based

@pytest.mark.parametrize("name", FIELDS)
def test_A1_false_positive_rate_reported_detections(truth_runs, name):
    run = truth_runs[name]
    xy = np.array([(d["x"], d["y"]) for d in run.res["detections"]]).reshape(-1, 2)
    fp, n, rate = _fp_stats(xy, run)
    METRICS.append(f"{name}: A1 original fp={fp}/{n} ({rate:.1%})")
    assert rate <= STATED_FP_RATE, f"{name}: {fp} of {n} detections are > {MATCH_PX} px from any true star ({rate:.1%})"


@pytest.mark.parametrize("name", FIELDS)
def test_A1_false_positive_rate_restored_frame(truth_runs, name):
    run = truth_runs[name]
    xy = np.array([(d.x, d.y) for d in run.restored_dets]).reshape(-1, 2)
    fp, n, rate = _fp_stats(xy, run)
    METRICS.append(f"{name}: A1 restored fp={fp}/{n} ({rate:.1%})")
    assert rate <= STATED_FP_RATE, f"{name}: {fp} of {n} restored-frame detections are > {MATCH_PX} px from any true star ({rate:.1%})"


@pytest.mark.parametrize("name", FIELDS)
def test_A2_benchmark_agrees_with_independent_matching(client, truth_runs, name):
    run = truth_runs[name]
    b, ind = _run_benchmark(client, run)
    assert ind["n_blobs"] == b["injected"], f"rebuilt {ind['n_blobs']} injected stars, benchmark says {b['injected']}"
    assert abs(ind["recovered"] - b["recovered"]) <= AGREEMENT_PTS * b["injected"], (
        f"{name}: benchmark recovered {b['recovered']}/{b['injected']}, independent matching {ind['recovered']}")


@pytest.mark.parametrize("name", FIELDS)
def test_A2_completeness_above_limit_vs_benchmark(client, truth_runs, name):
    run = truth_runs[name]
    b, _ = _run_benchmark(client, run)
    comp, n = _completeness(run)
    METRICS.append(f"{name}: A2 completeness {comp:.3f} over {n} truth stars above {_flux_limit(run):.0f} counts; "
                   f"benchmark {b['recovery_rate']:.3f}")
    assert n > 0
    assert comp >= b["recovery_rate"] - AGREEMENT_PTS, (
        f"{name}: completeness on the real field {comp:.3f} (n={n}) < benchmark recovery {b['recovery_rate']:.3f} - 0.05")


@pytest.mark.parametrize("name", FIELDS)
def test_A3_flux_conservation_reported(truth_runs, name):
    fc = truth_runs[name].res["honesty"]["flux_conservation"]
    METRICS.append(f"{name}: A3 reported flux {fc}")
    assert fc["median_ratio"] is not None, f"{name}: flux conservation not reported ({fc})"
    assert abs(fc["median_ratio"] - 1.0) <= FLUX_TOL, f"{name}: median restored/original flux ratio {fc['median_ratio']:.4f}"


@pytest.mark.parametrize("name", FIELDS)
def test_A3_flux_conservation_own_sums(truth_runs, name):
    from photutils.aperture import CircularAperture, aperture_photometry

    run = truth_runs[name]
    a = run.arrays
    s0, s1 = float(a.sub.astype(np.float64).sum()), float(a.restored.astype(np.float64).sum())
    frame_ratio = s1 / s0
    # Aperture sums (r = 2 FWHM) at the true positions of bright, isolated-from-galaxies stars.
    lim = _flux_limit(run)
    st = run.truth_stars
    h, w = a.sub.shape
    r_ap = 2.0 * (a.psf_fwhm or 3.37)
    sel = ((st[:, 2] >= 3 * lim) & ~_in_galaxy_zone(st[:, :2], run.galaxies, GAL_ZONE)
           & (st[:, 0] > r_ap + 1) & (st[:, 0] < w - r_ap - 1) & (st[:, 1] > r_ap + 1) & (st[:, 1] < h - r_ap - 1))
    ap = CircularAperture(st[sel, :2], r=r_ap)
    f0 = np.asarray(aperture_photometry(a.sub.astype(np.float64), ap)["aperture_sum"])
    f1 = np.asarray(aperture_photometry(a.restored.astype(np.float64), ap)["aperture_sum"])
    ok = f0 > 0
    ap_ratio = float(np.median(f1[ok] / f0[ok]))
    METRICS.append(f"{name}: A3 own frame-sum ratio {frame_ratio:.4f}, aperture median ratio {ap_ratio:.4f} over {int(ok.sum())} stars")
    assert abs(frame_ratio - 1.0) <= FLUX_TOL, f"{name}: total restored/original flux {frame_ratio:.4f}"
    assert abs(ap_ratio - 1.0) <= FLUX_TOL, f"{name}: median aperture flux ratio at true positions {ap_ratio:.4f}"


@pytest.mark.parametrize("name", FIELDS)
def test_A4_reblur_honest(truth_runs, name):
    """honesty.py has no SSIM threshold: its 'honest' call is verdict noise-like (structure < STRUCTURE_THRESHOLD),
    so that is what is asserted; the re-blur SSIM (original vs PSF (x) restored) is computed and recorded."""
    run = truth_runs[name]
    a = run.arrays
    h = run.res["honesty"]
    fm = h["forward_model"]
    o = a.sub.astype(np.float64)
    model = o - a.residual.astype(np.float64)
    dr = float(max(o.max() - o.min(), 1e-6))
    ssim_reblur = float(structural_similarity(o, model, data_range=dr))
    METRICS.append(f"{name}: A4 chi2={fm['chi2_reduced']:.3f} structure={fm['structure_score']:.3f} verdict={fm['verdict']} "
                   f"ssim(orig,restored)={h['ssim']:.4f} ssim(orig,reblur)={ssim_reblur:.4f} invented={h['invented_pixels']}")
    assert fm["verdict"] == "noise-like" and fm["structure_score"] < honesty.STRUCTURE_THRESHOLD, fm
    assert math.isfinite(ssim_reblur) and 0.0 < ssim_reblur <= 1.0


def test_A4_chi2_reduced_near_one_on_pure_gaussian_noise(client):
    rng = np.random.default_rng(5)
    noise = rng.normal(0.0, 1.0, (512, 512)).astype(np.float32)
    body = _check_outcome(client, _post_file(client, "noise.fits", _fits(noise)), "A4 pure noise FITS")
    assert body is not None and body["status"] == "done", body and body.get("error")
    chi2 = body["result"]["honesty"]["forward_model"]["chi2_reduced"]
    METRICS.append(f"A4 pure Gaussian noise: chi2_reduced={chi2:.4f} dets={len(body['result']['detections'])}")
    assert 0.8 <= chi2 <= 1.2, f"reduced chi2 {chi2:.4f} on pure Gaussian noise"


@pytest.mark.parametrize("name", FIELDS)
def test_A5_no_invented_pixels_in_empty_sky(truth_runs, name):
    run = truth_runs[name]
    a = run.arrays
    m = _empty_mask(run)
    n_empty = int(m.sum())
    thr = 3.0 * a.rms_map
    n_orig = int(((a.sub > thr) & m).sum())
    n_rest = int(((a.restored > thr) & m).sum())
    cap = 0.001 * n_empty  # below the 0.135 % that pure Gaussian noise gives by chance
    METRICS.append(f"{name}: A5 empty px={n_empty} >3sigma original={n_orig} restored={n_rest} cap={cap:.0f}")
    assert n_empty > 10000, f"{name}: only {n_empty} empty-sky pixels; mask too small to judge"
    assert n_rest <= 1.5 * n_orig, f"{name}: restored has {n_rest} >3 sigma empty-sky pixels vs {n_orig} in the original"
    assert n_rest <= cap, f"{name}: restored has {n_rest} >3 sigma empty-sky pixels (cap {cap:.0f})"


@pytest.mark.parametrize("name", FIELDS)
def test_A5_no_detections_in_empty_sky(truth_runs, name):
    run = truth_runs[name]
    m = _empty_mask(run)
    h, w = m.shape

    def in_empty(dets):
        out = []
        for x, y in dets:
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < w and 0 <= yi < h and m[yi, xi]:
                out.append((round(x, 1), round(y, 1)))
        return out

    orig = in_empty([(d["x"], d["y"]) for d in run.res["detections"]])
    rest = in_empty([(d.x, d.y) for d in run.restored_dets])
    METRICS.append(f"{name}: A5 detections in empty sky original={len(orig)} restored={len(rest)}")
    assert not orig, f"{name}: {len(orig)} reported detections in empty sky, e.g. {orig[:5]}"
    assert not rest, f"{name}: {len(rest)} restored-frame detections in empty sky, e.g. {rest[:5]}"


# ------------------------------------------------------------------------------------------------ B. adversarial

@pytest.fixture(scope="module")
def crop(tmp_path_factory) -> tuple[np.ndarray, np.ndarray]:
    """512x384 corner of the seed-7 synthetic field (16-bit counts) and the truth stars inside it."""
    img, truth = _generate(tmp_path_factory.mktemp("crop"), 7)
    c = img[:384, :512]
    st = np.array([(s["x"], s["y"], s["flux"]) for s in truth["stars"] if s["x"] < 512 and s["y"] < 384])
    return c, st


def test_B_pure_gaussian_noise(client):
    rng = np.random.default_rng(11)
    body = _check_outcome(client, _post_file(client, "noise16.png", _png16(rng.normal(1000, 10, (512, 512))), "image/png"),
                          "B pure noise")
    assert body is not None and body["status"] == "done", body and body.get("error")
    res = body["result"]
    METRICS.append(f"B pure noise: dets={len(res['detections'])} chi2={res['honesty']['forward_model']['chi2_reduced']:.3f}")
    assert len(res["detections"]) <= 2
    assert math.isfinite(res["honesty"]["forward_model"]["chi2_reduced"]) and math.isfinite(res["honesty"]["ssim"])


def test_B_fully_saturated_frame(client):
    body = _check_outcome(client, _post_file(client, "sat.png", _png8(np.full((256, 256), 255.0)), "image/png"), "B saturated")
    if body and body["status"] == "done":
        METRICS.append(f"B saturated: dets={len(body['result']['detections'])}")
        assert len(body["result"]["detections"]) == 0


def test_B_dark_frame_with_hot_pixels_not_stars(client):
    rng = np.random.default_rng(3)
    dark = rng.normal(100, 5, (512, 512))
    ys, xs = rng.integers(10, 502, 50), rng.integers(10, 502, 50)
    dark[ys, xs] = 60000
    body = _check_outcome(client, _post_file(client, "hot.png", _png16(dark), "image/png"), "B hot pixels")
    assert body is not None
    if body["status"] == "done":
        res = body["result"]
        METRICS.append(f"B hot pixels: dets={len(res['detections'])} counts={res['counts']}")
        assert len(res["detections"]) <= HOT_PIXEL_MAX_DETECTIONS, (
            f"{len(res['detections'])} detections on a dark frame with 50 single hot pixels; counts {res['counts']}")


def test_B_jpeg_quality_15_block_artefacts(client, crop):
    img, st = crop
    data = _jpeg(_to8(img), 15)
    body = _check_outcome(client, _post_file(client, "q15.jpg", data, "image/jpeg"), "B jpeg q15")
    assert body is not None and body["status"] == "done", body and body.get("error")
    n = len(body["result"]["detections"])
    METRICS.append(f"B jpeg q15: dets={n} truth stars in crop={len(st)}")
    assert 1 <= n <= 2 * (len(st) + 3), f"{n} detections on a JPEG of a crop holding {len(st)} stars"


@pytest.mark.parametrize("shape", [(40, 4000), (4000, 40)], ids=["4000x40", "40x4000"])
def test_B_extreme_aspect_ratio(client, shape):
    rng = np.random.default_rng(9)
    arr = rng.normal(50, 5, shape)
    h, w = shape
    yy, xx = np.mgrid[:h, :w]
    for _ in range(10):
        x, y = rng.uniform(5, w - 5), rng.uniform(5, h - 5)
        arr += 150 * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 1.4 ** 2))
    body = _check_outcome(client, _post_file(client, f"aspect_{w}x{h}.png", _png8(arr), "image/png"), f"B aspect {w}x{h}")
    if body and body["status"] == "done":
        METRICS.append(f"B aspect {w}x{h}: dets={len(body['result']['detections'])}")
        assert len(body["result"]["detections"]) <= 30


@pytest.mark.parametrize("side", [1, 2])
def test_B_tiny_image(client, side):
    _check_outcome(client, _post_file(client, f"tiny{side}.png", _png8(np.full((side, side), 100.0)), "image/png"), f"B {side}x{side}")


def test_B_large_image(client):
    rng = np.random.default_rng(1)
    arr = (20 + rng.integers(0, 3, (6000, 6000), dtype=np.uint8)).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="L").save(buf, format="PNG", compress_level=1)
    data = buf.getvalue()
    del arr
    r = _post_file(client, "large.png", data, "image/png")
    if r.status_code in (400, 413):
        _assert_readable(r.json()["detail"])
        return
    body = _check_outcome(client, r, f"B large 6000x6000 ({len(data) / 1e6:.1f} MB)", render=False)
    assert body is not None and body["status"] == "done", body and body.get("error")
    res = body["result"]
    METRICS.append(f"B large: {len(data) / 1e6:.1f} MB processed as {res['image']['width']}x{res['image']['height']}, "
                   f"dets={len(res['detections'])}")
    assert max(res["image"]["width"], res["image"]["height"]) <= 2048
    ir = client.get(f"/api/lens/jobs/{body['job_id']}/image/original")
    assert ir.status_code == 200


@pytest.fixture(scope="module")
def png16_crop_job(client, crop) -> dict:
    img, _ = crop
    body = _check_outcome(client, _post_file(client, "crop16.png", _png16(img), "image/png"), "B crop 16-bit PNG")
    assert body is not None and body["status"] == "done", body and body.get("error")
    return body


def test_B_fits_16bit_mono(client, crop, png16_crop_job):
    img, _ = crop
    data = _fits(np.clip(np.round(img), 0, 65535).astype(np.uint16))
    body = _check_outcome(client, _post_file(client, "crop16.fits", data), "B FITS 16-bit")
    assert body is not None and body["status"] == "done", body and body.get("error")
    n_fits, n_png = len(body["result"]["detections"]), len(png16_crop_job["result"]["detections"])
    METRICS.append(f"B FITS16: dets={n_fits} (same pixels as 16-bit PNG: {n_png})")
    assert body["result"]["image"]["is_fits"] is True
    assert n_fits == n_png, f"same pixels: FITS gave {n_fits} detections, PNG gave {n_png}"


def test_B_fits_32bit_float(client, crop, png16_crop_job):
    img, _ = crop
    data = _fits((img / 1000.0).astype(np.float32))
    body = _check_outcome(client, _post_file(client, "cropf32.fits", data), "B FITS float32")
    assert body is not None and body["status"] == "done", body and body.get("error")
    n_f, n_png = len(body["result"]["detections"]), len(png16_crop_job["result"]["detections"])
    METRICS.append(f"B FITS f32: dets={n_f} (PNG16 {n_png})")
    assert abs(n_f - n_png) <= 0.2 * n_png, f"float FITS gave {n_f} detections, the 16-bit PNG of the same field {n_png}"


@pytest.mark.parametrize("mode", ["RGB", "RGBA"])
def test_B_colour_png(client, crop, mode):
    img, st = crop
    body = _check_outcome(client, _post_file(client, f"crop_{mode}.png", _png8(_to8(img), mode), "image/png"), f"B {mode} PNG")
    assert body is not None and body["status"] == "done", body and body.get("error")
    res = body["result"]
    METRICS.append(f"B {mode}: channels={res['image']['channels']} dets={len(res['detections'])}")
    assert res["image"]["channels"] == 3
    assert 10 <= len(res["detections"]) <= 2 * (len(st) + 3)


@pytest.mark.parametrize("variant", ["zero_cd", "garbage_cd"])
def test_B_fits_broken_wcs(client, crop, variant):
    img, _ = crop
    hdr = fits.Header()
    hdr["CTYPE1"], hdr["CTYPE2"] = "RA---TAN", "DEC--TAN"
    hdr["CRVAL1"], hdr["CRVAL2"] = 10.68, 41.27
    hdr["CRPIX1"], hdr["CRPIX2"] = 256.0, 192.0
    if variant == "zero_cd":
        hdr["CD1_1"] = hdr["CD1_2"] = hdr["CD2_1"] = hdr["CD2_2"] = 0.0
    else:
        hdr["CD1_1"], hdr["CD1_2"], hdr["CD2_1"], hdr["CD2_2"] = "garbage", 1e30, -1e30, "nan?"
    data = _fits(np.clip(np.round(img), 0, 65535).astype(np.uint16), hdr)
    body = _check_outcome(client, _post_file(client, f"badwcs_{variant}.fits", data), f"B broken WCS {variant}")
    assert body is not None and body["status"] == "done", body and body.get("error")
    res = body["result"]
    wst = next(s for s in body["stages"] if s["name"] == "wcs")
    METRICS.append(f"B broken WCS {variant}: wcs={res['wcs']} stage={wst['status']}: {wst['detail']}")
    assert res["wcs"]["solved"] is False, f"garbage CD matrix reported as solved: {res['wcs']}"
    assert wst["status"] == "skipped" and wst["detail"] and "WCS" in wst["detail"], wst
    assert all(d["ra"] is None and d["dec"] is None for d in res["detections"])


def test_B_text_file_renamed_jpg_is_400(client):
    r = _post_file(client, "notes.jpg", b"this is plain text, not a JPEG\n" * 40, "image/jpeg")
    assert r.status_code < 500
    ended = ""
    if r.status_code == 202:
        body = _check_outcome(client, r, "B text as .jpg")
        ended = f"; job then ended {body['status']}: {body.get('error')}"
    assert r.status_code == 400, f"text file renamed .jpg accepted with HTTP {r.status_code}{ended}"
    _assert_readable(r.json()["detail"])


@pytest.mark.parametrize("name", ["empty.png", "empty.fits"])
def test_B_empty_upload_is_400(client, name):
    r = _post_file(client, name, b"")
    assert r.status_code == 400, f"{name}: HTTP {r.status_code}: {r.text[:300]}"
    _assert_readable(r.json()["detail"])


# ------------------------------------------------------------------------------------------------ C. concurrency, restart

def test_C1_ten_concurrent_jobs(client, crop):
    img, _ = crop
    # wait (bounded) for the background sample registration of the copied real images
    t0 = time.time()
    ids = []
    while time.time() - t0 < 20:
        ids = [s["id"] for s in client.get("/api/lens/samples").json()]
        if all((settings.data_path / "samples" / f).exists() is False or sid in ids
               for sid, f in (("heic1502a", "heic1502a.jpg"), ("potw2048a", "potw2048a.jpg"))):
            break
        time.sleep(0.2)
    expected_samples = set(ids)
    real = [s for s in ("heic1502a", "potw2048a") if s in ids]

    small = [_png16(img[y:y + 192, x:x + 256]) for y, x in ((0, 0), (192, 0), (0, 256))]
    plan: list[tuple[str, str, bytes | None]] = [("sample", "synthetic_field", None), ("sample", "synthetic_field", None)]
    plan += [("sample", s, None) for s in real]
    for i, d in enumerate(small):
        plan += [("file", f"small{i}.png", d), ("file", f"small{i}.png", d)]
    while len(plan) < 10:
        plan.append(("file", f"pad{len(plan)}.png", _png16(img[100:228, 100:356])))
    plan = plan[:10]

    stop = threading.Event()
    manifest_errors: list[str] = []

    def poll_manifest():
        while not stop.is_set():
            try:
                r = client.get("/api/lens/samples")
                lst = r.json()
                if r.status_code != 200 or not isinstance(lst, list) or "synthetic_field" not in [s["id"] for s in lst]:
                    manifest_errors.append(f"{r.status_code}: {r.text[:200]}")
            except Exception as e:  # noqa: BLE001
                manifest_errors.append(f"{type(e).__name__}: {e}")
            time.sleep(0.3)

    poller = threading.Thread(target=poll_manifest, daemon=True)
    poller.start()

    def submit(item):
        kind, name, data = item
        return _post_sample(client, name) if kind == "sample" else _post_file(client, name, data, "image/png")

    t_sub = time.time()
    with ThreadPoolExecutor(max_workers=10) as ex:
        resps = list(ex.map(submit, plan))
    for (kind, name, _), r in zip(plan, resps):
        assert r.status_code == 202, f"{kind}:{name} -> HTTP {r.status_code}: {r.text[:300]}"
    job_ids = [r.json()["job_id"] for r in resps]
    try:
        bodies = [_wait(client, jid, f"C1:{name}", timeout=180.0, t_submit=t_sub) for (_, name, _), jid in zip(plan, job_ids)]
    finally:
        stop.set()
        poller.join(timeout=5)
    TIMINGS.append(f"C1: 10 jobs finished {time.time() - t_sub:.1f} s after submission")
    for (kind, name, _), b in zip(plan, bodies):
        assert b["status"] in ("done", "failed"), (name, b["status"])
        if b["status"] == "failed":
            _assert_readable(b["error"])
    assert not manifest_errors, f"samples manifest broke while jobs ran: {manifest_errors[:3]}"
    r = client.get("/api/lens/samples")
    assert r.status_code == 200
    after_ids = {s["id"] for s in json.loads(r.text)}
    assert expected_samples <= after_ids, f"manifest lost entries: {expected_samples - after_ids}"

    def fingerprint(b):
        res = b["result"]
        h = res["honesty"]
        return (b["status"], len(res["detections"]), res["counts"], res["psf"]["fwhm_px"], res["restoration"]["deblur"]["iterations"],
                h["ssim"], h["psnr_db"], h["forward_model"], h["flux_conservation"], h["invented_pixels"],
                [(d["x"], d["y"], d["flux"]) for d in res["detections"]])

    groups: dict[str, list[dict]] = {}
    for (kind, name, _), b in zip(plan, bodies):
        groups.setdefault(f"{kind}:{name}", []).append(b)
    for key, bs in groups.items():
        if len(bs) < 2:
            continue
        assert all(b["status"] == "done" for b in bs), (key, [b.get("error") for b in bs])
        f0 = fingerprint(bs[0])
        for b in bs[1:]:
            assert fingerprint(b) == f0, f"{key}: identical inputs gave different results"


def _stage(name: str, status: str, t: str | None) -> dict:
    return {"name": name, "status": status, "started_at": t if status != "pending" else None,
            "ended_at": t if status in ("done", "skipped") else None, "detail": None}


@pytest.fixture(scope="module")
def restarted(client, crop) -> dict:
    img, _ = crop
    ids = []
    for i, (y, x) in enumerate(((0, 0), (128, 128), (192, 256), (64, 320))):
        r = _post_file(client, f"restart{i}.png", _png16(img[y:y + 128, x:x + 192]), "image/png")
        assert r.status_code == 202
        ids.append(r.json()["job_id"])
    before = {jid: _wait(client, jid, f"C2:restart{i}") for i, jid in enumerate(ids)}
    assert all(b["status"] == "done" for b in before.values()), before
    running_id, queued_id, done_ids = ids[0], ids[1], ids[2:]
    jobs_root = settings.data_path / "jobs"
    for jid, state in ((running_id, "running"), (queued_id, "queued")):
        p = jobs_root / jid / "job.json"
        info = json.loads(p.read_text(encoding="utf-8"))
        t = info["created_at"]
        if state == "running":
            info["stages"] = [_stage(s, "done", t) for s in jobstore.STAGES[:3]] + [_stage("psf", "running", t)] + \
                             [_stage(s, "pending", t) for s in jobstore.STAGES[4:]]
        else:
            info["stages"] = [_stage(s, "pending", t) for s in jobstore.STAGES]
        info.update(status=state, error=None, result=None)
        p.write_text(json.dumps(info), encoding="utf-8")
        for f in ("arrays.npz", "arrays.json"):
            (jobs_root / jid / f).unlink(missing_ok=True)
    disk_before = {jid: (jobs_root / jid / "job.json").read_bytes() for jid in done_ids}
    # the restart: the process memory is gone; the router's GET goes through jobstore.get_job -> _load_from_disk
    with jobstore._jobs_lock:
        for jid in ids:
            jobstore._jobs.pop(jid, None)
    after = {jid: client.get(f"/api/lens/jobs/{jid}") for jid in ids}
    return {"running": running_id, "queued": queued_id, "done": done_ids, "before": before, "after": after,
            "disk_before": disk_before, "jobs_root": jobs_root}


def test_C2_restart_marks_interrupted_jobs_failed(client, restarted):
    for key in ("running", "queued"):
        r = restarted["after"][restarted[key]]
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "failed", f"{key} job after restart: {b['status']}"
        _assert_readable(b["error"])
        assert "restart" in b["error"].lower(), b["error"]
    for jid in restarted["done"]:
        r = restarted["after"][jid]
        assert r.status_code == 200
        assert r.json() == restarted["before"][jid], "a done job changed across the restart"
        assert (restarted["jobs_root"] / jid / "job.json").read_bytes() == restarted["disk_before"][jid]
        ir = client.get(f"/api/lens/jobs/{jid}/image/restored")
        assert ir.status_code == 200, f"done job lost its arrays across the restart: {ir.status_code}"


def test_C2_restart_failed_jobs_show_no_running_stage(restarted):
    """Beyond the plan's letter: a job reported failed must not still show a stage 'running' (the UI would spin)."""
    b = restarted["after"][restarted["running"]].json()
    stuck = [s["name"] for s in b["stages"] if s["status"] == "running"]
    assert not stuck, f"job is failed after restart but stages {stuck} still say 'running'"
