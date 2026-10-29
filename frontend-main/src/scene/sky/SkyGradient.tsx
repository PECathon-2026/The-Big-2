/**
 * Sky colour sphere: zenith → horizon gradient from skyClock.palette (the Sun's real altitude, §5.1),
 * a warm glow toward the real Sun near the horizon (dusk runs through the PECFEST rising-sun reds),
 * and the ground below. Drawn first, behind everything; fades out when the camera leaves the dome.
 */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyClock } from '@/scene/skyClock';
import { outside, tokColor } from './shared';

const vs = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fs = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunGlow;
  uniform float uOpacity; uniform float uGlow;
  varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    float alt = d.y;
    float t = pow(clamp(alt, 0.0, 1.0), 0.55);
    vec3 sky = mix(uHorizon, uZenith, t);
    // glow toward the real Sun (only meaningful near the horizon: dusk and dawn)
    float s = max(dot(d, uSunDir), 0.0);
    sky += uSunGlow * (pow(s, 6.0) * 0.55 + pow(s, 32.0) * 0.6) * uGlow * (1.0 - t * 0.7);
    // below the horizon: ground, with a thin horizon haze band
    float below = smoothstep(0.0, -0.06, alt);
    vec3 col = mix(sky, uGround, below);
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }`;

export default function SkyGradient() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vs,
        fragmentShader: fs,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, -1, 0) },
          uSunGlow: { value: new THREE.Color() },
          uOpacity: { value: 1 },
          uGlow: { value: 0 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      }),
    [],
  );
  let lastV = -1;
  useFrame(() => {
    const u = material.uniforms;
    if (skyClock.version !== lastV) {
      lastV = skyClock.version;
      const p = skyClock.palette;
      (u.uZenith.value as THREE.Color).setRGB(...p.zenithRgb, THREE.SRGBColorSpace);
      (u.uHorizon.value as THREE.Color).setRGB(...p.horizonRgb, THREE.SRGBColorSpace);
      tokColor('--sumi', u.uGround.value as THREE.Color).lerp((u.uHorizon.value as THREE.Color).clone().multiplyScalar(0.25), 0.5);
      tokColor('--sun-1', u.uSunGlow.value as THREE.Color);
      const sd = skyClock.sun.dir;
      (u.uSunDir.value as THREE.Vector3).set(sd[0], sd[1], sd[2]);
      const alt = skyClock.sun.alt;
      // strongest from −10° to +4°; none at night or high day
      u.uGlow.value = THREE.MathUtils.smoothstep(alt, -14, -4) * (1 - THREE.MathUtils.smoothstep(alt, 2, 14));
    }
    u.uOpacity.value = 1 - outside();
  });
  return (
    <mesh renderOrder={-100} frustumCulled={false} material={material}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  );
}
