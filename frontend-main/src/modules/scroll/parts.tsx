/** Small SVG pieces for /scroll: ISS compass rose, meteor sparkline, live countdown, Remind-me button. */
import { useEffect, useId, useState } from 'react';
import { api, type Pass } from '@/data/api';
import { ensureSubscribed, pushSupported } from '@/data/push';
import { fmtTime } from '@/data/format';
import { useApp } from '@/state/store';

/** Compass rose: zenith at the centre, horizon at the rim, azimuth clockwise from north (北 top). */
export function CompassRose({ p, size = 220 }: { p: Pass; size?: number }) {
  const R = 100;
  const pt = (alt: number, az: number) => {
    const rr = ((90 - Math.max(0, alt)) / 90) * R;
    const a = (az * Math.PI) / 180;
    return [rr * Math.sin(a), -rr * Math.cos(a)] as const;
  };
  const path = (pts: Pass['track']) => pts.map((t, i) => `${i === 0 ? 'M' : 'L'}${pt(t.alt, t.az).map((v) => v.toFixed(1)).join(',')}`).join(' ');
  const lit = p.track.filter((t) => t.sunlit);
  const max = p.track.length ? p.track.reduce((a, b) => (b.alt > a.alt ? b : a)) : null;
  const [mx, my] = max ? pt(max.alt, max.az) : [0, 0];
  const s = p.track[0];
  const e = p.track[p.track.length - 1];
  const dirs = ['北', '東', '南', '西'];
  return (
    <svg viewBox="-122 -122 244 244" width={size} height={size} className="sc-rose" role="img" aria-label={`${p.satellite} sky path from ${p.start_compass} to ${p.end_compass}, peaking ${p.max_alt.toFixed(0)}° up`}>
      {[60, 30].map((alt) => (
        <circle key={alt} r={((90 - alt) / 90) * R} className="sc-rose-ring" />
      ))}
      <circle r={R} className="sc-rose-rim" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        const l = i % 4 === 0 ? 10 : i % 2 === 0 ? 6 : 3;
        return <line key={i} x1={Math.sin(a) * R} y1={-Math.cos(a) * R} x2={Math.sin(a) * (R - l)} y2={-Math.cos(a) * (R - l)} className="sc-rose-tick" />;
      })}
      {/* 8-point star */}
      <path d="M0,-34 L5,-5 L34,0 L5,5 L0,34 L-5,5 L-34,0 L-5,-5 Z" className="sc-rose-star" />
      {dirs.map((d, i) => {
        const a = (i * 90 * Math.PI) / 180;
        return (
          <g key={d}>
            <text x={Math.sin(a) * 112} y={-Math.cos(a) * 112 + 5} textAnchor="middle" className={`sc-rose-dir ${i === 0 ? 'n' : ''}`} lang="ja">
              {d}
            </text>
          </g>
        );
      })}
      {p.track.length > 1 && <path d={path(p.track)} className="sc-rose-trk dark" />}
      {lit.length > 1 && <path d={path(lit)} className="sc-rose-trk" />}
      {s && <circle cx={pt(s.alt, s.az)[0]} cy={pt(s.alt, s.az)[1]} r={3} className="sc-rose-start" />}
      {e && <path d={`M${pt(e.alt, e.az)[0] - 4},${pt(e.alt, e.az)[1] - 4} l8,8 m0,-8 l-8,8`} className="sc-rose-end" />}
      {max && <circle cx={mx} cy={my} r={4.5} className="sc-rose-max" />}
    </svg>
  );
}

export function Sparkline({ values, labels, width = 260, height = 56 }: { values: number[]; labels?: string[]; width?: number; height?: number }) {
  const gid = useId().replace(/:/g, '');
  if (!values.length) return null;
  const max = Math.max(0.5, ...values);
  const step = width / Math.max(1, values.length - 1);
  const yy = (v: number) => height - 4 - (v / max) * (height - 12);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${yy(v).toFixed(1)}`).join(' ');
  const peak = values.indexOf(Math.max(...values));
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="sc-spark" role="img" aria-label={`Rate per hour, ${values.map((v, i) => `${labels?.[i] ?? i}: ${v.toFixed(1)}`).join(', ')}`}>
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity=".35" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#sp-${gid})`} />
      <path d={d} fill="none" stroke="var(--gold)" strokeWidth="1.6" />
      <circle cx={peak * step} cy={yy(values[peak])} r={3} fill="var(--crimson-bright)" />
    </svg>
  );
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** DAYS 日 · HOURS 時 · MINS 分 · SECS 秒 to an ISO instant (real time, not sky time). */
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);
  const t = new Date(to).getTime();
  const diff = t - now;
  if (Number.isNaN(t)) return null;
  if (diff <= 0) return <span className="tw-chip live">window open or past</span>;
  const p = parts(diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className={`sc-count ${diff < 3600_000 ? 'soon' : ''}`} role="timer" aria-label={`${p.d} days ${p.h} hours ${p.m} minutes to go`}>
      {[
        [p.d, '日', 'days'],
        [p.h, '時', 'hrs'],
        [p.m, '分', 'min'],
        [p.s, '秒', 'sec'],
      ].map(([v, k, l]) => (
        <span key={l as string} className="u">
          <b className="num">{pad(v as number)}</b>
          <i lang="ja">{k}</i>
          <small>{l}</small>
        </span>
      ))}
    </span>
  );
}

type RState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

/**
 * "Remind me": the only place Notification permission is requested. Subscribes this browser to Web Push,
 * then asks the backend to push 15 minutes before the event (POST /api/alerts/schedule-event).
 */
export function RemindMe({ eventId }: { eventId: string }) {
  const place = useApp((s) => s.place);
  const tz = useApp((s) => s.tz);
  const [st, setSt] = useState<RState>({ kind: 'idle' });
  if (!pushSupported()) return <span className="pg-quiet">Reminders need a browser with Web Push.</span>;
  const run = async () => {
    if (!place) return;
    setSt({ kind: 'busy' });
    try {
      const endpoint = await ensureSubscribed();
      const r = await api.alerts.scheduleEvent({ endpoint, lat: place.lat, lon: place.lon, event_id: eventId, lead_minutes: 15 });
      setSt({ kind: 'done', text: `A push will arrive ${fmtTime(r.fire_at, tz, true)}, 15 min before.` });
    } catch (e) {
      setSt({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <span className="sc-remind">
      <button className="tw-btn primary" onClick={() => void run()} disabled={st.kind === 'busy' || st.kind === 'done'} style={{ minHeight: 36 }}>
        {st.kind === 'busy' ? 'Asking…' : st.kind === 'done' ? 'Reminder set ✓' : 'Remind me'}
      </button>
      {st.kind === 'done' && <span className="pg-quiet">{st.text}</span>}
      {st.kind === 'error' && <span className="pg-quiet" role="alert">Not set: {st.text}</span>}
    </span>
  );
}
