/**
 * The HUD (workstream C, z 30): wordmark + location chip, countdown + directory button, chapter rail,
 * the wadokei time compass, sound toggle, GlowCursor, InfoCard, directory and city-search dialogs,
 * and the ink flood (z 60). Owns selection → dive / InfoCard (NOTES "Selection → dive") and keyboard.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { app, useApp, type SkyObject } from '@/state/store';
import { isModulePath } from '@/app/routes';
import { Director } from '@/scene/Director';
import { Button } from '@/ui';
import { cue } from '@/audio/engine';
import ChapterRail from './ChapterRail';
import Directory from './Directory';
import InkFlood from './InkFlood';
import SoundToggle from './SoundToggle';
import LocationChip from './LocationChip';
import CitySearch from './CitySearch';
import Countdown from './Countdown';
import TimeCompass from './TimeCompass';
import TimeBand from './TimeBand';
import InfoCard from './InfoCard';
import SkyCursor from './SkyCursor';
import { goHome, stepChapter } from './nav';
import './hud.css';

/** Last pointer position (the dive's ink origin). */
export const lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

function isTyping(el: EventTarget | null) {
  const e = el as HTMLElement | null;
  if (!e || !e.closest) return false;
  return !!e.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-keys="own"]');
}

export default function HudRoot() {
  const phase = useApp((s) => s.phase);
  const lite = useApp((s) => s.lite);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [card, setCard] = useState<{ obj: SkyObject; x: number; y: number } | null>(null);

  // non-React code (Director) navigates through the router
  useEffect(() => Director.registerNavigate((p) => nav(p)), [nav]);

  useEffect(() => {
    const track = (e: PointerEvent) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    };
    window.addEventListener('pointerdown', track, true);
    window.addEventListener('pointermove', track, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', track, true);
      window.removeEventListener('pointermove', track);
    };
  }, []);

  // Selection contract: route → dive; no route → InfoCard beside the object.
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        const o = s.selected;
        if (!o || o === prev.selected) {
          if (!o && prev.selected) setCard(null);
          return;
        }
        if (o.route) {
          cue('pluck');
          setCard(null);
          void Director.diveTo(o, { ...lastPointer }).finally(() => {
            if (app().selected === o) app().select(null);
          });
        } else {
          cue('pluck');
          setCard({ obj: o, x: lastPointer.x, y: lastPointer.y });
        }
      }),
    [],
  );

  // a soft koto pluck on hover (§7.5)
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.hovered && s.hovered.id !== prev.hovered?.id && (s.phase === 'sky' || s.phase === 'dome')) cue('pluck', 0.35);
      }),
    [],
  );

  // the card belongs to the open sky only
  useEffect(() => {
    if (phase !== 'sky' && phase !== 'dome') setCard(null);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const s = app();
      if (s.directoryOpen || s.citySearchOpen) return; // dialogs handle their own Esc
      if (s.phase === 'gate' || s.phase === 'loading' || s.phase === 'intro') return;
      if (e.key === 'Escape') {
        if (s.selected && !s.selected.route) {
          s.select(null);
          setCard(null);
        } else if (isModulePath(window.location.pathname)) {
          void Director.back();
        }
        return;
      }
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      const onPage = isModulePath(window.location.pathname);
      if (e.key === 'ArrowRight' || (!onPage && e.key === 'ArrowDown')) {
        e.preventDefault();
        stepChapter(1, window.location.pathname);
      } else if (e.key === 'ArrowLeft' || (!onPage && e.key === 'ArrowUp')) {
        e.preventDefault();
        stepChapter(-1, window.location.pathname);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hidden = phase === 'gate' || phase === 'loading' || phase === 'intro';
  const onPage = phase === 'module' || isModulePath(pathname);
  return (
    <>
      {!hidden && (
        <>
          <SkyCursor />
          <div className={`hud hud-enter ${onPage ? 'on-page' : ''}`} data-hud>
            {onPage && <div className="hud-topbar" aria-hidden="true" />}
            <div className="hud-tl">
              <button className="hud-wordmark" onClick={goHome} aria-label="Tsukuyomi: return to the dome">
                <span className="seal" lang="ja" aria-hidden="true">
                  月
                </span>
                <span className="jp" lang="ja">
                  月読
                </span>
                <span aria-hidden="true">·</span> TSUKUYOMI
              </button>
              <LocationChip />
            </div>
            <div className="hud-tr">
              <Countdown />
              <Button
                variant="primary"
                className="hud-dir-btn"
                aria-haspopup="dialog"
                onClick={() => {
                  cue('clack');
                  app().setDirectoryOpen(true);
                }}
              >
                <span className="star" aria-hidden="true">
                  ✦
                </span>
                Chapters
              </Button>
            </div>
            <ChapterRail />
            {lite && !onPage ? <TimeBand /> : <TimeCompass folded={onPage} compact={phase === 'dome'} />}
            <SoundToggle />
          </div>
          {card && !onPage && <InfoCard obj={card.obj} x={card.x} y={card.y} onClose={() => (app().select(null), setCard(null))} />}
        </>
      )}
      <Directory />
      <CitySearch />
      <InkFlood />
    </>
  );
}
