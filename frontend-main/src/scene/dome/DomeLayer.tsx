/**
 * PHASE-0 PLACEHOLDER (lead) — workstream A owns scene/dome/ and replaces this with
 * DomeGlass, Island, Horizon and DomeHotspots (§7.4). Visible only when the camera is outside the sky.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rig } from '@/scene/Director';

const rimVS = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const rimFS = /* glsl */ `
  uniform float uOpacity; varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); vec3 c = mix(vec3(0.85,0.87,0.92), vec3(0.81,0.66,0.31), f); gl_FragColor = vec4(c, f * 0.55 * uOpacity); }`;

export default function DomeLayer() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame(() => {
    const d = Math.hypot(...rig.cur.pos);
    if (mat.current) mat.current.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(d, 105, 180);
  });
  return (
    <mesh>
      <sphereGeometry args={[101, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <shaderMaterial ref={mat} vertexShader={rimVS} fragmentShader={rimFS} uniforms={{ uOpacity: { value: 0 } }} transparent depthWrite={false} side={THREE.FrontSide} />
    </mesh>
  );
}
