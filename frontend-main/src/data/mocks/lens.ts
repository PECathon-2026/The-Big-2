/**
 * Spirit Lens MOCK (§6.6) — used ONLY when /api/lens/samples does not answer. Everything here is
 * generated in the browser and labelled MOCK wherever it shows:
 *  - "restored" = a procedural star field + nebula drawn here (seeded, so it is reproducible),
 *  - "original" = a simulated degradation of it (blur 2.2 px + noise, as in the demo's lens pane),
 *  - detections = the generator's own truth table (positions/sizes it drew), not a pipeline output,
 *  - PSNR is measured between the two canvases; every other metric is null (shown as "—").
 */
import type { Detection, LensResult } from '../api';

export const MOCK_PROVENANCE = [{ source: 'mock', url: null, fetched_at: null, stale: false, cached: false, note: 'Spirit Lens pipeline not live yet' }];

export interface MockLens {
  id: string;
  width: number;
  height: number;
  original: string; // data URL
  restored: string; // data URL
  result: LensResult;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function makeMockLens(seed = 42, width = 960, height = 600): MockLens {
  const r = rng(seed);
  const a = document.createElement('canvas');
  a.width = width;
  a.height = height;
  const ac = a.getContext('2d', { willReadFrequently: true })!;
  ac.fillStyle = '#06050c';
  ac.fillRect(0, 0, width, height);
  // nebula: soft overlapping blots
  for (let i = 0; i < 70; i++) {
    const x = width * (0.3 + r() * 0.45);
    const y = height * (0.25 + r() * 0.5);
    const rad = 40 + r() * 140;
    const g = ac.createRadialGradient(x, y, 0, x, y, rad);
    const hue = r() < 0.5 ? '104,28,66' : '88,52,124';
    g.addColorStop(0, `rgba(${hue},0.22)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    ac.fillStyle = g;
    ac.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const dets: Detection[] = [];
  for (let i = 0; i < 220; i++) {
    const x = r() * width;
    const y = r() * height;
    const s = 0.6 + Math.pow(r(), 3) * 3;
    const g = ac.createRadialGradient(x, y, 0, x, y, s * 4);
    g.addColorStop(0, `rgba(255,250,235,${0.6 + s * 0.1})`);
    g.addColorStop(0.3, 'rgba(255,245,225,0.25)');
    g.addColorStop(1, 'rgba(255,245,225,0)');
    ac.fillStyle = g;
    ac.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
    if (s > 1.6) dets.push(det(dets.length + 1, x, y, s, s, 0, 'star', s));
  }
  for (const [fx, fy] of [
    [0.2, 0.3],
    [0.82, 0.72],
  ]) {
    const x = fx * width;
    const y = fy * height;
    ac.save();
    ac.translate(x, y);
    ac.rotate(0.6);
    const g = ac.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(240,230,210,0.9)');
    g.addColorStop(0.4, 'rgba(200,180,170,0.35)');
    g.addColorStop(1, 'rgba(200,180,170,0)');
    ac.fillStyle = g;
    ac.scale(1, 0.45);
    ac.beginPath();
    ac.arc(0, 0, 26, 0, Math.PI * 2);
    ac.fill();
    ac.restore();
    dets.push(det(dets.length + 1, x, y, 8, 3.6, 34, 'galaxy', 5));
  }
  const b = document.createElement('canvas');
  b.width = width;
  b.height = height;
  const bc = b.getContext('2d', { willReadFrequently: true })!;
  bc.filter = 'blur(2.2px)';
  bc.drawImage(a, 0, 0);
  bc.filter = 'none';
  const bi = bc.getImageData(0, 0, width, height);
  for (let i = 0; i < bi.data.length; i += 4) {
    const n = (r() - 0.5) * 70 + (r() < 0.004 ? 160 : 0);
    bi.data[i] = Math.max(0, Math.min(255, bi.data[i] + n));
    bi.data[i + 1] = Math.max(0, Math.min(255, bi.data[i + 1] + n));
    bi.data[i + 2] = Math.max(0, Math.min(255, bi.data[i + 2] + n * 1.1));
  }
  bc.putImageData(bi, 0, 0);
  // PSNR measured between the two canvases (luma)
  const ai = ac.getImageData(0, 0, width, height).data;
  let se = 0;
  for (let i = 0; i < ai.length; i += 4) {
    const la = 0.299 * ai[i] + 0.587 * ai[i + 1] + 0.114 * ai[i + 2];
    const lb = 0.299 * bi.data[i] + 0.587 * bi.data[i + 1] + 0.114 * bi.data[i + 2];
    se += (la - lb) ** 2;
  }
  const mse = se / (width * height);
  const psnr = mse > 0 ? 10 * Math.log10((255 * 255) / mse) : null;
  const stars = dets.filter((d) => d.kind === 'star').length;
  const result: LensResult = {
    image: { width, height, channels: 3, format: 'MOCK canvas', is_fits: false, source_filename: `mock-field-${seed}` },
    noise: { background_median: 0, background_sigma: 0, method: 'mock · none' },
    psf: { fwhm_px: null, method: 'none', n_stars_used: 0, kernel_size: 0 },
    restoration: { denoise: { method: 'mock · none', strength: 0 }, deblur: { method: 'mock · none', iterations: 0, applied: false, reason: 'MOCK: the "restored" image is the generator output' } },
    honesty: {
      ssim: null,
      psnr_db: psnr,
      forward_model: { chi2_reduced: null, residual_rms: null, structure_score: null, verdict: 'mock' },
      flux_conservation: { n_stars: 0, median_ratio: null, max_abs_dev_pct: null, within_5pct_fraction: null },
      position_shift: { n_stars: 0, median_shift_px: null, max_shift_px: null },
      invented_pixels: 0,
      notes: ['MOCK · pipeline pending: the original is a simulated degradation (blur 2.2 px + noise) of a procedural field; PSNR compares the two.'],
    },
    detections: dets,
    counts: { stars, galaxies: dets.length - stars, unknown: 0 },
    wcs: { solved: false, method: null, ra_center: null, dec_center: null, fov_deg: null, pixel_scale_arcsec: null, orientation_deg: null },
    units_note: 'MOCK · pixel units of a generated canvas',
    trace: { formula: 'MOCK · no pipeline ran', inputs: { seed }, notes: [] },
  };
  return { id: `mock-${seed}`, width, height, original: b.toDataURL('image/png'), restored: a.toDataURL('image/png'), result };
}

function det(id: number, x: number, y: number, a: number, b: number, th: number, kind: Detection['kind'], size: number): Detection {
  return { id, x, y, flux: size * 1000, peak: size * 60, snr: 0, fwhm_px: 2.355 * a, a, b, theta_deg: th, ellipticity: 1 - b / a, kind, mag_instrumental: null, size_px: size, ra: null, dec: null, name: `generator truth #${id}` };
}
