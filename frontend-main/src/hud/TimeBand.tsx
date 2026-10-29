/**
 * Lite-mode time compass (§10.7): the wadokei as a horizontal swipe band. Same contract as the
 * compass — it writes only `offsetMs` (±72 h). Swipe / drag sideways, ←/→ ±15 min (Shift ±1 h), Now.
 */
import { useEffect, useRef, useState } from 'react';
import { app, useApp } from '@/state/store';
import { fmtClock, KOKU, kokuAt, localHours } from '@/astro/skytime';
import { cue } from '@/audio/engine';

const H = 3600_000;
const PX_PER_H = 46;

export default function TimeBand() {
  const offset = useApp((s) => s.offsetMs);
  const tz = useApp((s) => s.tz);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);
  const sky = new Date(now + offset);
  const hSky = localHours(sky, tz);
  const koku = kokuAt(sky, tz);
  const live = Math.abs(offset) < 30_000;
  const lastKoku = useRef(koku.kanji);
  useEffect(() => {
    if (lastKoku.current !== koku.kanji) cue('tick');
    lastKoku.current = koku.kanji;
  }, [koku.kanji]);

  const drag = useRef<{ x: number; id: number } | null>(null);
  const setOff = (ms: number) => app().setOffset(Math.round(ms));
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? H : 15 * 60_000;
    if (e.key === 'ArrowRight') setOff(app().offsetMs + step);
    else if (e.key === 'ArrowLeft') setOff(app().offsetMs - step);
    else if (e.key === 'Home') setOff(0);
    else return;
    e.preventDefault();
  };
  // ticks: 30 h either side of the centre, positioned relative to sky time
  const ticks = [];
  for (let k = -14; k <= 14; k++) {
    const h = Math.floor(hSky) + k;
    const x = (h - hSky) * PX_PER_H;
    const hh = ((h % 24) + 24) % 24;
    ticks.push(
      <div key={k} className="band-tick" style={{ transform: `translateX(${x.toFixed(1)}px)` }}>
        <i className={hh % 2 === 0 ? 'major' : ''} />
        {hh % 2 === 0 && (
          <span lang="ja" className="k">
            {KOKU[(hh / 2) % 12].kanji}
          </span>
        )}
      </div>,
    );
  }
  return (
    <div className="band hud-bar">
      <div className="band-read">
        {live ? (
          <span className="live">
            <span className="beacon" aria-hidden="true" /> LIVE
          </span>
        ) : null}
        <span className="clock num">{fmtClock(sky, tz)}</span>
        <span lang="ja" className="koku">
          {koku.kanji}の刻
        </span>
        <button className="tw-btn primary band-now" onClick={() => setOff(0)} disabled={live}>
          Now
        </button>
      </div>
      <div
        className="band-track"
        role="slider"
        tabIndex={0}
        aria-label="Sky time: swipe sideways to change"
        aria-valuemin={-72}
        aria-valuemax={72}
        aria-valuenow={Math.round((offset / H) * 4) / 4}
        aria-valuetext={`${fmtClock(sky, tz, true)}, ${koku.kanji} no koku${live ? ', live' : ''}`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          setOff(app().offsetMs - ((e.clientX - d.x) / PX_PER_H) * H);
          d.x = e.clientX;
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {ticks}
        <span className="band-notch" aria-hidden="true" />
      </div>
    </div>
  );
}
