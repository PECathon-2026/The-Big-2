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

## Alerts (`/api/alerts`) — Web Push

The browser registers `public/sw.js`, subscribes with the server's VAPID key and posts the subscription; the backend stores subscriptions and scheduled alerts in SQLite (`data/alerts.db`) and a background worker (started from the app lifespan) delivers due alerts every 30 s with `pywebpush`. `frontend-basic/src/push.ts` does the browser side; copy it.

- `GET /vapid-public-key` → `{ public_key }` (base64url uncompressed P-256 point for `pushManager.subscribe`).
- `POST /subscribe` body `{ subscription: PushSubscription.toJSON() }` → `201 { subscription_id, endpoint, created_at }`; `DELETE /subscribe?endpoint=` removes it.
- `POST /schedule` body `{ endpoint, title, body, fire_at (ISO), url?, event_id? }` → `201 ScheduledAlert`.
- `POST /schedule-event` body `{ endpoint, lat, lon, event_id, lead_minutes=15, days=7 }` → resolves the event from `/api/scroll/events` and schedules its `alert` text `lead_minutes` before `start` (immediately if already inside the window) → `201 ScheduledAlert & { event }`.
- `POST /test` body `{ endpoint, delay_seconds=0, title?, body? }` → sends now (returns `delivery: {sent, failed, gone}`) or schedules.
- `GET /scheduled?endpoint=&include_sent=false` → `ScheduledAlert[]`; `DELETE /scheduled/{id}?endpoint=` cancels.
- `GET /stats` → counts by status.

`ScheduledAlert = { id, subscription_id, title, body, url, event_id, fire_at, status: scheduled|sent|failed|cancelled, created_at, sent_at, error }`. A subscription the push service reports gone (404/410) is deleted automatically.

## Honor (`/api/honor`) — verified observations

