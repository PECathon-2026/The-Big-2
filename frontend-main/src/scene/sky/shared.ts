/**
 * Workstream A shared helpers: token colours (read from CSS, refreshed on field mode), the catalogue
 * hook, camera "outside the dome" factor, a zero-allocation projector, and the registry of objects
 * the sky currently shows (positions for picking, overlay labels, dome hotspots).
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { loadCatalog, catalogSync, type Catalog } from '@/astro/catalog';
import { rig } from '@/scene/Director';
import { useApp, type SkyObject } from '@/state/store';

/* ---------------- tokens ---------------- */

const tokenCache = new Map<string, string>();
let tokenEpoch = 0;
/** CSS token value (hex or rgba string). Cached; the cache clears when field mode toggles. */
export function tok(name: string): string {
  let v = tokenCache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff';
    tokenCache.set(name, v);
  }
  return v;
}
export const tokenVersion = () => tokenEpoch;
useApp.subscribe((s, p) => {
  if (s.field !== p.field) {
    // tokens.css swaps on the data-field attribute; read after it is applied
    requestAnimationFrame(() => {
      tokenCache.clear();
      tokenEpoch++;
    });
  }
});

/** "rgba(r,g,b,a)" for a hex token. */
export function tokA(name: string, a: number): string {
  const c = tokRgb(name);
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}
const rgbCache = new Map<string, [number, number, number]>();
let rgbEpoch = -1;
export function tokRgb(name: string): [number, number, number] {
  if (rgbEpoch !== tokenEpoch) {
    rgbCache.clear();
    rgbEpoch = tokenEpoch;
  }
  let c = rgbCache.get(name);
  if (!c) {
    c = parseCss(tok(name));
    rgbCache.set(name, c);
  }
  return c;
}
/** "#rgb", "#rrggbb" or "rgb(a)(…)" → sRGB 0..1 */
function parseCss(v: string): [number, number, number] {
  if (v.startsWith('#')) {
    let h = v.slice(1);
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = v.match(/[\d.]+/g);
  if (m && m.length >= 3) return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
  return [1, 1, 1];
}

/** THREE.Color (linear working space) for a token. */
export function tokColor(name: string, target = new THREE.Color()): THREE.Color {
  const [r, g, b] = tokRgb(name);
  return target.setRGB(r, g, b, THREE.SRGBColorSpace);
}

/* ---------------- catalogue ---------------- */

export function useCatalog(): Catalog | null {
  const [cat, setCat] = useState<Catalog | null>(catalogSync());
  useEffect(() => {
    if (!cat) loadCatalog().then(setCat).catch(console.error);
  }, [cat]);
  return cat;
}

/* ---------------- camera ---------------- */

/** 0 inside the sky, 1 well outside the glass (dome view). */
export function outside(): number {
  const p = rig.cur.pos;
  return THREE.MathUtils.smoothstep(Math.hypot(p[0], p[1], p[2]), 95, 160);
}

/**
 * Zero-allocation world → screen projector, refreshed once per frame by the overlay painter.
 * `project(x,y,z)` writes CSS-pixel coordinates into `P.x/P.y` and returns false when behind the camera.
 */
export const P = {
  m: new Float32Array(16),
  w: 1,
  h: 1,
  x: 0,
  y: 0,
  depth: 0,
  frame: -1,
};
const vp = new THREE.Matrix4();
export function refreshProjector(camera: THREE.Camera, w: number, h: number, frame: number) {
  camera.updateMatrixWorld();
  vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  P.m.set(vp.elements);
  P.w = w;
  P.h = h;
  P.frame = frame;
}
export function project(x: number, y: number, z: number): boolean {
  const e = P.m;
  const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
  if (cw <= 1e-4) return false;
  const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw;
  const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw;
  P.x = (cx * 0.5 + 0.5) * P.w;
  P.y = (0.5 - cy * 0.5) * P.h;
  P.depth = cw;
  return true;
}

/** Equatorial unit vector → horizontal frame (writes into out). m = skyClock.eqMatrix elements (column-major). */
export function eqToWorld(e: ArrayLike<number>, x: number, y: number, z: number, out: Float32Array | number[], o = 0, scale = 1) {
  out[o] = (e[0] * x + e[4] * y + e[8] * z) * scale;
  out[o + 1] = (e[1] * x + e[5] * y + e[9] * z) * scale;
  out[o + 2] = (e[2] * x + e[6] * y + e[10] * z) * scale;
}

/* ---------------- what the sky shows right now ---------------- */

/** Objects with live world positions, kept by the sky (A). Picking, overlay and dome hotspots read this. */
export const live = new Map<string, SkyObject>();

/** The object under the pointer (mirrors store.hovered without a React read per frame). */
export const hoverRef: { obj: SkyObject | null; since: number; con: string | null } = { obj: null, since: 0, con: null };

/** Shared overlay canvas (created by SkyOverlay, painted inside the R3F frame loop). */
export const overlay: { canvas: HTMLCanvasElement | null } = { canvas: null };

/** First-arrival hint DOM nodes (ArrivalHints); positioned each frame by the canvas loop. */
export const hintSpots = new Map<string, { el: HTMLElement; anchor: string }>();

/** Landmark meshes for raycast picking (torii, pagoda, ridges, fuji, sakura). */
export const landmarks = new Map<string, THREE.Object3D>();

/** Dev-only handles for QA. */
export const debug: Record<string, unknown> = {};

// QA hook for workstream A screenshots (dev only): window.__A.look(dirOrId, fov)
if (import.meta.env.DEV) {
  import('@/scene/skyClock').then(({ skyClock }) => {
    (window as unknown as Record<string, unknown>).__A = {
      skyClock,
      rig,
      live,
      debug,
      app: useApp.getState,
      look(target: string | [number, number, number], fov = 30) {
        const w = typeof target === 'string' ? live.get(target)?.world : target;
        if (!w) return false;
        const len = Math.hypot(w[0], w[1], w[2]);
        rig.tgt.yaw = Math.atan2(w[0], -w[2]);
        rig.tgt.pitch = Math.asin(w[1] / len);
        rig.tgt.fov = fov;
        return true;
      },
    };
  });
}
