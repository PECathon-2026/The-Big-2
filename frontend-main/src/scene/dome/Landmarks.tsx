/**
 * Small procedural landmarks on the island at tonight's real sunset azimuth (§7.4): Mt Fuji (snow cap,
 * ink-wash flanks), a five-storey pagoda and one cherry tree (crimson + pink blossom points on black
 * branches). Cheap: a handful of meshes with basic/shader materials. They stand inside the same world,
 * so from inside the sky they sit on the horizon; the pagoda is clickable (→ /watchtower).
 * Hidden during the intro, which has its own close-up centrepiece (B).
 */
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEG } from '@/astro/coords';
import { introTimeline } from '@/astro/skytime';
import { DEFAULT_PLACE } from '@/data/location';
import { rng } from '@/scene/noise';
import { skyClock } from '@/scene/skyClock';
import { useApp } from '@/state/store';
import { landmarks, tokColor } from '@/scene/sky/shared';

const fujiVS = /* glsl */ `
  varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fujiFS = /* glsl */ `
  uniform vec3 uInk; uniform vec3 uSnow; uniform vec3 uHaze; uniform float uHazeK; uniform float uH;
  varying vec3 vP;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    float y = vP.y / uH;
    float ang = atan(vP.z, vP.x);
    // jagged snow line: gullies of snow running down the flanks
    float gully = 0.5 + 0.5 * sin(ang * 23.0) * sin(ang * 7.0 + 1.3);
    float line = 0.68 - 0.16 * gully;
    float snow = smoothstep(line - 0.02, line + 0.02, y);
    vec3 ink = mix(uInk, uHaze, uHazeK * (0.4 + 0.6 * y));
    vec3 col = mix(ink, uSnow, snow * 0.9);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

function fujiGeometry(): THREE.BufferGeometry {
  // concave volcano profile with a flattened crater top
  const pts: THREE.Vector2[] = [];
  const H = 24, B = 34, T = 3.2;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = T + (B - T) * Math.pow(1 - t, 1.9);
    pts.push(new THREE.Vector2(r, t * H));
  }
  pts.push(new THREE.Vector2(0.01, H - 0.4));
  return new THREE.LatheGeometry(pts, 72);
}

function pagoda(body: THREE.Material, roof: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const w = 3.2 - i * 0.42;
    const hBody = 1.5 - i * 0.08;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hBody, w), body);
    b.position.y = y + hBody / 2;
    g.add(b);
    y += hBody;
    // the roof: a wide shallow pyramid with a thin eave slab; corners read as upturned in silhouette
    const r = new THREE.Mesh(new THREE.ConeGeometry(w * 1.05, 0.9, 4, 1), roof);
    r.rotation.y = Math.PI / 4;
    r.position.y = y + 0.3;
    g.add(r);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.12, w * 1.5), roof);
    eave.position.y = y - 0.08;
    g.add(eave);
    y += 0.55;
  }
  // sōrin spire with rings
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), roof);
  spire.position.y = y + 1.6;
  g.add(spire);
  for (let k = 0; k < 6; k++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8), roof);
    ring.position.y = y + 0.6 + k * 0.32;
    g.add(ring);
  }
  return g;
}

function sakura(bark: THREE.Material, colours: THREE.Color[]): { tree: THREE.Group; blossoms: THREE.Points } {
  const tree = new THREE.Group();
  const rand = rng(77);
  const tips: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.65, rad, len, 5), bark);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir);
    tree.add(m);
    if (depth === 0) {
      tips.push(to);
      return;
    }
    const n = depth > 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const d = dir.clone().add(new THREE.Vector3((rand() - 0.5) * 1.6, rand() * 0.5 - 0.05, (rand() - 0.5) * 1.6)).normalize();
      branch(to, d, len * (0.62 + rand() * 0.15), rad * 0.62, depth - 1);
    }
  };
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 1, 0).normalize(), 2.6, 0.32, 4);
  const N = tips.length * 26;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  let k = 0;
  for (const t of tips) {
    for (let j = 0; j < 26; j++) {
      const r = 0.9 * Math.cbrt(rand());
      const th = rand() * Math.PI * 2, ph = Math.acos(rand() * 2 - 1);
      pos[k * 3] = t.x + r * Math.sin(ph) * Math.cos(th);
      pos[k * 3 + 1] = t.y + r * Math.cos(ph) * 0.7;
      pos[k * 3 + 2] = t.z + r * Math.sin(ph) * Math.sin(th);
      const c = colours[Math.floor(rand() * colours.length)];
      col.set([c.r, c.g, c.b], k * 3);
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const blossoms = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.42, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
  tree.add(blossoms);
  return { tree, blossoms };
}

/** World position of the pagoda (for hotspots / picking): set when built. */
export const pagodaAt = new THREE.Vector3();

export default function Landmarks() {
  const place = useApp((s) => s.place);
  const phase = useApp((s) => s.phase);
  const az = useMemo(() => {
    try {
      return introTimeline(place ?? DEFAULT_PLACE).sunsetAz;
    } catch {
      return 250;
    }
  }, [place]);

  const built = useMemo(() => {
    const body = new THREE.MeshBasicMaterial({ color: tokColor('--crimson-deep') });
    const roof = new THREE.MeshBasicMaterial({ color: tokColor('--sumi') });
    const bark = new THREE.MeshBasicMaterial({ color: tokColor('--sumi') });
    const fujiMat = new THREE.ShaderMaterial({
      vertexShader: fujiVS,
      fragmentShader: fujiFS,
      uniforms: {
        uInk: { value: tokColor('--indigo') },
        uSnow: { value: tokColor('--kinu') },
        uHaze: { value: new THREE.Color() },
        uHazeK: { value: 0.3 },
        uH: { value: 24 },
      },
    });
    const fuji = new THREE.Mesh(fujiGeometry(), fujiMat);
    const pg = pagoda(body, roof);
    const { tree } = sakura(bark, [tokColor('--sakura'), tokColor('--nadeshiko'), tokColor('--beni-zakura'), tokColor('--kobai')]);
    return { body, fujiMat, fuji, pg, tree };
  }, []);

  // place everything along the sunset bearing
  const at = (dist: number, dAz: number): [number, number, number] => {
    const a = (az + dAz) * DEG;
    return [Math.sin(a) * dist, 0, -Math.cos(a) * dist];
  };
  const fujiPos = at(80, 0);
  const pgPos = at(46, -7);
  const treePos = at(38, 9);
  pagodaAt.set(pgPos[0], 7, pgPos[2]);

  let lastV = -1;
  useFrame(() => {
    if (skyClock.version === lastV) return;
    lastV = skyClock.version;
    const u = built.fujiMat.uniforms;
    (u.uHaze.value as THREE.Color).setRGB(...skyClock.palette.horizonRgb, THREE.SRGBColorSpace);
    u.uHazeK.value = 0.25 + 0.4 * skyClock.palette.daylight;
  });

  return (
    <group visible={phase !== 'intro'}>
      <primitive object={built.fuji} position={[fujiPos[0], -1.5, fujiPos[2]]} />
      <primitive
        object={built.pg}
        position={[pgPos[0], -0.4, pgPos[2]]}
        rotation-y={-az * DEG}
        ref={(o: THREE.Object3D | null) => {
          if (o) landmarks.set('pagoda', o);
          else landmarks.delete('pagoda');
        }}
      />
      <primitive object={built.tree} position={[treePos[0], -0.5, treePos[2]]} scale={1.6} />
    </group>
  );
}
