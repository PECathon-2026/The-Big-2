/**
 * The dome seen from outside (§7.4): a fresnel glass hemisphere (gold-silver rim, faint inner streak,
 * gilded base ring) over a floating ink island — the sky's ridges and ground, a rocky underside fading
 * into mist, drifting mist sprites — and the landmarks at the real sunset azimuth.
 * Camera: while phase is 'dome' this layer owns an orbit around the dome through Director.set():
 * slow idle spin (0.5°/s) unless the pointer moved recently, damped drag-orbit with inertia, and the
 * wheel (scroll down) enters the sky.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DEG } from '@/astro/coords';
import { Director, DOME_POS, rig } from '@/scene/Director';
import { app, useApp } from '@/state/store';
import { rng } from '@/scene/noise';
import { outside, tokColor } from '@/scene/sky/shared';
import Landmarks from './Landmarks';
import { orbit, enterSky } from './orbit';

const glassVS = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const glassFS = /* glsl */ `
  uniform float uOpacity; uniform vec3 uRim; uniform vec3 uSilver; uniform vec3 uFill; uniform float uFlash;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){
    float ndv = abs(dot(normalize(vN), vV));
    float f = pow(1.0 - ndv, 3.0);
    vec3 rim = mix(uSilver, uRim, smoothstep(0.2, 0.9, f));
    // a soft diagonal reflection streak across the glass
    vec3 p = normalize(vW);
    float streak = smoothstep(0.08, 0.0, abs(p.x * 0.8 + p.y * 0.55 - 0.35)) * 0.16 * (1.0 - f);
    float a = f * 0.6 + streak + 0.035;
    vec3 col = rim * (f + streak * 2.0) + uFill * 0.2 + uSilver * uFlash;
    gl_FragColor = vec4(col, a * uOpacity + uFlash * 0.18);
    #include <colorspace_fragment>
  }`;

