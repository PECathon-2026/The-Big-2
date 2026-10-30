/**
 * Dusk landscape (§7.3) at the REAL sunset azimuth: Mt Fuji, a five-storey pagoda, ink ridges with ink
 * bleed and drifting mist bands, as canvas-painted billboards at depth (parallax from depth), plus the
 * real-azimuth crimson ink sun and its horizon glow. Colours come from the tokens; the sky tint and
 * darkness follow the Sun's real altitude through skyClock.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm1, rng } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';
import { intro, P, sceneryOpacity, smooth, token } from './introBus';

const D = Math.PI / 180;

/* ---------- painted textures ---------- */

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Mt Fuji: concave cone, truncated summit, snow with streaks, ink-wash body. */
function fujiTex(body: string, snow: string) {
  return canvasTex(1024, 384, (ctx, w, h) => {
    const cx = w * 0.5;
    const top = h * 0.12;
    const half = (y: number) => {
      const t = (y - top) / (h - top); // 0 at summit → 1 at base
      return w * (0.035 + 0.36 * Math.pow(t, 1.5)) * (1 + 0.015 * Math.sin(t * 40));
    };
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(cx - half(h), h);
      for (let y = h; y >= top; y -= 2) ctx.lineTo(cx - half(y) + (fbm1(y * 0.05, 3) - 0.5) * 3, y);
      // summit crater notches
      ctx.lineTo(cx - w * 0.02, top + 3);
      ctx.lineTo(cx, top + 1);
      ctx.lineTo(cx + w * 0.018, top + 4);
      for (let y = top; y <= h; y += 2) ctx.lineTo(cx + half(y) + (fbm1(y * 0.05 + 9, 3) - 0.5) * 3, y);
      ctx.closePath();
    };
    outline();
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, body);
    g.addColorStop(1, body);
    ctx.fillStyle = g;
    ctx.fill();
    // the foot dissolves into mist
    const fade = ctx.createLinearGradient(0, h * 0.6, 0, h);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.globalCompositeOperation = 'source-over';
    // snow cap with streaks running down the ravines
    ctx.save();
    outline();
    ctx.clip();
    const r = rng(42);
    ctx.fillStyle = snow;
    ctx.beginPath();
    const snowLine = top + (h - top) * 0.21;
    ctx.moveTo(cx - half(snowLine) - 4, snowLine);
    for (let x = -1; x <= 1.001; x += 0.02) {
      const y = snowLine + (fbm1(x * 9 + 3, 3) - 0.5) * 30 + (Math.abs(Math.sin(x * 17)) * 26) * (1 - Math.abs(x));
      ctx.lineTo(cx + x * half(snowLine), y);
    }
    ctx.lineTo(cx + half(top), top);
    ctx.lineTo(cx - half(top), top);
    ctx.closePath();
    ctx.globalAlpha = 0.92;
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const x = (r() * 2 - 1) * 0.9;
      const y0 = snowLine - 10;
      const len = 12 + r() * 36;
      ctx.globalAlpha = 0.18 + r() * 0.25;
      ctx.beginPath();
      ctx.moveTo(cx + x * half(y0), y0);
      ctx.lineTo(cx + x * half(y0 + len) * 1.02 - 1.5, y0 + len);
      ctx.lineTo(cx + x * half(y0 + len) * 1.02 + 1.5, y0 + len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  });
}

