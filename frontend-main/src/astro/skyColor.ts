/**
 * Sky colour from the Sun's real altitude (AGENT_BRIEF §5.1, "Crimson Sakura Night" palette).
 * Dusk runs through the PECFEST rising-sun reds into a murasaki-violet night.
 */

const STOPS: { alt: number; zenith: [number, number, number]; horizon: [number, number, number] }[] = [
  { alt: -18, zenith: hex('#08070F'), horizon: hex('#120E22') }, // astronomical night: violet-black
  { alt: -12, zenith: hex('#140F2E'), horizon: hex('#3B1A35') }, // nautical dusk: nebula over crimson-violet
  { alt: -6, zenith: hex('#2A2150'), horizon: hex('#9E3329') }, // civil dusk: murasaki over pecfest sun-2
  { alt: 0, zenith: hex('#7E6A92'), horizon: hex('#D3572E') }, // golden hour: wisteria over pecfest sun-1
  { alt: 6, zenith: hex('#C9C4CC'), horizon: hex('#EADBC8') }, // day: ink-wash washi
];

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const toHex = (c: [number, number, number]) =>
  '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

export interface SkyPalette {
  zenith: string;
  horizon: string;
  /** 0..1 sRGB, for three.js Color.setRGB(..., SRGBColorSpace) */
  zenithRgb: [number, number, number];
  horizonRgb: [number, number, number];
  /** 1 = full night stars, 0 = stars hidden */
  starFade: number;
  /** naked-eye limiting magnitude implied by sky brightness */
  limitingMag: number;
  /** 0 night … 1 day */
  daylight: number;
}

export function skyPalette(sunAltDeg: number): SkyPalette {
  const a = Math.max(-18, Math.min(6, sunAltDeg));
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].alt < a) i++;
  const s0 = STOPS[i];
  const s1 = STOPS[i + 1];
  const t = smoothstep(s0.alt, s1.alt, a);
  const mix = (p: [number, number, number], q: [number, number, number]): [number, number, number] => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t,
  ];
  const zenithRgb = mix(s0.zenith, s1.zenith);
  const horizonRgb = mix(s0.horizon, s1.horizon);
  const starFade = 1 - smoothstep(-15, -1, sunAltDeg);
  const limitingMag = -1.5 + 7.5 * (1 - smoothstep(-18, 0, sunAltDeg));
  return { zenith: toHex(zenithRgb), horizon: toHex(horizonRgb), zenithRgb, horizonRgb, starFade, limitingMag, daylight: smoothstep(-6, 6, sunAltDeg) };
}
