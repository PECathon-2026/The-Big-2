/** Constellation figures flattened for per-frame projection (890 vertices; built once). */
import type { Catalog } from '@/astro/catalog';
import { raDecToEquatorial } from '@/astro/coords';

export interface ConGeom {
  /** equatorial unit vectors, xyz × count */
  verts: Float32Array;
  count: number;
  /** polyline start index (into verts), length and constellation index */
  polyStart: Int32Array;
  polyLen: Int32Array;
  polyCon: Int32Array;
  polyCount: number;
  /** per-frame screen buffer: x, y, ok (1 when above the horizon and in front of the camera) */
  scr: Float32Array;
  /** equatorial unit vector of each constellation's label centre */
  centers: Float32Array;
  /** per-frame: centre screen x, y, ok */
  cScr: Float32Array;
  names: { id: string; name: string; ja: string; rank: number }[];
}

let geom: ConGeom | null = null;
let forCat: Catalog | null = null;

export function constellationGeom(cat: Catalog): ConGeom {
  if (geom && forCat === cat) return geom;
  let count = 0;
  let polys = 0;
  for (const c of cat.constellations) for (const l of c.lines) {
    count += l.length;
    polys++;
  }
  const verts = new Float32Array(count * 3);
  const polyStart = new Int32Array(polys), polyLen = new Int32Array(polys), polyCon = new Int32Array(polys);
  const centers = new Float32Array(cat.constellations.length * 3);
  let v = 0, p = 0;
  cat.constellations.forEach((c, ci) => {
    centers.set(raDecToEquatorial(c.center[0], c.center[1]), ci * 3);
    for (const l of c.lines) {
      polyStart[p] = v;
      polyLen[p] = l.length;
      polyCon[p] = ci;
      p++;
      for (const [ra, dec] of l) {
        verts.set(raDecToEquatorial(ra, dec), v * 3);
        v++;
      }
    }
  });
  geom = {
    verts,
    count,
    polyStart,
    polyLen,
    polyCon,
    polyCount: polys,
    scr: new Float32Array(count * 3),
    centers,
    cScr: new Float32Array(cat.constellations.length * 3),
    names: cat.constellations.map((c) => ({ id: c.id, name: c.name, ja: c.ja, rank: c.rank })),
  };
  forCat = cat;
  return geom;
}

/** Constellation index nearest to (x, y) within maxPx (distance to projected segments), or −1. */
export function pickConstellation(g: ConGeom, x: number, y: number, maxPx = 8): number {
  let best = -1;
  let bestD = maxPx * maxPx;
  const s = g.scr;
  for (let p = 0; p < g.polyCount; p++) {
    const st = g.polyStart[p];
    for (let k = 0; k < g.polyLen[p] - 1; k++) {
      const a = (st + k) * 3, b = a + 3;
      if (!s[a + 2] || !s[b + 2]) continue;
      const ax = s[a], ay = s[a + 1], bx = s[b], by = s[b + 1];
      const dx = bx - ax, dy = by - ay;
      const L = dx * dx + dy * dy;
      let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - x, ey = ay + t * dy - y;
      const d = ex * ex + ey * ey;
      if (d < bestD) {
        bestD = d;
        best = g.polyCon[p];
      }
    }
  }
  return best;
}
