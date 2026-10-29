/**
 * First-arrival hints (product-owner change: no dome exterior). The first time the phase becomes
 * 'sky' in a session, four Atelier-style leader-line labels appear on their real objects — the Moon,
 * the horizon landmarks, the ISS arc or a planet, M42 or the best DSO up — after ~1 s, and fade out
 * after ~10 s or on the first drag / wheel / click in the sky. Clicking one select()s its object (C
 * dives). Positions come from the canvas loop (OverlayPainter → hintSpots); only on-screen anchors show.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/state/store';
import { Kanji } from '@/ui';
import { hintSpots, live, P, project } from './shared';

interface Spot {
  key: string;
  eyebrow: string;
  jp?: string;
  line: string;
  anchors: string[];
  side: 1 | -1;
}

const SPOTS: Spot[] = [
  { key: 'moon', eyebrow: "Tonight's moon", line: 'name, phase, rise and set', anchors: ['moon'], side: 1 },
  { key: 'watch', eyebrow: 'The Watchtower', jp: '見張り', line: 'where to watch', anchors: ['pagoda', 'torii', 'ridges'], side: -1 },
  { key: 'scroll', eyebrow: 'The Scroll', jp: '巻物', line: 'what is coming', anchors: ['iss', 'jupiter', 'saturn', 'mars', 'venus', 'meteor-radiant'], side: 1 },
  { key: 'lens', eyebrow: 'The Lens', jp: '鏡', line: 'look closer', anchors: ['M42', 'lens-best', 'M31', 'M45'], side: -1 },
];

/** First candidate that is up and on screen (outside the compass band); else the first that is up. */
function pickAnchor(s: Spot): string {
  const W = window.innerWidth, H = window.innerHeight;
  let fallback: string | null = null;
  for (const id of s.anchors) {
    const o = live.get(id);
    if (!o || (o.kind !== 'landmark' && o.world[1] < 4)) continue;
    fallback ??= id;
    if (!project(o.world[0], o.world[1], o.world[2])) continue;
    const inBand = P.y > H * 0.72 && Math.abs(P.x - W / 2) < W * 0.27;
    if (P.x > 60 && P.x < W - 60 && P.y > 60 && P.y < H - 60 && !inBand) return id;
  }
  return fallback ?? s.anchors[0];
}

function Hint({ spot, moonName }: { spot: Spot; moonName: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entry = { el, anchor: pickAnchor(spot) };
    hintSpots.set(spot.key, entry);
    const id = window.setInterval(() => (entry.anchor = pickAnchor(spot)), 400);
    return () => {
      window.clearInterval(id);
      hintSpots.delete(spot.key);
    };
  }, [spot]);
  const click = () => {
    const entry = hintSpots.get(spot.key);
    const o = entry && live.get(entry.anchor);
    if (o) useApp.getState().select({ ...o, world: [...o.world] as [number, number, number] });
  };
  const jp = spot.key === 'moon' ? moonName : spot.jp;
  return (
    <button ref={ref} type="button" className={`a-hint ${spot.side < 0 ? 'left' : ''}`} style={{ visibility: 'hidden' }} onClick={click} aria-label={`${spot.eyebrow}: ${spot.line}`}>
      <span className="ring" />
      <span className="lead" />
      <span className="label">
        <span className="eb">
          {spot.eyebrow}
          {jp && (
            <>
              {' · '}
              <Kanji>{jp}</Kanji>
            </>
          )}
        </span>
        <span className="ln">{spot.line}</span>
      </span>
    </button>
  );
}

const CSS = `
.a-hints{position:fixed;inset:0;z-index:10;pointer-events:none;opacity:0;transition:opacity 900ms var(--ease-cinematic)}
.a-hints.on{opacity:1}
.a-hints.on .a-hint{pointer-events:auto}
.a-hint{position:fixed;left:0;top:0;width:0;height:0;padding:0;border:0;background:none;cursor:pointer;pointer-events:none;
  will-change:transform;color:var(--kinu)}
.a-hint .ring{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border:1px solid var(--gold-bright);border-radius:50%;
  box-shadow:0 0 10px rgba(232,198,106,.35)}
.a-hint .lead{position:absolute;left:6px;top:-6px;width:46px;height:1px;background:var(--gold);transform-origin:0 0;transform:rotate(-40deg)}
.a-hint .label{position:absolute;left:41px;top:-50px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;
  padding:0 0 6px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:left;min-width:150px;
  transition:border-color 180ms var(--ease-katana)}
.a-hint .eb{font:600 11px/1 var(--font-ui);letter-spacing:.27em;text-transform:uppercase;color:var(--kinu);text-shadow:0 2px 10px rgba(0,0,0,.8)}
.a-hint .eb .jp{font:500 13px/1 var(--font-jp);letter-spacing:.04em;color:var(--gold)}
.a-hint .ln{font:italic 500 15px/1.1 var(--font-accent);color:var(--gold-accent);text-shadow:0 2px 10px rgba(0,0,0,.8)}
.a-hint.left .lead{left:-6px;transform:rotate(-140deg)}
.a-hint.left .label{left:auto;right:41px;align-items:flex-end;text-align:right}
.a-hint:hover .label,.a-hint:focus-visible .label{border-bottom-color:var(--line-hover)}
.a-hint:focus-visible{outline:none}
.a-hint:focus-visible .ring{outline:2px solid var(--gold-bright);outline-offset:6px}
@media (prefers-reduced-motion: reduce){.a-hints{transition:opacity 200ms linear}}
`;

let shownThisSession = false;

export default function ArrivalHints() {
  const phase = useApp((s) => s.phase);
  const [state, setState] = useState<'idle' | 'on' | 'done'>(shownThisSession ? 'done' : 'idle');
  const [moonName, setMoonName] = useState('');

  useEffect(() => {
    if (phase !== 'sky' || state !== 'idle') return;
    shownThisSession = true;
    setMoonName(String(live.get('moon')?.info?.kanji ?? ''));
    const show = window.setTimeout(() => setState('on'), 1000);
    const hide = window.setTimeout(() => setState('done'), 11000);
    const canvas = document.querySelector('#canvas-root canvas');
    const dismiss = () => setState('done');
    canvas?.addEventListener('pointerdown', dismiss);
    canvas?.addEventListener('wheel', dismiss, { passive: true });
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
      canvas?.removeEventListener('pointerdown', dismiss);
      canvas?.removeEventListener('wheel', dismiss);
    };
  }, [phase, state]);

  // leaving the sky (a dive) ends the hints
  useEffect(() => {
    if (state === 'on' && phase !== 'sky') setState('done');
  }, [phase, state]);

  // keep the DOM briefly after 'done' so the fade-out plays
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    if (state !== 'done') return;
    const t = window.setTimeout(() => setMounted(false), 1000);
    return () => window.clearTimeout(t);
  }, [state]);

  if (!mounted || (state === 'idle' && phase !== 'sky')) return null;
  return (
    <div className={`a-hints ${state === 'on' ? 'on' : ''}`}>
      <style>{CSS}</style>
      {SPOTS.map((s) => (
        <Hint key={s.key} spot={s} moonName={moonName} />
      ))}
    </div>
  );
}
