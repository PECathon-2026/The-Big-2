"""Night Honor Score model checks (no network: a hand-built forecast)."""
from datetime import datetime, timedelta, timezone

from app.watchtower import lightpollution
from app.watchtower.score import compute_night_score, darkness_gate, factor_qualities, score_hour

BLR = (12.97, 77.59)


def _forecast(start: datetime, hours: int, **cols):
    times = [start + timedelta(hours=i) for i in range(hours)]
    f = {"time": times, "elevation": 900.0}
    for k, v in cols.items():
        f[k] = [v] * hours
    return f


def test_darkness_gate_edges():
    assert darkness_gate(-20) == 1.0
    assert darkness_gate(-6) == 0.0
    assert darkness_gate(10) == 0.0
    assert 0 < darkness_gate(-12) < 1


def test_perfect_night_scores_near_100():
    q = factor_qualities(cloud_low=0, cloud_mid=0, cloud_high=0, humidity=40, visibility_m=30000, aod=0.05, moon_alt=-20, moon_illum=0.9, bortle=1)
    s, contribs, gate = score_hour(-25, q)
    assert s > 97
    assert gate == 1.0
    assert all(c.penalty < 3 for c in contribs)


def test_overcast_night_scores_low_and_blames_low_cloud():
    q = factor_qualities(cloud_low=100, cloud_mid=80, cloud_high=50, humidity=95, visibility_m=3000, aod=0.5, moon_alt=40, moon_illum=1.0, bortle=8)
    s, contribs, _ = score_hour(-25, q)
    assert s < 20
    assert max(contribs, key=lambda c: c.penalty).factor == "cloud_low"


def test_unknown_light_pollution_is_excluded_and_renormalised():
    q = factor_qualities(cloud_low=0, cloud_mid=0, cloud_high=0, humidity=40, visibility_m=30000, aod=0.05, moon_alt=-20, moon_illum=0.1, bortle=None)
    s, contribs, _ = score_hour(-25, q)
    lp = next(c for c in contribs if c.factor == "light_pollution")
    assert lp.weight == 0 and lp.note == "unknown, excluded"
    assert abs(sum(c.weight for c in contribs) - 1.0) < 1e-6
    assert s > 97


def test_night_score_picks_best_window_and_warns_about_dew():
    ref = datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc)  # 17:30 IST, before sunset
    start = datetime(2026, 10, 30, 0, 0, tzinfo=timezone.utc)
    fc = _forecast(start, 48, cloud_cover_low=10, cloud_cover_mid=5, cloud_cover_high=0, relative_humidity_2m=70, visibility_m=20000, wind_speed_10m=5, temperature_2m=18, dew_point_2m=17)
    fc["visibility"] = fc.pop("visibility_m")
    ns = compute_night_score(*BLR, fc, None, None, bortle=4, ref=ref)
    assert ns.best_window is not None
    assert ns.night_start < ns.best_window.start < ns.night_end
    assert ns.verdict.verdict in ("go", "maybe")
    assert any(w.startswith("Dew") for w in ns.warnings)
    assert ns.trace.contributions


def test_bortle_mapping_is_monotonic():
    vals = [lightpollution.brightness_to_bortle(b) for b in range(0, 256, 5)]
    assert vals == sorted(vals)
    assert vals[0] < 2 and vals[-1] == 9.0


def test_tile_math_matches_known_tile():
    x, y, px, py = lightpollution.tile_xy(12.97, 77.59, 8)
    assert (x, y) == (183, 118)
    assert 0 <= px < 256 and 0 <= py < 256
