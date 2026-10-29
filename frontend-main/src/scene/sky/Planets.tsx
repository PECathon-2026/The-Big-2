/**
 * Naked-eye planets at their astronomy-engine positions (cross-checked against /api/scroll/planets:
 * within 0.05°). Small warm discs sized by real magnitude; labels (jp + Latin) are in the overlay.
 */
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { R } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { app } from '@/state/store';
import { outside, tokColor } from './shared';
import { starFS, starVS } from './Stars';

const TINT: Record<string, string> = { Mercury: '--washi-2', Venus: '--moon-warm', Mars: '--sun-1', Jupiter: '--kinu', Saturn: '--gold-accent' };

export default function Planets() {
  const dpr = useThree((s) => s.viewport.dpr);
  const { geo, mat } = useMemo(() => {
    const n = skyClock.planets.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aTw', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aMag', new THREE.BufferAttribute(new Float32Array(n), 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: starVS,
      fragmentShader: starFS,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uFade: { value: 1 },
        uLimMag: { value: 6.5 },
        uScale: { value: 1 },
        uTwinkle: { value: 0 }, // planets don't twinkle
        uField: { value: 0 },
        uOutside: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo: g, mat: m };
  }, []);
  const c = new THREE.Color();
  let lastV = -1;
  useFrame(() => {
    const u = mat.uniforms;
    u.uDpr.value = dpr;
    const out = outside();
    u.uOutside.value = out;
    u.uFade.value = THREE.MathUtils.lerp(Math.max(0.35, skyClock.palette.starFade), 0.9, out);
    u.uLimMag.value = skyClock.palette.limitingMag + 1.5;
    u.uField.value = app().field ? 1 : 0;
    if (skyClock.version === lastV) return;
    lastV = skyClock.version;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.aColor as THREE.BufferAttribute;
    const size = geo.attributes.aSize as THREE.BufferAttribute;
    const mag = geo.attributes.aMag as THREE.BufferAttribute;
    skyClock.planets.forEach((p, i) => {
      pos.setXYZ(i, p.dir[0] * R * 0.97, p.dir[1] * R * 0.97, p.dir[2] * R * 0.97);
      tokColor(TINT[p.name] ?? '--kinu', c);
      col.setXYZ(i, c.r, c.g, c.b);
      size.setX(i, Math.min(14, Math.max(4, 10.5 - 1.6 * p.mag)));
      mag.setX(i, p.mag);
    });
    pos.needsUpdate = col.needsUpdate = size.needsUpdate = mag.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-4} />;
}
