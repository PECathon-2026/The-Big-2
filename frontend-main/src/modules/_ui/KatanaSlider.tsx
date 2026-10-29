/**
 * The Katana slider (§9.4). Two aligned layers in a frame: the left/original layer, and the right layer
 * (restored, or the honesty view) clipped with inset(0 0 0 --cut). The divider is a drawn katana:
 * kissaki above the frame, steel blade with mune and a milky notare hamon, gold habaki, iron tsuba with a
 * gold rim, and a tsuka (ito diamond wrap over samegawa, gold menuki, kashira) below the frame as the grab
 * handle. Drag with pointer capture, click to move (250 ms, ease-katana), ARIA slider keys, a "slash" on
 * release, an "unsheathe" on first view. Wheel zooms, drag pans when zoomed (or with Space held); one
 * transform drives both layers so they stay aligned.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cue } from '@/audio/engine';
import { useApp } from '@/state/store';
import './katana.css';

export interface KatanaSliderProps {
  /** natural image size (sets the frame aspect ratio and detection coordinates) */
  width: number;
  height: number;
  left: ReactNode;
  right: ReactNode;
  /** drawn above the right layer only, inside the same transform + clip (detections) */
  rightOverlay?: ReactNode;
  leftLabel?: ReactNode;
  rightLabel?: ReactNode;
  /** 'left' hides the right layer entirely (cut at 100%) */
  only?: 'left' | null;
  initial?: number;
  /** extra element in the frame (not transformed), e.g. a MOCK chip */
  badge?: ReactNode;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// cubic-bezier(.16,1,.3,1) ≈ expo-out
