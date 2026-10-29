/**
 * Milky Way from d3-celestial's mw.json (5 nested density contours, J2000). Rasterised ONCE into an
 * equirectangular alpha texture mapped on a sphere inside the equatorial group, plus a sparse cloud of
 * sparkle points sampled from the same density (count per quality tier). Brightness follows darkness.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { R, raDecToEquatorial } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { useTier } from '@/scene/quality';
import { app } from '@/state/store';
import { rng } from '@/scene/noise';
import { outside, tokColor } from './shared';
import { starFS, starVS } from './Stars';

type Ring = [number, number][];
interface MwJson {
  features: { id: string; geometry: { type: string; coordinates: Ring[][] } }[];
}

const TW = 2048;
const TH = 1024;

interface Raster {
  texture: THREE.CanvasTexture;
  density: Uint8ClampedArray; // low-res copy for sampling (512×256)
}

async function rasterise(): Promise<Raster> {
  const res = await fetch('/data/sky/mw.json');
  const mw = (await res.json()) as MwJson;
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, TW, TH);
  g.fillStyle = '#fff';
  const X = (lon: number) => ((lon + 180) / 360) * TW;
  const Y = (dec: number) => ((90 - dec) / 180) * TH;
  for (const f of mw.features) {
    g.globalAlpha = 0.2;
    for (const poly of f.geometry.coordinates) {
      for (const off of [-360, 0, 360]) {
        g.beginPath();
        for (const ring of poly) {
          let prev = ring[0][0];
          let acc = 0;
          ring.forEach(([lon, dec], i) => {
            // unwrap across ±180 so polygons that straddle RA 12h stay whole
            if (i > 0) {
              const d = lon - prev;
              if (d > 180) acc -= 360;
              else if (d < -180) acc += 360;
            }
            prev = lon;
            const x = X(lon + acc + off);
            const y = Y(dec);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          });
          g.closePath();
        }
        g.fill('evenodd');
      }
    }
  }
  // soften the contour steps
  const b = document.createElement('canvas');
  b.width = TW;
  b.height = TH;
  const bg = b.getContext('2d')!;
  bg.filter = 'blur(6px)';
  bg.drawImage(c, 0, 0);
  const s = document.createElement('canvas');
  s.width = 512;
  s.height = 256;
  const sg = s.getContext('2d', { willReadFrequently: true })!;
  sg.drawImage(b, 0, 0, 512, 256);
  const density = sg.getImageData(0, 0, 512, 256).data;
  const texture = new THREE.CanvasTexture(b);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  return { texture, density };
}

const mwVS = /* glsl */ `
  varying vec3 vEq; varying float vAlt;
  void main(){
    vEq = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vAlt = w.y / length(w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const mwFS = /* glsl */ `
  uniform sampler2D uMap; uniform float uBright; uniform vec3 uCool; uniform vec3 uWash; uniform float uOutside;
  varying vec3 vEq; varying float vAlt;
  void main(){
    vec3 e = normalize(vEq);
    float lon = atan(e.y, e.x);           // RA in (−π, π] = d3-celestial longitude
    float dec = asin(clamp(e.z, -1.0, 1.0));
    vec2 uv = vec2(lon / 6.2831853 + 0.5, dec / 3.1415927 + 0.5);
    float d = texture2D(uMap, uv).r;
    float ext = mix(smoothstep(0.0, 0.25, vAlt), step(0.0, vAlt), uOutside);
    vec3 col = mix(uWash, uCool, smoothstep(0.15, 0.9, d));
    gl_FragColor = vec4(col * d * uBright * ext, 1.0);
    #include <colorspace_fragment>
  }`;

export default function MilkyWay() {
  const [raster, setRaster] = useState<Raster | null>(null);
  useEffect(() => {
    let alive = true;
    rasterise()
      .then((r) => alive && setRaster(r))
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, []);
  if (!raster) return null;
  return <MilkyWayInner raster={raster} />;
}

function MilkyWayInner({ raster }: { raster: Raster }) {
  const group = useRef<THREE.Group>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const { milkyWayPoints } = useTier();

  const sphereMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: mwVS,
        fragmentShader: mwFS,
        uniforms: {
          uMap: { value: raster.texture },
          uBright: { value: 0 },
          uCool: { value: tokColor('--starlight') },
          uWash: { value: tokColor('--nebula') },
          uOutside: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [raster],
  );

  const sparkle = useMemo(() => {
    const n = milkyWayPoints;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), tw = new Float32Array(n), mag = new Float32Array(n);
    const rand = rng(4242);
    const cool = tokColor('--starlight');
    const warm = tokColor('--moon-warm');
    let k = 0;
    let guard = 0;
    while (k < n && guard++ < n * 60) {
      const lon = rand() * 360 - 180;
      const dec = (Math.asin(rand() * 2 - 1) * 180) / Math.PI;
      const px = Math.min(511, Math.floor(((lon + 180) / 360) * 512));
      const py = Math.min(255, Math.floor(((90 - dec) / 180) * 256));
      const d = raster.density[(py * 512 + px) * 4] / 255;
      if (rand() > d * 1.15) continue;
      const v = raDecToEquatorial(lon < 0 ? lon + 360 : lon, dec);
      pos[k * 3] = v[0] * R * 0.995;
      pos[k * 3 + 1] = v[1] * R * 0.995;
      pos[k * 3 + 2] = v[2] * R * 0.995;
      const c = rand() < 0.2 ? warm : cool;
      const b = 0.35 + rand() * 0.35;
      col[k * 3] = c.r * b;
      col[k * 3 + 1] = c.g * b;
      col[k * 3 + 2] = c.b * b;
      size[k] = 1.1 + rand() * 1.6;
      tw[k] = rand();
      mag[k] = 5.2 + rand() * 1.2; // faint: they vanish first as the sky brightens
      k++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, k * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size.subarray(0, k), 1));
    g.setAttribute('aTw', new THREE.BufferAttribute(tw.subarray(0, k), 1));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag.subarray(0, k), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: starVS,
      fragmentShader: starFS,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uFade: { value: 1 },
        uLimMag: { value: 6.5 },
        uScale: { value: 1 },
        uTwinkle: { value: 0.6 },
        uField: { value: 0 },
        uOutside: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { g, mat };
  }, [raster, milkyWayPoints]);

  useEffect(() => () => {
    sparkle.g.dispose();
    sparkle.mat.dispose();
  }, [sparkle]);

  useFrame((state) => {
    const gr = group.current;
    if (!gr) return;
    gr.matrix.copy(skyClock.eqMatrix);
    gr.matrixWorldNeedsUpdate = true;
    const out = outside();
    const fade = THREE.MathUtils.lerp(skyClock.palette.starFade, 0.8, out);
    // the band only reads in a dark sky: it follows darkness squared and dims under a bright Moon
    const moonUp = Math.max(0, skyClock.moon.dir[1]) * skyClock.moon.illumination;
    sphereMat.uniforms.uBright.value = fade * fade * 0.42 * (1 - 0.45 * moonUp * (1 - out));
    sphereMat.uniforms.uOutside.value = out;
    const s = app();
    const u = sparkle.mat.uniforms;
    u.uTime.value = state.clock.elapsedTime * 0.4;
    u.uTwinkle.value = s.reducedMotion ? 0 : 0.6;
    u.uDpr.value = dpr;
    u.uFade.value = fade;
    u.uLimMag.value = THREE.MathUtils.lerp(skyClock.palette.limitingMag, 6, out);
    u.uOutside.value = out;
    u.uField.value = s.field ? 1 : 0;
    const cp = state.camera.position;
    const dist = Math.hypot(cp.x, cp.y, cp.z);
    u.uScale.value = THREE.MathUtils.clamp(1 - dist / 700, 0.55, 1);
  });

  return (
    <group ref={group} matrixAutoUpdate={false}>
      <mesh material={sphereMat} renderOrder={-20} frustumCulled={false}>
        <sphereGeometry args={[R * 0.998, 96, 48]} />
      </mesh>
      <points geometry={sparkle.g} material={sparkle.mat} frustumCulled={false} renderOrder={-6} />
    </group>
  );
}
