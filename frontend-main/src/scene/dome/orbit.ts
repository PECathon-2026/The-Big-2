/** Dome orbit state shared by DomeLayer (camera) and DomeOverlay (CTA). */
import { Director, rig } from '@/scene/Director';
import { app } from '@/state/store';

export const orbit = {
  theta: 0,
  phi: Math.atan2(70, 290),
  vTheta: 0,
  vPhi: 0,
  lastInput: 0,
  syncFromRig: true,
  /** 0..1 glass shimmer when the camera passes through */
  flash: 0,
  prevDist: 999,
  dragging: false,
};

/** "Enter your sky": fly back to the origin through the glass, facing the way we were looking. */
export function enterSky() {
  const s = app();
  if (s.phase !== 'dome') return;
  s.setPhase('sky');
  Director.station('sky', { yaw: rig.cur.yaw, pitch: 24 * (Math.PI / 180) });
}
