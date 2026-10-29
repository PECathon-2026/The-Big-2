/**
 * The Moon: NASA SVS CGI Moon Kit LROC colour map on a sphere at its real position (astronomy-engine),
 * lit in the shader from the real Sun direction, so the phase and the terminator's tilt are automatic.
 * The near side faces the observer with north toward the celestial pole; optical libration (elon,
 * elat from Libration()) turns the globe. Drawn ~3× its real angular size for presence (stated on
 * /science). The Sun is a crimson ink disc with a glow when above the horizon.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { DEG, R } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { outside, tokColor } from './shared';

export const MOON_DIST = R * 0.92;
export const MOON_SCALE = 3; // × real angular size
export const SUN_DIST = R * 0.95;

/** Current drawn Moon radius in world units (for picking and labels). */
export const moonDraw = { radius: 1.3, sunRadius: 1.3 };

const moonVS = /* glsl */ `
  varying vec3 vN; varying vec2 vUv; varying vec3 vView;
  void main(){
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const moonFS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uTint; uniform float uEarthshine; uniform float uFade;
  varying vec3 vN; varying vec2 vUv; varying vec3 vView;
  void main(){
    vec3 n = normalize(vN);
    vec3 alb = texture2D(uMap, vUv).rgb;
    float mu0 = dot(n, uSunDir);
    float mu = max(dot(n, vView), 0.0);
    // Lommel–Seeliger lunar reflectance blended with Lambert: flat full moon, soft terminator
    float ls = mu0 > 0.0 ? mu0 / (mu0 + mu + 1e-3) : 0.0;
    float lam = max(mu0, 0.0);
    float lit = mix(lam, ls * 1.6, 0.55) * smoothstep(-0.04, 0.06, mu0);
    vec3 col = alb * uTint * (lit * 1.9 + uEarthshine);
    gl_FragColor = vec4(col, uFade);
    #include <colorspace_fragment>
  }`;

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.22, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const f = new THREE.Vector3();
const up = new THREE.Vector3();
const right = new THREE.Vector3();
const back = new THREE.Vector3();
const ncp = new THREE.Vector3();
const basis = new THREE.Matrix4();
const q = new THREE.Matrix4();
const qz = new THREE.Matrix4();
const sc = new THREE.Matrix4();

export default function MoonAndSun() {
  const map = useLoader(THREE.TextureLoader, '/textures/moon_color_2k.webp');
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.needsUpdate = true;
  }, [map]);

  const moon = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const sun = useRef<THREE.Mesh>(null);
  const sunGlow = useRef<THREE.Sprite>(null);

  const moonMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: moonVS,
        fragmentShader: moonFS,
        uniforms: {
          uMap: { value: map },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uTint: { value: tokColor('--moon-warm') },
          uEarthshine: { value: 0.035 },
          uFade: { value: 1 },
        },
      }),
    [map],
  );
  const halos = useMemo(() => {
    const t = haloTexture();
    return {
      moon: new THREE.SpriteMaterial({ map: t, color: tokColor('--moon-warm'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      sun: new THREE.SpriteMaterial({ map: t, color: tokColor('--sun-1'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      sunDisc: new THREE.MeshBasicMaterial({ color: tokColor('--crimson-bright'), transparent: true, depthWrite: false }),
    };
  }, []);

  let lastV = -1;
  useFrame(() => {
    const m = moon.current, h = halo.current, s = sun.current, sg = sunGlow.current;
    if (!m || !h || !s || !sg) return;
    const out = outside();
    if (skyClock.version !== lastV) {
      lastV = skyClock.version;
      const md = skyClock.moon.dir, sd = skyClock.sun.dir;
      const radius = MOON_DIST * Math.tan((skyClock.moon.angularDiameterDeg * MOON_SCALE * DEG) / 2);
      moonDraw.radius = radius;
      // orientation: near side (texture centre = local +x) toward the observer, north toward the celestial pole
      f.set(-md[0], -md[1], -md[2]);
      const e = skyClock.eqMatrix.elements; // equatorial +z (NCP) in the horizontal frame
      ncp.set(e[8], e[9], e[10]);
      up.copy(ncp).addScaledVector(f, -ncp.dot(f)).normalize();
      right.crossVectors(up, f).normalize(); // = observer's view dir × up → lunar east appears on the observer's right
      back.copy(right).negate();
      basis.makeBasis(f, up, back);
      // libration: bring selenographic (elon, elat) to the sub-observer point
      const { elon, elat } = skyClock.moon.libration;
      q.makeRotationY(-elon * DEG);
      qz.makeRotationZ(-elat * DEG);
      sc.makeScale(radius, radius, radius);
      m.matrix.copy(basis).multiply(qz).multiply(q).multiply(sc);
      m.matrix.setPosition(md[0] * MOON_DIST, md[1] * MOON_DIST, md[2] * MOON_DIST);
      m.matrixWorldNeedsUpdate = true;
      (moonMat.uniforms.uSunDir.value as THREE.Vector3).set(sd[0], sd[1], sd[2]);
      // behind the globe, so the disc occludes its own glow
      h.position.set(md[0] * (MOON_DIST + 3), md[1] * (MOON_DIST + 3), md[2] * (MOON_DIST + 3));
      const sunR = SUN_DIST * Math.tan((0.533 * MOON_SCALE * DEG) / 2);
      moonDraw.sunRadius = sunR;
      s.position.set(sd[0] * SUN_DIST, sd[1] * SUN_DIST, sd[2] * SUN_DIST);
      s.lookAt(0, 0, 0);
      s.scale.setScalar(sunR);
      sg.position.copy(s.position).multiplyScalar(0.995);
    }
    const md = skyClock.moon.dir, sd = skyClock.sun.dir;
    const night = 1 - skyClock.palette.daylight;
    const moonVis = md[1] > -moonDraw.radius / MOON_DIST;
    m.visible = moonVis;
    // the halo scales with illumination and with darkness (a day-time moon has no glow)
    const ill = skyClock.moon.illumination;
    h.visible = moonVis;
    h.scale.setScalar(moonDraw.radius * (7 + 6 * ill));
    halos.moon.opacity = (0.25 + 0.75 * ill) * (0.35 + 0.65 * night) * THREE.MathUtils.smoothstep(md[1], -0.01, 0.05);
    // the Sun only when above the horizon, and never seen from outside the dome (the dome holds the night)
    const sunVis = sd[1] > -0.012 && out < 0.98;
    s.visible = sunVis;
    sg.visible = sunVis;
    const low = 1 - THREE.MathUtils.smoothstep(sd[1], 0.0, 0.3);
    halos.sunDisc.opacity = (1 - out) * THREE.MathUtils.smoothstep(sd[1], -0.012, 0.01);
    halos.sun.opacity = halos.sunDisc.opacity * (0.55 + 0.4 * low);
    sg.scale.setScalar(moonDraw.sunRadius * (9 + 8 * low));
  });

  return (
    <>
      <mesh ref={moon} matrixAutoUpdate={false} material={moonMat} renderOrder={2}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
      <sprite ref={halo} material={halos.moon} renderOrder={1} />
      <mesh ref={sun} material={halos.sunDisc} renderOrder={1}>
        <circleGeometry args={[1, 48]} />
      </mesh>
      <sprite ref={sunGlow} material={halos.sun} renderOrder={0} />
    </>
  );
}