/** Five-storey pagoda: stacked bodies, five roofs with upturned eaves, sōrin spire with nine rings. */
function pagodaTex(ink: string, lacquer: string) {
  return canvasTex(256, 512, (ctx, w, h) => {
    const cx = w / 2;
    let y = h - 6;
    ctx.fillStyle = ink;
    ctx.fillRect(cx - 62, y - 10, 124, 10); // stone base
    y -= 10;
    for (let i = 0; i < 5; i++) {
      const bw = 44 - i * 5;
      const bh = 34 - i * 2;
      // body (lacquered vermilion, reads only before dark)
      ctx.fillStyle = lacquer;
      ctx.fillRect(cx - bw, y - bh, bw * 2, bh);
      ctx.fillStyle = ink;
      for (let k = -2; k <= 2; k++) ctx.fillRect(cx + k * bw * 0.42 - 1.5, y - bh, 3, bh);
      ctx.fillRect(cx - bw, y - bh * 0.55, bw * 2, 3);
      y -= bh;
      // roof with upturned eaves
      const rw = 98 - i * 10;
      const rh = 16 - i;
      ctx.beginPath();
      ctx.moveTo(cx - rw - 6, y - 10);
      ctx.quadraticCurveTo(cx - rw * 0.6, y + 2, cx - bw - 4, y + 1);
      ctx.lineTo(cx + bw + 4, y + 1);
      ctx.quadraticCurveTo(cx + rw * 0.6, y + 2, cx + rw + 6, y - 10);
      ctx.quadraticCurveTo(cx + rw * 0.55, y - rh * 0.6, cx + bw * 0.6, y - rh);
      ctx.lineTo(cx - bw * 0.6, y - rh);
      ctx.quadraticCurveTo(cx - rw * 0.55, y - rh * 0.6, cx - rw - 6, y - 10);
      ctx.closePath();
      ctx.fill();
      y -= rh;
    }
    // sōrin spire
    ctx.fillRect(cx - 3, y - 96, 6, 96);
    for (let k = 0; k < 9; k++) ctx.fillRect(cx - 9 + k * 0.4, y - 22 - k * 7, 18 - k * 0.8, 3);
    ctx.beginPath();
    ctx.arc(cx, y - 100, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ---------- shaders ---------- */

const layerVS = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const layerFS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uHaze; uniform float uHazeAmt; uniform float uNight; uniform float uBleed;
  uniform float uSeed; uniform float uOpacity; uniform vec3 uNightInk; uniform float uFeather;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec4 c = texture2D(uMap, vUv);
    // ink bleed: the wet edge creeps outward and drips down as dusk deepens (demo's bleed)
    if (uBleed > 0.001) {
      float n = vn(vUv * vec2(60.0, 12.0) + uSeed);
      vec2 off = vec2((n - 0.5) * 0.006, 0.012 + n * 0.02) * uBleed;
      vec4 b1 = texture2D(uMap, vUv + off);
      vec4 b2 = texture2D(uMap, vUv + off * 2.2 + vec2(0.003, 0.0));
      float drip = smoothstep(0.55, 0.95, vn(vec2(vUv.x * 90.0 + uSeed, 0.5))) * uBleed;
      vec4 b3 = texture2D(uMap, vUv + vec2(0.0, 0.05 * drip));
      float bleedA = max(b1.a * 0.55, max(b2.a * 0.3, b3.a * drip * 0.8));
      c.rgb = mix(b1.rgb, c.rgb, step(bleedA, c.a));
      c.a = max(c.a, bleedA);
    }
    vec3 col = mix(c.rgb, uNightInk, uNight * 0.82);
    col = mix(col, uHaze, uHazeAmt * (1.0 - uNight * 0.6));
    float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
    gl_FragColor = vec4(col, c.a * uOpacity * mix(1.0, edge, uFeather));
    if (gl_FragColor.a < 0.004) discard;
    #include <colorspace_fragment>
  }`;

const ridgeFS = /* glsl */ `
  uniform vec3 uInk; uniform vec3 uHaze; uniform float uHazeAmt; uniform float uNight; uniform float uBleed;
  uniform float uSeed; uniform float uOpacity; uniform vec3 uNightInk; uniform float uAmp; uniform float uFreq;
  varying vec2 vUv;
  float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h1(i), h1(i + 1.0), f); }
  float fbm(float x){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n1(x); x *= 2.03; a *= 0.5; } return s / 0.97; }
  float prof(float u){ return 0.6 + uAmp * (fbm(u * uFreq + uSeed) - 0.5) * 2.0 + max(0.0, n1(u * uFreq * 0.5 + uSeed * 2.0) - 0.6) * uAmp * 2.4; }
  void main(){
    float top = prof(vUv.x);
    float body = smoothstep(top + 0.006, top - 0.006, vUv.y);
    // ink-wash: dense at the crest, thinning into mist below
    float a = body * smoothstep(0.0, max(0.04, top * 0.85), vUv.y);
    // ink bleed (demo): a wet halo creeps above the crest and dark drips run down as dusk deepens
    float wet = smoothstep(top + 0.06 * uBleed + 0.001, top, vUv.y) * (0.22 + 0.25 * n1(vUv.x * 160.0 + uSeed)) * uBleed;
    float col1 = vUv.x * 90.0 + uSeed * 3.0;
    float drip = smoothstep(0.7, 0.95, n1(floor(col1) * 7.3)) * (1.0 - smoothstep(0.0, 0.18, abs(fract(col1) - 0.5)));
    float dripLen = 0.12 + 0.3 * n1(floor(col1) * 3.1);
    drip *= smoothstep(top - dripLen * uBleed, top, vUv.y) * step(vUv.y, top) * uBleed;
    a = max(max(a, wet), drip * 0.9);
    vec3 col = mix(uInk, uNightInk, uNight * 0.82);
    col = mix(col, uHaze, uHazeAmt * (1.0 - uNight * 0.6) * (0.6 + 0.4 * smoothstep(top - 0.3, top, vUv.y)));
    a *= smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

const mistFS = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uSeed; uniform float uOpacity;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
  void main(){
    float band = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float n = fbm(vec2(vUv.x * 6.0 + uTime * 0.012 + uSeed, vUv.y * 2.0 + uSeed));
    float a = band * smoothstep(0.32, 0.8, n) * uAlpha * uOpacity;
    a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    gl_FragColor = vec4(uColor, a);
    if (a < 0.003) discard;
    #include <colorspace_fragment>
  }`;

const sunFS = /* glsl */ `
  uniform vec3 uCore; uniform vec3 uRim; uniform vec3 uGlow; uniform float uAlpha; uniform float uTime;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float edge = 0.2 + 0.012 * (vn(vec2(ang * 6.0, uTime * 0.2)) - 0.5); // ink-bled rim
    float disc = 1.0 - smoothstep(edge - 0.008, edge + 0.006, r);
    vec3 dc = mix(uCore, uRim, smoothstep(0.0, edge, r));
    float glow = exp(-r * 12.0) * 0.12;
    vec3 col = dc * disc + uGlow * glow * (1.0 - disc);
    float a = max(disc, glow * 0.85) * uAlpha;
    gl_FragColor = vec4(col, a);
    if (a < 0.003) discard;
    #include <colorspace_fragment>
  }`;

const glowFS = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float a = exp(-dot(p * vec2(1.0, 3.2), p * vec2(1.0, 3.2)) * 2.2) * uAlpha;
    a *= smoothstep(-0.05, 0.25, -p.y + 0.25);
    gl_FragColor = vec4(uColor * a, a);
    #include <colorspace_fragment>
  }`;

