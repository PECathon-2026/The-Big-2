"""Sample images for the Spirit Lens.

* `synthetic_field.png` (1024 x 768) is generated locally with a known Gaussian PSF, Gaussian stars, a few
  elliptical galaxies, Poisson + Gaussian noise and a slight extra blur; the truth table is saved next to it.
* Real ESA/Hubble press images with AVM sky metadata are downloaded on a best-effort basis in a background
  thread. Downloads are untrusted data: they are only written into the samples directory, never executed.

`samples.json` is the manifest served by GET /api/lens/samples.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from ..core.config import settings

SYNTHETIC_ID = "synthetic_field"
SYNTHETIC_PSF_FWHM = 3.2

REAL_SAMPLES = [
    {
        "id": "heic1502a", "name": "Andromeda Galaxy (M31), Hubble mosaic", "file": "heic1502a.jpg",
        "url": "https://cdn.esahubble.org/archives/images/screen/heic1502a.jpg",
        "description": "ESA/Hubble press image; AVM metadata in the JPEG XMP gives the sky coordinates.",
        "credit": "NASA, ESA, J. Dalcanton, B.F. Williams, L.C. Johnson (University of Washington), the PHAT team, R. Gendler",
    },
    {
        "id": "potw2048a", "name": "Hubble Picture of the Week 2048a", "file": "potw2048a.jpg",
        "url": "https://cdn.esahubble.org/archives/images/screen/potw2048a.jpg",
        "description": "ESA/Hubble picture of the week; AVM metadata in the JPEG XMP if present.",
        "credit": "ESA/Hubble & NASA",
    },
]

_lock = threading.Lock()


def samples_dir() -> Path:
    d = settings.data_path / "samples"
    d.mkdir(parents=True, exist_ok=True)
    return d


def generate_synthetic(path: Path, seed: int = 7) -> dict:
    """Render a 1024x768 star field with a known PSF and write it as a 16-bit PNG plus a truth JSON."""
    rng = np.random.default_rng(seed)
    h, w = 768, 1024
    sigma_psf = SYNTHETIC_PSF_FWHM / 2.3548
    img = np.zeros((h, w), dtype=np.float64)
    yy, xx = np.mgrid[:h, :w]
    stars = []
    n_stars = 220
    xs = rng.uniform(8, w - 8, n_stars)
    ys = rng.uniform(8, h - 8, n_stars)
    # Luminosity function weighted towards faint stars, spanning ~4 magnitudes; only a few saturate (8-bit).
    fluxes = 10 ** (3.0 + 2.0 * (1.0 - rng.power(2.5, n_stars)))
    half = int(np.ceil(6 * sigma_psf))
    for x, y, f in zip(xs, ys, fluxes):
        xi, yi = int(round(x)), int(round(y))
        x0, x1 = max(0, xi - half), min(w, xi + half + 1)
        y0, y1 = max(0, yi - half), min(h, yi + half + 1)
        r2 = (xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - y) ** 2
        img[y0:y1, x0:x1] += f / (2 * np.pi * sigma_psf ** 2) * np.exp(-r2 / (2 * sigma_psf ** 2))
        stars.append({"x": float(x), "y": float(y), "flux": float(f)})
    galaxies = []
    for gx, gy, re_, q, pa, f in [
        (300, 200, 9.0, 0.55, 0.6, 4.0e5), (720, 520, 14.0, 0.4, -0.9, 7.0e5), (880, 150, 7.0, 0.7, 1.9, 2.0e5),
    ]:
        c, s = np.cos(pa), np.sin(pa)
        dx, dy = xx - gx, yy - gy
        u = c * dx + s * dy
        v = -s * dx + c * dy
        r = np.sqrt(u ** 2 + (v / q) ** 2)
        prof = np.exp(-r / re_)
        prof *= f / prof.sum()
        img += prof
        galaxies.append({"x": gx, "y": gy, "r_e": re_, "axis_ratio": q, "pa_rad": pa, "flux": f})
    img = gaussian_filter(img, 0.5)  # slight extra blur on top of the PSF
    background = 200.0
    read_noise = 8.0
    electrons = rng.poisson(np.clip(img + background, 0, None)).astype(np.float64)
    electrons += rng.normal(0, read_noise, electrons.shape)
    out = np.clip(electrons, 0, 65535).astype(np.uint16)
    Image.fromarray(out).save(path, format="PNG")  # uint16 -> 16-bit grayscale PNG
    truth = {
        "psf_fwhm_px": float(np.sqrt(SYNTHETIC_PSF_FWHM ** 2 + (0.5 * 2.3548) ** 2)),
        "background": background, "read_noise": read_noise, "stars": stars, "galaxies": galaxies,
    }
    path.with_suffix(".truth.json").write_text(json.dumps(truth), encoding="utf-8")
    return truth


def _manifest_path() -> Path:
    return samples_dir() / "samples.json"


def load_manifest() -> list[dict]:
    p = _manifest_path()
    with _lock:  # the background download thread may be rewriting it
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                return []
    return []


def _write_manifest(items: list[dict]) -> None:
    """Atomic write (temp file + rename) so a concurrent reader never sees a half-written manifest."""
    p = _manifest_path()
    tmp = p.with_suffix(".json.tmp")
    with _lock:
        tmp.write_text(json.dumps(items, indent=2), encoding="utf-8")
        os.replace(tmp, p)


def _upsert(items: list[dict], entry: dict) -> list[dict]:
    items = [i for i in items if i.get("id") != entry["id"]]
    items.append(entry)
    return items


def sample_path(sample_id: str) -> Path | None:
    for s in load_manifest():
        if s["id"] == sample_id:
            p = samples_dir() / s["file"]
            return p if p.exists() else None
    return None


def ensure_synthetic() -> None:
    d = samples_dir()
    p = d / f"{SYNTHETIC_ID}.png"
    if not p.exists():
        generate_synthetic(p)
    items = _upsert(load_manifest(), {
        "id": SYNTHETIC_ID, "name": "Synthetic star field (known truth)", "file": p.name,
        "description": f"1024x768 16-bit generated field: Gaussian stars with PSF FWHM {SYNTHETIC_PSF_FWHM} px, three "
                       "elliptical galaxies, Poisson + Gaussian noise. Truth table in synthetic_field.truth.json.",
        "kind": "synthetic", "has_wcs": False, "credit": "Generated by app/lens/samples.py",
    })
    _write_manifest(items)


def _download_real(timeout: float = 25.0) -> None:
    import httpx  # local import keeps module import cheap

    from .wcs import wcs_from_avm

    d = samples_dir()
    for spec in REAL_SAMPLES:
        p = d / spec["file"]
        if not p.exists():
            try:
                r = httpx.get(spec["url"], timeout=timeout, follow_redirects=True,
                              headers={"User-Agent": settings.user_agent})
                r.raise_for_status()
                if not r.content[:3] == b"\xff\xd8\xff":
                    continue  # not a JPEG; do not keep it
                p.write_bytes(r.content)
            except Exception:  # noqa: BLE001 - offline is fine, the synthetic sample always exists
                continue
        try:
            has_wcs = wcs_from_avm(p.read_bytes()) is not None
        except Exception:  # noqa: BLE001
            has_wcs = False
        items = _upsert(load_manifest(), {
            "id": spec["id"], "name": spec["name"], "file": spec["file"], "description": spec["description"],
            "kind": "real", "has_wcs": has_wcs, "credit": spec["credit"],
        })
        _write_manifest(items)


def ensure_samples(download: bool = True) -> None:
    """Generate the synthetic field if missing and fetch the real samples in the background."""
    ensure_synthetic()
    if download:
        threading.Thread(target=_download_real, name="lens-sample-download", daemon=True).start()
