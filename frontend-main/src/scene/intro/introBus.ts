/**
 * Shared, non-React intro state (workstream B). The DOM side (src/intro) writes it from the master
 * ScrollTrigger timeline; the canvas side (scene/intro) reads it inside useFrame. Never React state.
 *
 * Scroll map (§7.3):
 *   0–.08 frame opens · .08–.30 sunset · .30–.55 petals stream · .55–.72 petals land on stars
 *   .72–.82 title morph · .82–.90 Moon + constellations · .90–1 pull back to the dome
 */
import type { StarTargets } from '@/astro/catalog';

export const P = {
  frameEnd: 0.08,
  sunEnd: 0.3,
  streamEnd: 0.55,
  landEnd: 0.72,
  titleEnd: 0.82,
  moonEnd: 0.9,
} as const;

/** Landing window of the petal → star handoff. Brightest stars land first. */
export const LAND0 = 0.555;
export const LAND1 = 0.712;
export const LAND_FADE = 0.006;
const MAG_MIN = -1.5;

export interface IntroTimeline {
  start: Date;
  end: Date;
  sunsetAz: number;
  sunset: Date | null;
}

export const intro = {
  /** 0..1, smoothed master progress */
  progress: 0,
  /** true while the intro scene should render */
  active: false,
  timeline: null as IntroTimeline | null,
  /** the instant shown at the current progress (also pushed to skyClock.override) */
  time: new Date(),
  /** faintest magnitude that receives a petal; stars fainter land at LAND1 */
  magMax: 5,
  targets: null as StarTargets | null,
};

/** Landing progress for a star of magnitude `mag` — the same formula the sky's star shader can use. */
export function landForMag(mag: number, magMax = intro.magMax): number {
  // ≈ the fraction of visible stars brighter than mag (counts grow ~10^0.4m), so landings are evenly paced
  const e0 = Math.pow(10, 0.4 * (MAG_MIN - magMax));
  const k = Math.min(1, Math.max(0, (Math.pow(10, 0.4 * (mag - magMax)) - e0) / (1 - e0)));
  return LAND0 + (LAND1 - LAND0) * Math.sqrt(k);
}

/**
 * GLSL for the invisible handoff (for the sky's Stars shader, workstream A):
 *   uniform float uIntroP;  // intro.progress while the intro runs, 1.0 otherwise
 *   uniform float uIntroMagMax; // intro.magMax
 *   vAlpha *= introReveal(aMag);
 * A star becomes visible exactly as its petal lands on it.
 */
export const INTRO_REVEAL_GLSL = /* glsl */ `
  uniform float uIntroP; uniform float uIntroMagMax;
  float introReveal(float mag){
    float e0 = pow(10.0, 0.4 * (${MAG_MIN.toFixed(1)} - uIntroMagMax));
    float k = clamp((pow(10.0, 0.4 * (mag - uIntroMagMax)) - e0) / (1.0 - e0), 0.0, 1.0);
    float land = ${LAND0} + ${(LAND1 - LAND0).toFixed(3)} * sqrt(k);
    return smoothstep(land, land + ${LAND_FADE}, uIntroP);
  }`;

/** Value for uIntroP: the progress during the intro, 1 at every other moment. */
export const introRevealProgress = () => (intro.active ? intro.progress : 1);

/**
 * Real time-lapse: key points (progress → minutes after timeline.start). The rate is not uniform, so the
 * sun sets during 8–30% and the night deepens over the rest, but every instant shown is a real time.
 */
export function timeAt(p: number, tl: IntroTimeline): Date {
  const total = (tl.end.getTime() - tl.start.getTime()) / 60_000;
  const sunsetMin = tl.sunset ? (tl.sunset.getTime() - tl.start.getTime()) / 60_000 : 20;
  const keys: [number, number][] = [
    [0, 0],
    [P.frameEnd, Math.min(total * 0.05, sunsetMin * 0.3)],
    [P.sunEnd, Math.min(total * 0.35, sunsetMin + 12)],
    [P.streamEnd, Math.min(total * 0.7, Math.max(sunsetMin + 40, total * 0.5))],
    [P.moonEnd, total],
    [1, total],
  ];
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] < p) i++;
  const [p0, m0] = keys[i];
  const [p1, m1] = keys[i + 1];
  const t = Math.max(0, Math.min(1, (p - p0) / Math.max(1e-6, p1 - p0)));
  const e = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
  return new Date(tl.start.getTime() + (m0 + (m1 - m0) * e) * 60_000);
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Read a CSS colour token (e.g. '--sakura') as a hex/rgb string. */
export function token(name: string, fallback = '#000000'): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __intro: typeof intro }).__intro = intro;
