/**
 * Petals → stars (§7.3.1, the signature effect). One InstancedMesh, all motion in the vertex shader.
 * Per instance: aBranch (rest position on the tree), aSeed, aTimes (detach, homing start, land, star px),
 * aStar (target star, equatorial unit vector — rotated by the live sky matrix, so it lands where the
 * real star is during the time-lapse), aStarCol. Per frame only uniforms are written.
 *
 * Assignment: visible stars brightest first, one petal each; extra petals join the brightest stars in
 * proportion to their flux; those extras dissolve while still pink, before the last stretch, so dozens
 * of them never trail into one bright star as a white streak. Landing time comes from landForMag(), the same formula the sky's star
 * shader uses (INTRO_REVEAL_GLSL), so each star appears exactly as its petal lands and fades.
 * About a third of the petals stay on the trees as blossoms.
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { catalogSync, bvToRgb, STAR_STRIDE } from '@/astro/catalog';
import { raDecToEquatorial } from '@/astro/coords';
import { rng } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';
import { rig } from '@/scene/Director';
import { useTier } from '@/scene/quality';
import { app } from '@/state/store';
import { buildTrees } from './trees';
import { LAND_FADE, intro, landForMag, sceneOpacity, sceneryOpacity, smooth, token } from './introBus';

const vs = /* glsl */ `
  attribute vec3 aBranch; attribute vec4 aSeed; attribute vec4 aTimes; attribute vec3 aStar; attribute vec3 aStarCol; attribute float aPink; attribute float aExtra;
  uniform float uP; uniform float uTime; uniform float uPx; uniform float uLandFade; uniform float uNight; uniform float uFade; uniform float uSceneryFade;
  uniform mat4 uEq; uniform vec3 uWind; uniform vec3 uBack; uniform vec3 uSakura; uniform vec3 uBeni;
  varying vec2 vUv; varying vec3 vCol; varying float vGlow; varying float vA;

  vec3 hash3(vec3 p){ p = vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6)));
    return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
  vec3 noise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), u.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), u.x), u.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), u.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), u.x), u.y), u.z); }
  mat3 rotAxis(vec3 a, float t){ a = normalize(a); float s = sin(t), c = cos(t), oc = 1.0 - c;
    return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
                oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
                oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }

  void main(){
    float det = aTimes.x, home = aTimes.y, land = aTimes.z;
    float p = uP;
    vec3 star = (uEq * vec4(aStar * 100.0, 1.0)).xyz;

    // on the branch: a breeze wobble
    vec3 rest = aBranch + 0.025 * vec3(sin(uTime * 1.3 + aSeed.x * 30.0), sin(uTime * 1.7 + aSeed.y * 20.0), cos(uTime * 1.1 + aSeed.z * 25.0));
    // free flight before homing: a short fall, then lift and stream across the view in a noise flow field
    float fh = max(min(p, home) - det, 0.0);
    float fall = sin(min(fh * 10.0, 3.14159)) * (0.5 + aSeed.w);
    vec3 pos = rest
      + uWind * fh * (16.0 + 14.0 * aSeed.z)
      + vec3(0.0, -fall + fh * fh * (50.0 + 50.0 * aSeed.w), 0.0)
      + noise3(aBranch * 0.35 + vec3(fh * 7.0, fh * 5.0, aSeed.x * 9.0)) * fh * 22.0;
    float t = clamp((p - home) / max(land - home, 1e-4), 0.0, 1.0);
    if (p > home) {
      // cubic Bezier to the star: control points above and behind the camera
      float e = t * t * (3.0 - 2.0 * t);
      vec3 b1 = pos + vec3(0.0, 14.0 + 10.0 * aSeed.y, 0.0) + uBack * (6.0 + 8.0 * aSeed.x);
      vec3 b2 = star * 0.55 + vec3(0.0, 22.0, 0.0);
      float u = 1.0 - e;
      pos = u*u*u * pos + 3.0*u*u*e * b1 + 3.0*u*e*e * b2 + e*e*e * star;
    }
    // shrink to the star's point size and turn emissive in the last stretch
    float glow = smoothstep(0.55, 1.0, t);
    vGlow = glow;
    vec3 petalCol = mix(uSakura, uBeni, aPink);
    petalCol *= 1.0 - uNight * 0.55 * (1.0 - step(det, p));
    vCol = mix(petalCol, aStarCol * 1.25, glow);
    float camDist = length(pos - cameraPosition);
    float petalSize = 0.07 + 0.05 * aSeed.y;
    float starSize = aTimes.w * 0.55 * uPx * camDist;
    float size = mix(petalSize, max(starSize, 0.0), smoothstep(0.3, 1.0, t));
    // flutter: tumble while flying, gentle while on the branch
    float flying = step(det, p);
    float ang = aSeed.x * 6.283 + uTime * (0.4 + flying * (1.6 + 2.0 * aSeed.y));
    mat3 R = rotAxis(vec3(aSeed.y - 0.5, 0.6, aSeed.z - 0.5), ang);
    vec3 local = position;
    local.z += (local.x * local.x) * 0.9 - 0.12; // curved petal
    vec3 petalOff = R * (local * size);
    vec4 mv = viewMatrix * vec4(pos, 1.0);
    vec4 mvPetal = viewMatrix * vec4(pos + petalOff, 1.0);
    vec4 mvGlow = mv + vec4(position.xy * size * 2.0, 0.0, 0.0);
    vec4 mvFinal = mix(mvPetal, mvGlow, glow);
    gl_Position = projectionMatrix * mvFinal;
    vUv = position.xy + 0.5;
    // fade out exactly as the real star fades in (handoff), and with the whole intro at the pull-back
    // Blossoms still on branches leave with the tree; detached petals keep their original handoff.
    float attached = 1.0 - step(det, p);
    vA = (1.0 - smoothstep(land, land + uLandFade, p)) * uFade * mix(1.0, uSceneryFade, attached);
    // a star's extra petals melt into the dark before they would turn white and stream in behind its own
    vA *= 1.0 - aExtra * smoothstep(0.3, 0.52, t);
    if (vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;

const fs = /* glsl */ `
  varying vec2 vUv; varying vec3 vCol; varying float vGlow; varying float vA;
  void main(){
    vec2 q = vUv * 2.0 - 1.0; // x across, y base(-1) → tip(+1)
    // petal: rounded teardrop with a notch at the tip
    float w = 0.9 * sqrt(max(0.0, 1.0 - q.y * q.y)) * (0.55 + 0.45 * (1.0 - q.y) * 0.6 + 0.2);
    float notch = smoothstep(0.18, 0.0, abs(q.x)) * smoothstep(0.62, 0.95, q.y);
    float petal = smoothstep(w, w - 0.12, abs(q.x)) * (1.0 - notch) * smoothstep(-1.0, -0.86, q.y);
    vec3 pc = vCol * (0.78 + 0.32 * (q.y * 0.5 + 0.5));
    pc = mix(pc, pc * 0.72, smoothstep(0.55, 0.95, q.y)); // darker tip
    float r = length(q);
    float disc = exp(-r * r * 5.0);
    float a = mix(petal, disc, vGlow) * vA;
    vec3 col = mix(pc, vCol * (0.9 + 0.6 * disc), vGlow);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

export default function Petals({ targetsKey }: { targetsKey: number }) {
  const { petals: count } = useTier();
  const size = useThree((s) => s.size);

  const { mesh, mat } = useMemo(() => {
    const az = intro.timeline?.sunsetAz ?? 270;
    const trees = buildTrees(az);
    const r = rng(2026);
    const n = count;
    const aBranch = new Float32Array(n * 3);
    const aSeed = new Float32Array(n * 4);
    const aTimes = new Float32Array(n * 4);
    const aStar = new Float32Array(n * 3);
    const aStarCol = new Float32Array(n * 3);
    const aPink = new Float32Array(n);
    const aExtra = new Float32Array(n);

    // flying petals ↔ stars
    const cat = catalogSync();
    const tg = intro.targets;
    const stay = Math.floor(n * 0.32);
    const fly = n - stay;
    const assign = new Int32Array(fly).fill(-1);
    let first = 0;
    if (tg && tg.count) {
      first = Math.min(fly, tg.count);
      for (let i = 0; i < first; i++) assign[i] = i;
      // extra petals gather on the brightest stars, by flux
      const top = Math.min(tg.count, 240);
      const flux = Array.from({ length: top }, (_, i) => Math.pow(10, -0.4 * tg.mags[i]));
      const sum = flux.reduce((a, b) => a + b, 0);
      let k = first;
      for (let i = 0; i < top && k < fly; i++) {
        const extra = Math.round(((fly - first) * flux[i]) / sum);
        for (let j = 0; j < extra && k < fly; j++) assign[k++] = i;
      }
      for (; k < fly; k++) assign[k] = Math.floor(r() * Math.min(tg.count, 60));
    }

    for (let i = 0; i < n; i++) {
      // rest position inside a blossom cluster at a branch tip (flattened sphere)
      const a = Math.floor(r() * trees.anchorCount) * 4;
      const rad = trees.anchors[a + 3];
      const th = r() * Math.PI * 2;
      const ph = Math.acos(2 * r() - 1);
      const rr = Math.cbrt(r()) * rad;
      aBranch[i * 3] = trees.anchors[a] + Math.sin(ph) * Math.cos(th) * rr;
      aBranch[i * 3 + 1] = trees.anchors[a + 1] + Math.cos(ph) * rr * 0.6;
      aBranch[i * 3 + 2] = trees.anchors[a + 2] + Math.sin(ph) * Math.sin(th) * rr;
      aSeed.set([r(), r(), r(), r()], i * 4);
      aPink[i] = r() < 0.45 ? 0.75 + r() * 0.25 : r() * 0.25; // pink sakura mixed with crimson beni-zakura
      const fi = i - stay;
      if (fi < 0 || assign[fi] < 0) {
        // stays on the tree as a blossom (or no catalogue: never leaves)
        aTimes.set([9, 9.5, 10, 2], i * 4);
        aStar.set([0, 0, 1], i * 3);
        continue;
      }
      const si = assign[fi];
      if (fi >= first) aExtra[i] = 1;
      const ci = tg!.indices[si];
      const ra = cat!.stars[ci * STAR_STRIDE];
      const dec = cat!.stars[ci * STAR_STRIDE + 1];
      const mag = tg!.mags[si];
      aStar.set(raDecToEquatorial(ra, dec), i * 3);
      aStarCol.set(bvToRgb(tg!.bvs[si]), i * 3);
      const land = landForMag(mag);
      // detach: a few drift early (0–8%), then more and more through the sunset
      const det = r() < 0.06 ? r() * 0.08 : 0.08 + 0.36 * Math.pow(r(), 0.65);
      const home = Math.min(land - 0.06, Math.max(det + 0.05, 0.3 + 0.2 * r()));
      const px = Math.min(12, Math.max(1.6, 9.4 - 1.55 * mag));
      aTimes.set([det, home, land, px], i * 4);
    }

    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1, 4, 2);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('aBranch', new THREE.InstancedBufferAttribute(aBranch, 3));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 4));
    g.setAttribute('aTimes', new THREE.InstancedBufferAttribute(aTimes, 4));
    g.setAttribute('aStar', new THREE.InstancedBufferAttribute(aStar, 3));
    g.setAttribute('aStarCol', new THREE.InstancedBufferAttribute(aStarCol, 3));
    g.setAttribute('aPink', new THREE.InstancedBufferAttribute(aPink, 1));
    g.setAttribute('aExtra', new THREE.InstancedBufferAttribute(aExtra, 1));
    g.instanceCount = n;
    const azr = (az * Math.PI) / 180;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vs,
      fragmentShader: fs,
      uniforms: {
        uP: { value: 0 },
        uTime: { value: 0 },
        uPx: { value: 0.001 },
        uLandFade: { value: LAND_FADE },
        uNight: { value: 0 },
        uFade: { value: 1 },
        uSceneryFade: { value: 1 },
        uEq: { value: skyClock.eqMatrix },
        uWind: { value: new THREE.Vector3(Math.cos(azr), 0.05, Math.sin(azr)).normalize() },
        uBack: { value: new THREE.Vector3(-Math.sin(azr), 0, Math.cos(azr)) },
        uSakura: { value: new THREE.Color(token('--sakura', '#F4C6CF')) },
        uBeni: { value: new THREE.Color(token('--beni-zakura', '#B3141E')) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return { mesh, mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, targetsKey]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mat.dispose();
    },
    [mesh, mat],
  );

  useFrame(() => {
    const u = mat.uniforms;
    u.uP.value = intro.progress;
    u.uTime.value = app().reducedMotion ? 0 : intro.progress * 30;
    u.uPx.value = (2 * Math.tan((rig.cur.fov * Math.PI) / 360)) / Math.max(1, size.height);
    u.uNight.value = smooth(2, -10, skyClock.sun.alt);
    u.uFade.value = sceneOpacity(intro.progress);
    u.uSceneryFade.value = sceneryOpacity(intro.progress);
    mesh.visible = u.uFade.value > 0.001;
    u.uEq.value = skyClock.eqMatrix;
  });

  return <primitive object={mesh} />;
}
