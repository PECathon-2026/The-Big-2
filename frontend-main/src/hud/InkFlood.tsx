/**
 * The ink flood between worlds (§7.6, z 60). Two layers, both mounted only during a transition:
 *  1. a feathered suminagashi mask (2D canvas at half resolution: noisy blobs in sumi + indigo with a
 *     moon-silver rim) that grows from the click point to full cover, then clears centre-out;
 *  2. the forked LiquidEther (InkFluid) on top, fed 12–16 radial splats so the edge swirls like ink in water.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '@/state/store';
import InkFluid, { type InkFluidHandle } from './InkFluid';
import { registerInk, useInk } from './ink';
import { TIERS } from '@/scene/quality';

const SCALE = 0.5;

function token(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function rgba(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Seamless angular noise (integer harmonics), range ≈ −1..1. */
function makeNoise() {
  const ph = Array.from({ length: 7 }, () => Math.random() * Math.PI * 2);
  const w = Array.from({ length: 7 }, () => 0.4 + Math.random() * 0.9);
  return (a: number, t: number) => {
    let s = 0;
    for (let k = 0; k < 7; k++) s += Math.sin((k + 2) * a + ph[k] + t * w[k]) / (k + 2);
    return s * 1.6;
  };
}

export default function InkFlood() {
  const active = useInk((s) => s.active);
  if (!active) return null;
  return <InkLayers />;
}

function InkLayers() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fluid = useRef<InkFluidHandle>(null);
  const quality = useApp((s) => s.quality);
  const reduced = useApp((s) => s.reducedMotion);
  const lite = useApp((s) => s.lite);
  const colors = useMemo(() => [token('--indigo', '#101B2B'), token('--nebula', '#2C1B4E'), token('--moon', '#D9DDE6')], []);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const sumi = token('--sumi', '#090A0C');
    const indigo = token('--indigo', '#101B2B');
    const moon = token('--moon', '#D9DDE6');
    let W = 0;
    let H = 0;
    const size = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.ceil(W * SCALE);
      cv.height = Math.ceil(H * SCALE);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    };
    size();
    window.addEventListener('resize', size);

    const noise = makeNoise();
    let raf = 0;
    let cancel: (() => void) | null = null;
    let covered = 0; // last drawn coverage 0..1, so a reversed transition starts where the last one stopped

    const blobPath = (x: number, y: number, R: number, t: number, wob = 0.3) => {
      ctx.beginPath();
      const n = 96;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = Math.max(0, R * (0.82 + wob * noise(a, t)));
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    const reach = (x: number, y: number) => Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) * 1.3;

    const animate = (ms: number, draw: (e: number, t: number) => void) =>
      new Promise<void>((resolve) => {
        cancel?.();
        cancelAnimationFrame(raf);
        const t0 = performance.now();
        let done = false;
        cancel = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        const step = (now: number) => {
          if (done) return;
          const k = Math.min(1, (now - t0) / ms);
          draw(k, (now - t0) / 1000);
          if (k < 1) raf = requestAnimationFrame(step);
          else {
            done = true;
            resolve();
          }
        };
        raf = requestAnimationFrame(step);
      });

    registerInk({
      close: (x, y, ms) => {
        const R = reach(x, y);
        const from = covered;
        fluid.current?.burst(x, y, 16, 55, 80);
        let lastSplat = 0;
        return animate(ms, (k, t) => {
          const e = from + (1 - from) * (1 - Math.pow(1 - k, 3));
          covered = e;
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, W, H);
          if (k >= 1) {
            ctx.fillStyle = sumi;
            ctx.fillRect(0, 0, W, H);
            return;
          }
          blobPath(x, y, R * e * 1.14, t * 0.9, 0.34);
          ctx.fillStyle = rgba(indigo, 0.5);
          ctx.fill();
          ctx.strokeStyle = rgba(moon, 0.22);
          ctx.lineWidth = 2;
          ctx.stroke();
          blobPath(x, y, R * e, t * 1.1 + 2, 0.3);
          ctx.fillStyle = rgba(sumi, 0.72);
          ctx.fill();
          blobPath(x, y, R * e * 0.84, t * 1.3 + 4, 0.26);
          ctx.fillStyle = sumi;
          ctx.fill();
          // satellite droplets thrown past the edge
          for (let i = 0; i < 7; i++) {
            const a = i * 0.9 + 0.4;
            const d = R * e * (1.06 + 0.07 * i);
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, (5 + i * 2.2) * (1 - k * 0.5), 0, Math.PI * 2);
            ctx.fillStyle = rgba(i % 2 ? indigo : sumi, 0.85);
            ctx.fill();
          }
          // keep the fluid fed along the advancing edge
          if (t - lastSplat > 0.09) {
            lastSplat = t;
            const a = Math.random() * Math.PI * 2;
            const d = R * e * 0.85;
            fluid.current?.splat(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * 40, Math.sin(a) * 40, 90);
          }
        });
      },
      open: (x, y, ms) => {
        const R = reach(x, y);
        fluid.current?.burst(x, y, 14, 70, 110);
        return animate(ms, (k, t) => {
          const e = 1 - Math.pow(1 - k, 3);
          covered = 1 - e;
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, W, H);
          if (k >= 1) return;
          ctx.fillStyle = sumi;
          ctx.fillRect(0, 0, W, H);
          // indigo bleed just outside the opening hole
          blobPath(x, y, R * e * 1.12, t + 1, 0.3);
          ctx.fillStyle = rgba(indigo, 0.55);
          ctx.fill();
          ctx.globalCompositeOperation = 'destination-out';
          blobPath(x, y, R * e * 1.04, t * 1.2, 0.3);
          ctx.fillStyle = 'rgba(0,0,0,.4)';
          ctx.fill();
          blobPath(x, y, R * e * 0.92, t * 1.4 + 3, 0.28);
          ctx.fillStyle = 'rgba(0,0,0,.65)';
          ctx.fill();
          blobPath(x, y, R * e * 0.8, t * 1.6 + 5, 0.24);
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          blobPath(x, y, R * e * 0.92, t * 1.4 + 3, 0.28);
          ctx.strokeStyle = rgba(moon, 0.18 * (1 - k));
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      },
      fade: (to, ms) => {
        const from = covered;
        return animate(ms, (k) => {
          const a = from + (to - from) * k;
          covered = a;
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, W, H);
          ctx.fillStyle = rgba(sumi, a);
          ctx.fillRect(0, 0, W, H);
        });
      },
    });
    return () => {
      cancel?.();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      registerInk(null);
    };
  }, []);

  const fluidOn = !reduced && !lite;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-flood)' as unknown as number, pointerEvents: 'none' }}>
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {fluidOn && <InkFluid ref={fluid} colors={colors} resolution={TIERS[quality].liquidResolution} intensity={1.3} persistence={0.5} viscosity={0.3} />}
    </div>
  );
}
