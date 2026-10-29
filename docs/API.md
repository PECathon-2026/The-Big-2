# Tsukuyomi Watch — Backend API contract

Base URL: `http://localhost:8000`. Interactive docs: `/docs`. All JSON responses that come from upstream data or computation are wrapped:

```json
{ "data": ..., "provenance": [ { "source": "open-meteo", "url": "...", "fetched_at": "...", "stale": false, "cached": true, "note": null } ], "computed_at": "..." }
```

Computed scores also carry a `trace`: `{ formula, inputs, contributions: [{factor, label, value, unit, quality, weight, contribution, penalty, note}], notes }`.

Errors from a failed upstream provider return HTTP 502 `{ "error": "provider_unavailable", "source": "...", "detail": "..." }`.

## Health
- `GET /api/health` → `{ status, time, version, demo_replay, astrometry_enabled }`

## Watchtower (`/api/watchtower`)
- `GET /forecast?lat&lon&days=2` → raw hourly forecast (UTC `time[]`, `cloud_cover_low/mid/high`, `relative_humidity_2m`, `visibility`, `wind_speed_10m`, `temperature_2m`, `dew_point_2m`, `air_quality.aerosol_optical_depth[]`).
- `GET /score?lat&lon&at?&window_hours=2&light_pollution=true` → `NightScore`:
  `{ lat, lon, timezone, night_start, night_end, astronomical_dusk, astronomical_dawn, hours: HourScore[], best_window: {start, end, start_local, end_local, mean_score, reason} | null, verdict: {verdict: go|maybe|stay_in, headline, reason, score}, warnings: string[], bortle, trace }`
  `HourScore = { time, time_local, score (0-100), darkness (0-1), sun_alt, moon_alt, moon_illum, cloud_low, cloud_mid, cloud_high, humidity, visibility_m, aod, temperature, dew_point, wind_kmh, cloud_spread, contributions[] }`
- `GET /light-pollution?lat&lon` → `{ brightness, brightness_peak, bortle, layer, date, tile, note }`
- `GET /spots?lat&lon&radius_km=60&limit=12&at?` → `{ origin, radius_km, candidates_found, spots: Spot[], formula }`
  `Spot = { osm_id, name, kind (peak|viewpoint|shrine|temple|lake|park), glyph, lat, lon, elevation_m, distance_km, bortle, night_score, best_window, rank_score, rank_trace, verdict, warnings }`

## Celestial Scroll (`/api/scroll`)
- `GET /moon?lat&lon&at?` → `{ time, timezone, phase_deg, phase_name, illumination, age_days, waxing, name: {lunar_day, kanji, romaji, meaning}, altitude, azimuth, distance_km, angular_diameter_deg, libration, rise, set, rise_local, set_local, next_quarters: [{quarter, name, time}], alert }`
- `GET /sun?lat&lon&at?` → `{ altitude, azimuth, sunset, civil_dusk, nautical_dusk, astronomical_dusk, astronomical_dawn, nautical_dawn, civil_dawn, sunrise, dark_hours, local: {...} }`
- `GET /eclipses?lat&lon&start?&lunar=3&solar=2` → `Eclipse[] = { type: lunar|solar, kind, peak, peak_local, obscuration, visible_from_here, peak_altitude, begins, ends, duration_minutes, note }`
- `GET /meteors?lat&lon&at?&bortle?` → `Shower[] = { code, name, jp, active_from, active_to, peak, days_from_peak, zhr_peak, zhr_now, population_index, velocity_kms, radiant_ra, radiant_dec, is_peak_night, best_hour, hours: [{time, time_local, radiant_alt, limiting_magnitude, rate_per_hour}], trace }`
- `GET /passes?lat&lon&days=3&sat=ISS&min_alt=10&start?` → `Pass[] = { satellite, norad_id, start, start_local, end, end_local, duration_s, max_alt, max_time, start_az, start_compass, max_az, end_az, end_compass, visible, visible_seconds, brightness_hint, track: [{time, alt, az, sunlit}], alert }`
- `GET /launches?lat?&lon?&limit=20` → `Launch[] = { id, name, provider, rocket, mission, status, net, net_local, window_start, window_end, pad, location, pad_lat, pad_lon, distance_km, visible_trail_hint, webcast, image }`
- `GET /planets?lat&lon&at?` → `PlanetInfo[] = { name, jp, altitude, azimuth, magnitude, elongation, ra_hours, dec_deg, up_now, rise, set, rise_local, set_local, moon_separation_deg, naked_eye }`
- `GET /calendar?lat&lon&year?&month?` → `{ year, month, timezone, days: [{date, weekday, moon_age, illumination, phase_deg, moon_name, lunar_month, lunar_day, sekki: {kanji, romaji, meaning, index}, ko: {kanji, meaning, index}, is_new_moon, is_full_moon, is_today}], lunar_months, note }`
- `GET /season?at?` → `{ sun_longitude, sekki, ko }`
- `GET /events?lat&lon&days=7&types?&start?&bortle?` → `Event[] = { id, kind (moon|meteor|eclipse|satellite|launch|planet), title, jp, start, end, start_local, visible_from_here, direction, altitude_max, detail, alert, source }`
- `GET /ics?title&start&end?&description?&location?` → `text/calendar` download.

