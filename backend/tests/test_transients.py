"""Two-epoch subtraction on synthetic fields with a known answer (no network)."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from app.transients import alerce, subtract


def _field(seed: int, stars, fwhm: float = 3.0, noise: float = 5.0, shape=(120, 120)) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = np.zeros(shape)
    for x, y, flux in stars:
        img[int(round(y)), int(round(x))] += flux
    img = ndimage.gaussian_filter(img, fwhm / 2.3548)
    return img + 200 + rng.normal(0, noise, shape)


BASE = [(20, 30, 4000), (70, 25, 2500), (45, 80, 6000), (95, 95, 1800), (15, 100, 3000)]


def test_new_source_is_found_after_shift_blur_and_flux_change():
    old = _field(1, BASE, fwhm=2.6)
    new_stars = BASE + [(60, 60, 2200)]  # the supernova
    new = _field(2, [(x, y, f * 1.3) for x, y, f in new_stars], fwhm=3.4)  # brighter night, worse seeing
    new = ndimage.shift(new, (1.6, -2.3), order=1, mode="nearest")  # telescope pointing differs a little
    res = subtract.difference(old, new)
    real = [c for c in res["candidates"] if c["real_candidate"] and c["sign"] == "positive"]
    assert real, res["steps"]
    best = max(real, key=lambda c: c["snr"])
    assert abs(best["x"] - 60) < 2 and abs(best["y"] - 60) < 2
    assert not best["on_known_source"]
    assert abs(res["flux_scale"] - 1.3) < 0.15
    assert abs(res["shift_px"][0] - 1.6) < 0.5 and abs(res["shift_px"][1] + 2.3) < 0.5


def test_identical_epochs_give_no_candidates():
    old = _field(3, BASE)
    new = _field(4, BASE)
    res = subtract.difference(old, new)
    assert res["real_candidates"] == 0


def test_faded_known_source_is_flagged_not_called_new():
    old = _field(5, BASE)
    new = _field(6, [(x, y, f * (0.3 if (x, y) == (45, 80) else 1.0)) for x, y, f in BASE])
    res = subtract.difference(old, new)
    neg = [c for c in res["candidates"] if c["sign"] == "negative"]
    assert neg and all("fading known source" in c["flags"] for c in neg if abs(c["x"] - 45) < 3)


def test_mjd_conversion():
    assert alerce.mjd_to_dt(60000.0).date().isoformat() == "2023-02-25"


def test_png_helpers_return_data_urls():
    a = _field(7, BASE)
    assert subtract.png_b64(a).startswith("data:image/png;base64,")
    assert subtract.png_b64(a - a.mean(), diverging=True).startswith("data:image/png;base64,")
