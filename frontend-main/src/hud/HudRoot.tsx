/**
 * PHASE-0 STUB (lead) — workstream C owns src/hud/ and replaces this with TimeCompass, ChapterRail,
 * Directory, LocationChip, Countdown, SoundToggle, SkyCursor, InkFlood and InfoCard (§8.5–8.7).
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '@/state/store';
import { CHAPTERS, isModulePath } from '@/app/routes';
import { Director } from '@/scene/Director';
import { sourceGlyph } from '@/data/location';
import { Kanji } from '@/ui';

export default function HudRoot() {
  const phase = useApp((s) => s.phase);
  const place = useApp((s) => s.place);
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModulePath(pathname)) {
        nav('/');
        Director.back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname, nav]);

  if (phase === 'gate' || phase === 'loading' || phase === 'intro') return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 30, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 20, left: 24, pointerEvents: 'auto' }}>
        <button
          className="display"
          style={{ letterSpacing: '.2em', fontSize: 14 }}
          onClick={() => {
            nav('/');
            useApp.getState().setPhase('dome');
            Director.station('dome');
          }}
        >
          <Kanji>月読</Kanji> · TSUKUYOMI
        </button>
        {place && (
          <div style={{ fontSize: 12, color: 'var(--washi-2)', marginTop: 4 }} className="num">
            {place.label} · {place.lat.toFixed(2)} N {place.lon.toFixed(2)} E · {sourceGlyph(place.source)}
          </div>
        )}
      </div>
      <nav aria-label="Chapters" style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', display: 'grid', gap: 14, pointerEvents: 'auto' }}>
        {CHAPTERS.map((c) => (
          <button key={c.path} onClick={() => nav(c.path)} title={c.name} style={{ color: pathname === c.path ? 'var(--gold)' : 'var(--washi-3)' }}>
            <Kanji>{c.num}</Kanji>
          </button>
        ))}
      </nav>
    </div>
  );
}