const rockVS = /* glsl */ `
  varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const rockFS = /* glsl */ `
  uniform vec3 uInk; uniform vec3 uMist; uniform float uOpacity; varying float vY;
  void main(){
    float t = clamp(-vY / 60.0, 0.0, 1.0);
    vec3 col = mix(uInk, uMist, smoothstep(0.2, 1.0, t) * 0.6);
    gl_FragColor = vec4(col, (1.0 - smoothstep(0.55, 1.0, t)) * uOpacity);
    #include <colorspace_fragment>
  }`;

function rockGeometry(): THREE.BufferGeometry {
  const rand = rng(91);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const r = 100 * Math.pow(1 - t, 0.75) * (0.92 + rand() * 0.1);
    pts.push(new THREE.Vector2(Math.max(0.5, r), -0.7 - t * 62));
  }
  const g = new THREE.LatheGeometry(pts, 64);
  // break the symmetry: jitter radii by angle so the underside reads as rock
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > -1) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.sin(a * 7 + y * 0.2) + 0.05 * Math.sin(a * 17 - y * 0.35);
    pos.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function mistTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.5)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MIST = 7;

export default function DomeLayer() {
  const gl = useThree((s) => s.gl);
  const glass = useRef<THREE.Group>(null);
  const island = useRef<THREE.Group>(null);
  const mats = useMemo(() => {
    const glassMat = new THREE.ShaderMaterial({
      vertexShader: glassVS,
      fragmentShader: glassFS,
      uniforms: {
        uOpacity: { value: 0 },
        uRim: { value: tokColor('--gold') },
        uSilver: { value: tokColor('--moon') },
        uFill: { value: tokColor('--nebula') },
        uFlash: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: tokColor('--gold'), transparent: true, opacity: 0, depthWrite: false });
    const rockMat = new THREE.ShaderMaterial({
      vertexShader: rockVS,
      fragmentShader: rockFS,
      uniforms: { uInk: { value: tokColor('--sumi') }, uMist: { value: tokColor('--nebula') }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: true,
    });
    const mistMat = new THREE.SpriteMaterial({ map: mistTexture(), color: tokColor('--fuji'), transparent: true, depthWrite: false, opacity: 0 });
    return { glassMat, ringMat, rockMat, mistMat };
  }, []);
  const rock = useMemo(rockGeometry, []);
  const mist = useMemo(() => {
    const rand = rng(13);
    return Array.from({ length: MIST }, (_, i) => ({
      a: (i / MIST) * Math.PI * 2 + rand(),
      r: 70 + rand() * 60,
      y: -18 - rand() * 30,
      s: 90 + rand() * 80,
      w: 0.01 + rand() * 0.02,
    }));
  }, []);
  const mistRefs = useRef<(THREE.Sprite | null)[]>([]);

  // pointer: damped orbit drag in the dome phase; wheel down = enter the sky
  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (app().phase !== 'dome') return;
      drag = { x: e.clientX, y: e.clientY };
      orbit.lastInput = performance.now();
    };
    const move = (e: PointerEvent) => {
      orbit.lastInput = performance.now();
      if (!drag || app().phase !== 'dome') return;
      orbit.dragging = true;
      orbit.vTheta = -(e.clientX - drag.x) * 0.0042 * 40;
      orbit.vPhi = (e.clientY - drag.y) * 0.003 * 40;
      orbit.theta -= (e.clientX - drag.x) * 0.0042;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi + (e.clientY - drag.y) * 0.003, 4 * DEG, 50 * DEG);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      drag = null;
      orbit.dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      if (app().phase !== 'dome' || e.deltaY <= 0) return;
      e.preventDefault();
      enterSky();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    const unsub = useApp.subscribe((s, p) => {
      if (s.phase === 'dome' && p.phase !== 'dome') orbit.syncFromRig = true;
    });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
      unsub();
    };
  }, [gl]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(0.1, dtRaw);
    const out = outside();
    mats.glassMat.uniforms.uOpacity.value = out;
    mats.ringMat.opacity = 0.55 * out;
    // refraction shimmer (~300 ms) when the camera passes through the glass
    const dist = Math.hypot(rig.cur.pos[0], rig.cur.pos[1], rig.cur.pos[2]);
    if (orbit.prevDist > 101 && dist <= 101 && !app().reducedMotion) orbit.flash = 1;
    orbit.prevDist = dist;
    orbit.flash = Math.max(0, orbit.flash - dt / 0.3);
    mats.glassMat.uniforms.uFlash.value = orbit.flash;
    if (glass.current) glass.current.visible = out > 0.001 || orbit.flash > 0;
    mats.rockMat.uniforms.uOpacity.value = out;
    mats.mistMat.opacity = 0.22 * out;
    const t = state.clock.elapsedTime;
    mist.forEach((m, i) => {
      const s = mistRefs.current[i];
      if (!s) return;
      s.visible = out > 0.01;
      const a = m.a + t * m.w;
      s.position.set(Math.sin(a) * m.r, m.y + Math.sin(t * 0.1 + i) * 2, Math.cos(a) * m.r);
      s.scale.set(m.s, m.s * 0.45, 1);
    });

    // orbit controller (dome phase only; the rig eases toward what we set)
    const s = app();
    if (s.phase !== 'dome' || rig.station !== 'dome') return;
    if (orbit.syncFromRig) {
      const p = rig.tgt.pos;
      orbit.theta = Math.atan2(p[0], p[2]);
      orbit.phi = Math.atan2(p[1], Math.hypot(p[0], p[2]));
      orbit.syncFromRig = false;
    }
    const idle = performance.now() - orbit.lastInput > 2000;
    if (!s.reducedMotion && idle) orbit.theta += 0.5 * DEG * dt;
    // inertia after a flick, damped
    if (!orbit.dragging) {
      const k = Math.pow(0.03, dt);
      orbit.theta += orbit.vTheta * dt;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi + orbit.vPhi * dt, 4 * DEG, 50 * DEG);
      orbit.vTheta *= k;
      orbit.vPhi *= k;
    }
    const D = Math.hypot(DOME_POS[0], DOME_POS[1], DOME_POS[2]);
    const x = Math.sin(orbit.theta) * Math.cos(orbit.phi) * D;
    const y = Math.sin(orbit.phi) * D;
    const z = Math.cos(orbit.theta) * Math.cos(orbit.phi) * D;
    Director.set({ pos: [x, y, z], yaw: Math.atan2(-x, z), pitch: -orbit.phi });
    rig.domeSpin = 0;
  });

  return (
    <>
      <group ref={glass}>
        <mesh material={mats.glassMat} renderOrder={20}>
          <sphereGeometry args={[101, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh material={mats.ringMat} rotation-x={Math.PI / 2} renderOrder={21}>
          <torusGeometry args={[101, 0.35, 6, 160]} />
        </mesh>
      </group>
      <group ref={island}>
        <mesh geometry={rock} material={mats.rockMat} renderOrder={-1} />
        {mist.map((_, i) => (
          <sprite
            key={i}
            material={mats.mistMat}
            ref={(sp) => {
              mistRefs.current[i] = sp;
            }}
          />
        ))}
      </group>
      <Landmarks />
    </>
  );
}
