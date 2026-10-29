/**
 * Procedural cherry trees (§7.3): a few recursive splits → curved TubeGeometry, merged into one mesh.
 * Two trees frame the left and right edges of the view toward the sunset; their branch tips give the
 * blossom anchors the petals start from.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '@/scene/noise';

export interface TreeSet {
  geometry: THREE.BufferGeometry;
  /** blossom anchor points (world), with a cluster radius each: x,y,z,r */
  anchors: Float32Array;
  anchorCount: number;
}

const cache = new Map<string, TreeSet>();

export function buildTrees(sunsetAzDeg: number): TreeSet {
  const key = sunsetAzDeg.toFixed(2);
  const hit = cache.get(key);
  if (hit) return hit;
  const az = (sunsetAzDeg * Math.PI) / 180;
  const fwd = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));
  const right = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const up = new THREE.Vector3(0, 1, 0);
  const geos: THREE.BufferGeometry[] = [];
  const anchors: number[] = [];

  const grow = (r: () => number, start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number, inward: THREE.Vector3) => {
    const end = start.clone().addScaledVector(dir, len);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((r() - 0.5) * len * 0.25, (r() - 0.3) * len * 0.15, (r() - 0.5) * len * 0.25));
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const g = new THREE.TubeGeometry(curve, depth < 2 ? 8 : 4, rad, depth < 2 ? 7 : 4, false);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    geos.push(g);
    if (depth >= 3) anchors.push(end.x, end.y, end.z, 0.35 + len * 0.35);
    if (depth >= 4) {
      anchors.push(mid.x, mid.y, mid.z, 0.3 + len * 0.25);
      return;
    }
    const kids = depth === 0 ? 3 : 2 + (r() < 0.45 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const d = dir.clone();
      // spread around, bias upward and toward the centre of the view (the canopy frames the scene)
      const axis = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.3, r() - 0.5).normalize();
      d.applyAxisAngle(axis, (0.35 + r() * 0.5) * (k === 0 ? 0.6 : 1));
      d.addScaledVector(inward, 0.28 + depth * 0.07).addScaledVector(up, depth < 2 ? 0.15 : -0.05).normalize();
      grow(r, end, d, len * (0.66 + r() * 0.14), rad * 0.62, depth + 1, inward);
    }
  };

  const tree = (seed: number, side: -1 | 1, dist: number, lateral: number) => {
    const r = rng(seed);
    const base = fwd.clone().multiplyScalar(dist).addScaledVector(right, side * lateral).setY(-0.6);
    const inward = right.clone().multiplyScalar(-side).addScaledVector(fwd, -0.25).normalize();
    const dir = up.clone().addScaledVector(inward, 0.32).normalize();
    grow(r, base, dir, 2.6, 0.2, 0, inward);
  };
  tree(11, -1, 7.2, 6.4);
  tree(29, 1, 8.4, 6.9);

  const geometry = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  const set = { geometry, anchors: new Float32Array(anchors), anchorCount: anchors.length / 4 };
  cache.set(key, set);
  return set;
}
