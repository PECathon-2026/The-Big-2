/**
 * Backend-fed sky layers (§8.2), derived once per API response — never per frame:
 *  - the ISS pass to draw (the one in progress at sky time, else the next one) with its track as
 *    unit vectors in the horizontal frame (alt/az from /api/scroll/passes),
 *  - tonight's most active meteor shower with its radiant (J2000 RA/Dec) and hourly rates.
 */
import { altAzToVec, raDecToEquatorial } from '@/astro/coords';
import { useTonight } from '@/data/tonight';
import type { Pass, Shower } from '@/data/api';

export interface IssArc {
  pass: Pass;
  start: number;
  end: number;
  /** unit vectors, xyz × n */
  dirs: Float32Array;
  times: Float64Array;
  sunlit: Uint8Array;
  n: number;
  /** index of the highest point */
  top: number;
}

export interface MeteorShower {
  shower: Shower;
  /** equatorial unit vector of the radiant */
  eq: [number, number, number];
  hourTimes: number[];
  hourRates: number[];
}

export const skyData: { passes: IssArc[]; shower: MeteorShower | null; version: number } = { passes: [], shower: null, version: 0 };

function buildPasses(list: Pass[] | null): IssArc[] {
  if (!list) return [];
  return list
    .filter((p) => /iss|zarya/i.test(p.satellite) && p.track?.length >= 2)
    .map((p) => {
      const n = p.track.length;
      const dirs = new Float32Array(n * 3);
      const times = new Float64Array(n);
      const sunlit = new Uint8Array(n);
      let top = 0;
      p.track.forEach((t, i) => {
        const v = altAzToVec(t.alt, t.az);
        dirs.set(v, i * 3);
        times[i] = Date.parse(t.time);
        sunlit[i] = t.sunlit ? 1 : 0;
        if (t.alt > p.track[top].alt) top = i;
      });
      return { pass: p, start: Date.parse(p.start), end: Date.parse(p.end), dirs, times, sunlit, n, top };
    })
    .sort((a, b) => a.start - b.start);
}

function rateNow(s: Shower): number {
  return s.best_hour?.rate_per_hour ?? s.zhr_now ?? 0;
}

function buildShower(list: Shower[] | null): MeteorShower | null {
  if (!list?.length) return null;
  const best = [...list].sort((a, b) => rateNow(b) - rateNow(a) || b.zhr_now - a.zhr_now)[0];
  if (!best) return null;
  return {
    shower: best,
    eq: raDecToEquatorial(best.radiant_ra, best.radiant_dec),
    hourTimes: (best.hours ?? []).map((h) => Date.parse(h.time)),
    hourRates: (best.hours ?? []).map((h) => h.rate_per_hour),
  };
}

function sync() {
  const t = useTonight.getState();
  skyData.passes = buildPasses(t.passes.data);
  skyData.shower = buildShower(t.meteors.data);
  skyData.version++;
}
sync();
useTonight.subscribe((s, p) => {
  if (s.passes.data !== p.passes.data || s.meteors.data !== p.meteors.data) sync();
});

/** The pass to draw at sky time t: in progress, else the next to start, else null. */
export function issArcAt(t: number): IssArc | null {
  for (const a of skyData.passes) if (t <= a.end) return a;
  return null;
}

/** Interpolated ISS direction at time t inside a pass (writes into out); returns sunlit or -1 when not inside. */
export function issPointAt(a: IssArc, t: number, out: Float32Array): number {
  if (t < a.times[0] || t > a.times[a.n - 1]) return -1;
  let i = 0;
  while (i < a.n - 2 && a.times[i + 1] < t) i++;
  const f = (t - a.times[i]) / Math.max(1, a.times[i + 1] - a.times[i]);
  for (let k = 0; k < 3; k++) out[k] = a.dirs[i * 3 + k] + (a.dirs[(i + 1) * 3 + k] - a.dirs[i * 3 + k]) * f;
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= len;
  out[1] /= len;
  out[2] /= len;
  return a.sunlit[f < 0.5 ? i : i + 1];
}

/** Real hourly rate from this place at sky time t (nearest hour from the API), else zhr_now. */
export function showerRateAt(m: MeteorShower, t: number): number {
  if (!m.hourTimes.length) return m.shower.zhr_now ?? 0;
  let best = 0;
  for (let i = 1; i < m.hourTimes.length; i++) if (Math.abs(m.hourTimes[i] - t) < Math.abs(m.hourTimes[best] - t)) best = i;
  if (Math.abs(m.hourTimes[best] - t) > 3 * 3600_000) return m.shower.zhr_now ?? 0;
  return m.hourRates[best];
}

/** Visibility scale for drawn meteors (stated in the label and on /science). */
export const METEOR_SCALE = 40;