const easeKatana = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export default function KatanaSlider({ width, height, left, right, rightOverlay, leftLabel = '原 Original', rightLabel = '修 Restored', only = null, initial = 50, badge }: KatanaSliderProps) {
  const calm = useApp((s) => s.reducedMotion || s.field);
  const [cut, setCut] = useState(calm ? initial : 20);
  const [sheathed, setSheathed] = useState(!calm);
  const [slash, setSlash] = useState(0);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const tween = useRef(0);
  const space = useRef(false);
  const gesture = useRef<{ kind: 'cut' | 'pan' | 'maybe'; id: number; x0: number; y0: number; vx: number; vy: number; moved: boolean } | null>(null);
  const hamonId = useId().replace(/:/g, '');

  const animateCut = useCallback(
    (to: number, ms = 250) => {
      cancelAnimationFrame(tween.current);
      if (calm || ms <= 0) return setCut(to);
      const from = cutRef.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        setCut(from + (to - from) * easeKatana(k));
        if (k < 1) tween.current = requestAnimationFrame(step);
      };
      tween.current = requestAnimationFrame(step);
    },
    [calm],
  );
  const cutRef = useRef(cut);
  cutRef.current = cut;

  // First view: the blade slides up out of the tsuba, then sweeps 20% → 50%.
  useEffect(() => {
    if (calm || !sheathed) return;
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        window.setTimeout(() => setSheathed(false), 120);
        window.setTimeout(() => animateCut(initial, 700), 760);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [calm, sheathed, animateCut, initial]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.closest?.('.ks')) e.preventDefault();
      if (e.code === 'Space') space.current = true;
    };
    const ku = (e: KeyboardEvent) => e.code === 'Space' && (space.current = false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      cancelAnimationFrame(tween.current);
    };
  }, []);

  const pctAt = (clientX: number) => {
    const r = frame.current!.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * 100, 0, 100);
  };

  const doSlash = () => {
    setSlash((n) => n + 1);
    cue('shing');
  };

  const onKatanaDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    cancelAnimationFrame(tween.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind: 'cut', id: e.pointerId, x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y, moved: false };
    setDragging(true);
  };
  const onKatanaMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.kind !== 'cut' || g.id !== e.pointerId) return;
    g.moved = true;
    setCut(pctAt(e.clientX));
  };
  const onKatanaUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (g.moved) doSlash();
  };

  const onFrameDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.ks-det, button, a')) return;
    const pan = view.z > 1.001 || space.current;
    gesture.current = { kind: pan ? 'pan' : 'maybe', id: e.pointerId, x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onFrameMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (g.kind === 'pan' && g.moved) {
      const r = frame.current!.getBoundingClientRect();
      setView((v) => clampView({ z: v.z, x: g.vx + dx / r.width, y: g.vy + dy / r.height }));
    }
  };
  const onFrameUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.moved && only !== 'left') {
      animateCut(pctAt(e.clientX), 250);
      window.setTimeout(doSlash, 260);
    }
  };

  // wheel zoom about the cursor (non-passive so the page does not scroll)
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      setView((v) => {
        const z = clamp(v.z * Math.exp(-e.deltaY * 0.0015), 1, 8);
        // keep the image point under the cursor fixed: p = (q - t) / z
        const qx = (px - v.x) / v.z;
        const qy = (py - v.y) / v.z;
        return clampView({ z, x: px - qx * z, y: py - qy * z });
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    let to: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = cut - step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = cut + step;
    if (e.key === 'Home') to = 0;
    if (e.key === 'End') to = 100;
    if (e.key === 'PageUp') to = cut + 10;
    if (e.key === 'PageDown') to = cut - 10;
    if (to == null) return;
    e.preventDefault();
    setCut(clamp(to, 0, 100));
  };

  const shownCut = only === 'left' ? 100 : cut;
  const transform = `translate(${(view.x * 100).toFixed(3)}%, ${(view.y * 100).toFixed(3)}%) scale(${view.z.toFixed(4)})`;

  return (
    <div className={`ks ${sheathed ? 'sheathed' : ''} ${dragging ? 'dragging' : ''}`} ref={root} style={{ ['--cut' as string]: `${shownCut}%` }} data-cursor="off">
      <div
        className={`ks-frame ${view.z > 1.001 ? 'zoomed' : ''}`}
        ref={frame}
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={onFrameDown}
        onPointerMove={onFrameMove}
        onPointerUp={onFrameUp}
        onPointerCancel={() => (gesture.current = null)}
        onDoubleClick={() => setView({ z: 1, x: 0, y: 0 })}
        data-lenis-prevent
      >
        <div className="ks-stage" style={{ transform }}>
          {left}
        </div>
        <div className="ks-right" aria-hidden={only === 'left'}>
          <div className="ks-stage" style={{ transform }}>
            {right}
            {rightOverlay && <div className="ks-overlay">{rightOverlay}</div>}
          </div>
        </div>
        {slash > 0 && <span key={slash} className="ks-slashline" aria-hidden="true" />}
        <span className="ks-label l">{leftLabel}</span>
        {only !== 'left' && <span className="ks-label r">{rightLabel}</span>}
        {view.z > 1.001 && (
          <button className="ks-reset tw-tag" onClick={() => setView({ z: 1, x: 0, y: 0 })}>
            ×{view.z.toFixed(1)} · reset
          </button>
        )}
        {badge && <span className="ks-badge">{badge}</span>}
      </div>

      {only !== 'left' && (
        <div className="ks-rail" aria-hidden="false">
          <div
            className="ks-katana"
            role="slider"
            tabIndex={0}
            aria-label="Before and after: drag the katana"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(cut)}
            aria-valuetext={`${Math.round(cut)}% original, ${100 - Math.round(cut)}% restored`}
            onKeyDown={onKey}
            onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key) && doSlash()}
            onPointerDown={onKatanaDown}
            onPointerMove={onKatanaMove}
            onPointerUp={onKatanaUp}
            onPointerCancel={onKatanaUp}
          >
            <div className="ks-blade-wrap">
              <svg className="ks-kissaki" viewBox="0 0 10 16" aria-hidden="true">
                <path d="M1 16 L1 7 Q1.5 2 7.5 0 Q9 6 9 16 Z" className="ks-steel-fill" />
                <path d="M7.5 0 Q9 6 9 16" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth=".8" />
              </svg>
              <div className="ks-blade">
                <svg className="ks-hamon" aria-hidden="true" preserveAspectRatio="none">
                  <defs>
                    <filter id={`hamon-${hamonId}`}>
                      <feTurbulence type="fractalNoise" baseFrequency="0.08 0.6" numOctaves="2" seed="11" result="n" />
                      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
                      <feGaussianBlur stdDeviation=".35" />
                    </filter>
                    <pattern id={`notare-${hamonId}`} width="6" height="22" patternUnits="userSpaceOnUse">
                      <path d="M3 0 Q5.6 5.5 3 11 Q0.4 16.5 3 22 L6 22 L6 0 Z" fill="rgba(255,255,255,.9)" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#notare-${hamonId})`} filter={`url(#hamon-${hamonId})`} />
                </svg>
                <span className="ks-glint" />
                <span key={`f${slash}`} className={`ks-flash ${slash ? 'on' : ''}`} />
              </div>
              <span className="ks-habaki" />
            </div>
            <svg className="ks-hilt" viewBox="0 0 48 104" aria-hidden="true">
              <defs>
                <pattern id={`ito-${hamonId}`} width="10" height="10" patternUnits="userSpaceOnUse">
                  <rect width="10" height="10" fill="var(--washi)" />
                  <path d="M0 0 L5 5 L0 10 Z M10 0 L5 5 L10 10 Z" fill="var(--ink)" />
                </pattern>
                <radialGradient id={`tsuba-${hamonId}`} cx=".4" cy=".35" r=".8">
                  <stop offset="0" stopColor="#3A3A40" />
                  <stop offset="1" stopColor="#101012" />
                </radialGradient>
              </defs>
              {/* tsuba: dark iron oval, gold rim */}
              <ellipse cx="24" cy="6" rx="22" ry="5.4" fill={`url(#tsuba-${hamonId})`} stroke="var(--gold)" strokeWidth="1.3" />
              <rect x="20.5" y="3.6" width="7" height="4.6" rx="1" fill="#0A0A0C" />
              {/* seppa */}
              <rect x="17" y="11" width="14" height="2" rx=".6" fill="var(--gold)" />
              {/* tsuka */}
              <rect x="17.5" y="13" width="13" height="80" rx="3" fill={`url(#ito-${hamonId})`} stroke="#0A0A0C" strokeWidth=".8" />
              {/* menuki */}
              <path d="M21 46 q3 -4 6 0 q-3 4 -6 0 Z" fill="var(--gold)" />
              {/* kashira */}
              <path d="M17 93 h14 v4 q0 5 -7 5 q-7 0 -7 -5 Z" fill="#141416" stroke="var(--gold)" strokeWidth="1" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/** Keep the zoomed image covering the frame. */
function clampView(v: { z: number; x: number; y: number }) {
  const min = 1 - v.z;
  return { z: v.z, x: clamp(v.x, min, 0), y: clamp(v.y, min, 0) };
}
