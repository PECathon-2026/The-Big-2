/**
 * Shooting stars from the radiant of tonight's most active shower (/api/scroll/meteors). Each streak
 * runs along a great circle away from the real radiant. The spawn rate is the real hourly rate from
 * this place at sky time × METEOR_SCALE (with a floor so a weak shower still shows one now and then);
 * the overlay label states the real rate and the speed-up. Off with reduced motion.
 */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { R } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { app } from '@/state/store';
import { eqToWorld, tokColor } from './shared';
import { METEOR_SCALE, showerRateAt, skyData } from './skyData';

export const meteorStats = { shownPerHour: 0 };

const POOL = 4;
const rad = new Float32Array(3);

interface Streak {
  t: number; // 0..1, ≥1 idle
  dur: number;
  a0: number;
  len: number;
  tail: number;
  p: THREE.Vector3;
}

export default function Meteors() {
  const { lines, streaks } = useMemo(() => {
    const head = tokColor('--kinu');
    const lines: THREE.Line[] = [];
    const streaks: Streak[] = [];
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const c = new Float32Array([head.r, head.g, head.b, 0, 0, 0]);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const l = new THREE.Line(g, m);
      l.frustumCulled = false;
      l.visible = false;
      lines.push(l);
      streaks.push({ t: 1, dur: 0.8, a0: 0, len: 0, tail: 0, p: new THREE.Vector3() });
    }
    return { lines, streaks };
  }, []);

  // seconds until the next streak; counts down only while the open sky shows (no backlog at arrival)
  const clock = useMemo(() => ({ wait: 10 }), []);
  const r = new THREE.Vector3();
  const q = new THREE.Vector3();

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.1, dtRaw);
    const s = app();
    const m = skyData.shower;
    // Never during the intro: the petals' landing on the stars is the only motion there.
    const active = m && !s.reducedMotion && (s.phase === 'sky' || s.phase === 'dome');
    let perHour = 0;
    if (m) {
      eqToWorld(skyClock.eqMatrix.elements, m.eq[0], m.eq[1], m.eq[2], rad, 0, 1);
      const real = showerRateAt(m, skyClock.date.getTime());
      perHour = real > 0 ? Math.min(900, Math.max(60, real * METEOR_SCALE)) : 0;
    }
    meteorStats.shownPerHour = perHour;
    const dark = skyClock.palette.starFade;
    if (active) clock.wait -= dt;
    if (active && perHour > 0 && rad[1] > 0 && dark > 0.3 && clock.wait <= 0) {
      // exponential waiting time at the shown rate
      clock.wait = (-Math.log(1 - Math.random()) * 3600) / perHour;
      const k = streaks.findIndex((x) => x.t >= 1);
      if (k >= 0) {
        const st = streaks[k];
        r.set(rad[0], rad[1], rad[2]);
        st.p.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).addScaledVector(r, -0).cross(r).normalize();
        st.a0 = (8 + Math.random() * 30) * (Math.PI / 180);
        st.len = (8 + Math.random() * 12) * (Math.PI / 180);
        st.tail = (3 + Math.random() * 4) * (Math.PI / 180);
        st.dur = 0.55 + Math.random() * 0.5;
        st.t = 0;
        // never start below the horizon
        q.copy(r).multiplyScalar(Math.cos(st.a0)).addScaledVector(st.p, Math.sin(st.a0));
        if (q.y < 0.05) st.t = 1;
      }
    } else if (clock.wait < 0) clock.wait = 0.5;

    for (let i = 0; i < POOL; i++) {
      const st = streaks[i];
      const l = lines[i];
      if (st.t >= 1) {
        l.visible = false;
        continue;
      }
      st.t += dt / st.dur;
      l.visible = true;
      r.set(rad[0], rad[1], rad[2]);
      const a = st.a0 + st.len * Math.min(1, st.t);
      const pos = l.geometry.attributes.position as THREE.BufferAttribute;
      q.copy(r).multiplyScalar(Math.cos(a)).addScaledVector(st.p, Math.sin(a)).normalize().multiplyScalar(R * 0.95);
      pos.setXYZ(0, q.x, q.y, q.z);
      const b = Math.max(st.a0, a - st.tail);
      q.copy(r).multiplyScalar(Math.cos(b)).addScaledVector(st.p, Math.sin(b)).normalize().multiplyScalar(R * 0.95);
      pos.setXYZ(1, q.x, q.y, q.z);
      pos.needsUpdate = true;
      (l.material as THREE.LineBasicMaterial).opacity = Math.sin(Math.min(1, st.t) * Math.PI) * 0.95 * dark;
    }
  });

  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </>
  );
}
