/** Nearby light gives the scroll journey parallax; catalogue stars keep their real coordinates. */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useApp } from '@/state/store';
import { rig } from '@/scene/Director';
import { intro, P, smooth } from '@/scene/intro/introBus';
import { rng } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';

const COUNTS = { high: 12000, medium: 7200, low: 3200 };
const SPAN = 140;
const vertexShader = /* glsl */ `
  attribute float aSize, aWarm, aPhase, aSpan;
  uniform vec3 uTravel, uParallax, uStep;
  uniform vec2 uResolution;
  uniform float uDpr, uFade, uTime, uMotion, uLens;
  varying float vAlpha, vWarm, vAspect;
  varying vec2 vAxis;
  void main() {
    // Wrapping happens outside the visible range, so flying never exhausts the field.
    vec3 local = mod(position - uTravel + aSpan * 0.5, aSpan) - aSpan * 0.5;
    local -= uParallax;
    vec4 view = viewMatrix * vec4(cameraPosition + local, 1.0);
    float depth = -view.z;
    vec4 clip = projectionMatrix * view;
    // Keep a wide foreground lens while the catalogue is optically magnified.
    // Otherwise a narrow zoom crops away the very lights we need to fly past.
    clip.xy *= uLens;
    gl_Position = clip;
    float nearFade = smoothstep(1.5, 5.0, depth);
    float farFade = 1.0 - smoothstep(aSpan * 0.34, aSpan * 0.49, length(local));
    float horizon = smoothstep(-0.01, 0.12, local.y / max(length(local), 0.001));
    float pulse = 1.0 + uMotion * 0.1 * sin(uTime * (0.6 + aPhase) + aPhase * 40.0);
    vAlpha = uFade * nearFade * farFade * horizon * pulse;
    vWarm = aWarm;
    float diameter = clamp(aSize * 24.0 / max(depth, 2.5), 0.8, 8.0) * uDpr;
    vec4 previous = projectionMatrix * (view + viewMatrix * vec4(uStep, 0.0));
    previous.xy *= uLens;
    vec2 flow = (clip.xy / max(clip.w, 0.1) - previous.xy / max(previous.w, 0.1)) * uResolution * 0.5;
    float trail = min(length(flow) * uMotion * 0.35, diameter * 1.8);
    vAxis = length(flow) > 0.01 ? normalize(flow) : vec2(1.0, 0.0);
    vAspect = diameter / (diameter + trail);
    gl_PointSize = diameter + trail;
    if (depth <= 0.0 || vAlpha < 0.002) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
    }
  }
`;
const fragmentShader = /* glsl */ `
  uniform float uField;
  varying float vAlpha, vWarm, vAspect;
  varying vec2 vAxis;
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    // Point coordinates run down the screen; projected velocity runs up it.
    p.y = -p.y;
    vec2 q = vec2(dot(p, vAxis), dot(p, vec2(-vAxis.y, vAxis.x)) / vAspect);
    float r = length(q);
    if (r > 1.0) discard;
    float halo = pow(1.0 - r, 2.6);
    float core = 1.0 - smoothstep(0.0, 0.3, r);
    vec3 color = mix(vec3(0.79, 0.85, 1.0), vec3(1.0, 0.85, 0.59), vWarm);
    color = mix(color, vec3(0.8, 0.035, 0.02), uField);
    gl_FragColor = vec4(color * (1.0 + core * 0.3), (halo + core * 0.4) * vAlpha);
    #include <colorspace_fragment>
  }
`;