- `GET /ranks` → rank thresholds (Ashigaru 0, Samurai 50, Daimyō 150, Shōgun 400), points per kind, photo bonus.
- `POST /observe` body `{ user_id, lat, lon, kind (moon|planet|meteor|satellite|launch|eclipse|deepsky|custom), event_id?, title?, note?, claimed_at?, photo_job_id? }` → `201 { observation, accepted, points_awarded, reason, rank }`. The claim is verified against the sky (Moon up, dark enough, inside the event's window); rejected claims are stored with the reason and zero points. A future `claimed_at` is refused (400). A finished Lens job with a solved WCS adds the photo bonus.
- `GET /ledger?user_id=` → `{ user_id, rank: {points, kanji, romaji, meaning, next}, verified_count, rejected_count, entries: Observation[] }`; each entry carries `evidence` and a `conditions` snapshot (score, cloud, humidity, moon) at the claimed hour when the forecast is reachable.

## Transients (`/api/transients`) — ZTF alerts via ALeRCE, and our own subtraction

- `GET /classes` → classifier classes.
- `GET /near?ra&dec&radius_arcsec=600&limit=20` → `{ ra, dec, radius_arcsec, objects: TransientObject[] }`.
- `GET /recent?class_name=SNIa&min_probability=0.5&limit=20&lat?&lon?` → most recently detected objects of a class; with `lat/lon` each carries `visibility: { observable_tonight, max_altitude, at_local, dusk_local, dawn_local }`.
- `GET /field/{job_id}` → alerts inside a plate-solved Lens job's field (409 if no WCS).
- `GET /{oid}?lat?&lon?` → object record + `lightcurve` + top `probabilities` (+ `visibility`).
- `GET /{oid}/lightcurve` → `{ detections: [{mjd, date, band, mag, err, candid, has_stamp, real_bogus}], non_detections: [{mjd, date, band, limit}], bands, peak, note }`.
- `GET /{oid}/stamps/{candid}/{science|template|difference}.png` → the real ZTF alert cutout, proxied.
- `POST /{oid}/subtract?candid=` → our pipeline on the ZTF template (old) and science (new) stamps: `{ shape, shift_px, fwhm_px, flux_scale, sigma, nsigma, candidates: [{x, y, sign, npix, peak, snr, flux, on_known_source, flags, real_candidate}], real_candidates, steps, images: {template, science, our_difference (data URLs), ztf_difference_url} }`.
- `POST /subtract-jobs?job_old&job_new&nsigma=5` → the same pipeline on two finished Lens jobs of the same field.

`TransientObject = { oid, ra, dec, ndet, first_detection, last_detection, days_active, class, classifier, probability, stellar, alerce_url }`.

## Planner (`/api/planner`) — where and when, and what would change the answer

- `GET /targets` → built-in targets (`{id, name, jp, kind, ra?, dec?, note}`) and equipment classes (`{min_alt, label}`).
- `POST /plan` body `{ lat, lon, target? (built-in id or SIMBAD name), ra?, dec?, kind?, equipment=eyes, date?, earliest_local? "HH:MM", latest_local?, travel_limit_km=60, candidate_limit=6 }` → `Envelope<Plan>`:
  `{ target, equipment, min_altitude, sun_limit, date_local, timezone, night, window, travel_limit_km, candidates: Candidate[], best, recommendation, counterfactuals: [{question, answer, usable_minutes_best, delta_minutes, best_spot, best_spot_changes}], moonset_local, forecast_spread_pct, trace }`
  `Candidate = { name, kind, lat, lon, distance_km, travel_minutes, bortle, usable_minutes, mean_quality, blocked_minutes: {daylight, altitude, moon, cloud, light_pollution}, windows: [{start, end, start_local, end_local, minutes}], net_score, timeline: [{time, local, status, target_alt, moon_alt, cloud, quality}] }`.
  The home candidate uses the terrain horizon (below) as its altitude floor.

## Horizon (`/api/horizon`) — the personal skyline

- `GET /terrain?lat&lon` → `Horizon`: `{ observer_elevation_m, az_step: 5, terrain[72], manual[72], mask[72], highest: {az, compass, alt}, mean_deg, sky_fraction_lost, note }` from the Open-Meteo elevation model sampled out to 30 km every 10° of bearing (Earth curvature included), cached 30 days.
- `POST /mask` body `{ lat, lon, points: [{az, alt}], use_terrain=true }` → the same with the traced skyline merged (max of terrain and manual).
- `POST /path` body `{ lat, lon, points, use_terrain, target?/ra?/dec?/kind?, date? }` → `{ horizon, report: { target, geometric_rise_local, geometric_set_local, crossings: [{kind, time, local, az, alt, mask_alt}], minutes_above_geometric, minutes_above_mask, minutes_lost_to_skyline, sentence, path: [{time, local, alt, az, mask_alt, visible}] }, night }` — e.g. "The Moon rises at 20:54 but clears your skyline only at 22:54".

## Spirit Lens (`/api/lens`) — image pipeline contract

Processing is asynchronous: upload creates a job, the job runs through named stages, results are fetched by id.

- `GET /samples` → `[{ id, name, description, kind (synthetic|real), has_wcs }]`; `GET /samples/{id}` → the image file.
- `POST /jobs` (multipart) fields: `file` (JPG/PNG/TIFF/FITS), `denoise_strength` float 0..1 (default 0.5), `deblur_iterations` int (0 = auto, default 0), `detect_sigma` float (default 3.0), `sample_id` (alternative to `file`). → `202 { job_id, status }`
- `GET /jobs/{id}` → `{ job_id, status: queued|running|done|failed, created_at, stages: [{ name, status, started_at, ended_at, detail }], error, result: LensResult | null }`
  Stage names, in order: `load`, `background`, `detect`, `psf`, `denoise`, `deblur`, `honesty`, `classify`, `wcs`.
- `GET /jobs/{id}/image/{kind}?stretch=asinh|linear` → PNG. `kind` ∈ `original | denoised | restored | residual | psf | noise | overlay`.
- `POST /jobs/{id}/benchmark?n_stars=40` → synthetic-star injection benchmark: `{ injected, recovered, recovery_rate, baseline_detections, recovered_before_restoration, false_positives, magnitude_error_rms, position_error_rms_px, note }`. Baseline = detections on the injected-but-unrestored copy; a false positive is a detection on the restored copy that matches neither an injected star nor a baseline detection (2 px).
- `POST /jobs/{id}/solve` → starts a plate-solve (astrometry.net) if a key is configured; progress appears in the `wcs` stage.
- `GET /jobs/{id}/skyview?survey=DSS2%20Red` → PNG cutout of the same field from NASA SkyView when the WCS is known (404 otherwise).
- `GET /jobs/{id}/catalog` → `Envelope{ matches: [{ detection_id, name, otype, ra, dec, separation_arcsec }], queried, note }` from SIMBAD for the 10 brightest detections when the WCS is known; fails soft with an empty list and a note.

Job endpoints (`/samples`, `/jobs/{id}`, `/benchmark`) return their documented shapes unwrapped; `/catalog` is wrapped in the standard envelope with SIMBAD provenance.

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
