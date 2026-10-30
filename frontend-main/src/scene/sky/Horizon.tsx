/**
 * Horizon and ground (demo's ridges, seamless): three ink ridge rings whose heights come from noise
 * sampled on a circle (so there is no wrap seam at north), aerial haze toward the real horizon colour,
 * a low mist band, the ground disc and a crimson torii. These are also the floating island's ridges
 * when seen from outside the dome.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm2, n2 } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';
import { landmarks, tokColor } from './shared';
import { intro, sceneryOpacity } from '@/scene/intro/introBus';

interface RidgeDef {
  rad: number;
  base: number;
  amp: number;
  seed: number;
  ink: string;
  haze: number;
}
const RIDGES: RidgeDef[] = [
  { rad: 95, base: 7, amp: 9, seed: 2.1, ink: '--indigo', haze: 0.55 },
  { rad: 62, base: 5, amp: 7, seed: 5.7, ink: '--ink', haze: 0.3 },
  { rad: 34, base: 2.6, amp: 4.2, seed: 9.3, ink: '--sumi', haze: 0.12 },
];

/** Ridge height at azimuth a (radians) — periodic in a, so the ring closes without a seam. */
export function ridgeHeight(r: RidgeDef, a: number): number {
  const cx = Math.sin(a), cz = Math.cos(a);
  const k1 = 2.2, k2 = 0.8;
  const body = fbm2(cx * k1 + r.seed * 7.1, cz * k1 + r.seed * 3.3, 4);
  const peak = n2(cx * k2 + r.seed * 11.7, cz * k2 + r.seed * 5.9);
  return r.base + r.amp * (body - 0.35) * 2 + Math.max(0, peak - 0.6) * r.amp * 2.6;
}

