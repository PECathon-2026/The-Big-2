/** A restrained ochre-to-ink atmosphere, exclusive to the illustrated opening. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyClock } from '@/scene/skyClock';
import { intro, P, sceneryOpacity, smooth, token } from './introBus';

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uPaper, uOchre, uInk, uCrimson, uSun;
  uniform float uNight, uOpacity;
  varying vec3 vDirection;
  void main() {
    vec3 d = normalize(vDirection);
    float height = smoothstep(-0.06, 0.75, d.y);
    vec3 day = mix(uPaper, uOchre, height * 0.5);
    float sunset = pow(max(dot(d, uSun), 0.0), 18.0);
    day = mix(day, uCrimson, sunset * 0.13 * (1.0 - height));
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
      uPaper: { value: new THREE.Color(token('--kinu', '#E8D9B5')) },
      uOchre: { value: new THREE.Color(token('--gold-soft', '#C4AA7C')) },
      uInk: { value: new THREE.Color(token('--sumi', '#090A0C')) },
      uCrimson: { value: new THREE.Color(token('--crimson', '#A70D16')) },
      uSun: { value: new THREE.Vector3() },
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
    (u.uSun.value as THREE.Vector3).set(...skyClock.sun.dir);
    if (mesh.current) mesh.current.visible = u.uOpacity.value > 0.001;
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={-99} frustumCulled={false}>
      <sphereGeometry args={[350, 48, 24]} />
    </mesh>
  );
}