/* ---------- component ---------- */

interface Layer {
  tex?: THREE.Texture;
  ridge?: { ink: string; amp: number; freq: number };
  z: number;
  x: number;
  w: number;
  h: number;
  y: number;
  haze: number;
  bleed: number;
  seed: number;
}

export default function DuskLandscape() {
  const group = useRef<THREE.Group>(null);
  const sun = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const az = (intro.timeline?.sunsetAz ?? 270) * D;

  const { layers, mats, mists, sunMat, glowMat, hazeColor } = useMemo(() => {
    const sumi = token('--sumi', '#090A0C');
    const ink = token('--ink', '#141416');
    const distantInk = token('--washi-3', '#A79B85');
    const washi = token('--washi', '#EFE4CD');
    const beni = token('--crimson-deep', '#61070D');
    const hazeColor = new THREE.Color(token('--kinu', '#E8D9B5'));
    const layers: Layer[] = [
      // Kept inside r < 34 so the sky's own horizon ridge ring never hides it.
      { tex: fujiTex(ink, washi), z: -32.5, x: -5.5, w: 42, h: 10, y: -0.6, haze: 0.06, bleed: 0.08, seed: 1 },
      { ridge: { ink: distantInk, amp: 0.22, freq: 3.1 }, z: -29, x: 0, w: 72, h: 6.2, y: -1.9, haze: 0.12, bleed: 0.2, seed: 2 },
      { ridge: { ink, amp: 0.2, freq: 4.0 }, z: -24, x: 2, w: 58, h: 4.2, y: -1.6, haze: 0.1, bleed: 0.3, seed: 3 },
      { tex: pagodaTex(sumi, beni), z: -18, x: 4.4, w: 3.4, h: 6.8, y: -0.5, haze: 0.02, bleed: 0, seed: 4 },
      { ridge: { ink: sumi, amp: 0.18, freq: 5.5 }, z: -16, x: -1.5, w: 48, h: 2.6, y: -1.35, haze: 0.02, bleed: 0.3, seed: 5 },
    ];
    const nightInk = new THREE.Color(sumi);
    const mats = layers.map((l) =>
      l.ridge
        ? new THREE.ShaderMaterial({
            vertexShader: layerVS,
            fragmentShader: ridgeFS,
            uniforms: {
              uInk: { value: new THREE.Color(l.ridge.ink) },
              uHaze: { value: new THREE.Color() },
              uHazeAmt: { value: l.haze },
              uNight: { value: 0 },
              uBleed: { value: 0 },
              uSeed: { value: l.seed * 13.7 },
              uOpacity: { value: 1 },
              uNightInk: { value: nightInk },
              uAmp: { value: l.ridge.amp },
              uFreq: { value: l.ridge.freq },
            },
            transparent: true,
            depthWrite: false,
          })
        : new THREE.ShaderMaterial({
          vertexShader: layerVS,
          fragmentShader: layerFS,
          uniforms: {
            uMap: { value: l.tex },
            uHaze: { value: new THREE.Color() },
            uHazeAmt: { value: l.haze },
            uNight: { value: 0 },
            uBleed: { value: 0 },
            uSeed: { value: l.seed * 13.7 },
            uOpacity: { value: 1 },
            uNightInk: { value: nightInk },
            uFeather: { value: l.bleed > 0.3 ? 1 : 0 },
          },
          transparent: true,
          depthWrite: false,
        }),
    );
    const mistCol = new THREE.Color(washi);
    const mists = [
      { z: -27, w: 80, h: 2.2, y: -0.9, a: 0.07, seed: 1 },
      { z: -21, w: 60, h: 1.5, y: -0.9, a: 0.045, seed: 5 },
      { z: -14, w: 40, h: 1, y: -0.7, a: 0.025, seed: 9 },
    ].map(
      (m) =>
        ({
          ...m,
          mat: new THREE.ShaderMaterial({
            vertexShader: layerVS,
            fragmentShader: mistFS,
            uniforms: { uColor: { value: mistCol.clone() }, uAlpha: { value: m.a }, uTime: { value: 0 }, uSeed: { value: m.seed }, uOpacity: { value: 1 } },
            transparent: true,
            depthWrite: false,
          }),
        }) as const,
    );
    const sunMat = new THREE.ShaderMaterial({
      vertexShader: layerVS,
      fragmentShader: sunFS,
      depthTest: false,
      uniforms: {
        uCore: { value: new THREE.Color(token('--crimson', '#A70D16')) },
        uRim: { value: new THREE.Color(token('--crimson-deep', '#61070D')) },
        uGlow: { value: new THREE.Color(token('--crimson', '#A70D16')) },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: layerVS,
      fragmentShader: glowFS,
      depthTest: false,
      uniforms: { uColor: { value: new THREE.Color(token('--akane', '#A84C37')) }, uAlpha: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { layers, mats, mists, sunMat, glowMat, hazeColor };
  }, []);

  useFrame(() => {
    if (import.meta.env.DEV) Object.assign(window, { __sky: skyClock, __land: group.current, __sun: sun.current, __glow: glow.current });
    const p = intro.progress;
    const alt = skyClock.sun.alt;
    const night = smooth(P.frameEnd, P.streamEnd, p);
    const bleed = smooth(0.12, 0.62, p);
    const fadeOut = sceneryOpacity(p);
    if (group.current) group.current.visible = fadeOut > 0.001;
    mats.forEach((m, i) => {
      const u = m.uniforms;
      (u.uHaze.value as THREE.Color).copy(hazeColor).lerp(u.uNightInk.value as THREE.Color, night);
      u.uNight.value = night;
      u.uBleed.value = bleed * layers[i].bleed;
      u.uOpacity.value = fadeOut;
    });
    const t = intro.progress * 30;
    for (const m of mists) {
      m.mat.uniforms.uTime.value = t;
      m.mat.uniforms.uOpacity.value = fadeOut * (1 - night * 0.55);
      (m.mat.uniforms.uColor.value as THREE.Color).copy(hazeColor);
    }
    // the real Sun (time-lapse via skyClock.override): crimson ink disc + glow
    const sd = skyClock.sun.dir;
    if (sun.current) {
      sun.current.position.set(sd[0] * 96, sd[1] * 96, sd[2] * 96);
      sun.current.lookAt(0, 1.6, 0);
      sun.current.visible = alt > -4 && fadeOut > 0.001;
      sunMat.uniforms.uTime.value = t;
      sunMat.uniforms.uAlpha.value = smooth(-4, -0.5, alt) * fadeOut;
    }
    if (glow.current) {
      const g = alt > -14 ? 1 : 0;
      glow.current.visible = g > 0 && fadeOut > 0.001;
      glow.current.position.set(Math.sin(az) * 97, 2, -Math.cos(az) * 97);
      glow.current.lookAt(0, 1.6, 0);
      glowMat.uniforms.uAlpha.value = smooth(-14, -2, alt) * (1 - smooth(4, 12, alt)) * 0.08 * fadeOut;
    }
  });

  return (
    <>
      <group ref={group} rotation={[0, -az, 0]}>
        {layers.map((l, i) => (
          <mesh key={i} position={[l.x, l.y + l.h / 2, l.z]} material={mats[i]} renderOrder={-5 + i}>
            <planeGeometry args={[l.w, l.h]} />
          </mesh>
        ))}
        {mists.map((m, i) => (
          <mesh key={`m${i}`} position={[0, m.y + m.h / 2, m.z]} material={m.mat}>
            <planeGeometry args={[m.w, m.h]} />
          </mesh>
        ))}
      </group>
      <mesh ref={glow} material={glowMat} renderOrder={-9}>
        <planeGeometry args={[150, 40]} />
      </mesh>
      <mesh ref={sun} material={sunMat} renderOrder={-8}>
        <planeGeometry args={[18, 18]} />
      </mesh>
    </>
  );
}
