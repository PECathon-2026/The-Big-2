/**
 * The print's sky, exclusive to the illustrated opening: a Prussian-blue band overhead, cream in the
 * middle and persimmon at the horizon (ukiyo-e bokashi), warmest toward the real Sun, folding into ink.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyClock } from '@/scene/skyClock';
import { intro, P, sceneryOpacity, smooth, token } from './introBus';
import { PRINT } from './DuskLandscape';
import { backdrop } from './backdrop';

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop, uCream, uHorizon, uInk, uCrimson, uSun;
  uniform vec3 uPhotoSky;
  uniform float uNight, uOpacity, uPhoto;
  varying vec3 vDirection;
  void main() {
    vec3 d = normalize(vDirection);
    // horizon persimmon → cream → the blue band overhead
    vec3 day = mix(uHorizon, uCream, smoothstep(0.0, 0.17, d.y));
    day = mix(day, uTop, smoothstep(0.2, 0.52, d.y));
    // warmest toward the real Sun, low in the sky
    float sunset = pow(max(dot(d, uSun), 0.0), 6.0);
    day = mix(day, uCrimson, sunset * 0.35 * (1.0 - smoothstep(0.0, 0.3, d.y)));
    // above a photographic backdrop the sky continues in the colour of the photo's top edge
    day = mix(day, uPhotoSky, uPhoto * smoothstep(0.25, 0.45, d.y));
    float height = smoothstep(-0.06, 0.75, d.y);
    vec3 night = mix(uInk * 1.35, uInk, height);
    vec3 color = mix(day, night, uNight);
    color = mix(uInk, color, smoothstep(-0.12, 0.015, d.y));
    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
  }
`;

export default function DuskAtmosphere() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTop: { value: new THREE.Color(PRINT.prussian) },
      uCream: { value: new THREE.Color(PRINT.cream) },
      uHorizon: { value: new THREE.Color(PRINT.kaki) },
      uInk: { value: new THREE.Color(token('--sumi', '#090A0C')) },
      uCrimson: { value: new THREE.Color(token('--shu', '#C62920')) },
      uSun: { value: new THREE.Vector3() },
      uPhotoSky: { value: new THREE.Color() },
      uPhoto: { value: 0 },
      uNight: { value: 0 },
      uOpacity: { value: 1 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  }), []);

  useFrame(() => {
    const u = material.uniforms;
    u.uNight.value = smooth(P.frameEnd, P.streamEnd, intro.progress);
    u.uOpacity.value = sceneryOpacity(intro.progress);
    if (backdrop.sky) {
      (u.uPhotoSky.value as THREE.Color).copy(backdrop.sky);
      u.uPhoto.value = 1;
    }
    (u.uSun.value as THREE.Vector3).set(...skyClock.sun.dir);
    if (mesh.current) mesh.current.visible = u.uOpacity.value > 0.001;
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={-99} frustumCulled={false}>
      <sphereGeometry args={[350, 48, 24]} />
    </mesh>
  );
}
