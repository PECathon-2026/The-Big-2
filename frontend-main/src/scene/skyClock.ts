/**
 * The shared per-frame sky ephemeris. `SkyClock` (mounted once in CanvasRoot) calls `updateSkyClock()`
 * every frame; it recomputes only when sky time moved > 20 s or the place changed. Everything in the
 * scene reads `skyClock` inside useFrame — never React state.
 *
 *   skyClock.eqMatrix  — THREE.Matrix4 rotating equatorial cartesian → horizontal frame (§6.4).
 *                        Put catalogue geometry (equatorial × R) in a group with this matrix.
 *   skyClock.sun/moon/planets — astronomy-engine positions (dir = unit vector, horizontal frame).
 *   skyClock.palette   — sky colours / star fade from the Sun's real altitude.
 *   skyClock.version   — increments on every recompute (cheap change detection).
 */
import * as THREE from 'three';
import { eqToHorizontalMatrix, lstDeg } from '@/astro/coords';
import { skyPalette, type SkyPalette } from '@/astro/skyColor';
import { sunMoonPlanets, type SunMoonPlanets } from '@/astro/skytime';
import { app } from '@/state/store';
import { DEFAULT_PLACE } from '@/data/location';

export interface SkyClock extends SunMoonPlanets {
  lat: number;
  lon: number;
  lst: number;
  eqMatrix: THREE.Matrix4;
  palette: SkyPalette;
  version: number;
  /** override used by the intro time-lapse: when set, the sky shows this instant instead of skyDate() */
  override: Date | null;
}

const m = new THREE.Matrix4();
const init = sunMoonPlanets(new Date(), DEFAULT_PLACE);

export const skyClock: SkyClock = {
  ...init,
  lat: DEFAULT_PLACE.lat,
  lon: DEFAULT_PLACE.lon,
  lst: 0,
  eqMatrix: m,
  palette: skyPalette(init.sun.alt),
  version: 0,
  override: null,
};

let lastT = -Infinity;
let lastKey = '';

export function updateSkyClock(force = false): boolean {
  const s = app();
  const place = s.place ?? DEFAULT_PLACE;
  const date = skyClock.override ?? s.skyDate();
  const key = `${place.lat},${place.lon}`;
  const t = date.getTime();
  if (!force && key === lastKey && Math.abs(t - lastT) < 20_000) return false;
  lastT = t;
  lastKey = key;
  const lst = lstDeg(date, place.lon);
  const r = eqToHorizontalMatrix(place.lat, lst);
  m.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
  const smp = sunMoonPlanets(date, place);
  Object.assign(skyClock, smp, { lat: place.lat, lon: place.lon, lst, palette: skyPalette(smp.sun.alt), version: skyClock.version + 1 });
  const root = document.documentElement.style;
  root.setProperty('--sky-zenith', skyClock.palette.zenith);
  root.setProperty('--sky-horizon', skyClock.palette.horizon);
  return true;
}
