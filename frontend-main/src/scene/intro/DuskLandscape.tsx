/**
 * Dusk landscape (§7.3) at the REAL sunset azimuth, painted as a high-contrast woodblock print
 * (fūkei-ga): Mt Fuji with a carved snow cap, a far violet range, cedar-crested indigo ridges, cream
 * kasumi mist bands, a black pine headland with a five-storey pagoda, a still lake that mirrors the dusk
 * and a skein of geese. Every layer is a canvas-painted billboard placed by angle from the eye, so the
 * composition holds at any FOV. The real-azimuth crimson sun sets behind the ridges and is mirrored on
 * the water. Colours fold into night ink as the real Sun goes down (skyClock).
 * When a photographic backdrop exists (backdrop.ts) it replaces the painted layers and the sun.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm1, rng } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';
import { EYE } from '@/scene/Director';
import { intro, P, sceneryOpacity, smooth, token } from './introBus';
import { backdrop, loadBackdrop } from './backdrop';

const D = Math.PI / 180;

/** Print colours: Prussian-blue sky band, persimmon horizon, indigo hills, cream mist (see DuskAtmosphere). */
export const PRINT = {
  prussian: '#1C2A4E',
  cream: '#F1DFB8',
  kaki: '#E2793F',
  fujiTop: '#232848',
  fujiBase: '#5F6C8E',
  snow: '#F7F2E7',
  snowShade: '#A9B5CF',
  far: '#7F84A8',
  ridge: '#161C30',
  ridgeLow: '#4E5A7A',
  mist: '#F3E8CF',
  lakeTop: '#C8693E',
  lakeMid: '#2E2D4A',
  lakeLow: '#0D0F1C',
};

/* ---------- painting ---------- */

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function vGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** A crest line (canvas y per x) from layered noise with a few sharper peaks. */
function crest(w: number, h: number, seed: number, base: number, amp: number, freq: number) {
  const ys = new Float32Array(w + 1);
  for (let x = 0; x <= w; x++) {
    const u = x / w;
    const body = fbm1(u * freq + seed, 5);
    const peak = Math.max(0, fbm1(u * freq * 0.45 + seed * 3.1, 3) - 0.55);
    ys[x] = h * (base - amp * (body - 0.5) * 2 - peak * amp * 3);
  }
  return ys;
}

