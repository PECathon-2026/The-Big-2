/** Quality tiers (§10.6). Read `tier()` for the current settings; components re-read on change via useApp. */
import { app, useApp, type Quality } from '@/state/store';

export interface TierSettings {
  dpr: number;
  petals: number;
  milkyWayPoints: number;
  bloom: 'full' | 'half' | 'off';
  overlayDpr: number;
  liquidResolution: number;
  glowCursor: 'high' | 'medium' | 'off';
}

export const TIERS: Record<Quality, TierSettings> = {
  high: { dpr: 2, petals: 12000, milkyWayPoints: 22000, bloom: 'full', overlayDpr: 2, liquidResolution: 0.5, glowCursor: 'high' },
  medium: { dpr: 1.5, petals: 6000, milkyWayPoints: 12000, bloom: 'half', overlayDpr: 1, liquidResolution: 0.35, glowCursor: 'medium' },
  low: { dpr: 1, petals: 2500, milkyWayPoints: 6000, bloom: 'off', overlayDpr: 1, liquidResolution: 0.25, glowCursor: 'off' },
};

export const tier = (q: Quality = app().quality) => TIERS[q];
export const useTier = () => TIERS[useApp((s) => s.quality)];

/** Effective device pixel ratio for the main canvas. */
export const tierDpr = (q: Quality) => Math.min(TIERS[q].dpr, window.devicePixelRatio || 1);

// Step down on decline, up at most once, limit flip-flops to 3 (§10.6).
let flips = 0;
let ups = 0;
let lowCount = 0;
const order: Quality[] = ['low', 'medium', 'high'];

export function stepQuality(dir: 'up' | 'down') {
  if (flips >= 3) return;
  const s = app();
  const i = order.indexOf(s.quality);
  if (dir === 'down' && i > 0) {
    const next = order[i - 1];
    s.setQuality(next);
    flips++;
    if (next === 'low' && ++lowCount >= 2) s.setLite(true);
  } else if (dir === 'up' && i < 2 && ups < 1) {
    s.setQuality(order[i + 1]);
    ups++;
    flips++;
  }
}

/** Initial guess before PerformanceMonitor has data. */
export function initialQuality(): Quality {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/nvidia|geforce|rtx|gtx|radeon rx|apple m\d (pro|max|ultra)/i.test(renderer)) return 'high';
    if (/intel|uhd|iris|mali|adreno|apple/i.test(renderer)) return 'medium';
  } catch {
    /* ignore */
  }
  return 'medium';
}
