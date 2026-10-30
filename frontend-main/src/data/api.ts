/**
 * Tsukuyomi Watch — typed HTTP client for the backend (see docs/API.md).
 *
 * Every JSON response that comes from upstream data or computation is wrapped:
 *   { data, provenance: Provenance[], computed_at }
 * `get<T>()` returns that envelope with `data` typed as T, so callers can read
 * `.data` and still show `.provenance`. `getRaw<T>()` is for unwrapped
 * endpoints (health, lens jobs). A failed upstream provider gives HTTP 502 with
 * `{ error: "provider_unavailable", source, detail }`; that surfaces as ApiError.
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Envelope, provenance, trace, errors
// ---------------------------------------------------------------------------

export interface Provenance {
  source: string;
  url: string | null;
  fetched_at: string | null;
  stale: boolean;
  cached: boolean;
  note: string | null;
}

export interface Envelope<T> {
  data: T;
  provenance: Provenance[];
  computed_at: string;
}

export interface Contribution {
  factor: string;
  label: string;
  value: number | null;
  unit: string | null;
  quality: number | null;
  weight: number;
  contribution: number;
  penalty: number;
  note: string | null;
}

export interface Trace {
  formula: string;
  inputs: Record<string, unknown>;
  contributions: Contribution[];
  notes: string[];
}

export interface ProviderError {
  error: 'provider_unavailable' | string;
  source?: string;
  detail?: string;
}

export class ApiError extends Error {
  status: number;
  body: ProviderError | unknown;
  url: string;
  constructor(status: number, url: string, body: unknown) {
    const pe = body as ProviderError | null;
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : undefined;
    const msg =
      pe && typeof pe === 'object' && 'error' in pe
        ? `${pe.error}${pe.source ? ` (${pe.source})` : ''}${pe.detail ? `: ${pe.detail}` : ''}`
        : typeof detail === 'string'
          ? `HTTP ${status}: ${detail}` // FastAPI validation / HTTPException message
          : `HTTP ${status}`;
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
  get isProviderUnavailable(): boolean {
    const b = this.body as ProviderError | null;
    return this.status === 502 && !!b && typeof b === 'object' && b.error === 'provider_unavailable';
  }
  get provider(): ProviderError | null {
    const b = this.body as ProviderError | null;
    return b && typeof b === 'object' && 'error' in b ? b : null;
  }
}

export type Params = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, params?: Params): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const body = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, url, body);
  return body;
}

function isEnvelope(x: unknown): x is Envelope<unknown> {
  return !!x && typeof x === 'object' && 'data' in x && 'provenance' in x;
}

/** GET an enveloped endpoint. Tolerates an unwrapped body (empty provenance). */
export async function get<T>(path: string, params?: Params, signal?: AbortSignal): Promise<Envelope<T>> {
  const body = await request(buildUrl(path, params), { signal });
  if (isEnvelope(body)) return body as Envelope<T>;
  return { data: body as T, provenance: [], computed_at: new Date().toISOString() };
}

/** GET an endpoint that is not wrapped (health, lens jobs, samples). */
export async function getRaw<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const body = await request(buildUrl(path, params), { signal });
  return (isEnvelope(body) ? body.data : body) as T;
}

