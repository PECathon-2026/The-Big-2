/**
 * Phase hand-offs owned by workstream B: gate → (loading) → intro → sky.
 */
import { useApp, type Place } from '@/state/store';
import { Director, rig } from '@/scene/Director';
import { skyClock, updateSkyClock } from '@/scene/skyClock';
import { introTimeline } from '@/astro/skytime';
import { intro } from '@/scene/intro/introBus';
import { allDone, preloadForPlace } from './preload';
import { isModulePath } from '@/app/routes';

const D = Math.PI / 180;
const SEEN_KEY = 'tw.introSeen';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** After the gate: store the place, then show the loader only if something is still loading. */
export function afterGate(place: Place) {
  const s = useApp.getState();
  s.setPlace(place);
  preloadForPlace(place);
  if (allDone()) startIntro();
  else s.setPhase('loading');
}

/** Enter the dusk: camera at eye height facing the real sunset azimuth. */
export function startIntro() {
  const s = useApp.getState();
  if (s.place) preloadForPlace(s.place);
  // A deep link or a refresh on a module page: after the gate, open that page instead of playing the intro over it.
  if (isModulePath(window.location.pathname)) {
    intro.active = false;
    skyClock.override = null;
    // the same "tonight's sky" the intro would have landed on
    const tl = s.place ? introTimeline(s.place) : null;
    if (tl) {
      const off = tl.end.getTime() - Date.now();
      s.setOffset(Math.abs(off) < 5 * 60_000 ? 0 : off);
    }
    updateSkyClock(true);
    s.setIntroProgress(1);
    Director.station('sky', { instant: true });
    s.setPhase('module');
    return;
  }
  const place = s.place;
  if (place && !intro.timeline) intro.timeline = introTimeline(place);
  const tl = intro.timeline;
  intro.progress = 0;
  intro.active = true;
  if (tl) {
    intro.time = tl.start;
    skyClock.override = tl.start;
    updateSkyClock(true);
  }
  s.setIntroProgress(0);
  Director.station('intro', { instant: true, yaw: (tl?.sunsetAz ?? 270) * D, pitch: 6 * D, fov: 38 });
  if (s.phase !== 'intro') s.setPhase('intro');
}

/** Leave the intro straight into the open sky at the current heading (end of scroll, Skip, Esc). */
export function finishIntro() {
  if (!intro.active) return;
  const s = useApp.getState();
  const tl = intro.timeline;
  const yaw = rig.cur.yaw;
  intro.active = false;
  skyClock.override = null;
  // The sky keeps showing tonight's sky (the time-lapse target): a real offset from now, shown as such by the HUD.
  if (tl) {
    const off = tl.end.getTime() - Date.now();
    s.setOffset(Math.abs(off) < 5 * 60_000 ? 0 : off);
  }
  updateSkyClock(true);
  const root = document.getElementById('canvas-root');
  if (root) root.style.clipPath = '';
  markSeen();
  s.setIntroProgress(1);
  s.setPhase('sky');
  Director.station('sky', { yaw });
}