function ridgeGeometry(r: RidgeDef): THREE.BufferGeometry {
  const N = 480;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const shade = new Float32Array((N + 1) * 2);
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const h = ridgeHeight(r, a);
    const x = Math.sin(a) * r.rad, z = -Math.cos(a) * r.rad;
    pos.set([x, h, z], i * 6);
    pos.set([x, -4, z], i * 6 + 3);
    shade[i * 2] = 1;
    shade[i * 2 + 1] = 0;
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTop', new THREE.BufferAttribute(shade, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const ridgeVS = /* glsl */ `
  attribute float aTop; varying float vTop; varying float vY;
  void main(){ vTop = aTop; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ridgeFS = /* glsl */ `
  uniform vec3 uInk; uniform vec3 uHaze; uniform float uHazeK; uniform vec3 uRim; uniform float uRimK;
  varying float vTop; varying float vY;
  void main(){
    // ink wash: lighter (hazier) toward the crest, darker at the foot — like a sumi-e ridge
    float crest = smoothstep(0.55, 1.0, vTop);
    vec3 col = mix(uInk, uHaze, uHazeK * (0.35 + 0.65 * crest));
    col += uRim * uRimK * smoothstep(0.985, 1.0, vTop);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const mistVS = /* glsl */ `
  varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const mistFS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
  void main(){
    float band = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
    float wisp = 0.75 + 0.25 * sin(vUv.x * 62.0 + uTime * 0.05) * sin(vUv.x * 23.0 - uTime * 0.03);
    gl_FragColor = vec4(uColor, band * wisp * uOpacity);
    #include <colorspace_fragment>
  }`;

function Torii() {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: tokColor('--crimson-deep') }), []);
  const parts = useMemo(() => {
    const box = (w: number, h: number, d: number, x: number, y: number, rz = 0) => ({ g: new THREE.BoxGeometry(w, h, d), p: [x, y, 0] as const, rz });
    return [
      { g: new THREE.CylinderGeometry(0.22, 0.28, 5.2, 10), p: [-1.9, 2.6, 0] as const, rz: -0.03 },
      { g: new THREE.CylinderGeometry(0.22, 0.28, 5.2, 10), p: [1.9, 2.6, 0] as const, rz: 0.03 },
      box(6.2, 0.36, 0.5, 0, 5.3),
      box(5.4, 0.22, 0.42, 0, 4.95),
      box(5.2, 0.24, 0.3, 0, 4.1),
      box(0.5, 0.9, 0.2, 0, 4.55),
      box(0.7, 0.36, 0.5, -3.3, 5.45, 0.18),
      box(0.7, 0.36, 0.5, 3.3, 5.45, -0.18),
    ];
  }, []);
  let lastV = -1;
  useFrame(() => {
    if (skyClock.version === lastV) return;
    lastV = skyClock.version;
    // lacquer crimson that reads as a silhouette at night and as vermilion by day
    tokColor('--crimson-deep', mat.color).lerp(tokColor('--crimson', tmpCol), skyClock.palette.daylight);
  });
  return (
    <group
      ref={(g) => {
        ref.current = g;
        if (g) landmarks.set('torii', g);
        else landmarks.delete('torii');
      }}
      position={[2.2, -0.5, 24]}
      rotation-y={-0.15}
      scale={0.9}
    >
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.g} material={mat} position={p.p as unknown as [number, number, number]} rotation-z={p.rz} />
      ))}
    </group>
  );
}
const tmpCol = new THREE.Color();

export default function Horizon() {
  const ridges = useMemo(
    () =>
      RIDGES.map((r) => ({
        def: r,
        geo: ridgeGeometry(r),
        mat: new THREE.ShaderMaterial({
          vertexShader: ridgeVS,
          fragmentShader: ridgeFS,
          uniforms: {
            uInk: { value: tokColor(r.ink) },
            uHaze: { value: new THREE.Color() },
            uHazeK: { value: 0 },
            uRim: { value: tokColor('--gold') },
            uRimK: { value: 0 },
          },
          side: THREE.DoubleSide,
        }),
      })),
    [],
  );
  const groundMat = useMemo(() => new THREE.MeshBasicMaterial({ color: tokColor('--sumi') }), []);
  const mistMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: mistVS,
        fragmentShader: mistFS,
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.35 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const group = useRef<THREE.Group>(null);
  let lastV = -1;
  useFrame((state) => {
    // the intro paints its own lake and hills; the ink ridges take over as that print clears in the dark
    if (group.current) group.current.visible = !intro.active || sceneryOpacity(intro.progress) < 0.5;
    mistMat.uniforms.uTime.value = state.clock.elapsedTime;
    if (skyClock.version === lastV) return;
    lastV = skyClock.version;
    const p = skyClock.palette;
    const day = p.daylight;
    for (const r of ridges) {
      const u = r.mat.uniforms;
      (u.uHaze.value as THREE.Color).setRGB(...p.horizonRgb, THREE.SRGBColorSpace);
      u.uHazeK.value = r.def.haze * (0.35 + 0.65 * day);
      // a hairline of gold light on the far crest at golden hour
      u.uRimK.value = r.def.rad > 90 ? 0.25 * THREE.MathUtils.smoothstep(skyClock.sun.alt, -8, -1) * (1 - THREE.MathUtils.smoothstep(skyClock.sun.alt, 4, 12)) : 0;
    }
    (mistMat.uniforms.uColor.value as THREE.Color).setRGB(...p.horizonRgb, THREE.SRGBColorSpace);
    mistMat.uniforms.uOpacity.value = 0.1 + 0.25 * day;
  });

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.6} material={groundMat}>
        <circleGeometry args={[100, 96]} />
      </mesh>
      {ridges.map((r, i) => (
        <mesh
          key={i}
          geometry={r.geo}
          material={r.mat}
          ref={(m) => {
            if (i === 0) {
              if (m) landmarks.set('ridges', m);
              else landmarks.delete('ridges');
            }
          }}
        />
      ))}
      <mesh material={mistMat} position-y={-0.5} renderOrder={3}>
        <cylinderGeometry args={[78, 78, 12, 96, 1, true]} />
      </mesh>
      <Torii />
    </group>
  );
}
