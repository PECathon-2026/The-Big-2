/**
 * Chapter navigation (§8.5): each chapter is a camera station + a page. Chapter 一 is the sky itself (home;
 * there is no dome exterior any more).
 * The station is a dive toward a real object: Watchtower → the torii/horizon, Scroll → the Moon,
 * Lens → M42 (or the brightest DSO above the horizon), Honor → Polaris.
 */
import { altAzToVec, R, type Vec3 } from '@/astro/coords';
import { CHAPTERS, isModulePath } from '@/app/routes';
import { Director, rig } from '@/scene/Director';
import { skyClock } from '@/scene/skyClock';
import { app, type SkyObject } from '@/state/store';

const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

export function chapterTarget(path: string): SkyObject {
  const o = app().objects;
  const base = path.split(/[?#]/)[0];
  switch (base) {
    case '/watchtower':
      return o.torii ?? o.pagoda ?? o.ridges ?? { kind: 'landmark', id: 'horizon', name: 'Horizon', world: scale(altAzToVec(3, ((rig.cur.yaw * 180) / Math.PI + 360) % 360), R) };
    case '/scroll':
      return o.moon ?? { kind: 'moon', id: 'moon', name: 'Moon', world: scale(skyClock.moon.dir, R) };
    case '/lens': {
      const up = ['M42', 'M31', 'M45'].map((id) => o[id]).filter((x): x is SkyObject => !!x && x.world[1] > 0);
      return up[0] ?? o.M42 ?? { kind: 'dso', id: 'M42', name: 'Orion Nebula', world: scale(altAzToVec(30, 120), R) };
    }
    case '/honor':
      return o.polaris ?? { kind: 'star', id: 'polaris', name: 'Polaris', world: scale(altAzToVec(skyClock.lat, 0), R) };
    default:
      return { kind: 'landmark', id: 'view', name: 'View', world: scale(altAzToVec(30, ((rig.cur.yaw * 180) / Math.PI + 360) % 360), R) };
  }
}

/** Go to a chapter (or /science) with the dive transition from `pt` (screen px). */
export function goChapter(path: string, pt?: { x: number; y: number }) {
  if (Director.busy) return;
  if (path === '/') return goHome();
  if (window.location.pathname + window.location.search + window.location.hash === path) return;
  void Director.diveTo(chapterTarget(path), pt, path);
}

/** Wordmark / chapter 一: the sky home view (current yaw, pitch 24°, FOV 62). */
export function goHome() {
  if (Director.busy) return;
  const s = app();
  if (isModulePath(window.location.pathname)) {
    void Director.back({ to: 'home' });
    return;
  }
  s.select(null);
  s.setPhase('sky');
  void Director.home({ instant: s.reducedMotion });
}

/** Index of the active chapter for a pathname (−1 for /science and unknown paths). */
export function chapterIndex(pathname: string): number {
  if (pathname === '/' || pathname === '') return 0;
  return CHAPTERS.findIndex((c, i) => i > 0 && (pathname === c.path || pathname.startsWith(c.path + '/') || (c.path === '/lens' && pathname.startsWith('/dojo'))));
}

export function stepChapter(dir: 1 | -1, pathname: string) {
  const i = chapterIndex(pathname);
  const next = Math.max(0, Math.min(CHAPTERS.length - 1, (i < 0 ? 0 : i) + dir));
  if (next === i) return;
  goChapter(CHAPTERS[next].path);
}
