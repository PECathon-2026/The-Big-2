"""SDSS spectrum parsing on a real file (M87, plate 1615 / MJD 53166 / fiber 544) kept as a fixture; no network."""
from pathlib import Path

from app.spectra import sdss

FIX = Path(__file__).parent / "fixtures" / "spec-1615-53166-0544.fits"


def test_parse_m87_spectrum():
    spec = sdss.parse(FIX.read_bytes())
    assert spec["class"] == "GALAXY" and abs(spec["z"] - 0.00415) < 0.0005
    assert spec["wavelength_range"][0] < 3850 and spec["wavelength_range"][1] > 9100
    assert 600 <= spec["binned_to"] <= 900 and len(spec["flux"]) == spec["binned_to"]
    # M87 is a weak-lined giant elliptical: only the Ca II H / [Ne III] 3970 absorption blend passes 3σ (10σ).
    assert spec["lines_measured"] and all(l["significance"] >= 3 for l in spec["lines_measured"])
    top = spec["lines_measured"][0]
    assert "3970" in top["name"] and not top["emission"] and top["significance"] > 9
    assert abs(top["observed_wavelength"] - top["rest_wavelength"] * (1 + spec["z"])) < 1.0
    ha = next(e for e in spec["lines_expected"] if e["name"] == "Hα")
    assert abs(ha["observed_wavelength"] - 6564.6 * (1 + spec["z"])) < 0.2


def test_fits_url_branches():
    assert sdss.fits_url(1615, 53166, 544, "26", "sdss").endswith("/sdss/spectro/redux/26/spectra/lite/1615/spec-1615-53166-0544.fits")
    assert "/eboss/spectro/redux/v5_13_2/" in sdss.fits_url(5399, 55956, 597, "v5_13_2", "boss")
