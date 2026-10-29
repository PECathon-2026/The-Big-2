/**
 * Coordinate conventions (AGENT_BRIEF §6.4) — everyone uses these.
 * Horizontal frame: x = east, y = up, −z = north. Sky sphere radius R = 100. Observer at the origin.
 */
import { SiderealTime } from 'astronomy-engine';

export const R = 100;
export const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];

/** Local apparent sidereal time in degrees. */
export function lstDeg(date: Date, lonDeg: number): number {
  const gast = SiderealTime(date) * 15; // hours → degrees
  return (((gast + lonDeg) % 360) + 360) % 360;
}

/** RA/Dec (degrees) → unit vector in the horizontal frame. Same maths as the demo's eqToVec. */
export function eqToHorizontal(raDeg: number, decDeg: number, latDeg: number, lst: number): Vec3 {
  const H = (lst - raDeg) * DEG;
  const d = decDeg * DEG;
  const lat = latDeg * DEG;
  const up = Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(lat) * Math.cos(H);
  const n = Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.sin(lat) * Math.cos(H);
  const e = -Math.cos(d) * Math.sin(H);
  return [e, up, -n];
}

/** Writes R-scaled positions for many RA/Dec pairs into `out` (xyz triples). */
export function eqArrayToWorld(radec: ArrayLike<number>, stride: number, count: number, latDeg: number, lst: number, out: Float32Array, radius = R): Float32Array {
  const lat = latDeg * DEG;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  for (let i = 0; i < count; i++) {
    const ra = radec[i * stride];
    const dec = radec[i * stride + 1] * DEG;
    const H = (lst - ra) * DEG;
    const sd = Math.sin(dec);
    const cd = Math.cos(dec);
    const cH = Math.cos(H);
    out[i * 3] = -cd * Math.sin(H) * radius;
    out[i * 3 + 1] = (sd * sl + cd * cl * cH) * radius;
    out[i * 3 + 2] = -(sd * cl - cd * sl * cH) * radius;
  }
  return out;
}

/** RA/Dec (degrees) → equatorial cartesian unit vector (x → RA 0h, z → north celestial pole). */
export function raDecToEquatorial(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(ra), Math.cos(d) * Math.sin(ra), Math.sin(d)];
}

/**
 * Row-major 3×3 rotation taking equatorial cartesian vectors to the horizontal frame (§6.4).
 * Lets the sky be ONE static geometry inside a group whose matrix changes with time — scrubbing
 * time is a matrix update, not a buffer rewrite. Equivalent to eqToHorizontal.
 */
export function eqToHorizontalMatrix(latDeg: number, lst: number): number[] {
  const l = lst * DEG;
  const p = latDeg * DEG;
  const sl = Math.sin(l), cl = Math.cos(l), sp = Math.sin(p), cp = Math.cos(p);
  return [
    -sl, cl, 0,
    cp * cl, cp * sl, sp,
    sp * cl, sp * sl, -cp,
  ];
}

/** Altitude/azimuth (degrees, azimuth from north through east) → unit vector. */
export function altAzToVec(altDeg: number, azDeg: number): Vec3 {
  const a = altDeg * DEG;
  const z = azDeg * DEG;
  return [Math.cos(a) * Math.sin(z), Math.sin(a), -Math.cos(a) * Math.cos(z)];
}

/** Unit (or any) vector → altitude/azimuth in degrees. */
export function vecToAltAz(v: Vec3): { alt: number; az: number } {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const alt = Math.asin(v[1] / len) / DEG;
  const az = ((Math.atan2(v[0], -v[2]) / DEG) % 360 + 360) % 360;
  return { alt, az };
}

/** Vector → camera yaw/pitch in radians (yaw 0 = north, +east), matching the demo's camera. */
export function dirToYawPitch(v: Vec3): { yaw: number; pitch: number } {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return { yaw: Math.atan2(v[0], -v[2]), pitch: Math.asin(v[1] / len) };
}

/** Camera yaw/pitch (radians) → unit look direction. */
export function yawPitchToDir(yaw: number, pitch: number): Vec3 {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/** Shortest-path target for an angle (radians) so easing never spins the long way round. */
export function nearestAngle(target: number, current: number): number {
  let d = target - current;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return current + d;
}

/** Time-based damping factor (§5.3): ~95% of the way per second. */
export const damp = (dt: number, base = 0.05) => 1 - Math.pow(base, dt);

/** Round coordinates to 2 decimals before they leave the device (§6.4). */
export const round2 = (x: number) => Math.round(x * 100) / 100;

export const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass16 = (az: number) => COMPASS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