export async function post<T>(path: string, body?: FormData | object, params?: Params, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method: 'POST', signal };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await request(buildUrl(path, params), init);
  return (isEnvelope(res) ? res.data : res) as T;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface Health {
  status: string;
  time: string;
  version: string;
  demo_replay: boolean;
  astrometry_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Watchtower
// ---------------------------------------------------------------------------

export interface Forecast {
  latitude: number;
  longitude: number;
  elevation: number | null;
  timezone: string;
  utc_offset_seconds: number;
  time: string[];
  cloud_cover?: (number | null)[];
  cloud_cover_low: (number | null)[];
  cloud_cover_mid: (number | null)[];
  cloud_cover_high: (number | null)[];
  relative_humidity_2m: (number | null)[];
  visibility: (number | null)[];
  wind_speed_10m: (number | null)[];
  temperature_2m: (number | null)[];
  dew_point_2m: (number | null)[];
  air_quality?: { aerosol_optical_depth: (number | null)[] } | null;
  [k: string]: unknown;
}

export interface HourScore {
  time: string;
  time_local: string;
  score: number;
  darkness: number;
  sun_alt: number;
  moon_alt: number | null;
  moon_illum: number | null;
  cloud_low: number | null;
  cloud_mid: number | null;
  cloud_high: number | null;
  humidity: number | null;
  visibility_m: number | null;
  aod: number | null;
  temperature: number | null;
  dew_point: number | null;
  wind_kmh: number | null;
  cloud_spread: number | null;
  contributions: Contribution[];
}

export interface BestWindow {
  start: string;
  end: string;
  start_local: string;
  end_local: string;
  mean_score: number;
  reason: string;
}

export type VerdictKind = 'go' | 'maybe' | 'stay_in';

export interface Verdict {
  verdict: VerdictKind;
  headline: string;
  reason: string;
  score: number;
}

export interface NightScore {
  lat: number;
  lon: number;
  timezone: string;
  night_start: string;
  night_end: string;
  astronomical_dusk: string;
  astronomical_dawn: string;
  hours: HourScore[];
  best_window: BestWindow | null;
  verdict: Verdict;
  warnings: string[];
  bortle: number | null;
  trace: Trace;
}

export interface LightPollution {
  brightness: number;
  brightness_peak: number;
  bortle: number;
  layer: string;
  date: string;
  tile: { z: number; x: number; y: number };
  note: string;
}

export type SpotKind = 'peak' | 'viewpoint' | 'shrine' | 'temple' | 'lake' | 'park' | string;

export interface Spot {
  osm_id: string;
  name: string;
  kind: SpotKind;
  glyph: string;
  lat: number;
  lon: number;
  elevation_m: number | null;
  distance_km: number;
  bortle: number | null;
  night_score: number;
  best_window: string | null;
  rank_score: number;
  rank_trace: Record<string, number>;
  verdict: string;
  warnings: string[];
}

export interface SpotsResult {
  origin: { lat: number; lon: number };
  radius_km: number;
  candidates_found: number;
  spots: Spot[];
  formula: string;
}

// ---------------------------------------------------------------------------
// Celestial Scroll
// ---------------------------------------------------------------------------

export interface MoonName {
  lunar_day: number;
  kanji: string;
  romaji: string;
  meaning: string;
}

export interface Moon {
  time: string;
  timezone: string;
  phase_deg: number;
  phase_name: string;
  illumination: number;
  age_days: number;
  waxing: boolean;
  name: MoonName;
  altitude: number;
  azimuth: number;
  distance_km: number;
  angular_diameter_deg: number;
  libration: { ecliptic_lat: number; ecliptic_lon: number; moon_lat: number; moon_lon: number };
  rise: string | null;
  set: string | null;
  rise_local: string | null;
  set_local: string | null;
  next_quarters: { quarter: number; name: string; time: string }[];
  alert: string | null;
}

export interface Sun {
  time: string;
  timezone: string;
  altitude: number;
  azimuth: number;
  sunset: string | null;
  civil_dusk: string | null;
  nautical_dusk: string | null;
  astronomical_dusk: string | null;
  astronomical_dawn: string | null;
  nautical_dawn: string | null;
  civil_dawn: string | null;
  sunrise: string | null;
  dark_hours: number | null;
  local: Record<string, string | null>;
}

export interface Eclipse {
  type: 'lunar' | 'solar';
  kind: string;
  peak: string;
  peak_local: string;
  obscuration: number | null;
  visible_from_here: boolean;
  peak_altitude: number | null;
  begins: string | null;
  ends: string | null;
  duration_minutes: number | null;
  note: string | null;
}

export interface ShowerHour {
  time: string;
  time_local: string;
  radiant_alt: number;
  limiting_magnitude: number;
  rate_per_hour: number;
}

export interface Shower {
  code: string;
  name: string;
  jp: string;
  active_from: string;
  active_to: string;
  peak: string;
  days_from_peak: number;
  zhr_peak: number;
  zhr_now: number;
  population_index: number;
  velocity_kms: number;
  radiant_ra: number;
  radiant_dec: number;
  is_peak_night: boolean;
  best_hour: ShowerHour | null;
  hours: ShowerHour[];
  trace?: Trace | Record<string, unknown>;
}

export interface TrackPoint {
  time: string;
  alt: number;
  az: number;
  sunlit: boolean;
}

export interface Pass {
  satellite: string;
  norad_id: number;
  start: string;
  start_local: string;
  end: string;
  end_local: string;
  duration_s: number;
  max_alt: number;
  max_time: string;
  start_az: number;
  start_compass: string;
  max_az: number;
  end_az: number;
  end_compass: string;
  visible: boolean;
  visible_seconds: number;
  brightness_hint: string | null;
  track: TrackPoint[];
  alert: string | null;
}

export interface Launch {
  id: string;
  name: string;
  provider: string | null;
  rocket: string | null;
  mission: string | null;
  status: string | null;
  net: string | null;
  net_local: string | null;
  window_start: string | null;
  window_end: string | null;
  pad: string | null;
  location: string | null;
  pad_lat: number | null;
  pad_lon: number | null;
  distance_km: number | null;
  visible_trail_hint: string | null;
  webcast: string | null;
  image: string | null;
}

export interface PlanetInfo {
  name: string;
  jp: string;
  altitude: number;
  azimuth: number;
  magnitude: number;
  elongation: number;
  ra_hours: number;
  dec_deg: number;
  up_now: boolean;
  rise: string | null;
  set: string | null;
  rise_local: string | null;
  set_local: string | null;
  moon_separation_deg: number | null;
  naked_eye: boolean;
}

export interface Sekki {
  kanji: string;
  romaji: string;
  meaning: string;
  index: number;
}

export interface Ko {
  kanji: string;
  meaning: string;
  index: number;
}

export interface CalendarDay {
  date: string;
  weekday: number;
  moon_age: number;
  illumination: number;
  phase_deg: number;
  moon_name: MoonName;
  lunar_month: number;
  lunar_day: number;
  sekki: Sekki;
  ko: Ko;
  is_new_moon: boolean;
  is_full_moon: boolean;
  is_today: boolean;
}

export interface LunarCalendar {
  year: number;
  month: number;
  timezone: string;
  days: CalendarDay[];
  lunar_months: { new_moon: string; number: number }[];
  note: string;
}

export interface Season {
  sun_longitude: number;
  sekki: Sekki;
  ko: Ko;
}

export type EventKind = 'moon' | 'meteor' | 'eclipse' | 'satellite' | 'launch' | 'planet';
export const EVENT_KINDS: EventKind[] = ['moon', 'meteor', 'eclipse', 'satellite', 'launch', 'planet'];

export interface SkyEvent {
  id: string;
  kind: EventKind;
  title: string;
  jp: string | null;
  start: string;
  end: string | null;
  start_local: string;
  visible_from_here: boolean;
  direction: string | null;
  altitude_max: number | null;
  detail: string | null;
  alert: string | null;
  source: string | null;
}

// ---------------------------------------------------------------------------
// Spirit Lens
// ---------------------------------------------------------------------------

export interface LensSample {
  id: string;
  name: string;
  description: string;
  kind: 'synthetic' | 'real';
  has_wcs: boolean;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type StageStatus = 'pending' | 'queued' | 'running' | 'done' | 'failed' | 'skipped' | string;

export const LENS_STAGES = ['load', 'background', 'detect', 'psf', 'denoise', 'deblur', 'honesty', 'classify', 'wcs'] as const;
export type LensStageName = (typeof LENS_STAGES)[number];

export interface LensStage {
  name: LensStageName | string;
  status: StageStatus;
  started_at: string | null;
  ended_at: string | null;
  detail: string | null;
}

export interface Detection {
  id: number;
  x: number;
  y: number;
  flux: number;
  peak: number;
  snr: number;
  fwhm_px: number;
  a: number;
  b: number;
  theta_deg: number;
  ellipticity: number;
  kind: 'star' | 'galaxy' | 'unknown';
  mag_instrumental: number | null;
  size_px: number;
  ra: number | null;
  dec: number | null;
  name: string | null;
}

export interface LensResult {
  image: { width: number; height: number; channels: number; format: string; is_fits: boolean; source_filename: string };
  noise: { background_median: number; background_sigma: number; method: string };
  psf: { fwhm_px: number | null; method: 'epsf' | 'gaussian-fit' | 'none'; n_stars_used: number; kernel_size: number };
  restoration: {
    denoise: { method: string; strength: number };
    deblur: { method: string; iterations: number; applied: boolean; reason: string | null };
  };
  honesty: {
    ssim: number | null;
    psnr_db: number | null;
    forward_model: { chi2_reduced: number | null; residual_rms: number | null; structure_score: number | null; verdict: 'noise-like' | 'structured' | string };
    flux_conservation: { n_stars: number; median_ratio: number | null; max_abs_dev_pct: number | null; within_5pct_fraction: number | null };
    position_shift: { n_stars: number; median_shift_px: number | null; max_shift_px: number | null };
    invented_pixels: number;
    notes: string[];
  };
  detections: Detection[];
  counts: { stars: number; galaxies: number; unknown: number };
  wcs: {
    solved: boolean;
    method: 'fits-header' | 'avm' | 'astrometry.net' | null;
    ra_center: number | null;
    dec_center: number | null;
    fov_deg: number | null;
    pixel_scale_arcsec: number | null;
    orientation_deg: number | null;
  };
  units_note: string;
  trace: { formula: string; inputs: Record<string, unknown>; notes: string[] };
}

export interface LensJob {
  job_id: string;
  status: JobStatus;
  created_at: string;
  stages: LensStage[];
  error: string | null;
  result: LensResult | null;
}

export interface LensJobCreated {
  job_id: string;
  status: JobStatus;
}

export interface Benchmark {
  injected: number;
  recovered: number;
  recovery_rate: number;
  false_positives: number;
  magnitude_error_rms: number | null;
  position_error_rms_px: number | null;
  note: string | null;
}

export interface CatalogMatch {
  detection_id?: number;
  id?: number;
  name: string | null;
  otype?: string | null;
  ra: number | null;
  dec: number | null;
  separation_arcsec?: number | null;
  [k: string]: unknown;
}

export interface CatalogResult {
  matches: { detection_id: number; name: string; otype: string | null; ra: number; dec: number; separation_arcsec: number }[];
  queried: number;
  note: string | null;
}

/** One row of the Dojo dashboard (GET /api/lens/jobs). */
export interface LensJobSummary {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  created_at: string;
  filename: string;
  sample_id: string | null;
  width: number | null;
  height: number | null;
  verdict: string | null;
  ssim: number | null;
  psnr_db: number | null;
  chi2_reduced: number | null;
  invented_pixels: number | null;
  stars: number | null;
  galaxies: number | null;
  unknown: number | null;
  psf_fwhm_px: number | null;
  wcs_solved: boolean;
  error: string | null;
}

export type LensImageKind = 'original' | 'denoised' | 'restored' | 'residual' | 'psf' | 'noise' | 'overlay';

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

export interface Where {
  lat: number;
  lon: number;
}

export const api = {
  health: (signal?: AbortSignal) => getRaw<Health>('/api/health', undefined, signal),

  watchtower: {
    forecast: (w: Where, days = 2, signal?: AbortSignal) =>
      get<Forecast>('/api/watchtower/forecast', { lat: w.lat, lon: w.lon, days }, signal),
    score: (w: Where, at?: string, windowHours = 2, lightPollution = true, signal?: AbortSignal) =>
      get<NightScore>(
        '/api/watchtower/score',
        { lat: w.lat, lon: w.lon, at, window_hours: windowHours, light_pollution: lightPollution },
        signal,
      ),
    lightPollution: (w: Where, signal?: AbortSignal) =>
      get<LightPollution>('/api/watchtower/light-pollution', { lat: w.lat, lon: w.lon }, signal),
    spots: (w: Where, radiusKm = 60, limit = 12, at?: string, signal?: AbortSignal) =>
      get<SpotsResult>('/api/watchtower/spots', { lat: w.lat, lon: w.lon, radius_km: radiusKm, limit, at }, signal),
  },

  scroll: {
    moon: (w: Where, at?: string, signal?: AbortSignal) => get<Moon>('/api/scroll/moon', { lat: w.lat, lon: w.lon, at }, signal),
    sun: (w: Where, at?: string, signal?: AbortSignal) => get<Sun>('/api/scroll/sun', { lat: w.lat, lon: w.lon, at }, signal),
    eclipses: (w: Where, start?: string, lunar = 3, solar = 2, signal?: AbortSignal) =>
      get<Eclipse[]>('/api/scroll/eclipses', { lat: w.lat, lon: w.lon, start, lunar, solar }, signal),
    meteors: (w: Where, at?: string, bortle?: number, signal?: AbortSignal) =>
      get<Shower[]>('/api/scroll/meteors', { lat: w.lat, lon: w.lon, at, bortle }, signal),
    passes: (w: Where, days = 3, sat = 'ISS', minAlt = 10, start?: string, signal?: AbortSignal) =>
      get<Pass[]>('/api/scroll/passes', { lat: w.lat, lon: w.lon, days, sat, min_alt: minAlt, start }, signal),
    launches: (w?: Where, limit = 20, signal?: AbortSignal) =>
      get<Launch[]>('/api/scroll/launches', { lat: w?.lat, lon: w?.lon, limit }, signal),
    planets: (w: Where, at?: string, signal?: AbortSignal) =>
      get<PlanetInfo[]>('/api/scroll/planets', { lat: w.lat, lon: w.lon, at }, signal),
    calendar: (w: Where, year?: number, month?: number, signal?: AbortSignal) =>
      get<LunarCalendar>('/api/scroll/calendar', { lat: w.lat, lon: w.lon, year, month }, signal),
    season: (at?: string, signal?: AbortSignal) => get<Season>('/api/scroll/season', { at }, signal),
    events: (w: Where, days = 7, types?: EventKind[], start?: string, bortle?: number, signal?: AbortSignal) =>
      get<SkyEvent[]>(
        '/api/scroll/events',
        { lat: w.lat, lon: w.lon, days, types: types && types.length ? types.join(',') : undefined, start, bortle },
        signal,
      ),
    /** URL of the .ics download (open in a new tab / use as href). */
    icsUrl: (p: { title: string; start: string; end?: string | null; description?: string | null; location?: string | null }) =>
      buildUrl('/api/scroll/ics', { title: p.title, start: p.start, end: p.end, description: p.description, location: p.location }),
  },

  lens: {
    samples: (signal?: AbortSignal) => getRaw<LensSample[]>('/api/lens/samples', undefined, signal),
    sampleUrl: (id: string) => buildUrl(`/api/lens/samples/${encodeURIComponent(id)}`),
    createJob: (p: { file?: File | null; sample_id?: string | null; denoise_strength: number; deblur_iterations: number; detect_sigma: number }) => {
      const fd = new FormData();
      if (p.file) fd.append('file', p.file, p.file.name);
      if (p.sample_id) fd.append('sample_id', p.sample_id);
      fd.append('denoise_strength', String(p.denoise_strength));
      fd.append('deblur_iterations', String(p.deblur_iterations));
      fd.append('detect_sigma', String(p.detect_sigma));
      return post<LensJobCreated>('/api/lens/jobs', fd);
    },
    job: (id: string, signal?: AbortSignal) => getRaw<LensJob>(`/api/lens/jobs/${encodeURIComponent(id)}`, undefined, signal),
    imageUrl: (id: string, kind: LensImageKind, stretch: 'asinh' | 'linear' = 'asinh') =>
      buildUrl(`/api/lens/jobs/${encodeURIComponent(id)}/image/${kind}`, { stretch }),
    benchmark: (id: string, nStars = 40) => post<Benchmark>(`/api/lens/jobs/${encodeURIComponent(id)}/benchmark`, undefined, { n_stars: nStars }),
    solve: (id: string) => post<unknown>(`/api/lens/jobs/${encodeURIComponent(id)}/solve`),
    skyviewUrl: (id: string, survey = 'DSS2 Red') => buildUrl(`/api/lens/jobs/${encodeURIComponent(id)}/skyview`, { survey }),
    catalog: (id: string, signal?: AbortSignal) => get<CatalogResult>(`/api/lens/jobs/${encodeURIComponent(id)}/catalog`, undefined, signal),
    jobs: (limit = 50, signal?: AbortSignal) => getRaw<LensJobSummary[]>('/api/lens/jobs', { limit }, signal),
  },

  /** Web Push alerts. Subscribe through `src/push.ts` (it needs the service worker); these calls take the endpoint it returns. */
  alerts: {
    vapidPublicKey: () => getRaw<{ public_key: string }>('/api/alerts/vapid-public-key'),
    schedule: (p: { endpoint: string; title: string; body: string; fire_at: string; url?: string; event_id?: string }) =>
      post<ScheduledAlert>('/api/alerts/schedule', p),
    scheduleEvent: (p: { endpoint: string; lat: number; lon: number; event_id: string; lead_minutes?: number; days?: number }) =>
      post<ScheduledAlert & { event: SkyEvent }>('/api/alerts/schedule-event', p),
    test: (endpoint: string, delaySeconds = 0) => post<ScheduledAlert & { delivery?: { sent: number; failed: number; gone: number } }>('/api/alerts/test', { endpoint, delay_seconds: delaySeconds }),
    scheduled: (endpoint: string, includeSent = false, signal?: AbortSignal) =>
      getRaw<ScheduledAlert[]>('/api/alerts/scheduled', { endpoint, include_sent: includeSent }, signal),
    cancel: (alertId: number, endpoint: string) => request(buildUrl(`/api/alerts/scheduled/${alertId}`, { endpoint }), { method: 'DELETE' }),
    stats: (signal?: AbortSignal) => getRaw<Record<string, number | string>>('/api/alerts/stats', undefined, signal),
  },

  /** Transients: ZTF alerts via the ALeRCE broker, light curves, real stamps and our own two-epoch subtraction. */
  transients: {
    classes: (signal?: AbortSignal) => getRaw<{ classes: string[]; classifier: string }>('/api/transients/classes', undefined, signal),
    near: (ra: number, dec: number, radiusArcsec = 600, limit = 20, signal?: AbortSignal) =>
      get<{ ra: number; dec: number; radius_arcsec: number; objects: TransientObject[] }>('/api/transients/near', { ra, dec, radius_arcsec: radiusArcsec, limit }, signal),
    recent: (className: string, minProbability = 0.5, limit = 20, w?: Where, signal?: AbortSignal) =>
      get<{ class: string; min_probability: number; objects: TransientObject[] }>('/api/transients/recent', { class_name: className, min_probability: minProbability, limit, lat: w?.lat, lon: w?.lon }, signal),
    field: (jobId: string, signal?: AbortSignal) =>
      get<{ job_id: string; ra: number; dec: number; radius_arcsec: number; objects: TransientObject[] }>(`/api/transients/field/${encodeURIComponent(jobId)}`, undefined, signal),
    object: (oid: string, w?: Where, signal?: AbortSignal) => get<TransientDetail>(`/api/transients/${encodeURIComponent(oid)}`, { lat: w?.lat, lon: w?.lon }, signal),
    stampUrl: (oid: string, candid: string, kind: 'science' | 'template' | 'difference') =>
      buildUrl(`/api/transients/${encodeURIComponent(oid)}/stamps/${encodeURIComponent(candid)}/${kind}.png`),
    subtract: (oid: string, candid: string) => post<SubtractionResult>(`/api/transients/${encodeURIComponent(oid)}/subtract`, undefined, { candid }),
    subtractJobs: (jobOld: string, jobNew: string, nsigma = 5) => post<SubtractionResult>('/api/transients/subtract-jobs', undefined, { job_old: jobOld, job_new: jobNew, nsigma }),
  },

  /** Spectra: the SDSS spectrum nearest a sky position, with the pipeline's measured lines and redshift. */
  spectra: {
    near: (ra: number, dec: number, radiusArcmin = 1, limit = 5, signal?: AbortSignal) =>
      get<{ ra: number; dec: number; radius_arcmin: number; objects: SpecObject[] }>('/api/spectra/near', { ra, dec, radius_arcmin: radiusArcmin, limit }, signal),
    at: (ra: number, dec: number, radiusArcmin = 1, signal?: AbortSignal) => get<Spectrum>('/api/spectra/at', { ra, dec, radius_arcmin: radiusArcmin }, signal),
    spectrum: (plate: number, mjd: number, fiberid: number, run2d: string, survey = 'sdss', signal?: AbortSignal) =>
      get<Spectrum>(`/api/spectra/spectrum/${plate}/${mjd}/${fiberid}`, { run2d, survey }, signal),
  },

  /** Observing planner: best place and time for a target, with the binding constraint per 15 min and what-if answers. */
  planner: {
    targets: (signal?: AbortSignal) => getRaw<{ targets: PlannerTarget[]; equipment: Record<string, { min_alt: number; label: string }> }>('/api/planner/targets', undefined, signal),
    plan: (p: { lat: number; lon: number; target?: string; ra?: number; dec?: number; kind?: string; equipment: string; date?: string; earliest_local?: string; latest_local?: string; travel_limit_km: number; candidate_limit?: number }) =>
      post<Plan>('/api/planner/plan', p),
  },

  /** Aurora chance: NOAA SWPC Kp now and forecast versus the Kp this geomagnetic latitude needs. */
  aurora: (w: Where, at?: string, signal?: AbortSignal) => get<AuroraReport>('/api/aurora', { lat: w.lat, lon: w.lon, at }, signal),

  /** Personal horizon: terrain skyline from a DEM (plus traced points), and when a target really clears it. */
  horizon: {
    terrain: (w: Where, signal?: AbortSignal) => get<HorizonProfile>('/api/horizon/terrain', { lat: w.lat, lon: w.lon }, signal),
    mask: (p: { lat: number; lon: number; points?: { az: number; alt: number }[]; use_terrain?: boolean }) => post<HorizonProfile>('/api/horizon/mask', p),
    path: (p: { lat: number; lon: number; target?: string; ra?: number; dec?: number; kind?: string; date?: string; points?: { az: number; alt: number }[]; use_terrain?: boolean }) =>
      post<{ horizon: HorizonProfile; report: HorizonPathReport; night: { sunset: string; sunrise: string } }>('/api/horizon/path', p),
  },

  /** Honor points: observations verified against the sky before points are awarded. */
  honor: {
    ranks: (signal?: AbortSignal) => getRaw<{ ranks: HonorRank[]; points: Record<string, number>; photo_bonus: number }>('/api/honor/ranks', undefined, signal),
    observe: (p: { user_id: string; lat: number; lon: number; kind: string; event_id?: string; title?: string; note?: string; claimed_at?: string; photo_job_id?: string }) =>
      post<ObserveResult>('/api/honor/observe', p),
    ledger: (userId: string, signal?: AbortSignal) => getRaw<Ledger>('/api/honor/ledger', { user_id: userId }, signal),
  },
};

export interface KpPoint {
  time: string;
  kp: number;
  kind: 'observed' | 'estimated' | 'predicted' | string;
  g_scale: string | null;
}
export interface AuroraReport {
  lat: number;
  lon: number;
  geomagnetic_lat: number;
  hemisphere: string;
  look_toward: string;
  kp_now: number | null;
  kp_now_time: string | null;
  g_now: string | null;
  forecast: KpPoint[];
  max_kp_next_24h: number | null;
  max_kp_time: string | null;
  required_kp: { overhead?: number | null; horizon?: number | null };
  chance_tonight: string;
  verdict: string;
  dark_window_local: Record<string, string>;
  trace: Trace;
}
export interface HorizonProfile {
  lat: number;
  lon: number;
  observer_elevation_m: number;
  az_step: number;
  terrain: number[];
  manual: number[];
  mask: number[];
  highest: { az: number; compass: string; alt: number };
  mean_deg: number;
  sky_fraction_lost: number;
  note: string;
}
export interface HorizonPathReport {
  target: string;
  geometric_rise_local: string | null;
  geometric_set_local: string | null;
  crossings: { kind: string; time: string; local: string; az: number; alt: number; mask_alt: number }[];
  minutes_above_geometric: number;
  minutes_above_mask: number;
  minutes_lost_to_skyline: number;
  sentence: string;
  path: { time: string; local: string; alt: number; az: number; mask_alt: number; visible: boolean }[];
}

export interface PlannerTarget {
  id: string;
  name: string;
  jp: string;
  kind: string;
  ra?: number;
  dec?: number;
  note: string;
}
export interface PlanStep {
  time: string;
  local: string;
  status: 'usable' | 'daylight' | 'altitude' | 'moon' | 'cloud' | 'light_pollution';
  target_alt: number;
  moon_alt: number;
  cloud: number | null;
  quality: number;
}
export interface PlanWindow {
  start: string;
  end: string;
  start_local: string;
  end_local: string;
  minutes: number;
}
export interface PlanCandidate {
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distance_km: number;
  travel_minutes: number;
  bortle: number | null;
  usable_minutes: number;
  mean_quality: number;
  blocked_minutes: Record<string, number>;
  windows: PlanWindow[];
  net_score: number;
  timeline: PlanStep[];
}
export interface Counterfactual {
  question: string;
  answer: string;
  usable_minutes_best: number;
  delta_minutes: number;
  best_spot: string;
  best_spot_changes: boolean;
}
export interface Plan {
  target: { name: string; kind: string; ra: number | null; dec: number | null; note: string | null; source: string };
  equipment: string;
  min_altitude: number;
  sun_limit: number;
  date_local: string;
  timezone: string;
  night: Record<string, string>;
  window: { start: string; end: string };
  travel_limit_km: number;
  candidates: PlanCandidate[];
  best: PlanCandidate | null;
  recommendation: string;
  counterfactuals: Counterfactual[];
  moonset_local: string | null;
  forecast_spread_pct: number | null;
  trace: Trace;
}

export interface TransientVisibility {
  observable_tonight: boolean;
  max_altitude: number;
  at_local: string;
  dusk_local: string;
  dawn_local: string;
}
export interface TransientObject {
  oid: string;
  ra: number | null;
  dec: number | null;
  ndet: number | null;
  first_detection: string | null;
  last_detection: string | null;
  days_active: number | null;
  class: string | null;
  classifier: string | null;
  probability: number | null;
  stellar: boolean | null;
  alerce_url: string;
  visibility?: TransientVisibility;
}
export interface LightcurvePoint {
  mjd: number;
  date: string;
  band: string;
  mag: number;
  err: number;
  candid: string;
  has_stamp: boolean;
  real_bogus: number | null;
}
export interface Lightcurve {
  oid: string;
  detections: LightcurvePoint[];
  non_detections: { mjd: number; date: string; band: string; limit: number }[];
  bands: Record<string, { n: number; brightest: number; faintest: number }>;
  peak: LightcurvePoint | null;
  note: string;
}
export interface TransientDetail extends TransientObject {
  lightcurve: Lightcurve;
  probabilities: { class: string; probability: number; classifier: string; version: string | null }[];
}
export interface SubtractionCandidate {
  x: number;
  y: number;
  sign: 'positive' | 'negative';
  npix: number;
  peak: number;
  snr: number;
  flux: number;
  on_known_source: boolean;
  flags: string[];
  real_candidate: boolean;
}
export interface SubtractionResult {
  shape: [number, number];
  shift_px: [number, number];
  fwhm_px: { old: number; new: number; matched: number };
  flux_scale: number;
  sigma: number;
  nsigma: number;
  candidates: SubtractionCandidate[];
  real_candidates: number;
  steps: string[];
  images: Record<string, string>;
  note?: string;
  oid?: string;
  candid?: string;
}

export interface SpecObject {
  spec_obj_id: string;
  plate: number;
  mjd: number;
  fiberid: number;
  class: string;
  subclass: string;
  z: number;
  z_err: number | null;
  ra: number;
  dec: number;
  survey: string;
  run2d: string;
  sn_median: number | null;
  separation_arcsec: number;
}
export interface SpecLine {
  name: string;
  rest_wavelength: number;
  observed_wavelength: number;
  z?: number;
  area?: number;
  area_err?: number;
  sigma_kms?: number;
  equivalent_width?: number;
  emission?: boolean;
  significance?: number;
}
export interface Spectrum {
  plate: number;
  mjd: number;
  fiberid: number;
  ra: number;
  dec: number;
  class: string;
  subclass: string;
  z: number;
  z_err: number;
  sn_median: number | null;
  exptime_s: number;
  flux_unit: string;
  wavelength: number[];
  flux: number[];
  model: number[];
  n_pixels: number;
  binned_to: number;
  wavelength_range: [number, number];
  lines_measured: SpecLine[];
  lines_expected: SpecLine[];
  note: string;
  separation_arcsec?: number;
}

export interface HonorRank {
  at: number;
  kanji: string;
  romaji: string;
  meaning: string;
}
export interface RankInfo {
  points: number;
  kanji: string;
  romaji: string;
  meaning: string;
  next: { kanji: string; romaji: string; at: number; points_needed: number } | null;
}
export interface Observation {
  id: number;
  user_id: string;
  kind: string;
  event_id: string | null;
  title: string;
  note: string | null;
  lat: number;
  lon: number;
  claimed_at: string;
  verified: boolean;
  reason: string;
  evidence: Record<string, unknown>;
  points: number;
  photo_job_id: string | null;
  conditions: { score: number; cloud_low: number | null; humidity: number | null; moon_illum: number; time_local: string } | null;
  created_at: string;
}
export interface ObserveResult {
  observation: Observation;
  accepted: boolean;
  points_awarded: number;
  reason: string;
  rank: RankInfo;
}
export interface Ledger {
  user_id: string;
  rank: RankInfo;
  verified_count: number;
  rejected_count: number;
  entries: Observation[];
}

export interface ScheduledAlert {
  id: number;
  subscription_id: number;
  title: string;
  body: string;
  url: string | null;
  event_id: string | null;
  fire_at: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled';
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

export default api;
