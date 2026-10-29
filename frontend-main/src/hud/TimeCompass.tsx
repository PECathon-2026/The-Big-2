/**
 * The wadokei time compass (§8.6) — a half-disc at the bottom centre. The ring carries the 12 koku
 * (equal 2-hour hours centred on 0:00, 2:00 …), the real day / twilight / night arcs for this place,
 * and marks from computation and the API: sunset/sunrise, astronomical dusk/dawn, moonrise/set, the
 * best window from /api/watchtower/score (gold arc) and visible ISS passes. The crimson notch at the
 * top is "now in the sky". Dragging the ring (360° = 24 h, inertia on flick), ←/→ (±15 min, Shift ±1 h)
 * or the Now button change ONLY `offsetMs` — the sky follows by itself. Range ±72 h.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Body } from 'astronomy-engine';
import { app, OFFSET_LIMIT_MS, useApp } from '@/state/store';
import { DEFAULT_PLACE } from '@/data/location';
import { useTonight } from '@/data/tonight';
import { fmtClock, KOKU, kokuAt, localHours, moonState, nextRiseSet, twilight } from '@/astro/skytime';
import { cue } from '@/audio/engine';

const H = 3600_000;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** point at local hour h on radius r (0 h at the top, clockwise) */
const pt = (h: number, r: number): [number, number] => [r * Math.sin(rad(h * 15)), -r * Math.cos(rad(h * 15))];
const f1 = (n: number) => n.toFixed(1);

/** Annular sector between hours h0 → h1 (clockwise), radii r0 < r1. */
function sector(h0: number, h1: number, r0: number, r1: number) {
  let span = (((h1 - h0) % 24) + 24) % 24;
  if (span === 0) span = 24;
  const large = span > 12 ? 1 : 0;
  const e = h0 + Math.min(span, 23.999);
  const [ax, ay] = pt(h0, r1);
  const [bx, by] = pt(e, r1);
  const [cx, cy] = pt(e, r0);
  const [dx, dy] = pt(h0, r0);
  return `M${f1(ax)} ${f1(ay)}A${r1} ${r1} 0 ${large} 1 ${f1(bx)} ${f1(by)}L${f1(cx)} ${f1(cy)}A${r0} ${r0} 0 ${large} 0 ${f1(dx)} ${f1(dy)}Z`;
}
function arc(h0: number, h1: number, r: number) {
  let span = (((h1 - h0) % 24) + 24) % 24;
  if (span === 0) span = 0.01;
  const [ax, ay] = pt(h0, r);
  const [bx, by] = pt(h0 + span, r);
  return `M${f1(ax)} ${f1(ay)}A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${f1(bx)} ${f1(by)}`;
}

/** Phase-correct Moon glyph (lit limb + terminator ellipse). */
function moonPath(r: number, ageDays: number) {
  const phi = (2 * Math.PI * ageDays) / 29.530588853;
  const waxing = ageDays < 29.530588853 / 2;
  const a = Math.abs(Math.cos(phi)) * r;
  const crescent = Math.cos(phi) > 0;
  const outer = waxing ? 1 : 0;
  const term = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  return `M0 ${-r}A${r} ${r} 0 0 ${outer} 0 ${r}A${f1(a)} ${r} 0 0 ${term} 0 ${-r}Z`;
}

/** min(40vh, 340px) in the sky; compact at the dome so the dome and its "Enter your sky" CTA stay clear. */
function useRadius(compact: boolean) {
  const get = () => Math.round(compact ? Math.min(window.innerHeight * 0.15, 150) : Math.min(window.innerHeight * 0.4, 340, window.innerWidth * 0.46));
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => setR(get());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [compact]); // eslint-disable-line react-hooks/exhaustive-deps
  return r;
}

interface Mark {
  h: number;
  kind: 'sunset' | 'sunrise' | 'dusk' | 'dawn' | 'moonrise' | 'moonset' | 'iss';
  label: string;
}

/**
 * `docked` (phase sky): the dial rests small and sunk — radius ≈ min(26vh, 230px), upper ~60 % showing —
 * and eases to full size on hover / focus / drag (CSS transform transition, so it is interruptible).
 */
