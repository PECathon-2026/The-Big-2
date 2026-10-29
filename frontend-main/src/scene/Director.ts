/**
 * The Director: the ONLY thing that moves the camera (§6.3). Owned by workstream C.
 *
 * The camera state is { pos, yaw, pitch, fov } with targets; `CameraRig` (CanvasRoot) eases the
 * current values toward the targets every frame with time-based damping, so any new input interrupts
 * a move. yaw 0 = north, +east; pitch up. The dome view is just a far position looking at the origin.
 *
 * Dives (§7.6) are orchestrated here: flight → ink flood from the click point → navigate(route) →
 * the page mounts under the ink → ink clears centre-out. `back()` reverses it to the exact saved view.
 * The HUD registers the router's navigate with `Director.registerNavigate`.
 */
import { dirToYawPitch, nearestAngle, type Vec3 } from '@/astro/coords';
import { app, type Phase, type SkyObject } from '@/state/store';
import { isModulePath } from '@/app/routes';
import { inkClose, inkFade, inkOpen } from '@/hud/ink';
import { cue } from '@/audio/engine';

export type StationName = 'intro' | 'dome' | 'sky';

export interface CamState {
  pos: Vec3;
  yaw: number;
  pitch: number;
  fov: number;
}

const D = Math.PI / 180;

/** Live camera values (eased) and targets. Mutated in place; never put these in React state. */
export const rig = {
  cur: { pos: [0, 70, 290] as Vec3, yaw: 0, pitch: -13 * D, fov: 50 } as CamState,
  tgt: { pos: [0, 70, 290] as Vec3, yaw: 0, pitch: -13 * D, fov: 50 } as CamState,
  /** damping base per second (lower = snappier). 0.05 ≈ 95% of the way per second. */
  ease: 0.05,
  /** dome ambient rotation (rad/s) applied while at the dome and idle */
  domeSpin: 0,
  station: 'dome' as StationName,
  /** 0..1 written during a dive — stars streak radially in the shader while > 0 */
  dive: 0,
};

export const PITCH_MIN = -8 * D;
export const PITCH_MAX = 88 * D;
export const FOV_MIN = 12;
export const FOV_MAX = 80;

export const DOME_POS: Vec3 = [0, 70, 290];
export const EYE: Vec3 = [0, 1.6, 0];

const BASE_EASE = 0.05;

function setTarget(s: Partial<CamState>, instant = false) {
  if (s.pos) rig.tgt.pos = [...s.pos];
  if (s.yaw !== undefined) rig.tgt.yaw = nearestAngle(s.yaw, rig.cur.yaw);
  if (s.pitch !== undefined) rig.tgt.pitch = s.pitch;
  if (s.fov !== undefined) rig.tgt.fov = s.fov;
  if (instant) {
    rig.cur = { pos: [...rig.tgt.pos], yaw: rig.tgt.yaw, pitch: rig.tgt.pitch, fov: rig.tgt.fov };
  }
}

