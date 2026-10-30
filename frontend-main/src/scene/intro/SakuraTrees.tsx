/** Two procedural cherry trees: black ink branches (pecfest card art), blossoms are the instanced petals. */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildTrees } from './trees';
import { intro, sceneryOpacity, token } from './introBus';

export default function SakuraTrees() {
  const set = useMemo(() => buildTrees(intro.timeline?.sunsetAz ?? 270), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(token('--sumi', '#090A0C')), transparent: true }), []);
  useFrame(() => {
    mat.opacity = sceneryOpacity(intro.progress);
    mat.visible = mat.opacity > 0.01;
  });
  return <mesh geometry={set.geometry} material={mat} frustumCulled={false} renderOrder={1} />;
}
