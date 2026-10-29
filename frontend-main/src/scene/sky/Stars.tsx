/**
 * The real star field: 5,044 catalogue stars (d3-celestial, to mag 6) in ONE static equatorial
 * geometry. The group's matrix is skyClock.eqMatrix, so time scrubbing is a matrix copy — no per-star
 * CPU work per frame. Colour from B−V (Ballesteros + blackbody, desaturated), size from magnitude,
 * twinkle stronger near the horizon, extinction below ~8°, daylight fade from the Sun's altitude.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STAR_STRIDE, bvToRgb, type Catalog } from '@/astro/catalog';
import { R, raDecToEquatorial } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { rig } from '@/scene/Director';
import { app } from '@/state/store';
import { outside } from './shared';

export const starVS = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aTw; attribute float aMag;
  uniform float uTime; uniform float uDpr; uniform float uFade; uniform float uLimMag; uniform float uScale;
  uniform float uTwinkle; uniform float uField; uniform float uOutside;
  varying vec3 vColor; varying float vAlpha; varying float vCore;
  void main(){
    vec4 world = modelMatrix * vec4(position, 1.0);
    float alt = world.y / length(world.xyz);
    // atmospheric extinction: dim and warm below ~8°, gone at the horizon (not when seen from outside)
    float ext = mix(smoothstep(-0.004, 0.14, alt), step(0.0, alt), uOutside);
    float horizon = 1.0 - smoothstep(0.0, 0.5, alt);
    float tw = 1.0 + uTwinkle * (0.10 + 0.22 * horizon) * sin(uTime * (1.7 + aTw * 2.3) + aTw * 31.0) * sin(uTime * (0.9 + aTw) + aTw * 7.0);
    float lim = smoothstep(uLimMag + 0.5, uLimMag - 0.5, aMag);
    float bright = clamp(1.35 - aMag * 0.12, 0.55, 1.0);
    vAlpha = ext * lim * uFade * bright * tw;
    vec3 c = mix(aColor, aColor * vec3(1.0, 0.86, 0.72), horizon * horizon * (1.0 - uOutside));
    vColor = mix(c, vec3(dot(c, vec3(0.33)) * 1.3, 0.05, 0.03), uField);
    vCore = clamp((2.0 - aMag) * 0.35, 0.0, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uDpr * uScale * (0.94 + 0.06 * tw);
    if (alt < 0.0 || vAlpha < 0.004) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
  }`;

export const starFS = /* glsl */ `
  varying vec3 vColor; varying float vAlpha; varying float vCore;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    if (d > 1.0) discard;
    float halo = pow(1.0 - d, 2.4);
    float core = smoothstep(0.32, 0.0, d);
    // faint four-point glint on the brightest stars (ink-brush sparkle, never neon)
    float glint = vCore * 0.35 * (smoothstep(0.06, 0.0, abs(p.x)) + smoothstep(0.06, 0.0, abs(p.y))) * (1.0 - d);
    float a = halo * 1.25 + core * 0.7 + glint;
    gl_FragColor = vec4(vColor * (1.0 + core * 0.4), a * vAlpha);
    #include <colorspace_fragment>
  }`;

const tmpC = new THREE.Color();

export default function Stars({ cat }: { cat: Catalog }) {
  const group = useRef<THREE.Group>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const { geometry, material } = useMemo(() => {
    const n = cat.starCount;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), tw = new Float32Array(n), mag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = cat.stars[i * STAR_STRIDE], dec = cat.stars[i * STAR_STRIDE + 1], m = cat.stars[i * STAR_STRIDE + 2], bv = cat.stars[i * STAR_STRIDE + 3];
      const v = raDecToEquatorial(ra, dec);
      pos[i * 3] = v[0] * R;
      pos[i * 3 + 1] = v[1] * R;
      pos[i * 3 + 2] = v[2] * R;
      tmpC.setRGB(...bvToRgb(bv), THREE.SRGBColorSpace);
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
      size[i] = Math.min(12, Math.max(1.6, 9.4 - 1.55 * m));
      tw[i] = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
      mag[i] = m;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.01);
    const mat = new THREE.ShaderMaterial({
      vertexShader: starVS,
      fragmentShader: starFS,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uFade: { value: 1 },
        uLimMag: { value: 6.5 },
        uScale: { value: 1 },
        uTwinkle: { value: 1 },
        uField: { value: 0 },
        uOutside: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: mat };
  }, [cat]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.matrix.copy(skyClock.eqMatrix);
    g.matrixWorldNeedsUpdate = true;
    const s = app();
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uTwinkle.value = s.reducedMotion ? 0 : 1;
    u.uDpr.value = dpr;
    const out = outside();
    u.uOutside.value = out;
    // from outside the dome the captured night sky stays visible whatever the Sun does (it is the glass's content)
    u.uFade.value = THREE.MathUtils.lerp(skyClock.palette.starFade, Math.max(skyClock.palette.starFade, 0.85), out);
    u.uLimMag.value = THREE.MathUtils.lerp(skyClock.palette.limitingMag, Math.max(skyClock.palette.limitingMag, 5.6), out);
    u.uField.value = s.field ? 1 : 0;
    // keep stars readable when the camera pulls out to the dome; slightly larger when zoomed in
    const dist = Math.hypot(rig.cur.pos[0], rig.cur.pos[1], rig.cur.pos[2]);
    u.uScale.value = THREE.MathUtils.clamp(1 - dist / 700, 0.55, 1) * (62 / Math.max(12, rig.cur.fov)) ** 0.3;
  });

  return (
    <group ref={group} matrixAutoUpdate={false}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-5} />
    </group>
  );
}