/** Resolves when the eased camera is within tolerance of the target (or after maxMs). */
function settle(maxMs = 2200): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    // rAF stalls in background tabs: never let a transition hang on it
    window.setTimeout(resolve, maxMs + 100);
    const tick = () => {
      const c = rig.cur;
      const t = rig.tgt;
      const d = Math.hypot(c.pos[0] - t.pos[0], c.pos[1] - t.pos[1], c.pos[2] - t.pos[2]) + Math.abs(c.yaw - t.yaw) * 20 + Math.abs(c.pitch - t.pitch) * 20 + Math.abs(c.fov - t.fov) * 0.2;
      if (d < 0.5 || performance.now() - t0 > maxMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const frames = (n = 2) => new Promise<void>((r) => {
  window.setTimeout(r, 120 + n * 30);
  const step = () => (--n <= 0 ? r() : requestAnimationFrame(step));
  requestAnimationFrame(step);
});

/** Animate rig.dive (star streak) to `to` over `ms`. */
function tweenDive(to: number, ms: number) {
  const from = rig.dive;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    rig.dive = from + (to - from) * (1 - Math.pow(1 - k, 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Where the camera looks to frame `obj`, and (from the dome) how far it travels toward it. */
function viewFor(obj: SkyObject, from: CamState): CamState {
  const outside = Math.hypot(...from.pos) > 120;
  const pos: Vec3 = outside
    ? [from.pos[0] + (obj.world[0] - from.pos[0]) * 0.45, from.pos[1] + (obj.world[1] - from.pos[1]) * 0.45, from.pos[2] + (obj.world[2] - from.pos[2]) * 0.45]
    : [...from.pos];
  const dir: Vec3 = [obj.world[0] - pos[0], obj.world[1] - pos[1], obj.world[2] - pos[2]];
  const { yaw, pitch } = dirToYawPitch(dir);
  const fov = obj.kind === 'moon' || obj.kind === 'sun' ? 12 : obj.kind === 'landmark' ? 24 : 14;
  return { pos, yaw, pitch, fov };
}

interface Saved {
  cam: CamState;
  phase: Phase;
  station: StationName;
}

let saved: Saved | null = null;
let busy = false;
let pendingBack = false;
let navigate: (path: string) => void = (p) => {
  window.history.pushState(null, '', p);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
const onModulePath = () => isModulePath(window.location.pathname);

export const Director = {
  /** The HUD hands over the router's navigate (so non-React code can change pages). */
  registerNavigate(fn: (path: string) => void) {
    navigate = fn;
  },

  get busy() {
    return busy;
  },

  station(name: StationName, opts: { instant?: boolean; yaw?: number; pitch?: number; fov?: number } = {}): Promise<void> {
    rig.station = name;
    if (name === 'dome') {
      const dir: Vec3 = [-DOME_POS[0], -DOME_POS[1], -DOME_POS[2]];
      const { yaw, pitch } = dirToYawPitch(dir);
      setTarget({ pos: DOME_POS, yaw: opts.yaw ?? yaw, pitch: opts.pitch ?? pitch, fov: opts.fov ?? 50 }, opts.instant);
    } else if (name === 'intro') {
      setTarget({ pos: EYE, yaw: opts.yaw ?? rig.cur.yaw, pitch: opts.pitch ?? 6 * D, fov: opts.fov ?? 38 }, opts.instant);
    } else {
      setTarget({ pos: EYE, yaw: opts.yaw ?? rig.tgt.yaw, pitch: opts.pitch ?? 24 * D, fov: opts.fov ?? 62 }, opts.instant);
    }
    return opts.instant ? Promise.resolve() : settle();
  },

  /**
   * Dive (§7.6) toward `obj`, then land on `route` (default obj.route).
   * 0–600 ms the look eases onto the object and the FOV narrows; from 400 ms ink floods out of
   * `screenPt` until it covers; then navigate, the page mounts under the ink, and the ink clears.
   * From a module page (chapter → chapter) there is no flight: ink, navigate, ink.
   */
  async diveTo(obj: SkyObject, screenPt: { x: number; y: number } = centre(), route = obj.route): Promise<void> {
    if (!route || busy) return;
    busy = true;
    const s = app();
    const fromModule = s.phase === 'module' || onModulePath();
    try {
      if (!fromModule) saved = { cam: { pos: [...rig.tgt.pos], yaw: rig.tgt.yaw, pitch: rig.tgt.pitch, fov: rig.tgt.fov }, phase: s.phase === 'dome' ? 'dome' : 'sky', station: rig.station };
      s.setTimeFrozen(true);
      const view = viewFor(obj, rig.cur);
      if (s.reducedMotion) {
        await inkFade(1, 150);
        setTarget(view, true);
        navigate(route);
        app().setPhase('module');
        await frames(2);
        await inkFade(0, 150);
      } else if (fromModule) {
        cue('whoosh');
        await inkClose(screenPt.x, screenPt.y, 520);
        setTarget(view, true);
        navigate(route);
        app().setPhase('module');
        await frames(3);
        await inkOpen(560);
      } else {
        cue('whoosh');
        s.setPhase('diving');
        rig.station = 'sky';
        rig.ease = 0.012;
        setTarget(view);
        tweenDive(1, 600);
        await wait(400);
        await inkClose(screenPt.x, screenPt.y, 700);
        navigate(route);
        app().setPhase('module');
        rig.dive = 0;
        rig.ease = BASE_EASE;
        await frames(3);
        await wait(60);
        await inkOpen(620);
      }
    } finally {
      rig.ease = BASE_EASE;
      rig.dive = 0;
      app().setTimeFrozen(false);
      busy = false;
    }
    if (pendingBack) {
      pendingBack = false;
      void Director.back();
    }
  },

  /**
   * Reverse a dive: ink closes over the page, the page unmounts, the camera flies back to the exact
   * saved orientation + FOV while the ink clears. `to: 'dome'` returns home (chapter 一) instead.
   * Safe to call after something else already navigated to '/'.
   */
  async back(opts: { to?: 'saved' | 'dome' } = {}): Promise<void> {
    if (busy) {
      pendingBack = true;
      return;
    }
    busy = true;
    const s = app();
    const onPage = onModulePath();
    const home = opts.to === 'dome' || !saved ? (opts.to === 'dome' || s.phase === 'dome' ? 'dome' : 'sky') : null;
    const restore = () => {
      if (home === 'dome' || (!home && saved?.phase === 'dome')) app().setPhase('dome');
      else app().setPhase('sky');
      if (home) {
        void Director.station(home, { instant: s.reducedMotion });
      } else if (saved) {
        rig.station = saved.station;
        setTarget(saved.cam, s.reducedMotion);
      }
      saved = null;
    };
    try {
      s.setTimeFrozen(true);
      if (s.reducedMotion) {
        if (onPage) await inkFade(1, 150);
        if (onPage) navigate('/');
        restore();
        await frames(2);
        await inkFade(0, 150);
      } else {
        cue('whooshReverse');
        if (onPage) {
          const c = centre();
          await inkClose(c.x, c.y, 460);
          navigate('/');
        }
        rig.ease = 0.02;
        restore();
        await frames(2);
        // release as soon as the ink has cleared; the camera keeps easing home (any input interrupts it)
        await Promise.all([inkOpen(700), settle(700)]);
      }
    } finally {
      rig.ease = BASE_EASE;
      app().setTimeFrozen(false);
      busy = false;
    }
  },

  /** Eased look at a direction (any length) with optional FOV. */
  lookAt(dir: Vec3, fov?: number): void {
    const { yaw, pitch } = dirToYawPitch(dir);
    setTarget({ yaw, pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch)), ...(fov ? { fov } : {}) });
  },

  /** Drag-look in the sky (pixels). k scales with FOV so zoomed-in drags stay precise (demo math). */
  drag(dx: number, dy: number) {
    const k = (rig.tgt.fov / 62) * 0.0045;
    rig.tgt.yaw -= dx * k;
    rig.tgt.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, rig.tgt.pitch + dy * k));
  },

  zoom(deltaY: number) {
    rig.tgt.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, rig.tgt.fov + deltaY * 0.03));
  },

  set: setTarget,
  get savedView() {
    return saved?.cam ?? null;
  },
};

export default Director;
