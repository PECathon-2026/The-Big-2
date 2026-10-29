/** Watchtower charts: brush-arc gauge, hourly timeline, "why this score" waterfall. All values from /api/watchtower/score. */
import { useEffect, useId, useState } from 'react';
import type { Contribution, HourScore, NightScore } from '@/data/api';
import { fmtNum } from '@/data/format';
import { useApp } from '@/state/store';
import { localHours } from '@/astro/skytime';
import { Num, useCalm } from '../_ui/kit';

/** The demo's brush-arc gauge (a 270° arc), stroke drawn with a turbulence "brush" filter. */
export function Gauge({ score, label }: { score: number; label: string }) {
  const fid = useId().replace(/:/g, '');
  const calm = useCalm();
  const [shown, setShown] = useState(calm ? score : 0);
  useEffect(() => {
    if (calm) return setShown(score);
    const h = requestAnimationFrame(() => requestAnimationFrame(() => setShown(score)));
    return () => cancelAnimationFrame(h);
  }, [score, calm]);
  const d = 'M40 150 A 75 75 0 1 1 160 150';
  return (
    <div className="wt-gauge" role="img" aria-label={`${label}: ${Math.round(score)} of 100`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <filter id={`brush-${fid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="4" />
          </filter>
          <linearGradient id={`g-${fid}`} x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="var(--gold-dark)" />
            <stop offset=".55" stopColor="var(--gold)" />
            <stop offset="1" stopColor="var(--gold-bright)" />
          </linearGradient>
        </defs>
        <path d={d} className="wt-gauge-track" pathLength={100} />
        {[0, 25, 50, 75, 100].map((t) => {
          const a = ((135 + t * 2.7) * Math.PI) / 180;
          return <line key={t} x1={100 + Math.cos(a) * 86} y1={100 + Math.sin(a) * 86} x2={100 + Math.cos(a) * 92} y2={100 + Math.sin(a) * 92} className="wt-gauge-tick" />;
        })}
        <path
          d={d}
          className="wt-gauge-val"
          pathLength={100}
          stroke={`url(#g-${fid})`}
          filter={`url(#brush-${fid})`}
          style={{ strokeDasharray: 100, strokeDashoffset: 100 - Math.max(0, Math.min(100, shown)) }}
        />
      </svg>
      <div className="wt-gauge-c">
        <Num value={score} className="wt-gauge-n" />
        <span className="pg-label">of 100</span>
        <span className="wt-gauge-jp" lang="ja">
          夜の誉
        </span>
      </div>
    </div>
  );
}

/** Hourly scores as brush bars; gold band = best window, crimson notch = current sky time. */
export function Timeline({ n, sel, onSel }: { n: NightScore; sel: number | null; onSel: (i: number | null) => void }) {
  const tz = useApp((s) => s.tz);
  const offsetMs = useApp((s) => s.offsetMs);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(h);
  }, []);
  const hours = n.hours;
  if (!hours.length) return <p className="pg-quiet">The forecast returned no hours for tonight.</p>;
  const W = 1000;
  const H = 230;
  const pl = 30;
  const pr = 10;
  const pt = 14;
  const pb = 30;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const bw = iw / hours.length;
  const t0 = new Date(hours[0].time).getTime();
  const step = hours.length > 1 ? new Date(hours[1].time).getTime() - t0 : 3600_000;
  const xOf = (t: number) => pl + ((t - t0) / step) * bw;
  const y = (v: number) => pt + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const bwin = n.best_window;
  const sky = now + offsetMs;
  const skyX = xOf(sky);
  const skyIn = skyX >= pl && skyX <= W - pr;
  const every = hours.length > 14 ? 2 : 1;
  return (
    <svg className="wt-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hourly Night Honor scores from ${hours[0].time_local} to ${hours[hours.length - 1].time_local}`}>
      <desc>{hours.map((h) => `${h.time_local}: ${h.score.toFixed(0)}`).join('; ')}</desc>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={pl} x2={W - pr} y1={y(g)} y2={y(g)} className="wt-grid" />
          <text x={pl - 6} y={y(g) + 4} textAnchor="end" className="pg-svg-text">
            {g}
          </text>
        </g>
      ))}
      {bwin && (
        <g>
          <rect x={xOf(new Date(bwin.start).getTime())} y={pt - 6} width={Math.max(2, xOf(new Date(bwin.end).getTime()) - xOf(new Date(bwin.start).getTime()))} height={ih + 6} className="wt-band" />
          <text x={xOf(new Date(bwin.start).getTime()) + 6} y={pt + 6} className="wt-band-label">
            best window
          </text>
        </g>
      )}
      {hours.map((h, i) => {
        const x = pl + i * bw + bw * 0.18;
        const w = Math.max(2, bw * 0.64);
        const top = y(h.score);
        return (
          <g key={h.time}>
            <rect
              x={pl + i * bw}
              y={pt}
              width={bw}
              height={ih}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${h.time_local}, score ${h.score.toFixed(0)}`}
              aria-pressed={sel === i}
              onMouseEnter={() => onSel(i)}
              onFocus={() => onSel(i)}
              onClick={() => onSel(i)}
              className="wt-hit"
            />
            <path className={`wt-bar ${sel === i ? 'sel' : ''}`} d={`M${x},${pt + ih} L${x},${top + 3} Q${x + w / 2},${top - 3} ${x + w},${top + 2} L${x + w},${pt + ih} Z`} pointerEvents="none" />
            {i % every === 0 && (
              <text x={pl + i * bw + bw / 2} y={H - 10} textAnchor="middle" className="pg-svg-text">
                {h.time_local}
              </text>
            )}
          </g>
        );
      })}
      {skyIn && (
        <g className="wt-notch" pointerEvents="none">
          <line x1={skyX} x2={skyX} y1={pt - 8} y2={pt + ih} />
          <path d={`M${skyX - 5},${pt - 12} L${skyX + 5},${pt - 12} L${skyX},${pt - 5} Z`} />
          <text x={skyX + 7} y={pt - 4} className="wt-notch-label">
            {Math.abs(offsetMs) < 60_000 ? 'now' : 'sky time'} · {String(Math.floor(localHours(new Date(sky), tz))).padStart(2, '0')}h
          </text>
        </g>
      )}
    </svg>
  );
}

interface Step {
  label: string;
  from: number;
  to: number;
  kind: 'start' | 'loss' | 'gate' | 'end';
  note?: string;
}

/** Waterfall of losses: a perfect 100 → each factor's penalty → the darkness gate → the score. */
export function Waterfall({ contributions, hour }: { contributions: Contribution[]; hour?: HourScore | null }) {
  const sumC = contributions.reduce((a, c) => a + c.contribution, 0);
  const sumAll = contributions.reduce((a, c) => a + c.contribution + c.penalty, 0);
  const steps: Step[] = [];
  let cur = 100;
  steps.push({ label: 'A perfect sky', from: 0, to: 100, kind: 'start' });
  if (sumAll < 99.5 && hour) {
    steps.push({ label: 'Darkness gate', from: cur, to: sumAll, kind: 'gate', note: `Sun ${fmtNum(hour.sun_alt, 1)}° · darkness ×${fmtNum(hour.darkness, 2)}` });
    cur = sumAll;
  } else if (sumAll < 99.5) {
    steps.push({ label: 'Excluded / renormalised', from: cur, to: sumAll, kind: 'gate' });
    cur = sumAll;
  }
  for (const c of [...contributions].sort((a, b) => b.penalty - a.penalty)) {
    if (c.penalty <= 0.05) continue;
    steps.push({ label: c.label || c.factor, from: cur, to: cur - c.penalty, kind: 'loss', note: `${c.value == null ? '—' : fmtNum(c.value, 1)}${c.unit ? ` ${c.unit}` : ''} · weight ${c.weight}${c.note ? ` · ${c.note}` : ''}` });
    cur -= c.penalty;
  }
  steps.push({ label: hour ? `Score at ${hour.time_local}` : 'Tonight’s score', from: 0, to: sumC, kind: 'end' });
  const W = 1000;
  const rowH = 30;
  const lw = 240;
  const vw = W - lw - 70;
  const x = (v: number) => lw + (Math.max(0, Math.min(100, v)) / 100) * vw;
  const H = steps.length * rowH + 10;
  return (
    <svg className="wt-waterfall" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Why this score: losses from a perfect sky">
      <desc>{steps.map((s) => `${s.label}: ${s.kind === 'loss' || s.kind === 'gate' ? `−${(s.from - s.to).toFixed(1)}` : s.to.toFixed(1)}`).join('; ')}</desc>
      {steps.map((s, i) => {
        const yy = 6 + i * rowH;
        const a = Math.min(s.from, s.to);
        const b = Math.max(s.from, s.to);
        const val = s.kind === 'loss' || s.kind === 'gate' ? `−${(s.from - s.to).toFixed(1)}` : s.to.toFixed(1);
        return (
          <g key={i}>
            <title>{s.note ?? s.label}</title>
            <text x={lw - 12} y={yy + 18} textAnchor="end" className={`wt-wf-label ${s.kind}`}>
              {s.label}
            </text>
            <rect x={x(a)} y={yy + 5} width={Math.max(1.5, x(b) - x(a))} height={rowH - 12} className={`wt-wf ${s.kind}`} rx={1} />
            {i < steps.length - 1 && s.kind !== 'end' && <line x1={x(s.to)} x2={x(s.to)} y1={yy + rowH - 7} y2={yy + rowH + 5} className="wt-wf-link" />}
            <text x={x(b) + 8} y={yy + 18} className={`wt-wf-val ${s.kind}`}>
              {val}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
