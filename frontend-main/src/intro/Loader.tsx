/**
 * The loader (§7.2): shown only when something is still loading after the gate.
 * ~3,000 points form tonight's Moon at its real phase (sampled with isLit), then a torii, and scatter
 * when loading finishes. One DecryptedText line narrates the real step with real counts. Progress is
 * weighted by real cost. Hard timeout 10 s: continue anyway, the scene streams in.
 */
import { useEffect, useRef, useState } from 'react';
import DecryptedText from '@/vendor/reactbits/DecryptedText';
import { useApp } from '@/state/store';
import { moonState } from '@/astro/skytime';
import { isLit } from '@/astro/moonNames';
import { rng } from '@/scene/noise';
import { token } from '@/scene/intro/introBus';
import { allDone, progress, usePreload, type StepId } from './preload';
import { startIntro } from './flow';

const SCRAMBLE = 'つきよみのみはりほしさくらやまかぜ月読見張星桜山風夜空闇光雲刻鳥戌亥子';
const HARD_TIMEOUT = 10_000;
const LINE_MS = 650;

const ORDER: (StepId | 'api')[] = ['catalog', 'moon', 'sky', 'api'];
const API: StepId[] = ['api.moon', 'api.sun', 'api.score', 'api.events'];

export default function Loader() {
  const steps = usePreload((s) => s.steps);
  const [leaving, setLeaving] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scatter = useRef(0);

  const pct = Math.round(progress(steps) * 100);
  const ready = allDone(steps) || timedOut;
  // Lines play in order; each finished step shows its real result for at least LINE_MS.
  const [idx, setIdx] = useState(0);
  const isDone = (id: StepId | 'api') => (id === 'api' ? API.every((a) => steps[a].done) : steps[id].done);
  const cur = ORDER[Math.min(idx, ORDER.length - 1)];
  const lineOf = (id: StepId | 'api') =>
    id === 'api'
      ? `Fetching tonight's forecast · ${API.filter((a) => steps[a].done).length} of ${API.length}${API.some((a) => steps[a].line.includes('offline')) ? ' · offline, using the sky alone' : ''}`
      : steps[id].line;
  const line = idx >= ORDER.length ? 'Opening the gate' : lineOf(cur);
  const curDone = idx < ORDER.length && (isDone(cur) || timedOut);

  useEffect(() => {
    if (idx >= ORDER.length || !curDone) return;
    const t = setTimeout(() => setIdx((i) => i + 1), timedOut ? 120 : LINE_MS);
    return () => clearTimeout(t);
  }, [idx, curDone, timedOut]);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), HARD_TIMEOUT);
    return () => clearTimeout(t);
  }, []);

  const go = ready && idx >= ORDER.length;
  useEffect(() => {
    if (!go) return;
    setLeaving(true);
    scatter.current = performance.now();
    const t = setTimeout(() => startIntro(), 900);
    return () => clearTimeout(t);
  }, [go]);

  // Particles: tonight's lit Moon → torii → scatter. 2D canvas, ~3k points, only while the loader shows.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduced = useApp.getState().reducedMotion;
    const place = useApp.getState().place ?? { lat: 30.76, lon: 76.79 };
    const age = moonState(new Date(), place).ageDays;
    const N = useApp.getState().lite ? 1200 : 3000;
    const rand = rng(77);
    const moon = new Float32Array(N * 2);
    const torii = new Float32Array(N * 2);
    const seed = new Float32Array(N);
    // Moon: rejection-sample the real lit region (same geometry as drawMoon). New moon → a faint full disc rim.
    let k = 0;
    let guard = 0;
    while (k < N && guard++ < N * 60) {
      const x = rand() * 2 - 1;
      const y = rand() * 2 - 1;
      if (x * x + y * y > 1) continue;
      if (!isLit(x, y, age) && !(guard > N * 40 && x * x + y * y > 0.92)) continue;
      moon[k * 2] = x;
      moon[k * 2 + 1] = y;
      k++;
    }
    for (; k < N; k++) {
      const a = rand() * Math.PI * 2;
      moon[k * 2] = Math.cos(a);
      moon[k * 2 + 1] = Math.sin(a);
    }
    // Torii silhouette in a unit box (x −1..1, y −1..1, y down): kasagi, nuki, two pillars, gakuzuka.
    const rects: [number, number, number, number][] = [
      [-1, -0.86, 1, -0.7], // kasagi (top beam)
      [-0.8, -0.62, 0.8, -0.52], // shimaki
      [-0.74, -0.3, 0.74, -0.2], // nuki
      [-0.6, -0.62, -0.46, 1], // left pillar
      [0.46, -0.62, 0.6, 1], // right pillar
      [-0.06, -0.52, 0.06, -0.3], // gakuzuka
    ];
    const areas = rects.map(([a, b, c, d]) => (c - a) * (d - b));
    const total = areas.reduce((x, y) => x + y, 0);
    for (let i = 0; i < N; i++) {
      let r = rand() * total;
      let j = 0;
      while (r > areas[j] && j < rects.length - 1) r -= areas[j++];
      const [a, b, c, d] = rects[j];
      let x = a + (c - a) * rand();
      const y = b + (d - b) * rand();
      if (j === 0) x *= 1 + 0.08 * Math.pow(Math.abs(x), 2); // upturned kasagi ends
      torii[i * 2] = x;
      torii[i * 2 + 1] = j === 0 ? y - 0.1 * x * x : y;
      seed[i] = rand();
    }
    const moonCol = token('--moon-warm', '#F3EAD6');
    const toriiCol = token('--crimson-bright', '#D81E28');
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const t = (now - t0) / 1000;
      const S = Math.min(W, H) * 0.17;
      const cx = W / 2;
      const cy = H * 0.42;
      // 0–1.6 s gather into the Moon, 2.4–3.6 s morph to the torii, scatter on leave
      const gather = reduced ? 1 : Math.min(1, t / 1.6);
      const morph = reduced ? 0 : Math.max(0, Math.min(1, (t - 2.4) / 1.2));
      const sc = scatter.current ? Math.min(1, (now - scatter.current) / 850) : 0;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const sd = seed[i];
        const lag = Math.max(0, Math.min(1, morph * 1.4 - sd * 0.4));
        const e = lag * lag * (3 - 2 * lag);
        let x = moon[i * 2] + (torii[i * 2] * 1.05 - moon[i * 2]) * e;
        let y = moon[i * 2 + 1] + (torii[i * 2 + 1] * 1.05 - moon[i * 2 + 1]) * e;
        const g = Math.max(0, Math.min(1, gather * 1.3 - sd * 0.3));
        const ge = 1 - Math.pow(1 - g, 3);
        const ang = sd * 40;
        const far = 3.2 + sd * 2;
        x = Math.cos(ang) * far + (x - Math.cos(ang) * far) * ge;
        y = Math.sin(ang) * far + (y - Math.sin(ang) * far) * ge;
        if (sc) {
          const s2 = sc * sc;
          x += Math.cos(ang) * s2 * (2 + sd * 3);
          y += Math.sin(ang) * s2 * (2 + sd * 3) - s2 * 1.5;
        }
        const tw = reduced ? 1 : 0.75 + 0.25 * Math.sin(t * 2 + sd * 30);
        const a = (0.25 + 0.55 * sd) * ge * tw * (1 - sc);
        if (a < 0.01) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = e > 0.5 ? toriiCol : moonCol;
        const r = 0.6 + sd * 1.1;
        ctx.fillRect(cx + x * S - r, cy + y * S - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`tw-loader ${leaving ? 'out' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={line}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="tw-loader-ui">
        <span className="tw-loader-line">
          <DecryptedText key={line} text={line} animateOn="view" sequential speed={28} maxIterations={8} characters={SCRAMBLE} encryptedClassName="enc" />
        </span>
        <div className="tw-loader-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <span className="tw-loader-pct num">{pct}%</span>
      </div>
    </div>
  );
}
