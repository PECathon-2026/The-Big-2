/** Spirit Lens shared pieces: stages timeline, kintsugi loader, detections overlay, honesty (heat map + kintsugi seams). */
import { useEffect, useRef, useState } from 'react';
import { LENS_STAGES, type Detection, type LensStage } from '@/data/api';
import { useApp } from '@/state/store';

export const STAGE_JP: Record<string, string> = {
  load: '読',
  background: '空',
  detect: '見',
  psf: '点',
  denoise: '静',
  deblur: '研',
  honesty: '誠',
  classify: '類',
  wcs: '図',
};

export function Stages({ stages }: { stages: LensStage[] }) {
  return (
    <ol className="ln-stages" aria-label="Pipeline stages">
      {LENS_STAGES.map((name) => {
        const st = stages.find((s) => s.name === name);
        const status = st?.status ?? 'pending';
        const dur = st?.started_at && st.ended_at ? ((new Date(st.ended_at).getTime() - new Date(st.started_at).getTime()) / 1000).toFixed(1) : null;
        return (
          <li key={name} className={`ln-stage ${status}`} title={st?.detail ?? ''}>
            <span className="ln-stage-k" lang="ja" aria-hidden="true">
              {STAGE_JP[name]}
            </span>
            <span className="ln-stage-n">{name}</span>
            <span className="ln-stage-s num">
              {status}
              {dur && ` · ${dur}s`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The demo's kintsugi loader: gold cracks grow across lacquer while the pipeline runs. */
export function Kintsugi({ running, label }: { running: boolean; label: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const calm = useApp((s) => s.reducedMotion || s.field);
  useEffect(() => {
    const c = cv.current;
    if (!c || !running) return;
    const r = c.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1);
    c.width = r.width * d;
    c.height = r.height * d;
    const g = c.getContext('2d')!;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#C99A3A';
    type Crack = { x: number; y: number; a: number; life: number; w: number };
    const cracks: Crack[] = [];
    const spawn = (x: number, y: number, a: number, life: number, w: number) => cracks.push({ x, y, a, life, w });
    spawn(-2, r.height * (0.3 + Math.random() * 0.4), 0.1, 160, 2.2);
    spawn(r.width + 2, r.height * (0.2 + Math.random() * 0.5), Math.PI - 0.1, 150, 2);
    g.lineCap = 'round';
    g.strokeStyle = gold;
    g.shadowColor = 'rgba(255,215,120,0.9)';
    g.shadowBlur = 7;
    let raf = 0;
    const tick = () => {
      for (const k of cracks) {
        if (k.life <= 0) continue;
        for (let i = 0; i < 2; i++) {
          const nx = k.x + Math.cos(k.a) * 4;
          const ny = k.y + Math.sin(k.a) * 4;
          g.globalAlpha = 0.75 + Math.random() * 0.25;
          g.lineWidth = k.w;
          g.beginPath();
          g.moveTo(k.x, k.y);
          g.lineTo(nx, ny);
          g.stroke();
          k.x = nx;
          k.y = ny;
          k.a += (Math.random() - 0.5) * 0.9;
          k.life--;
          k.w = Math.max(0.5, k.w * 0.993);
          if (Math.random() < 0.05 && cracks.length < 16) spawn(k.x, k.y, k.a + (Math.random() - 0.5) * 1.6, k.life * 0.5, k.w * 0.6);
          if (k.x < -10 || k.x > r.width + 10 || k.y < -10 || k.y > r.height + 10) k.life = 0;
        }
      }
      if (cracks.some((k) => k.life > 0)) raf = requestAnimationFrame(tick);
    };
    if (!calm) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, calm]);
  return (
    <div className="ln-kintsugi" role="status" aria-live="polite">
      <canvas ref={cv} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Detections drawn as true-shape ellipses (a, b, θ in image pixels) in % of the frame. */
export function Detections({ list, width, height, sel, onSel, max = 80, labels = 8 }: { list: Detection[]; width: number; height: number; sel: number | null; onSel: (id: number) => void; max?: number; labels?: number }) {
  const top = [...list].sort((a, b) => b.flux - a.flux).slice(0, max);
  return (
    <>
      {top.map((d, i) => {
        const k = 3; // ellipse drawn at 3× the second-moment semi-axes so it encloses the source
        const w = ((2 * k * d.a) / width) * 100;
        const h = ((2 * k * d.b) / height) * 100;
        const x = (d.x / width) * 100;
        const y = (d.y / height) * 100;
        const flip = x > 72;
        const name = d.name ?? `${d.kind}${d.mag_instrumental != null ? ` · m ${d.mag_instrumental.toFixed(1)}` : ''}`;
        return (
          <span key={d.id}>
            <button
              className={`ks-det ${d.kind} ${sel === d.id ? 'sel' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, width: `max(8px, ${w}%)`, height: `max(8px, ${h}%)`, ['--th' as string]: `${d.theta_deg}deg` }}
              aria-label={`Detection ${d.id}: ${name}`}
              onClick={() => onSel(d.id)}
            />
            {(i < labels || sel === d.id) && (
              <span className={`ks-det-label ${flip ? 'flip' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
                {name}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * Honesty view: the residual (red = restored brighter than the data allows, blue = dimmer; unit 3σ,
 * sqrt-compressed by the backend) re-mapped to a sumi → crimson → gold heat map, plus kintsugi seams:
 * gold contours where |residual| exceeds ~2σ.
 */
export function HonestyCanvas({ src, onStats }: { src: string; onStats?: (s: { seamPx: number; hotFrac: number }) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let alive = true;
    img.onload = () => {
      if (!alive || !cv.current) return;
      const W = Math.min(900, img.naturalWidth);
      const H = Math.round((img.naturalHeight / img.naturalWidth) * W);
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const o = off.getContext('2d', { willReadFrequently: true })!;
      o.drawImage(img, 0, 0, W, H);
      let px: ImageData;
      try {
        px = o.getImageData(0, 0, W, H);
      } catch (e) {
        setErr('The residual image could not be read (CORS).');
        return;
      }
      const css = getComputedStyle(document.documentElement);
      const hex = (v: string, f: string) => {
        const s = (css.getPropertyValue(v).trim() || f).replace('#', '');
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
      };
      const c0 = hex('--sumi', '#090A0C');
      const c1 = hex('--crimson-bright', '#D81E28');
      const c2 = hex('--gold-bright', '#E8C66A');
      const mag = new Float32Array(W * H);
      const heat = o.createImageData(W, H);
      let hot = 0;
      for (let i = 0; i < W * H; i++) {
        const m = Math.max(px.data[i * 4], px.data[i * 4 + 2]) / 255;
        mag[i] = m;
        const a = m < 0.5 ? c0 : c1;
        const b = m < 0.5 ? c1 : c2;
        const t = m < 0.5 ? m * 2 : (m - 0.5) * 2;
        heat.data[i * 4] = a[0] + (b[0] - a[0]) * t;
        heat.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * t;
        heat.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * t;
        heat.data[i * 4 + 3] = 255;
        if (m > 0.82) hot++;
      }
      // seams: boundary pixels of the |r| > ~2σ mask (0.82 ≈ sqrt(2/3) after the backend's sqrt compression)
      const seam = o.createImageData(W, H);
      let seamPx = 0;
      const T = 0.82;
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (mag[i] <= T) continue;
          if (mag[i - 1] <= T || mag[i + 1] <= T || mag[i - W] <= T || mag[i + W] <= T) {
            seam.data[i * 4] = c2[0];
            seam.data[i * 4 + 1] = c2[1];
            seam.data[i * 4 + 2] = c2[2];
            seam.data[i * 4 + 3] = 255;
            seamPx++;
          }
        }
      const c = cv.current;
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      o.putImageData(heat, 0, 0);
      g.globalAlpha = 0.9;
      g.drawImage(off, 0, 0);
      o.clearRect(0, 0, W, H);
      o.putImageData(seam, 0, 0);
      g.globalAlpha = 1;
      g.filter = 'blur(3px)';
      g.drawImage(off, 0, 0);
      g.filter = 'none';
      g.drawImage(off, 0, 0);
      onStats?.({ seamPx, hotFrac: hot / (W * H) });
    };
    img.onerror = () => alive && setErr('The residual image did not load.');
    img.src = src;
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return (
    <>
      <canvas ref={cv} aria-label="Residual heat map with kintsugi seams where the change exceeds about 2 sigma" role="img" />
      {err && <span className="ln-err">{err}</span>}
    </>
  );
}
