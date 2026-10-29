/**
 * The Director: the ONLY thing that moves the camera (§6.3). Owned by workstream C after Phase 0.
 *
 * The camera state is { pos, yaw, pitch, fov } with targets; `CameraRig` (CanvasRoot) eases the
 * current values toward the targets every frame with time-based damping, so any new input interrupts
 * a move. yaw 0 = north, +east; pitch up. The dome view is just a far position looking at the origin.
 */
import { dirToYawPitch, nearestAngle, type Vec3 } from '@/astro/coords';
import { app, type SkyObject } from '@/state/store';

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

let saved: CamState | null = null;

export const Director = {
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
   * Dive (§7.6): flight toward the object + ink flood, then navigate(route).
   * Phase-0 skeleton: eases onto the object and narrows the FOV, then resolves. C adds the ink flood
   * and the navigation hand-off (see hud/InkFlood).
   */
  async diveTo(obj: SkyObject, _screenPt: { x: number; y: number }): Promise<void> {
    saved = { pos: [...rig.tgt.pos], yaw: rig.tgt.yaw, pitch: rig.tgt.pitch, fov: rig.tgt.fov };
    const s = app();
    s.setTimeFrozen(true);
    s.setPhase('diving');
    const { yaw, pitch } = dirToYawPitch(obj.world);
    if (s.reducedMotion) setTarget({ yaw, pitch, fov: 20 }, true);
    else setTarget({ yaw, pitch, fov: 14 });
    await settle(900);
  },

  /** Reverse flight to the orientation saved before the last dive. */
  async back(): Promise<void> {
    const s = app();
    if (saved) setTarget(saved, s.reducedMotion);
    saved = null;
    s.setTimeFrozen(false);
    await settle(1400);
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
    return saved;
  },
};

export default Director;
