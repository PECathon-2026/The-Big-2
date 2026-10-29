/**
 * Brand title star-morph (§7.3, 72–82%): ~1,500 faint, unnamed field stars that are really above the
 * user lift into 月読 · TSUKUYOMI WATCH on a plane in front of the camera, hold, then return exactly to
 * their true positions (they are rotated by the live sky matrix the whole time). Glyph points are
 * sampled from an offscreen canvas after document.fonts.load().
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { catalogSync, STAR_STRIDE } from '@/astro/catalog';
import { raDecToEquatorial } from '@/astro/coords';
import { rng } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';
import { intro, P, smooth, token } from './introBus';

const N = 1500;

async function sampleTitle(n: number): Promise<Float32Array | null> {
  try {
    await Promise.all([document.fonts.load('700 150px "Shippori Mincho"', '月読'), document.fonts.load('500 64px "Cinzel"', 'TSUKUYOMI WATCH')]);
  } catch {
    /* draw with fallbacks */
  }
  const W = 1200;
  const H = 360;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 170px "Shippori Mincho", serif';
  ctx.fillText('月読', W / 2, 115);
  ctx.font = '500 78px "Cinzel", serif';
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '10px';
  ctx.fillText('TSUKUYOMI WATCH', W / 2, 285);
  const data = ctx.getImageData(0, 0, W, H).data;
  const filled: number[] = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 140) filled.push(x, y);
  if (!filled.length) return null;
  const r = rng(321);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * (filled.length / 2)) * 2;
    out[i * 2] = (filled[k] + r() * 2 - W / 2) / W; // −0.5..0.5
    out[i * 2 + 1] = (H / 2 - filled[k + 1] - r() * 2) / W;
  }
  return out;
}

const vs = /* glsl */ `
  attribute vec3 aStar; attribute vec2 aText; attribute float aSeed;
  uniform mat4 uEq; uniform float uM; uniform vec3 uOrigin; uniform vec3 uRight; uniform vec3 uUp; uniform float uWidth; uniform float uDpr;
  varying float vA;
  void main(){
    vec3 star = (uEq * vec4(aStar * 100.0, 1.0)).xyz;
    vec3 text = uOrigin + uRight * aText.x * uWidth + uUp * aText.y * uWidth;
    float m = clamp(uM * 1.35 - aSeed * 0.35, 0.0, 1.0);
    float e = m * m * (3.0 - 2.0 * m);
    vec3 pos = mix(star, text, e) + uUp * sin(e * 3.14159) * (6.0 + 8.0 * aSeed);
    vA = smoothstep(0.0, 0.08, m);
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    gl_PointSize = (1.6 + 1.6 * e + aSeed) * uDpr;
    if (vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const fs = /* glsl */ `
  uniform vec3 uColor; varying float vA;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor * (0.7 + 0.5 * (1.0 - d)), pow(1.0 - d, 1.6) * vA);
  }`;

export default function StarMorph({ targetsKey }: { targetsKey: number }) {
  const [text, setText] = useState<Float32Array | null>(null);
  const camera = useThree((s) => s.camera);
  const dpr = useThree((s) => s.viewport.dpr);
  useEffect(() => {
    let alive = true;
    sampleTitle(N).then((t) => alive && setText(t));
    return () => {
      alive = false;
    };
  }, []);

  const pts = useMemo(() => {
    const cat = catalogSync();
    const tg = intro.targets;
    if (!text || !cat || !tg || !tg.count) return null;
    // faint, never-named field stars that are above the horizon tonight
    const pool: number[] = [];
    for (let i = 0; i < tg.count; i++) {
      const ci = tg.indices[i];
      if (tg.mags[i] >= 3.8 && !cat.names.has(cat.stars[ci * STAR_STRIDE + 4])) pool.push(ci);
    }
    if (!pool.length) return null;
    const r = rng(99);
    const n = Math.min(N, pool.length);
    const aStar = new Float32Array(n * 3);
    const aText = new Float32Array(n * 2);
    const aSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(r() * (pool.length - i)) + i;
      [pool[i], pool[j]] = [pool[j], pool[i]];
      const ci = pool[i];
      aStar.set(raDecToEquatorial(cat.stars[ci * STAR_STRIDE], cat.stars[ci * STAR_STRIDE + 1]), i * 3);
      aText.set([text[i * 2], text[i * 2 + 1]], i * 2);
      aSeed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aStar', new THREE.BufferAttribute(aStar, 3));
    g.setAttribute('aText', new THREE.BufferAttribute(aText, 2));
    g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: vs,
      fragmentShader: fs,
      uniforms: {
        uEq: { value: skyClock.eqMatrix },
        uM: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uRight: { value: new THREE.Vector3() },
        uUp: { value: new THREE.Vector3() },
        uWidth: { value: 34 },
        uDpr: { value: 1 },
        uColor: { value: new THREE.Color(token('--gold-bright', '#E8C66A')) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, targetsKey]);

  useEffect(
    () => () => {
      if (!pts) return;
      pts.geometry.dispose();
      (pts.material as THREE.Material).dispose();
    },
    [pts],
  );

  const fwd = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!pts) return;
    const u = (pts.material as THREE.ShaderMaterial).uniforms;
    const p = intro.progress;
    const m = smooth(P.landEnd, P.landEnd + 0.035, p) * (1 - smooth(P.titleEnd - 0.03, P.titleEnd, p));
    u.uM.value = m;
    pts.visible = m > 0;
    if (!pts.visible) return;
    u.uEq.value = skyClock.eqMatrix;
    u.uDpr.value = dpr;
    camera.getWorldDirection(fwd);
    (u.uOrigin.value as THREE.Vector3).copy(camera.position).addScaledVector(fwd, 40);
    (u.uRight.value as THREE.Vector3).setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    (u.uUp.value as THREE.Vector3).setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  });

  return pts ? <primitive object={pts} /> : null;
}
