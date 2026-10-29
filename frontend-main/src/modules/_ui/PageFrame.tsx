/**
 * Shared module page frame (§9.1). Floats over the dimmed sky at z 40, scrolls in its own container
 * (a Lenis instance on that container, driven by the GSAP ticker), with React Bits GradualBlur on the
 * top and bottom edges. Header: ← Return to the sky, eyebrow, title with one accent word, and the
 * place + sky-time chips.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import GradualBlur from '@/vendor/reactbits/GradualBlur';
import { Director } from '@/scene/Director';
import { useApp } from '@/state/store';
import { fmtClock, kokuAt } from '@/astro/skytime';
import { sourceGlyph } from '@/data/location';
import { Chip, Eyebrow, Kanji, Title } from '@/ui';
import { ScrollerCtx, useCalm } from './kit';
import './modules.css';

export interface PageFrameProps {
  eyebrow: string;
  /** chapter kanji shown in the crimson seal of the eyebrow row */
  seal?: string;
  title: ReactNode;
  lede?: ReactNode;
  /** extra chips / actions in the header row */
  actions?: ReactNode;
  children: ReactNode;
  /** wider content (Lens, Dojo) */
  wide?: boolean;
}

function SkyTimeChip() {
  const tz = useApp((s) => s.tz);
  const offsetMs = useApp((s) => s.offsetMs);
  const [, force] = useState(0);
  useEffect(() => {
    const h = window.setInterval(() => force((n) => n + 1), 20_000);
    return () => window.clearInterval(h);
  }, []);
  const d = new Date(Date.now() + offsetMs);
  const live = Math.abs(offsetMs) < 60_000;
  const k = kokuAt(d, tz);
  return (
    <span className={`tw-chip ${live ? 'live' : ''}`} title={`Sky time in ${tz}`}>
      <span className="num">{fmtClock(d, tz, !live)}</span>
      <Kanji>{k.kanji}の刻</Kanji>
      {live ? 'live' : 'sky time'}
    </span>
  );
}

function PlaceChip() {
  const place = useApp((s) => s.place);
  const setOpen = useApp((s) => s.setCitySearchOpen);
  if (!place) return <Chip>no place yet</Chip>;
  return (
    <button className="tw-chip pg-chip-btn" onClick={() => setOpen(true)} title="Change place">
      <span aria-hidden="true">{sourceGlyph(place.source)}</span>
      {place.label}
      <span className="num">
        {Math.abs(place.lat).toFixed(2)}
        {place.lat >= 0 ? 'N' : 'S'} {Math.abs(place.lon).toFixed(2)}
        {place.lon >= 0 ? 'E' : 'W'}
      </span>
    </button>
  );
}

export default function PageFrame({ eyebrow, seal, title, lede, actions, children, wide = false }: PageFrameProps) {
  const nav = useNavigate();
  const { hash } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const calm = useCalm();
  const lite = useApp((s) => s.lite);
  const lenisRef = useRef<Lenis | null>(null);

  // Own Lenis on the page container, driven by the shared GSAP ticker (§6.5).
  useEffect(() => {
    const wrapper = scroller.current;
    const inner = content.current;
    setEl(wrapper);
    if (!wrapper || !inner || calm) return;
    const l = new Lenis({ wrapper, content: inner, autoRaf: false, lerp: 0.1, smoothWheel: true });
    lenisRef.current = l;
    const raf = (t: number) => l.raf(t * 1000);
    gsap.ticker.add(raf);
    return () => {
      gsap.ticker.remove(raf);
      l.destroy();
      lenisRef.current = null;
    };
  }, [calm]);

  // Land on #anchor (dives go to /scroll#moon, #passes…): wait for content, then glide there.
  useEffect(() => {
    if (!hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1)).split('&')[0];
    let tries = 0;
    let h = 0;
    let fixes = 0;
    let touched = false;
    const wrapEl = scroller.current;
    const stop = () => (touched = true);
    wrapEl?.addEventListener('wheel', stop, { passive: true });
    wrapEl?.addEventListener('pointerdown', stop);
    wrapEl?.addEventListener('keydown', stop);
    const OFFSET = 96; // clear the HUD bar
    const go = () => {
      const target = document.getElementById(id);
      const wrap = scroller.current;
      if (target && wrap) {
        const delta = target.getBoundingClientRect().top - wrap.getBoundingClientRect().top - OFFSET;
        if (Math.abs(delta) > 40) {
          const top = delta + wrap.scrollTop;
          if (lenisRef.current) lenisRef.current.scrollTo(top, { duration: fixes ? 0.6 : 1.2 });
          else wrap.scrollTo({ top, behavior: calm ? 'auto' : 'smooth' });
        }
        // content above may still be loading (slow APIs): correct the landing a couple of times
        if (fixes++ < 3) h = window.setTimeout(() => !touched && go(), 1600);
        return;
      }
      if (tries++ < 20) h = window.setTimeout(go, 150);
    };
    h = window.setTimeout(go, 350);
    return () => {
      window.clearTimeout(h);
      wrapEl?.removeEventListener('wheel', stop);
      wrapEl?.removeEventListener('pointerdown', stop);
      wrapEl?.removeEventListener('keydown', stop);
    };
  }, [hash, calm]);

  const back = () => {
    nav('/');
    Director.back();
  };

  return (
    <div className="pg-root" data-cursor="off">
      <div className="pg-scroll pecfest-rails" ref={scroller} data-lenis-prevent>
        <div className={`pg-content ${wide ? 'wide' : ''}`} ref={content}>
          <ScrollerCtx.Provider value={el}>
            <header className="pg-head reveal-ink">
              <div className="pg-head-row">
                <button className="tw-btn secondary pg-back" onClick={back} aria-label="Return to the sky (Esc)">
                  ← Return to the sky <span className="pg-kbd">Esc</span>
                </button>
                <div className="pg-chips">
                  <PlaceChip />
                  <SkyTimeChip />
                  {actions}
                </div>
              </div>
              <div className="pg-eyebrow-row">
                {seal && (
                  <span className="pg-seal" lang="ja" aria-hidden="true">
                    {seal}
                  </span>
                )}
                <Eyebrow>{eyebrow}</Eyebrow>
              </div>
              <Title>{title}</Title>
              <span className="tw-brush pg-title-brush" aria-hidden="true" />
              {lede && <p className="pg-lede">{lede}</p>}
            </header>
            {children}
          </ScrollerCtx.Provider>
        </div>
      </div>
      {!lite && (
        <>
          <GradualBlur target="parent" position="top" height="4.5rem" strength={1.4} layers={6} curve="bezier" autoHide zIndex={5} />
          <GradualBlur target="parent" position="bottom" height="5rem" strength={1.6} layers={6} curve="bezier" autoHide zIndex={5} />
        </>
      )}
    </div>
  );
}