export default function StarDepth() {
  const quality = useApp((s) => s.quality);
  const dpr = useThree((s) => s.viewport.dpr);
  const size = useThree((s) => s.size);
  const field = useMemo(() => {
    const count = COUNTS[quality];
    const random = rng(1847);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const warmth = new Float32Array(count);
    const phases = new Float32Array(count);
    const spans = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Independent volumes keep close lights around the eye throughout long flights.
      const layer = random();
      const span = layer < 0.04 ? 36 : layer < 0.3 ? 80 : SPAN;
      spans[i] = span;
      positions[i * 3] = (random() - 0.5) * span;
      positions[i * 3 + 1] = (random() - 0.5) * span;
      positions[i * 3 + 2] = (random() - 0.5) * span;
      // Many fine distant lights, a few brighter lights that pass close to the eye.
      sizes[i] = 1.2 + Math.pow(random(), 3) * 3.8;
      warmth[i] = random();
      phases[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aWarm', new THREE.BufferAttribute(warmth, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSpan', new THREE.BufferAttribute(spans, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        uTravel: { value: new THREE.Vector3() },
        uParallax: { value: new THREE.Vector3() },
        uStep: { value: new THREE.Vector3() },
        uResolution: { value: new THREE.Vector2() },
        uDpr: { value: 1 }, uFade: { value: 0 },
        uTime: { value: 0 }, uMotion: { value: 1 }, uField: { value: 0 }, uLens: { value: 1 },
      },
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 3;
    return points;
  }, [quality]);
  const motion = useMemo(() => ({
    travel: new THREE.Vector3(), previous: new THREE.Vector3(),
    forward: new THREE.Vector3(), parallax: new THREE.Vector3(), target: new THREE.Vector3(),
    lastFov: rig.cur.fov, lastPhase: '',
    finePointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  }), []);

  useEffect(() => () => {
    field.geometry.dispose();
    field.material.dispose();
  }, [field]);

  useFrame(({ camera, clock, pointer }, dtRaw) => {
    const s = useApp.getState();
    field.visible = s.phase === 'intro' || s.phase === 'sky' || s.phase === 'diving';
    const u = field.material.uniforms;
    const dt = Math.max(0.001, Math.min(0.1, dtRaw));
    const reduced = s.reducedMotion;
    motion.previous.copy(motion.travel);
    if (!reduced && s.phase === 'intro') {
      // A pure function of scroll: reversing the intro retraces the same stars exactly.
      // Settle the foreground before the final camera alignment and HUD handoff.
      const distance = 150 * smooth(P.sunEnd - 0.08, P.landEnd, intro.progress);
      const yaw = (intro.timeline?.sunsetAz ?? 270) * Math.PI / 180;
      motion.travel.set(Math.sin(yaw) * distance, distance * 0.22, -Math.cos(yaw) * distance);
    } else if (!reduced && s.phase === 'sky' && motion.lastPhase === 'sky') {
      // Perspective travel supplements optical zoom without displacing celestial picking targets.
      camera.getWorldDirection(motion.forward);
      motion.travel.addScaledVector(motion.forward, 72 * Math.log(motion.lastFov / rig.cur.fov));
    }
    motion.lastFov = rig.cur.fov;
    motion.lastPhase = s.phase;
    if (!field.visible) return;
    motion.target.set(0, 0, 0);
    if (!reduced && motion.finePointer) {
      motion.target.set(pointer.x * 0.65, pointer.y * 0.4, 0).applyQuaternion(camera.quaternion);
    }
    motion.parallax.lerp(motion.target, 1 - Math.exp(-5 * dt));
    u.uTravel.value.copy(motion.travel);
    u.uParallax.value.copy(motion.parallax);
    u.uStep.value.subVectors(motion.travel, motion.previous).multiplyScalar(1 / (60 * dt));
    u.uResolution.value.set(size.width * dpr, size.height * dpr);
    u.uDpr.value = dpr;
    u.uLens.value = Math.tan(rig.cur.fov * Math.PI / 360) / Math.tan(62 * Math.PI / 360);
    u.uMotion.value = reduced ? 0 : 1;
    u.uTime.value = reduced ? 0 : clock.elapsedTime;
    u.uField.value = s.field ? 1 : 0;
    const reveal = intro.active ? smooth(P.sunEnd - 0.02, P.streamEnd, intro.progress) : 1;
    u.uFade.value = reveal * skyClock.palette.starFade * (reduced ? 0.4 : 0.85);
  });

  return <primitive object={field} />;
}