export default function TimeCompass({ folded, compact = false, docked = false }: { folded: boolean; compact?: boolean; docked?: boolean }) {
  const offset = useApp((s) => s.offsetMs);
  const place = useApp((s) => s.place) ?? DEFAULT_PLACE;
  const tz = useApp((s) => s.tz);
  const reduced = useApp((s) => s.reducedMotion);
  const score = useTonight((s) => s.score.data);
  const passes = useTonight((s) => s.passes.data);
  const R = useRadius(compact);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false); // unfolded on a module page
  const [engaged, setEngaged] = useState(false); // dragging or coasting: stay full size
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);

  const sky = new Date(now + offset);
  const hSky = localHours(sky, tz);
  const live = Math.abs(offset) < 30_000;
  const koku = kokuAt(sky, tz);
  const kokuIdx = KOKU.indexOf(koku);
  const sameDay = fmtClock(sky, tz, true).slice(0, 10) === fmtClock(new Date(now), tz, true).slice(0, 10);

  // koku boundary ticks
  const lastKoku = useRef(kokuIdx);
  useEffect(() => {
    if (lastKoku.current !== kokuIdx) cue('tick');
    lastKoku.current = kokuIdx;
  }, [kokuIdx]);

  // Marks for the night around sky time: recomputed per sky-hour bucket, never while dragging within it.
  const bucket = Math.floor((now + offset) / H);
  const night = useMemo(() => {
    const at = new Date(bucket * H);
    const tw = twilight(place, at);
    const from = new Date(at.getTime() - 12 * H);
    const mr = nextRiseSet(Body.Moon, place, from, 1, 1.2);
    const ms = nextRiseSet(Body.Moon, place, from, -1, 1.2);
    const lh = (d: Date | null) => (d ? localHours(d, tz) : null);
    const marks: Mark[] = [];
    const add = (d: Date | null, kind: Mark['kind'], label: string) => {
      const h = lh(d);
      if (h != null && d) marks.push({ h, kind, label: `${label} ${fmtClock(d, tz)}` });
    };
    add(tw.sunset, 'sunset', 'Sunset');
    add(tw.sunrise, 'sunrise', 'Sunrise');
    add(tw.astroDusk, 'dusk', 'Astronomical dusk');
    add(tw.astroDawn, 'dawn', 'Astronomical dawn');
    add(mr, 'moonrise', 'Moonrise');
    add(ms, 'moonset', 'Moonset');
    const moon = moonState(at, place);
    return {
      sunrise: lh(tw.sunrise),
      sunset: lh(tw.sunset),
      civilDusk: lh(tw.civilDusk),
      astroDusk: lh(tw.astroDusk),
      astroDawn: lh(tw.astroDawn),
      marks,
      moonAge: moon.ageDays,
    };
  }, [bucket, place, tz]);

  const best = useMemo(() => {
    const bw = score?.best_window;
    if (!bw) return null;
    const s = Date.parse(bw.start);
    const e = Date.parse(bw.end);
    if (Math.abs((s + e) / 2 - (now + offset)) > 18 * H) return null;
    return { h0: localHours(new Date(s), tz), h1: localHours(new Date(e), tz), label: `Best window ${bw.start_local}–${bw.end_local} · ${Math.round(bw.mean_score)}` };
  }, [score, bucket, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  const iss = useMemo(
    () =>
      (passes ?? [])
        .filter((p) => p.visible && Math.abs(Date.parse(p.start) - bucket * H) < 12 * H)
        .map((p) => ({ h: localHours(new Date(p.start), tz), label: `${p.satellite} ${p.start_local} · ${Math.round(p.max_alt)}°` })),
    [passes, bucket, tz],
  );

  // ---------------------------------------------------------------- interaction
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ a: number; t: number; v: number; id: number } | null>(null);
  const inertia = useRef(0);
  const tween = useRef(0);
  const stopMotion = () => {
    cancelAnimationFrame(inertia.current);
    cancelAnimationFrame(tween.current);
  };
  const setOff = (ms: number) => app().setOffset(Math.round(ms));
  const angleOf = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.bottom - PAD_B;
    return { a: (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI, d: Math.hypot(e.clientX - cx, e.clientY - cy) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (app().timeFrozen) return;
    stopMotion();
    const { a } = angleOf(e);
    drag.current = { a, t: performance.now(), v: 0, id: e.pointerId };
    setEngaged(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const { a, d: dist } = angleOf(e);
    let da = a - d.a;
    while (da > 180) da -= 360;
    while (da < -180) da += 360;
    const t = performance.now();
    d.a = a;
    if (dist < R * 0.18) return; // the angle is unstable near the hub
    const dh = -da / 15; // clockwise drag turns the ring back in time
    const dt = Math.max(1, t - d.t);
    d.v = d.v * 0.6 + ((dh * H) / dt) * 0.4; // ms of sky time per ms
    d.t = t;
    setOff(app().offsetMs + dh * H);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (reduced || performance.now() - d.t > 80 || Math.abs(d.v) < 20) return setEngaged(false);
    let v = d.v;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      v *= Math.exp(-dt / 420);
      const cur = app().offsetMs;
      const next = cur + v * dt;
      setOff(next);
      if (Math.abs(v) > 4 && Math.abs(next) < OFFSET_LIMIT_MS) inertia.current = requestAnimationFrame(step);
      else setEngaged(false);
    };
    inertia.current = requestAnimationFrame(step);
  };
  const toNow = () => {
    stopMotion();
    const from = app().offsetMs;
    if (reduced || Math.abs(from) < 1000) return setOff(0);
    const t0 = performance.now();
    const dur = Math.min(1100, 450 + Math.abs(from) / H * 18);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      setOff(from * (1 - e));
      if (k < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? H : 15 * 60_000;
    let d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
    else if (e.key === 'PageUp') d = 6 * H;
    else if (e.key === 'PageDown') d = -6 * H;
    else if (e.key === 'Home' || e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      return toNow();
    } else return;
    e.preventDefault();
    stopMotion();
    setOff(app().offsetMs + d);
  };
  useEffect(() => stopMotion, []);

  // ---------------------------------------------------------------- render
  const PAD = 26;
  const PAD_B = 0;
  const r1 = R; // outer rim
  const r0 = R * 0.79; // inner edge of the koku band
  const rm = R * 0.72; // marks ring
  const offTxt = (() => {
    const m = Math.round(offset / 60_000);
    const sign = m < 0 ? '−' : '+';
    const a = Math.abs(m);
    return `${sign}${Math.floor(a / 60)} h ${String(a % 60).padStart(2, '0')} m`;
  })();
  const clock = fmtClock(sky, tz);
  const dateTxt = sameDay ? null : fmtClock(sky, tz, true).replace(/,?\s*\d{2}:\d{2}$/, '');
  const valueText = `${clock}${dateTxt ? `, ${dateTxt}` : ''}, ${koku.kanji} no koku (${koku.animal} hour)${live ? ', live' : `, ${offTxt} from now`}`;

  if (folded && !open) {
    return (
      <button className="compass-chip hud-bar" onClick={() => setOpen(true)} aria-label={`Sky time ${valueText}. Open the time compass`}>
        {live ? <span className="beacon" aria-hidden="true" /> : null}
        <span className="clock">{clock}</span>
        <span className="koku" lang="ja">
          {koku.kanji}の刻
        </span>
        {!live && <span className="num">{offTxt}</span>}
      </button>
    );
  }

  const W = 2 * (R + PAD);
  // resting size in the sky: radius min(26vh, 230px), sunk so ~60 % of the half-disc shows
  const restR = Math.min(window.innerHeight * 0.26, 230);
  const restK = Math.min(1, restR / R);
  const restSink = restR * 0.4;
  const Hh = R + PAD;
  const dayH0 = night.sunrise ?? 6;
  const dayH1 = night.sunset ?? 18;
  const duskEnd = night.astroDusk ?? (dayH1 + 1.3) % 24;
  const dawnStart = night.astroDawn ?? (dayH0 + 22.7) % 24;
  const noon = dayH0 + ((((dayH1 - dayH0) % 24) + 24) % 24) / 2;
  const midnight = duskEnd + ((((dawnStart - duskEnd) % 24) + 24) % 24) / 2;
  const glyph = (h: number, r: number) => pt(h, r);

  return (
    <div className={`compass compass-enter ${compact ? 'compact' : ''}`} style={{ width: W, height: Hh, transition: 'width 600ms var(--ease-katana), height 600ms var(--ease-katana)' }}>
      <div className={`compass-body ${docked ? 'docked' : ''} ${engaged ? 'engaged' : ''}`} style={{ ['--rest-k' as string]: restK.toFixed(3), ['--rest-sink' as string]: `${restSink.toFixed(0)}px` }}>
      {folded && (
        <button className="tw-icon-btn" style={{ position: 'absolute', right: PAD, top: -6, zIndex: 2 }} onClick={() => setOpen(false)} aria-label="Fold the time compass">
          ▾
        </button>
      )}
      <svg ref={svg} width={W} height={Hh} viewBox={`${-R - PAD} ${-R - PAD} ${W} ${Hh}`} aria-hidden="false">
        <defs>
          <radialGradient id="tc-glass" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--card-black)" stopOpacity=".72" />
            <stop offset=".7" stopColor="var(--card-black)" stopOpacity=".8" />
            <stop offset="1" stopColor="var(--card-black)" stopOpacity=".88" />
          </radialGradient>
          <clipPath id="tc-top">
            <rect x={-R - PAD} y={-R - PAD} width={W} height={Hh} />
          </clipPath>
        </defs>
        <g
          className="dial"
          role="slider"
          tabIndex={0}
          aria-label="Time compass: turn to change the sky time"
          aria-valuemin={-72}
          aria-valuemax={72}
          aria-valuenow={Math.round((offset / H) * 4) / 4}
          aria-valuetext={valueText}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          clipPath="url(#tc-top)"
        >
          <circle r={r1} fill="url(#tc-glass)" />
          <g transform={`rotate(${f1(-hSky * 15)})`}>
            {/* day / twilight / night arcs (real times for this place) */}
            <path d={sector(dayH0, dayH1, r0, r1)} fill="var(--washi)" fillOpacity=".13" />
            <path d={sector(dayH1, duskEnd, r0, r1)} fill="var(--akane)" fillOpacity=".34" />
            <path d={sector(duskEnd, dawnStart, r0, r1)} fill="var(--indigo)" fillOpacity=".92" />
            <path d={sector(dawnStart, dayH0, r0, r1)} fill="var(--murasaki)" fillOpacity=".34" />
            {/* koku boundaries (odd hours) and hour ticks */}
            {Array.from({ length: 24 }, (_, h) => {
              const odd = h % 2 === 1;
              const [ax, ay] = pt(h, odd ? r0 : r0 - 4);
              const [bx, by] = pt(h, odd ? r1 : r0);
              return <line key={h} x1={f1(ax)} y1={f1(ay)} x2={f1(bx)} y2={f1(by)} stroke={odd ? 'var(--card-line)' : 'var(--washi-3)'} strokeWidth={1} opacity={odd ? 1 : 0.5} />;
            })}
            {KOKU.map((k, i) => {
              const [x, y] = pt(i * 2, (r0 + r1) / 2);
              const isNow = i === kokuIdx;
              return (
                <text key={k.kanji} x={f1(x)} y={f1(y)} transform={`rotate(${f1(i * 30)} ${f1(x)} ${f1(y)})`} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-jp)" fontWeight={700} fontSize={Math.max(13, R * 0.075)} fill={isNow ? 'var(--gold-bright)' : 'var(--kinu)'} opacity={isNow ? 1 : 0.78}>
                  {k.kanji}
                </text>
              );
            })}
            {R >= 200 && [0, 6, 12, 18].map((h) => {
              const [x, y] = pt(h, r0 - 14);
              return (
                <text key={h} x={f1(x)} y={f1(y)} transform={`rotate(${h * 15} ${f1(x)} ${f1(y)})`} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-ui)" fontSize={11} fill="var(--washi-3)" letterSpacing=".08em">
                  {String(h).padStart(2, '0')}
                </text>
              );
            })}
            {/* best window (Night Honor Score) — gold arc */}
            {best && (
              <g>
                <path d={arc(best.h0, best.h1, r0 - 2)} stroke="var(--gold-bright)" strokeWidth={4} fill="none" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(232,198,106,.6))' }}>
                  <title>{best.label}</title>
                </path>
              </g>
            )}
            {/* sun and moon glyphs */}
            {R >= 200 && (() => {
              const [x, y] = glyph(noon, rm - 16);
              return <circle cx={f1(x)} cy={f1(y)} r={7} fill="var(--crimson-bright)" style={{ filter: 'drop-shadow(0 0 6px var(--crimson-bright))' }} />;
            })()}
            {R >= 200 && (() => {
              const [x, y] = glyph(midnight, rm - 16);
              return (
                <g transform={`translate(${f1(x)} ${f1(y)})`}>
                  <circle r={7} fill="var(--indigo)" stroke="var(--washi-3)" strokeOpacity=".4" strokeWidth={0.8} />
                  <path d={moonPath(7, night.moonAge)} fill="var(--moon-warm)" />
                </g>
              );
            })()}
            {/* event marks */}
            {night.marks.map((m) => {
              const [x, y] = pt(m.h, rm);
              const [x2, y2] = pt(m.h, r0);
              const col = m.kind === 'sunset' || m.kind === 'sunrise' ? 'var(--sun-1)' : m.kind === 'dusk' || m.kind === 'dawn' ? 'var(--fuji)' : 'var(--moon)';
              return (
                <g key={m.kind}>
                  <title>{m.label}</title>
                  <line x1={f1(x)} y1={f1(y)} x2={f1(x2)} y2={f1(y2)} stroke={col} strokeWidth={1.2} />
                  {m.kind === 'moonrise' || m.kind === 'moonset' ? (
                    <path d={moonPath(4, 5)} transform={`translate(${f1(x)} ${f1(y)})`} fill={col} />
                  ) : (
                    <circle cx={f1(x)} cy={f1(y)} r={m.kind === 'sunset' || m.kind === 'sunrise' ? 3.6 : 2.6} fill={col} />
                  )}
                </g>
              );
            })}
            {iss.map((p, i) => {
              const [x, y] = pt(p.h, r1 - 3);
              const [x2, y2] = pt(p.h, r1 - 12);
              return (
                <line key={i} x1={f1(x)} y1={f1(y)} x2={f1(x2)} y2={f1(y2)} stroke="var(--starlight)" strokeWidth={2} strokeLinecap="round">
                  <title>{p.label}</title>
                </line>
              );
            })}
          </g>
          {/* rim + pointer notch (fixed) */}
          <circle r={r1} fill="none" stroke="var(--card-gold)" strokeWidth={1} className="rim" />
          <circle r={r0} fill="none" stroke="var(--card-line)" strokeWidth={1} />
          <line x1={0} y1={-r1 - 2} x2={0} y2={-r0 + 2} stroke="var(--crimson-bright)" strokeWidth={2} />
          <path d={`M-7 ${-r1 - 12}L7 ${-r1 - 12}L0 ${-r1 - 1}Z`} fill="var(--crimson-bright)" style={{ filter: 'drop-shadow(0 0 6px var(--crimson-bright))' }} />
        </g>
      </svg>
      <div className="compass-read" style={{ bottom: R * (docked ? 0.56 : 0.4) }}>
        {live ? (
          <span className="live">
            <span className="beacon" aria-hidden="true" />
            LIVE
          </span>
        ) : (
          <span className="off">{offTxt}</span>
        )}
        <span className="clock">{clock}</span>
        <span className="koku" lang="ja">
          {koku.kanji}の刻
        </span>
        {dateTxt && <span className="date">{dateTxt}</span>}
      </div>
      <button className="tw-btn primary compass-now" style={{ left: '50%', bottom: R * 0.14, transform: 'translateX(-50%)' }} onClick={toNow} disabled={live} aria-label="Return the sky to now">
        Now
      </button>
      </div>
    </div>
  );
}
