/** Deterministic value noise from the demo (TK.n1/n2/fbm1/fbm2). Shared by sky, dome and intro. */
const perm = new Uint8Array(512);
{
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const fade = (t: number) => t * t * (3 - 2 * t);

export function n1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = perm[i & 255] / 255;
  const b = perm[(i + 1) & 255] / 255;
  return a + (b - a) * fade(f);
}

export function n2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a: number, b: number) => perm[(perm[a & 255] + b) & 255] / 255;
  const u = fade(xf), v = fade(yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

export function fbm1(x: number, o = 4): number {
  let s = 0, a = 0.5, f = 1, m = 0;
  for (let i = 0; i < o; i++) {
    s += a * n1(x * f);
    m += a;
    a *= 0.5;
    f *= 2;
  }
  return s / m;
}

export function fbm2(x: number, y: number, o = 4): number {
  let s = 0, a = 0.5, f = 1, m = 0;
  for (let i = 0; i < o; i++) {
    s += a * n2(x * f, y * f);
    m += a;
    a *= 0.5;
    f *= 2;
  }
  return s / m;
}

/** Seeded PRNG (mulberry32) for reproducible procedural layouts. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