## Spirit Lens (`/api/lens`) — image pipeline contract

Processing is asynchronous: upload creates a job, the job runs through named stages, results are fetched by id.

- `GET /samples` → `[{ id, name, description, kind (synthetic|real), has_wcs }]`; `GET /samples/{id}` → the image file.
- `POST /jobs` (multipart) fields: `file` (JPG/PNG/TIFF/FITS), `denoise_strength` float 0..1 (default 0.5), `deblur_iterations` int (0 = auto, default 0), `detect_sigma` float (default 3.0), `sample_id` (alternative to `file`). → `202 { job_id, status }`
- `GET /jobs/{id}` → `{ job_id, status: queued|running|done|failed, created_at, stages: [{ name, status, started_at, ended_at, detail }], error, result: LensResult | null }`
  Stage names, in order: `load`, `background`, `detect`, `psf`, `denoise`, `deblur`, `honesty`, `classify`, `wcs`.
- `GET /jobs/{id}/image/{kind}?stretch=asinh|linear` → PNG. `kind` ∈ `original | denoised | restored | residual | psf | noise | overlay`.
- `POST /jobs/{id}/benchmark?n_stars=40` → synthetic-star injection benchmark: `{ injected, recovered, recovery_rate, false_positives, magnitude_error_rms, position_error_rms_px, note }`.
- `POST /jobs/{id}/solve` → starts a plate-solve (astrometry.net) if a key is configured; progress appears in the `wcs` stage.
- `GET /jobs/{id}/skyview?survey=DSS2%20Red` → PNG cutout of the same field from NASA SkyView when the WCS is known (404 otherwise).
- `GET /jobs/{id}/catalog` → catalogue matches (SIMBAD) for the brightest detections when the WCS is known.

`LensResult`:
```
{
  image: { width, height, channels, format, is_fits, source_filename },
  noise: { background_median, background_sigma, method },
  psf: { fwhm_px, method: epsf|gaussian-fit|none, n_stars_used, kernel_size },
  restoration: { denoise: { method, strength }, deblur: { method, iterations, applied, reason } },
  honesty: {
    ssim, psnr_db,
    forward_model: { chi2_reduced, residual_rms, structure_score, verdict: noise-like|structured },
    flux_conservation: { n_stars, median_ratio, max_abs_dev_pct, within_5pct_fraction },
    position_shift: { n_stars, median_shift_px, max_shift_px },
    invented_pixels: int,
    notes: string[]
  },
  detections: [{ id, x, y, flux, peak, snr, fwhm_px, a, b, theta_deg, ellipticity, kind: star|galaxy|unknown, mag_instrumental, size_px, ra, dec, name }],
  counts: { stars, galaxies, unknown },
  wcs: { solved, method: fits-header|avm|astrometry.net|null, ra_center, dec_center, fov_deg, pixel_scale_arcsec, orientation_deg },
  units_note: string,
  trace: { formula, inputs, notes }
}
```
