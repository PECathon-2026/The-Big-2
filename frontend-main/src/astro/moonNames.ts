/** Japanese moon names by lunar day (from the approved demo). Prefer /api/scroll/moon's `name` when available. */
export interface MoonNameInfo {
  day: number;
  kanji: string;
  romaji: string;
  meaning: string;
}

export const SYNODIC = 29.530588853;

const MOON_NAMES: [number, string, string, string][] = [
  [1, '朔', 'Saku', 'The dark moon. The night belongs to the stars alone.'],
  [2, '二日月', 'Futsukazuki', 'A thread of light low in the west after sunset.'],
  [3, '三日月', 'Mikazuki', 'The blade moon. Thin, bright, and gone early.'],
  [7, '上弦の月', 'Jōgen no Tsuki', 'First quarter. Half the moon stands guard until midnight.'],
  [10, '十日夜', 'Tōkanya', 'The tenth night. The moon lingers well past midnight.'],
  [13, '十三夜', 'Jūsanya', 'The thirteenth night, honoured second only to the full moon.'],
  [14, '小望月', 'Komochizuki', 'The little waiting moon, one night before full.'],
  [15, '十五夜', 'Jūgoya', 'The full moon. Brightest night; the faintest stars retreat.'],
  [16, '十六夜', 'Izayoi', 'The hesitant moon. It rises a little later, as if reluctant to leave the mountain.'],
  [17, '立待月', 'Tachimachizuki', 'The standing-and-waiting moon: wait on your feet, it comes soon.'],
  [18, '居待月', 'Imachizuki', 'The sitting-and-waiting moon: sit, it is later still.'],
  [19, '寝待月', 'Nemachizuki', 'The lying-and-waiting moon: lie down, it will wake you.'],
  [20, '更待月', 'Fukemachizuki', 'The late-night moon. The best dark hours come before it.'],
  [23, '下弦の月', 'Kagen no Tsuki', 'Last quarter. Dark evenings, moonlit dawns.'],
  [26, '有明月', 'Ariakezuki', 'The daybreak moon, pale in the morning sky.'],
  [29, '三十日月', 'Misokazuki', 'The last sliver. Tomorrow, darkness returns.'],
];

export function moonName(ageDays: number): MoonNameInfo {
  const day = Math.floor(ageDays) + 1;
  let pick = MOON_NAMES[0];
  for (const m of MOON_NAMES) if (day >= m[0]) pick = m;
  return { day, kanji: pick[1], romaji: pick[2], meaning: pick[3] };
}

/**
 * Draws a phase-correct Moon into a 2D context (port of the demo's drawMoon).
 * `ageDays` = days since new moon.
 */
let off: HTMLCanvasElement | null = null;
export function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ageDays: number, opts: { color?: string; earthshine?: string } = {}) {
  off ??= document.createElement('canvas');
  const octx = off.getContext('2d')!;
  const phi = (2 * Math.PI * ageDays) / SYNODIC;
  const waxing = ageDays < SYNODIC / 2;
  const S = Math.ceil(r * 2 + 4);
  off.width = S;
  off.height = S;
  const c = S / 2;
  octx.clearRect(0, 0, S, S);
  octx.fillStyle = opts.color || '#f3ead6';
  octx.beginPath();
  octx.arc(c, c, r, -Math.PI / 2, Math.PI / 2, !waxing);
  octx.fill();
  const a = Math.abs(r * Math.cos(phi));
  octx.beginPath();
  octx.ellipse(c, c, Math.max(a, 0.01), r, 0, 0, Math.PI * 2);
  if (Math.cos(phi) < 0) octx.fill();
  else {
    octx.globalCompositeOperation = 'destination-out';
    octx.fill();
    octx.globalCompositeOperation = 'source-over';
  }
  if (opts.earthshine) {
    octx.globalCompositeOperation = 'destination-over';
    octx.fillStyle = opts.earthshine;
    octx.beginPath();
    octx.arc(c, c, r, 0, Math.PI * 2);
    octx.fill();
    octx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(off, x - c, y - c);
}

/**
 * Is the point (px, py) relative to the disc centre, in units of r, on the lit part of the Moon?
 * Same geometry as drawMoon — used by the loader to sample particles inside tonight's lit region.
 */
export function isLit(px: number, py: number, ageDays: number): boolean {
  if (px * px + py * py > 1) return false;
  const phi = (2 * Math.PI * ageDays) / SYNODIC;
  const waxing = ageDays < SYNODIC / 2;
  const half = waxing ? px >= 0 : px <= 0; // the lit half-disc
  const a = Math.abs(Math.cos(phi));
  const inEllipse = (px * px) / Math.max(a * a, 1e-4) + py * py <= 1;
  return Math.cos(phi) < 0 ? half || inEllipse : half && !inEllipse;
}
