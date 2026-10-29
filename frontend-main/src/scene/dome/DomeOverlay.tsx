/**
 * DOM layer for the dome (§7.4), z 10: Atelier-style hotspots — a small ring on the object, a hairline
 * leader line and an uppercase label — positioned every frame by the canvas loop (sky/OverlayPainter
 * → domeHotspots), and the "Enter your sky" CTA. A hotspot click select()s its object (C dives).
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/state/store';
import { Button, Kanji } from '@/ui';
import { domeHotspots, live } from '@/scene/sky/shared';
import { enterSky } from './orbit';

interface Spot {
  key: string;
  eyebrow: string;
  jp?: string;
  line: string;
  /** anchor candidates in order of preference (ids in the live registry) */
  anchors: string[];
  side: 1 | -1;
}

const SPOTS: Spot[] = [
  { key: 'moon', eyebrow: "Tonight's moon", line: 'name, phase, rise and set', anchors: ['moon'], side: 1 },
  { key: 'watch', eyebrow: 'The Watchtower', jp: '見張り', line: 'where to watch', anchors: ['pagoda', 'torii'], side: -1 },
  { key: 'scroll', eyebrow: 'The Scroll', jp: '巻物', line: 'what is coming', anchors: ['iss', 'meteor-radiant', 'jupiter', 'saturn'], side: 1 },
  { key: 'lens', eyebrow: 'The Lens', jp: '鏡', line: 'look closer', anchors: ['M42', 'lens-best', 'M31', 'M45'], side: -1 },
];

function pickAnchor(s: Spot): string {
  for (const id of s.anchors) {
    const o = live.get(id);
    if (o && (o.kind === 'landmark' || o.world[1] > 4)) return id;
  }
  return s.anchors[0];
}

function Hotspot({ spot, moonName }: { spot: Spot; moonName: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entry = { el, anchor: pickAnchor(spot) };
    domeHotspots.set(spot.key, entry);
    // anchors can rise and set while we look: re-choose every second
    const id = window.setInterval(() => (entry.anchor = pickAnchor(spot)), 1000);
    return () => {
      window.clearInterval(id);
      domeHotspots.delete(spot.key);
    };
  }, [spot]);
  const click = () => {
    const entry = domeHotspots.get(spot.key);
    const o = entry && live.get(entry.anchor);
    if (o) useApp.getState().select({ ...o, world: [...o.world] as [number, number, number] });
  };
  const jp = spot.key === 'moon' ? moonName : spot.jp;
  return (
    <button ref={ref} type="button" className={`a-hotspot ${spot.side < 0 ? 'left' : ''}`} style={{ opacity: 0 }} onClick={click} aria-label={`${spot.eyebrow}: ${spot.line}`}>
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
.a-hotspot{position:fixed;left:0;top:0;z-index:10;width:0;height:0;padding:0;border:0;background:none;cursor:pointer;
  transition:opacity 400ms var(--ease-katana);will-change:transform;color:var(--kinu)}
.a-hotspot .ring{position:absolute;left:-7px;top:-7px;width:14px;height:14px;border:1px solid var(--gold-bright);border-radius:50%;
  box-shadow:0 0 10px rgba(232,198,106,.35)}
.a-hotspot .ring::after{content:'';position:absolute;inset:4px;border-radius:50%;background:var(--gold-bright);opacity:.85}
.a-hotspot .lead{position:absolute;left:5px;top:-5px;width:46px;height:1px;background:var(--gold);transform-origin:0 0;transform:rotate(-40deg)}
.a-hotspot .label{position:absolute;left:40px;top:-48px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;
  padding:0 0 6px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:left;min-width:150px;
  transition:border-color 180ms var(--ease-katana)}
.a-hotspot .eb{font:600 11px/1 var(--font-ui);letter-spacing:.27em;text-transform:uppercase;color:var(--kinu)}
.a-hotspot .eb .jp{font:500 13px/1 var(--font-jp);letter-spacing:.04em;color:var(--gold)}
.a-hotspot .ln{font:italic 500 15px/1.1 var(--font-accent);color:var(--gold-accent)}
.a-hotspot.left .lead{left:-5px;transform:rotate(-140deg)}
.a-hotspot.left .label{left:auto;right:40px;align-items:flex-end;text-align:right}
.a-hotspot:hover .label,.a-hotspot:focus-visible .label{border-bottom-color:var(--line-hover)}
.a-hotspot:hover .ring{transform:scale(1.25);transition:transform 180ms var(--ease-spring)}
.a-hotspot:focus-visible{outline:none}
.a-hotspot:focus-visible .ring{outline:2px solid var(--gold-bright);outline-offset:6px}
.a-dome-cta{position:fixed;left:50%;bottom:16vh;transform:translateX(-50%);z-index:10;display:flex;flex-direction:column;align-items:center;gap:14px}
.a-dome-cta .hint{font:600 11px/1 var(--font-ui);letter-spacing:.27em;text-transform:uppercase;color:var(--washi-3)}
@media (prefers-reduced-motion: reduce){.a-hotspot{transition:none}}
`;

export default function DomeOverlay() {
  const phase = useApp((s) => s.phase);
  const [moonName, setMoonName] = useState('');
  useEffect(() => {
    if (phase !== 'dome') return;
    const tick = () => setMoonName(String(live.get('moon')?.info?.kanji ?? ''));
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [phase]);
  if (phase !== 'dome') return null;
  return (
    <>
      <style>{CSS}</style>
      {SPOTS.map((s) => (
        <Hotspot key={s.key} spot={s} moonName={moonName} />
      ))}
      <div className="a-dome-cta">
        <Button variant="gold" onClick={enterSky}>
          Enter your <em className="accent" style={{ textTransform: 'none', fontSize: 16, color: 'var(--gold-button-ink)', textShadow: 'none' }}>sky</em> ↘
        </Button>
        <span className="hint">or scroll down</span>
      </div>
    </>
  );
}