/** Sugi cedars: narrow stacked tiers standing on the crest. */
function cedars(ctx: CanvasRenderingContext2D, ys: Float32Array, r: () => number, minH: number, maxH: number, gap: number) {
  for (let x = 4 + r() * gap; x < ys.length - 4; x += gap * (0.45 + r())) {
    const y = ys[Math.round(x)] + 2;
    const th = minH + (maxH - minH) * Math.pow(r(), 1.6);
    const tw = th * (0.2 + 0.08 * r());
    ctx.beginPath();
    const tiers = 4;
    ctx.moveTo(x, y - th);
    for (let k = 1; k <= tiers; k++) {
      const ty = y - th + (th * k) / tiers;
      const wk = (tw * k) / tiers;
      ctx.lineTo(x + wk, ty);
      ctx.lineTo(x + wk * 0.45, ty - th * 0.06);
    }
    ctx.lineTo(x + tw * 0.4, y + 3);
    ctx.lineTo(x - tw * 0.4, y + 3);
    for (let k = tiers; k >= 1; k--) {
      const ty = y - th + (th * k) / tiers;
      const wk = (tw * k) / tiers;
      ctx.lineTo(x - wk * 0.45, ty - th * 0.06);
      ctx.lineTo(x - wk, ty);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** Mt Fuji: concave slopes, notched summit, carved slope lines and a crisp snow cap with long gullies. */
function fujiTex() {
  return canvasTex(2048, 760, (ctx, w, h) => {
    const cx = w * 0.5;
    const top = h * 0.05;
    const r = rng(7);
    const half = (y: number) => {
      const t = Math.max(0, (y - top) / (h - top));
      return w * (0.03 + 0.47 * Math.pow(t, 1.8));
    };
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(cx - half(h), h);
      for (let y = h; y >= top; y -= 2) ctx.lineTo(cx - half(y) + (fbm1(y * 0.03, 3) - 0.5) * 4, y);
      ctx.lineTo(cx - w * 0.018, top + 4);
      ctx.lineTo(cx - w * 0.006, top + 1);
      ctx.lineTo(cx + w * 0.004, top + 6);
      ctx.lineTo(cx + w * 0.016, top + 2);
      for (let y = top; y <= h; y += 2) ctx.lineTo(cx + half(y) + (fbm1(y * 0.03 + 9, 3) - 0.5) * 4, y);
      ctx.closePath();
    };
    // body: deep indigo at the summit fading to slate, then cream mist at the foot (opaque all the way)
    outline();
    ctx.fillStyle = vGrad(ctx, top, h, [
      [0, PRINT.fujiTop],
      [0.5, PRINT.fujiBase],
      [0.82, '#B9B3B4'],
      [1, PRINT.mist],
    ]);
    ctx.fill();
    ctx.save();
    outline();
    ctx.clip();
    // the flank toward the setting sun catches warm light
    const lit = ctx.createLinearGradient(cx, 0, cx + half(h), 0);
    lit.addColorStop(0, 'rgba(226,121,63,0)');
    lit.addColorStop(1, 'rgba(226,121,63,0.22)');
    ctx.fillStyle = lit;
    ctx.fillRect(cx, 0, w / 2, h * 0.8);
    // carved slope lines, as a woodblock cutter would leave them
    for (let i = 0; i < 70; i++) {
      const u = r() * 2 - 1;
      const y0 = top + (h - top) * (0.22 + r() * 0.25);
      const y1 = y0 + (h - top) * (0.06 + r() * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx + u * half(y0), y0);
      ctx.quadraticCurveTo(cx + u * half((y0 + y1) / 2) * 1.01, (y0 + y1) / 2, cx + u * half(y1), y1);
      ctx.strokeStyle = r() < 0.6 ? 'rgba(10,12,32,0.16)' : 'rgba(210,214,232,0.08)';
      ctx.lineWidth = 1 + r() * 1.2;
      ctx.stroke();
    }
    // snow cap: a jagged line of gullies running down the ravines
    const snowY = top + (h - top) * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - half(top) - 2, top - 2);
    ctx.lineTo(cx - half(snowY) - 6, snowY);
    for (let u = -1; u < 1; ) {
      const step = 0.035 + r() * 0.05;
      const mid = u + step * (0.4 + r() * 0.2);
      const len = (h - top) * (0.03 + Math.pow(r(), 1.7) * 0.24) * (1 - 0.55 * Math.abs(mid));
      const yb = snowY + (r() - 0.5) * 10;
      ctx.lineTo(cx + mid * half(yb + len), yb + len);
      u += step;
      const ye = snowY + (r() - 0.5) * 10;
      ctx.lineTo(cx + Math.min(1, u) * half(ye), ye);
    }
    ctx.lineTo(cx + half(snowY) + 6, snowY);
    ctx.lineTo(cx + half(top) + 2, top - 2);
    ctx.closePath();
    ctx.fillStyle = PRINT.snow;
    ctx.fill();
    // the shadow side of the snow, cool blue
    ctx.save();
    ctx.clip();
    const sh = ctx.createLinearGradient(cx - half(snowY), 0, cx + half(snowY) * 0.2, 0);
    sh.addColorStop(0, PRINT.snowShade);
    sh.addColorStop(1, 'rgba(169,181,207,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const u = (r() * 2 - 1) * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx + u * half(top + 10), top + 10);
      ctx.lineTo(cx + u * half(snowY + 60), snowY + 60);
      ctx.strokeStyle = 'rgba(120,136,170,0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  });
}

/** A far range of soft violet peaks, misted to cream at the foot. */
function farRangeTex() {
  return canvasTex(2048, 360, (ctx, w, h) => {
    const ys = crest(w, h, 4.2, 0.42, 0.18, 7);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x++) ctx.lineTo(x, ys[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, h * 0.1, h, [
      [0, PRINT.far],
      [0.55, '#B3AEBE'],
      [1, PRINT.mist],
    ]);
    ctx.fill();
  });
}

/** A ridge of dark indigo hills crowned with cedars, bokashi down to the mist. */
function ridgeTex(seed: number, crown: string, low: string, base: number, amp: number, freq: number, trees: [number, number, number]) {
  return canvasTex(2048, 420, (ctx, w, h) => {
    const ys = crest(w, h, seed, base, amp, freq);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x++) ctx.lineTo(x, ys[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, h * 0.15, h, [
      [0, crown],
      [0.45, crown],
      [0.75, low],
      [1, PRINT.mist],
    ]);
    ctx.fill();
    ctx.fillStyle = crown;
    cedars(ctx, ys, rng(seed * 100), trees[0], trees[1], trees[2]);
  });
}

/** Kasumi: flat cream bands with rounded ends and a fine printed contour, crisp above and soft below. */
function kasumiTex(bands: [number, number, number, number][]) {
  return canvasTex(2048, 256, (ctx, w, h) => {
    for (const [x0, x1, y0, bh] of bands) {
      const x = x0 * w;
      const y = y0 * h;
      const bw = (x1 - x0) * w;
      const hh = bh * h;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, hh, hh / 2);
      ctx.fillStyle = vGrad(ctx, y, y + hh, [
        [0, 'rgba(240,228,200,0.94)'],
        [0.55, 'rgba(236,222,192,0.85)'],
        [1, 'rgba(236,222,192,0.25)'],
      ]);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(x, y, bw, hh, hh / 2);
      ctx.strokeStyle = 'rgba(122,96,78,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

/** The lake: the dusk mirrored darker, with long horizontal ripple lines. */
function lakeTex() {
  return canvasTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = vGrad(ctx, 0, h, [
      [0, PRINT.lakeTop],
      [0.18, '#7A4A4E'],
      [0.45, PRINT.lakeMid],
      [1, PRINT.lakeLow],
    ]);
    ctx.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(r(), 1.4) * h;
      const len = w * (0.04 + r() * 0.3) * (1 - (y / h) * 0.5);
      const x = r() * (w - len);
      ctx.fillStyle = r() < 0.6 ? `rgba(241,223,184,${0.05 + 0.12 * (1 - y / h)})` : 'rgba(8,9,20,0.25)';
      ctx.fillRect(x, y, len, 1 + (y / h) * 2.5);
    }
  });
}

/** The black headland: a rocky spit, two Japanese black pines and the five-storey pagoda. */
function headlandTex(ink: string) {
  return canvasTex(1024, 1024, (ctx, w, h) => {
    const r = rng(19);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    // land: low on the left, a rocky shoulder on the right
    const ground = (x: number) => h * (0.78 - 0.16 * smooth(0.05, 0.6, x / w) + (fbm1(x * 0.012 + 2, 4) - 0.5) * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 2) ctx.lineTo(x, ground(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // pagoda on the shoulder
    const px = w * 0.62;
    let y = ground(px) + 4;
    ctx.fillRect(px - 64, y - 14, 128, 14);
    y -= 14;
    for (let i = 0; i < 5; i++) {
      const bw = 38 - i * 4.5;
      const bh = 40 - i * 3;
      ctx.fillRect(px - bw, y - bh, bw * 2, bh);
      y -= bh;
      const rw = 92 - i * 9;
      const rh = 16 - i;
      ctx.beginPath();
      ctx.moveTo(px - rw - 10, y - 14);
      ctx.quadraticCurveTo(px - rw * 0.62, y + 3, px - bw - 6, y + 2);
      ctx.lineTo(px + bw + 6, y + 2);
      ctx.quadraticCurveTo(px + rw * 0.62, y + 3, px + rw + 10, y - 14);
      ctx.quadraticCurveTo(px + rw * 0.5, y - rh * 0.5, px + bw * 0.5, y - rh);
      ctx.lineTo(px - bw * 0.5, y - rh);
      ctx.quadraticCurveTo(px - rw * 0.5, y - rh * 0.5, px - rw - 10, y - 14);
      ctx.closePath();
      ctx.fill();
      y -= rh;
    }
    ctx.fillRect(px - 3, y - 120, 6, 120);
    for (let k = 0; k < 9; k++) ctx.fillRect(px - 10 + k * 0.5, y - 26 - k * 9, 20 - k, 3.5);
    ctx.beginPath();
    ctx.arc(px, y - 126, 7, 0, Math.PI * 2);
    ctx.fill();
    // black pines: a leaning trunk and flat cloud-pad foliage
    const pine = (x0: number, lean: number, height: number, pads: number) => {
      const yb = ground(x0) + 6;
      const x1 = x0 + lean;
      const y1 = yb - height;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, yb);
      ctx.bezierCurveTo(x0 + lean * 0.1, yb - height * 0.4, x1 - lean * 0.5, y1 + height * 0.25, x1, y1);
      ctx.lineWidth = 16;
      ctx.stroke();
      for (let k = 0; k < pads; k++) {
        const t = 0.35 + (k / pads) * 0.65;
        const bx = x0 + lean * t * t;
        const by = yb - height * t;
        const dir = k % 2 ? 1 : -1;
        const reach = 40 + r() * 70;
        const ex = bx + dir * reach;
        const ey = by - 10 - r() * 20;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo((bx + ex) / 2, by - 4, ex, ey);
        ctx.lineWidth = 6;
        ctx.stroke();
        // pad: flat top, scalloped underside
        const pw = 46 + r() * 40;
        const ph = 14 + r() * 8;
        ctx.beginPath();
        ctx.moveTo(ex - pw, ey);
        ctx.quadraticCurveTo(ex - pw * 0.6, ey - ph * 1.3, ex, ey - ph * 1.1);
        ctx.quadraticCurveTo(ex + pw * 0.7, ey - ph * 1.2, ex + pw, ey);
        for (let s = 6; s >= 0; s--) {
          const sx = ex - pw + (2 * pw * s) / 6;
          ctx.quadraticCurveTo(sx + pw / 6, ey + ph * 0.55, sx, ey);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(x1, y1 - 8, 54, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    pine(w * 0.3, -70, 330, 5);
    pine(w * 0.88, 40, 260, 4);
    // the foot dissolves into the lake
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = vGrad(ctx, h * 0.82, h, [
      [0, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,1)'],
    ]);
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** A skein of geese, single brush strokes. */
function geeseTex(ink: string) {
  return canvasTex(512, 256, (ctx, w, h) => {
    const r = rng(5);
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = w * 0.12 + i * w * 0.085 + (r() - 0.5) * 10;
      const y = h * 0.3 + Math.abs(i - 3) * h * 0.08 + (r() - 0.5) * 12;
      const s = 9 + r() * 5;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.25);
      ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y);
      ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.6, x + s, y - s * 0.3);
      ctx.stroke();
    }
  });
}

/* ---------- shaders ---------- */

const layerVS = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const layerFS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uNightInk; uniform float uNight; uniform float uNightFade;
  uniform float uOpacity; uniform float uFeather;
  varying vec2 vUv;
  void main(){
    vec4 c = texture2D(uMap, vUv);
    vec3 col = mix(c.rgb, uNightInk, uNight * 0.86);
    float edge = mix(1.0, smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x), uFeather);
    float a = c.a * uOpacity * edge * (1.0 - uNight * uNightFade);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

const sunFS = /* glsl */ `
  uniform vec3 uCore; uniform vec3 uRim; uniform vec3 uGlow; uniform float uAlpha;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float edge = 0.2;
    float disc = 1.0 - smoothstep(edge - 0.004, edge + 0.004, r);
    vec3 dc = mix(uCore, uRim, smoothstep(edge * 0.5, edge, r));
    float glow = exp(-r * 9.0) * 0.22;
    vec3 col = dc * disc + uGlow * glow * (1.0 - disc);
    float a = max(disc, glow) * uAlpha;
    gl_FragColor = vec4(col, a);
    if (a < 0.003) discard;
    #include <colorspace_fragment>
  }`;

/** The sun's mirror image on the lake: broken horizontal dashes that thin out toward the viewer. */
const glintFS = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha;
  varying vec2 vUv;
  float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
  void main(){
    float row = floor(vUv.y * 46.0);
    float inRow = smoothstep(0.0, 0.25, fract(vUv.y * 46.0)) * smoothstep(0.75, 0.5, fract(vUv.y * 46.0));
    float halfW = (0.18 + 0.32 * h1(row)) * mix(0.35, 1.0, vUv.y);
    float x = abs(vUv.x - 0.5 - (h1(row + 7.0) - 0.5) * 0.12);
    float dash = 1.0 - smoothstep(halfW * 0.8, halfW, x);
    float a = dash * inRow * smoothstep(0.0, 0.7, vUv.y) * uAlpha * (0.55 + 0.45 * h1(row + 3.0));
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;

/** The photographic backdrop: cover-cropped, feathered at the top and sides into the sky, folding into ink. */
const photoFS = /* glsl */ `
  uniform sampler2D uMap; uniform vec4 uCrop; uniform vec3 uNightInk; uniform float uNight; uniform float uOpacity;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(uMap, uCrop.xy + vUv * uCrop.zw).rgb;
    vec3 col = mix(c, uNightInk, uNight * 0.86);
    float edge = smoothstep(1.0, 0.85, vUv.y) * smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
    float a = edge * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

/* ---------- layout ---------- */

interface Layer {
  tex: THREE.Texture;
  /** distance from the eye */
  d: number;
  /** horizontal centre and half-width (degrees, + = right of the sunset azimuth) */
  ax: number;
  half: number;
  /** bottom and top (degrees of altitude) */
  bot: number;
  top: number;
  feather?: boolean;
  /** fade out at night instead of turning to ink (mist, birds) */
  nightFade?: number;
}

/**
 * Where the photo sits once the frame has opened: the full view at the end of the sunset (FOV ≈ 55°,
 * pitch ≈ 8°). At the start it fills the small opening frame instead (same proportions), and it grows
 * with the frame, so the whole picture is always in view while the frame expands.
 */
const PHOTO = { d: 30, ax: 0, half: 44, bot: -21, top: 36 };
const PHOTO_FRAMED = { d: 30, ax: 0, half: 22.8, bot: -7.2, top: 19.6 };

/** Layers draw back to front from here (before the trees at 1 and the petals at 2); the lake is index LAKE. */
const LAYER_ORDER = -16;
const LAKE = 6;

/** A billboard covering the given angles at distance d (the camera only rotates about the eye). */
function place(l: Pick<Layer, 'd' | 'ax' | 'half' | 'bot' | 'top'>) {
  const y0 = EYE[1] + l.d * Math.tan(l.bot * D);
  const y1 = EYE[1] + l.d * Math.tan(l.top * D);
  const x0 = l.d * Math.tan((l.ax - l.half) * D);
  const x1 = l.d * Math.tan((l.ax + l.half) * D);
  return { pos: [(x0 + x1) / 2, (y0 + y1) / 2, -l.d] as [number, number, number], w: x1 - x0, h: y1 - y0 };
}

export default function DuskLandscape() {
  const group = useRef<THREE.Group>(null);
  const sun = useRef<THREE.Mesh>(null);
  const glint = useRef<THREE.Mesh>(null);
  const az = (intro.timeline?.sunsetAz ?? 270) * D;
  const [photo, setPhoto] = useState(backdrop.texture);
  useEffect(() => {
    if (photo) return;
    let alive = true;
    void loadBackdrop().then((t) => alive && t && setPhoto(t));
    return () => {
      alive = false;
    };
  }, [photo]);

  const { layers, mats, sunMat, glintMat } = useMemo(() => {
    const sumi = token('--sumi', '#090A0C');
    const layers: Layer[] = [
      // The opening frame shows about −4°…16° of altitude and ±20° across; the rest appears as it opens.
      { tex: farRangeTex(), d: 33, ax: 0, half: 64, bot: -3.5, top: 4.5, feather: true },
      { tex: fujiTex(), d: 32.5, ax: -7, half: 21, bot: -2.5, top: 11.5 },
      { tex: geeseTex(sumi), d: 30, ax: 9, half: 5.5, bot: 9, top: 12.5, nightFade: 1 },
      { tex: kasumiTex([[0.04, 0.3, 0.2, 0.3], [0.36, 0.55, 0.52, 0.26], [0.62, 0.9, 0.26, 0.28]]), d: 31, ax: -4, half: 46, bot: -1.2, top: 1.6, feather: true, nightFade: 0.9 },
      { tex: ridgeTex(5.3, PRINT.ridge, PRINT.ridgeLow, 0.5, 0.14, 9, [8, 24, 12]), d: 27, ax: 4, half: 66, bot: -4.6, top: 2.6, feather: true },
      { tex: kasumiTex([[0.1, 0.38, 0.3, 0.34], [0.55, 0.85, 0.5, 0.3]]), d: 25, ax: -6, half: 50, bot: -4.4, top: -2.0, feather: true, nightFade: 0.9 },
      { tex: lakeTex(), d: 15, ax: 0, half: 70, bot: -32, top: -4.0 },
      { tex: headlandTex(sumi), d: 13, ax: 13, half: 13, bot: -10, top: 13 },
    ];
    const nightInk = new THREE.Color(sumi);
    const mats = layers.map(
      (l) =>
        new THREE.ShaderMaterial({
          vertexShader: layerVS,
          fragmentShader: layerFS,
          uniforms: {
            uMap: { value: l.tex },
            uNightInk: { value: nightInk },
            uNight: { value: 0 },
            uNightFade: { value: l.nightFade ?? 0 },
            uOpacity: { value: 1 },
            uFeather: { value: l.feather ? 1 : 0 },
          },
          transparent: true,
          depthWrite: false,
          // painted back to front by renderOrder; nothing of the sky's own horizon may cut through
          depthTest: false,
        }),
    );
    const sunMat = new THREE.ShaderMaterial({
      vertexShader: layerVS,
      fragmentShader: sunFS,
      depthTest: false,
      uniforms: {
        uCore: { value: new THREE.Color(token('--shu', '#C62920')) },
        uRim: { value: new THREE.Color(token('--crimson', '#A70D16')) },
        uGlow: { value: new THREE.Color(PRINT.kaki) },
        uAlpha: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    const glintMat = new THREE.ShaderMaterial({
      vertexShader: layerVS,
      fragmentShader: glintFS,
      depthTest: false,
      uniforms: { uColor: { value: new THREE.Color(token('--sun-1', '#D3572E')) }, uAlpha: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    return { layers, mats, sunMat, glintMat };
  }, []);

  const placed = useMemo(() => layers.map(place), [layers]);

  const photoPlaced = useMemo(() => place(PHOTO), []);
  const photoMesh = useRef<THREE.Mesh>(null);
  const photoMat = useMemo(() => {
    if (!photo) return null;
    const img = photo.image as { width: number; height: number };
    const plane = photoPlaced.w / photoPlaced.h;
    const image = img.width / img.height;
    // cover: crop the long side, keeping the centre
    const sx = image > plane ? plane / image : 1;
    const sy = image > plane ? 1 : image / plane;
    return new THREE.ShaderMaterial({
      vertexShader: layerVS,
      fragmentShader: photoFS,
      uniforms: {
        uMap: { value: photo },
        uCrop: { value: new THREE.Vector4((1 - sx) / 2, (1 - sy) / 2, sx, sy) },
        uNightInk: { value: mats[0].uniforms.uNightInk.value },
        uNight: { value: 0 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
  }, [photo, photoPlaced, mats]);
  useEffect(() => () => photoMat?.dispose(), [photoMat]);

  useFrame(() => {
    if (import.meta.env.DEV) Object.assign(window, { __sky: skyClock, __land: group.current, __sun: sun.current });
    const p = intro.progress;
    const alt = skyClock.sun.alt;
    const night = smooth(P.frameEnd, P.streamEnd, p);
    const fadeOut = sceneryOpacity(p);
    if (group.current) group.current.visible = fadeOut > 0.001;
    for (const m of mats) {
      m.uniforms.uNight.value = night;
      m.uniforms.uOpacity.value = fadeOut;
    }
    if (photoMat) {
      photoMat.uniforms.uNight.value = night;
      photoMat.uniforms.uOpacity.value = fadeOut;
    }
    if (photoMesh.current) {
      const k = smooth(0, P.frameEnd, p);
      const at = place({
        d: PHOTO.d,
        ax: 0,
        half: PHOTO_FRAMED.half + (PHOTO.half - PHOTO_FRAMED.half) * k,
        bot: PHOTO_FRAMED.bot + (PHOTO.bot - PHOTO_FRAMED.bot) * k,
        top: PHOTO_FRAMED.top + (PHOTO.top - PHOTO_FRAMED.top) * k,
      });
      photoMesh.current.position.set(...at.pos);
      photoMesh.current.scale.set(at.w / photoPlaced.w, at.h / photoPlaced.h, 1);
    }
    // the real Sun (time-lapse via skyClock.override): a crimson disc that sets behind the ridges
    const sd = skyClock.sun.dir;
    const sunA = smooth(-4, -0.5, alt) * fadeOut;
    if (sun.current) {
      sun.current.position.set(sd[0] * 96, sd[1] * 96, sd[2] * 96);
      sun.current.lookAt(EYE[0], EYE[1], EYE[2]);
      sun.current.visible = sunA > 0.001 && !photoMat;
      sunMat.uniforms.uAlpha.value = sunA;
    }
    // …and its broken reflection on the lake, under the Sun's real azimuth
    if (glint.current) {
      const sAz = Math.atan2(sd[0], -sd[2]);
      const gd = 14.5;
      const top = EYE[1] + gd * Math.tan(-4.8 * D);
      const bot = EYE[1] + gd * Math.tan(-22 * D);
      glint.current.position.set(Math.sin(sAz) * gd, (top + bot) / 2, -Math.cos(sAz) * gd);
      glint.current.scale.set(gd * Math.tan(2.6 * D) * 2, top - bot, 1);
      glint.current.lookAt(EYE[0], glint.current.position.y, EYE[2]);
      const a = smooth(-2, 3, alt) * (1 - night * 0.7) * fadeOut * 0.85;
      glint.current.visible = a > 0.002 && !photoMat;
      glintMat.uniforms.uAlpha.value = a;
    }
  });

  return (
    <>
      <group ref={group} rotation={[0, -az, 0]}>
        {photoMat ? (
          <mesh ref={photoMesh} position={photoPlaced.pos} material={photoMat} renderOrder={LAYER_ORDER}>
            <planeGeometry args={[photoPlaced.w, photoPlaced.h]} />
          </mesh>
        ) : (
          layers.map((_, i) => (
            <mesh key={i} position={placed[i].pos} material={mats[i]} renderOrder={LAYER_ORDER + i}>
              <planeGeometry args={[placed[i].w, placed[i].h]} />
            </mesh>
          ))
        )}
      </group>
      <mesh ref={sun} material={sunMat} renderOrder={LAYER_ORDER - 1}>
        <planeGeometry args={[18, 18]} />
      </mesh>
      <mesh ref={glint} material={glintMat} renderOrder={LAYER_ORDER + LAKE + 0.5}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}
