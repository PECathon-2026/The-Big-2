/**
 * PHASE-0 PLACEHOLDER (lead) — workstream A owns scene/sky/ and replaces this.
 * Real catalogue stars in ONE static equatorial geometry, rotated by skyClock.eqMatrix; a lit Moon
 * from the real Sun direction; Sun disc; ground and ink ridges from the demo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { loadCatalog, STAR_STRIDE, bvToRgb, HIP_POLARIS, type Catalog } from '@/astro/catalog';
import { R, raDecToEquatorial, type Vec3 } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { rig } from '@/scene/Director';
import { fbm1, n1 } from '@/scene/noise';
import { app } from '@/state/store';

const starVS = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aTw; attribute float aMag;
  uniform float uTime; uniform float uDpr; uniform float uFade; uniform float uLimMag; uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vec4 world = modelMatrix * vec4(position, 1.0);
    float alt = world.y / length(world.xyz);
    float ext = smoothstep(-0.005, 0.14, alt);           // extinction below ~8°
    float tw = 0.82 + 0.18 * sin(uTime * (1.6 + aTw * 1.4) + aTw * 6.2832) * (1.0 + (1.0 - alt) * 0.8);
    float lim = smoothstep(uLimMag + 0.6, uLimMag - 0.4, aMag);
    vAlpha = ext * lim * uFade * tw;
    vColor = aColor;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uDpr * uScale * (0.92 + 0.08 * tw);
    if (alt < 0.0 || vAlpha < 0.003) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
  }`;
const starFS = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 2.2);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }`;

function Stars({ cat }: { cat: Catalog }) {
  const group = useRef<THREE.Group>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const { geometry, material } = useMemo(() => {
    const n = cat.starCount;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), tw = new Float32Array(n), mag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = cat.stars[i * STAR_STRIDE], dec = cat.stars[i * STAR_STRIDE + 1], m = cat.stars[i * STAR_STRIDE + 2], bv = cat.stars[i * STAR_STRIDE + 3];
      const v = raDecToEquatorial(ra, dec);
      pos.set([v[0] * R, v[1] * R, v[2] * R], i * 3);
      col.set(bvToRgb(bv), i * 3);
      size[i] = Math.min(12, Math.max(1.6, 9.4 - 1.55 * m));
      tw[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      mag[i] = m;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: starVS,
      fragmentShader: starFS,
      uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uFade: { value: 1 }, uLimMag: { value: 6.5 }, uScale: { value: 1 } },
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
    const u = material.uniforms;
    u.uTime.value = app().reducedMotion ? 0 : state.clock.elapsedTime;
    u.uDpr.value = dpr;
    u.uFade.value = skyClock.palette.starFade;
    u.uLimMag.value = skyClock.palette.limitingMag;
    // keep stars readable when the camera pulls out to the dome
    const dist = Math.hypot(...rig.cur.pos);
    u.uScale.value = THREE.MathUtils.clamp(1 - dist / 700, 0.55, 1) * (62 / Math.max(30, rig.cur.fov)) ** 0.25;
  });

  return (
    <group ref={group} matrixAutoUpdate={false}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

function MoonAndSun() {
  const moon = useRef<THREE.Mesh>(null);
  const sun = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const md = skyClock.moon.dir, sd = skyClock.sun.dir;
    moon.current?.position.set(md[0] * R * 0.92, md[1] * R * 0.92, md[2] * R * 0.92);
    sun.current?.position.set(sd[0] * R * 0.95, sd[1] * R * 0.95, sd[2] * R * 0.95);
    if (sun.current) {
      sun.current.visible = sd[1] > -0.02;
      sun.current.lookAt(0, 0, 0);
    }
    if (moon.current) moon.current.visible = md[1] > -0.02;
    if (light.current && moon.current) {
      // light the Moon from the real Sun direction: phase is automatic
      light.current.position.set(moon.current.position.x + sd[0] * 50, moon.current.position.y + sd[1] * 50, moon.current.position.z + sd[2] * 50);
      light.current.target = moon.current;
    }
  });
  return (
    <>
      <mesh ref={moon}>
        {/* ~3× real angular size for presence — stated on /science */}
        <sphereGeometry args={[2.1, 48, 48]} />
        <meshLambertMaterial color="#f3ead6" />
      </mesh>
      <directionalLight ref={light} intensity={2.2} />
      <ambientLight intensity={0.04} />
      <mesh ref={sun}>
        <circleGeometry args={[2.6, 48]} />
        <meshBasicMaterial color="#C8372D" side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function Ridges() {
  const meshes = useMemo(() => {
    const mk = (rad: number, base: number, amp: number, color: number, seed: number) => {
      const N = 360, pos = new Float32Array(N * 2 * 3), idx: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const h = base + amp * (fbm1((i / N) * 14 + seed, 4) - 0.35) * 2 + Math.max(0, n1((i / N) * 5 + seed * 3) - 0.6) * amp * 2.6;
        const x = Math.sin(a) * rad, z = -Math.cos(a) * rad;
        pos.set([x, h, z], i * 6);
        pos.set([x, -4, z], i * 6 + 3);
        const j = (i + 1) % N;
        idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      return { g, color };
    };
    return [mk(95, 7, 9, 0x1a1c2a, 2.1), mk(62, 5, 7, 0x10111b, 5.7), mk(34, 2.6, 4.2, 0x08080d, 9.3)];
  }, []);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.6}>
        <circleGeometry args={[100, 64]} />
        <meshBasicMaterial color={0x050508} />
      </mesh>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.g}>
          <meshBasicMaterial color={m.color} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

/** Publishes a few SkyObjects so HUD / Director can be built against real positions. A replaces this with full picking. */
function PublishPlaceholderObjects({ cat }: { cat: Catalog }) {
  useFrame(() => {
    if (skyClock.version % 30 !== 1) return;
    const m = skyClock.eqMatrix;
    const toWorld = (ra: number, dec: number): Vec3 => {
      const v = new THREE.Vector3(...raDecToEquatorial(ra, dec)).multiplyScalar(R).applyMatrix4(m);
      return [v.x, v.y, v.z];
    };
    const pi = cat.indexOfHip.get(HIP_POLARIS);
    const m42 = cat.dsos.find((d) => d.id === 'M42');
    const md = skyClock.moon.dir;
    app().publishObjects([
      { kind: 'moon', id: 'moon', name: 'Moon', route: '/scroll#moon', world: [md[0] * R, md[1] * R, md[2] * R] },
      ...(pi !== undefined ? [{ kind: 'star' as const, id: 'polaris', name: 'Polaris', jp: '北極星', route: '/honor', world: toWorld(cat.stars[pi * STAR_STRIDE], cat.stars[pi * STAR_STRIDE + 1]) }] : []),
      ...(m42 ? [{ kind: 'dso' as const, id: 'M42', name: 'Orion Nebula', route: '/lens?target=M42', world: toWorld(m42.ra, m42.dec) }] : []),
    ]);
  });
  return null;
}

export default function SkyLayer() {
  const [cat, setCat] = useState<Catalog | null>(null);
  useEffect(() => {
    loadCatalog().then(setCat).catch(console.error);
  }, []);
  return (
    <>
      {cat && <Stars cat={cat} />}
      {cat && <PublishPlaceholderObjects cat={cat} />}
      <MoonAndSun />
      <Ridges />
    </>
  );
}
