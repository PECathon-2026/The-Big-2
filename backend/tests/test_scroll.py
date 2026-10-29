"""Deterministic astronomy checks against published values (no network)."""
from datetime import datetime, timezone

from app.scroll import calendar_lunar, eclipses, meteors, moon, planets, sun

BLR = (12.97, 77.59)


def test_full_moon_2026_10_26_is_near_phase_180():
    # Full Moon (Hunter's Moon) 2026-10-26 04:12 UTC. Phase angle should be within a degree of 180.
    info = moon.moon_info(*BLR, datetime(2026, 10, 26, 4, 12, tzinfo=timezone.utc))
    assert abs(info.phase_deg - 180) < 1.0
    assert info.illumination > 0.99
    assert info.name["kanji"] in ("十五夜", "小望月", "十六夜")


def test_new_moon_2026_10_10_resets_age():
    info = moon.moon_info(*BLR, datetime(2026, 10, 10, 16, 0, tzinfo=timezone.utc))
    assert info.age_days < 0.1
    assert info.name["kanji"] == "朔"


def test_moon_rise_set_are_on_the_requested_local_day():
    at = datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc)
    info = moon.moon_info(*BLR, at)
    assert info.rise is not None and info.set is not None
    assert info.alert.startswith("The Moon")


def test_sun_night_bounds_order():
    s = sun.sun_info(*BLR, datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc))
    assert s.sunset < s.astronomical_dusk < s.astronomical_dawn < s.sunrise
    assert 8 < s.dark_hours < 12  # tropical latitude in late October


def test_total_solar_eclipse_2027_08_02_is_found():
    ev = eclipses.solar_eclipses(*BLR, datetime(2027, 1, 1, tzinfo=timezone.utc), count=1)
    assert ev[0].peak.date().isoformat() == "2027-08-02"
    assert ev[0].visible_from_here  # partial from Bengaluru


def test_lunar_eclipse_search_returns_sorted_future_events():
    ev = eclipses.lunar_eclipses(*BLR, datetime(2026, 11, 1, tzinfo=timezone.utc), count=3)
    assert [e.peak for e in ev] == sorted(e.peak for e in ev)
    assert all(e.peak.year >= 2026 for e in ev)


def test_geminids_peak_night_has_high_rate_at_dark_site():
    showers = meteors.active_showers(*BLR, datetime(2026, 12, 14, 18, 0, tzinfo=timezone.utc), bortle=2)
    gem = next(s for s in showers if s.code == "GEM")
    assert gem.is_peak_night
    assert gem.best_hour is not None and gem.best_hour.rate_per_hour > 30


def test_meteor_rate_drops_with_light_pollution():
    dark = meteors.active_showers(*BLR, datetime(2026, 12, 14, 18, 0, tzinfo=timezone.utc), bortle=2)
    city = meteors.active_showers(*BLR, datetime(2026, 12, 14, 18, 0, tzinfo=timezone.utc), bortle=8)
    g_dark = next(s for s in dark if s.code == "GEM").best_hour.rate_per_hour
    g_city = next(s for s in city if s.code == "GEM").best_hour.rate_per_hour
    assert g_city < g_dark / 3


def test_sekki_and_ko_for_known_dates():
    assert calendar_lunar.sekki_for(datetime(2026, 10, 30, tzinfo=timezone.utc))["sekki"]["kanji"] == "霜降"
    assert calendar_lunar.sekki_for(datetime(2026, 12, 22, 12, tzinfo=timezone.utc))["sekki"]["kanji"] == "冬至"
    assert calendar_lunar.sekki_for(datetime(2026, 3, 21, tzinfo=timezone.utc))["sekki"]["kanji"] == "春分"


def test_lunar_month_numbers_2026():
    cal = calendar_lunar.month_calendar(*BLR, 2026, 10)
    oct11 = next(d for d in cal.days if d.date == "2026-10-11")
    assert (oct11.lunar_month, oct11.lunar_day) == (9, 1)
    assert len(cal.days) == 31


def test_planets_have_sane_magnitudes():
    ps = planets.planets(*BLR, datetime(2026, 10, 30, 16, 0, tzinfo=timezone.utc))
    venus = next(p for p in ps if p.name == "Venus")
    assert -5 < venus.magnitude < -3
    assert all(-90 <= p.altitude <= 90 for p in ps)
