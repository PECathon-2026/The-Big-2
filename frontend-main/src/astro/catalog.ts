/**
 * Star catalogue loader. Data: d3-celestial (BSD-3), compacted by scripts/build-sky.mjs into
 * public/data/sky/catalog.json. Stars are J2000; precession to today (~0.36°) is below the
 * ±1° accuracy target and is noted on /science.
 */
import { eqArrayToWorld, lstDeg, R } from './coords';
import type { Place } from '@/state/store';

export const STAR_STRIDE = 5; // [ra°, dec°, mag, bv, hip]

export interface ConstellationDef {
  id: string;
  name: string;
  ja: string;
  rank: number;
  center: [number, number];
  /** polylines of [ra°, dec°] */
  lines: [number, number][][];
}

export interface DsoDef {
  id: string; // "M42", "NGC869"…
  name: string; // common name when known ("Orion Nebula")
  desig: string;
  type: string; // gc, oc, sfr, en, rn, pn, sg, eg, …
  mag: number;
  dim: string;
  ra: number;
  dec: number;
}

export interface StarName {
  name: string;
  ja: string;
  con: string;
  bayer: string;
}

export interface Catalog {
  source: string;
  starCount: number;
  /** flat Float32Array [ra, dec, mag, bv, hip] × starCount, brightest first */
  stars: Float32Array;
  /** hip → name info, only for stars with a proper name */
  names: Map<number, StarName>;
  /** index into `stars` for each named hip */
  indexOfHip: Map<number, number>;
  constellations: ConstellationDef[];
  dsos: DsoDef[];
}

interface RawCatalog {
  source: string;
  starCount: number;
  stars: number[];
  starNames: Record<string, [string, string, string, string]>;
  constellations: ConstellationDef[];
  dsos: DsoDef[];
}

let promise: Promise<Catalog> | null = null;
let loaded: Catalog | null = null;

export function loadCatalog(): Promise<Catalog> {
  if (!promise) {
    promise = fetch('/data/sky/catalog.json')
      .then((r) => {
        if (!r.ok) throw new Error(`catalog ${r.status}`);
        return r.json() as Promise<RawCatalog>;
      })
      .then((raw) => {
        const stars = Float32Array.from(raw.stars);
        const names = new Map<number, StarName>();
        for (const [hip, [name, ja, con, bayer]] of Object.entries(raw.starNames)) names.set(+hip, { name, ja, con, bayer });
        const indexOfHip = new Map<number, number>();
        for (let i = 0; i < raw.starCount; i++) {
          const hip = stars[i * STAR_STRIDE + 4];
          if (names.has(hip)) indexOfHip.set(hip, i);
        }
        loaded = { source: raw.source, starCount: raw.starCount, stars, names, indexOfHip, constellations: raw.constellations, dsos: raw.dsos };
        return loaded;
      });
    promise.catch(() => (promise = null));
  }
  return promise;
}

/** Synchronous access once loaded (null before). */
export const catalogSync = () => loaded;

export function findStarByName(cat: Catalog, name: string): number | null {
  const lower = name.toLowerCase();
  for (const [hip, n] of cat.names) if (n.name.toLowerCase() === lower) return cat.indexOfHip.get(hip) ?? null;
  return null;
}

export const HIP_POLARIS = 11767;

export interface StarTargets {
  /** world positions (R) of visible stars, brightest first */
  positions: Float32Array;
  mags: Float32Array;
  bvs: Float32Array;
  /** catalogue index of each target */
  indices: Uint32Array;
  count: number;
}

/**
 * World positions of the visible stars (y > 0 at `date`) sorted by brightness, for B's petals
 * ("the brightest stars land first"). At most n.
 */
export function getStarTargets(cat: Catalog, date: Date, place: Pick<Place, 'lat' | 'lon'>, n: number, minAltDeg = 2): StarTargets {
  const lst = lstDeg(date, place.lon);
  const all = new Float32Array(cat.starCount * 3);
  eqArrayToWorld(cat.stars, STAR_STRIDE, cat.starCount, place.lat, lst, all, R);
  const minY = Math.sin((minAltDeg * Math.PI) / 180) * R;
  const positions = new Float32Array(n * 3);
  const mags = new Float32Array(n);
  const bvs = new Float32Array(n);
  const indices = new Uint32Array(n);
  let k = 0;
  for (let i = 0; i < cat.starCount && k < n; i++) {
    if (all[i * 3 + 1] <= minY) continue; // stars are pre-sorted brightest first
    positions.set(all.subarray(i * 3, i * 3 + 3), k * 3);
    mags[k] = cat.stars[i * STAR_STRIDE + 2];
    bvs[k] = cat.stars[i * STAR_STRIDE + 3];
    indices[k] = i;
    k++;
  }
  return { positions: positions.subarray(0, k * 3), mags: mags.subarray(0, k), bvs: bvs.subarray(0, k), indices: indices.subarray(0, k), count: k };
}

/** B−V → linear RGB (Ballesteros temperature + small blackbody table), desaturated ~60% (§8.2). */
export function bvToRgb(bv: number, desat = 0.6): [number, number, number] {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  const T = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  // blackbody sRGB samples (Mitchell Charity table, normalised)
  const table: [number, [number, number, number]][] = [
    [2500, [1.0, 0.62, 0.33]],
    [3000, [1.0, 0.69, 0.43]],
    [3500, [1.0, 0.76, 0.54]],
    [4000, [1.0, 0.81, 0.64]],
    [4500, [1.0, 0.86, 0.73]],
    [5000, [1.0, 0.89, 0.81]],
    [5500, [1.0, 0.93, 0.88]],
    [6000, [1.0, 0.96, 0.94]],
    [6500, [1.0, 0.99, 0.99]],
    [7000, [0.95, 0.95, 1.0]],
    [8000, [0.86, 0.89, 1.0]],
    [10000, [0.79, 0.84, 1.0]],
    [15000, [0.71, 0.78, 1.0]],
    [30000, [0.64, 0.73, 1.0]],
  ];
  let c = table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [t0, c0] = table[i];
    const [t1, c1] = table[i + 1];
    if (T <= t0) {
      c = c0;
      break;
    }
    if (T <= t1) {
      const f = (T - t0) / (t1 - t0);
      c = [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
      break;
    }
  }
  const grey = (c[0] + c[1] + c[2]) / 3;
  return [grey + (c[0] - grey) * (1 - desat), grey + (c[1] - grey) * (1 - desat), grey + (c[2] - grey) * (1 - desat)];
}
