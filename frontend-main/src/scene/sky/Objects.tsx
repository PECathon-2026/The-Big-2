/**
 * Keeps the registry of clickable sky objects (`live`) at their current positions and publishes them
 * to the store (throttled) with the ids C and D rely on (NOTES · Cross-workstream contracts):
 * moon, sun, polaris, M42, M31, M45, iss, meteor-radiant, planet names (lowercase), torii, pagoda,
 * ridges — plus `lens-best` (the brightest DSO above the horizon). Routes follow §8.4.
 */
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HIP_POLARIS, STAR_STRIDE, type Catalog } from '@/astro/catalog';
import { R, raDecToEquatorial } from '@/astro/coords';
import { moonName } from '@/astro/moonNames';
import { skyClock } from '@/scene/skyClock';
import { useTonight } from '@/data/tonight';
import { app, type SkyObject } from '@/state/store';
import { eqToWorld, landmarks, live } from './shared';
import { MOON_DIST, SUN_DIST } from './Moon';
import { issArcAt, issPointAt, showerRateAt, skyData } from './skyData';

export const LENS_TARGETS = ['M42', 'M31', 'M45'];

const tmp = new Float32Array(3);
const v3 = new THREE.Vector3();

function obj(o: SkyObject): SkyObject {
  let cur = live.get(o.id);
  if (!cur) {
    cur = o;
    live.set(o.id, cur);
  } else {
    Object.assign(cur, o, { world: cur.world });
    cur.world[0] = o.world[0];
    cur.world[1] = o.world[1];
    cur.world[2] = o.world[2];
  }
  return cur;
}

const fmt1 = (x: number) => Math.round(x * 10) / 10;

export function conName(cat: Catalog, code: string): string {
  return cat.constellations.find((c) => c.id === code)?.name ?? code;
}

export default function Objects({ cat }: { cat: Catalog }) {
  let lastV = -1;
  let lastData = -1;
  let lastPublish = 0;
  const eqW = (ra: number, dec: number): [number, number, number] => {
    const v = raDecToEquatorial(ra, dec);
    eqToWorld(skyClock.eqMatrix.elements, v[0], v[1], v[2], tmp, 0, R);
    return [tmp[0], tmp[1], tmp[2]];
  };

  let dirty = false;
  const publish = () => {
    const now = performance.now();
    if (!dirty || now - lastPublish < 1000) return;
    lastPublish = now;
    dirty = false;
    app().publishObjects([...live.values()].map((o) => ({ ...o, world: [...o.world] as [number, number, number] })));
  };

  useFrame(() => {
    if (skyClock.version === lastV && skyData.version === lastData && live.size) return publish();
    dirty = true;
    lastV = skyClock.version;
    lastData = skyData.version;
    const t = skyClock.date.getTime();
    const tonight = useTonight.getState();

    const md = skyClock.moon.dir;
    const mn = tonight.moon.data?.name ?? null;
    const local = moonName(skyClock.moon.ageDays);
    obj({
      kind: 'moon',
      id: 'moon',
      name: 'Moon',
      jp: mn?.kanji ?? local.kanji,
      route: '/scroll#moon',
      world: [md[0] * MOON_DIST, md[1] * MOON_DIST, md[2] * MOON_DIST],
      info: {
        kanji: mn?.kanji ?? local.kanji,
        romaji: mn?.romaji ?? local.romaji,
        meaning: mn?.meaning ?? local.meaning,
        illumination: Math.round(skyClock.moon.illumination * 100),
        age_days: fmt1(skyClock.moon.ageDays),
        phase: tonight.moon.data?.phase_name ?? null,
        ra: fmt1(skyClock.moon.ra),
        dec: fmt1(skyClock.moon.dec),
      },
    });
    const sd = skyClock.sun.dir;
    obj({ kind: 'sun', id: 'sun', name: 'Sun', jp: '太陽', route: '/watchtower', world: [sd[0] * SUN_DIST, sd[1] * SUN_DIST, sd[2] * SUN_DIST], info: { altitude: fmt1(skyClock.sun.alt), ra: fmt1(skyClock.sun.ra), dec: fmt1(skyClock.sun.dec) } });
    for (const p of skyClock.planets) {
      obj({
        kind: 'planet',
        id: p.name.toLowerCase(),
        name: p.name,
        jp: p.jp,
        route: '/scroll#planets',
        world: [p.dir[0] * R * 0.97, p.dir[1] * R * 0.97, p.dir[2] * R * 0.97],
        info: { mag: fmt1(p.mag), ra: fmt1(p.ra), dec: fmt1(p.dec) },
      });
    }
    const pi = cat.indexOfHip.get(HIP_POLARIS);
    if (pi !== undefined) {
      const ra = cat.stars[pi * STAR_STRIDE], dec = cat.stars[pi * STAR_STRIDE + 1];
      obj({ kind: 'star', id: 'polaris', name: 'Polaris', jp: '北極星', route: '/honor', world: eqW(ra, dec), info: { mag: fmt1(cat.stars[pi * STAR_STRIDE + 2]), constellation: 'Ursa Minor', ra, dec, hip: HIP_POLARIS } });
    }
    // DSOs: the three Lens samples, and the brightest DSO above the horizon
    let best: (typeof cat.dsos)[number] | null = null;
    let bestW: [number, number, number] | null = null;
    for (const d of cat.dsos) {
      const isTarget = LENS_TARGETS.includes(d.id);
      if (!isTarget && (best && d.mag >= best.mag)) continue;
      const w = eqW(d.ra, d.dec);
      if (isTarget) {
        obj({ kind: 'dso', id: d.id, name: d.name, jp: d.id === 'M45' ? '昴' : undefined, route: `/lens?target=${d.id}`, world: w, info: { type: d.type, mag: d.mag, desig: d.desig, ra: d.ra, dec: d.dec } });
      }
      if (w[1] > 8 && (!best || d.mag < best.mag)) {
        best = d;
        bestW = w;
      }
    }
    if (best && bestW) obj({ kind: 'dso', id: 'lens-best', name: best.name, route: `/lens?target=${best.id}`, world: bestW, info: { id: best.id, type: best.type, mag: best.mag, desig: best.desig } });

    // ISS: the live point during a pass, else the top of the next pass
    const arc = issArcAt(t);
    if (arc) {
      const sun = issPointAt(arc, t, tmp);
      const k = sun >= 0 ? -1 : arc.top;
      const w: [number, number, number] = k < 0 ? [tmp[0] * R * 0.96, tmp[1] * R * 0.96, tmp[2] * R * 0.96] : [arc.dirs[k * 3] * R * 0.96, arc.dirs[k * 3 + 1] * R * 0.96, arc.dirs[k * 3 + 2] * R * 0.96];
      obj({
        kind: 'iss',
        id: 'iss',
        name: 'ISS',
        jp: '国際宇宙ステーション',
        route: '/scroll#passes',
        world: w,
        info: { start: arc.pass.start_local, end: arc.pass.end_local, max_alt: arc.pass.max_alt, visible: arc.pass.visible ? 'yes' : 'no', live: sun >= 0 ? 'now' : null },
      });
    } else live.delete('iss');

    const m = skyData.shower;
    if (m) {
      eqToWorld(skyClock.eqMatrix.elements, m.eq[0], m.eq[1], m.eq[2], tmp, 0, R * 0.97);
      obj({
        kind: 'meteor',
        id: 'meteor-radiant',
        name: m.shower.name,
        jp: m.shower.jp,
        route: '/scroll#meteors',
        world: [tmp[0], tmp[1], tmp[2]],
        info: { rate_per_hour: fmt1(showerRateAt(m, t)), zhr_peak: m.shower.zhr_peak, peak: m.shower.peak },
      });
    } else live.delete('meteor-radiant');

    for (const [id, name, jp] of [
      ['torii', 'Torii', '鳥居'],
      ['pagoda', 'Five-storey pagoda', '五重塔'],
      ['ridges', 'The horizon', '山並み'],
    ] as const) {
      const o = landmarks.get(id);
      if (!o) continue;
      o.getWorldPosition(v3);
      if (id === 'ridges') v3.set(0, 8, -95); // the ridge line due north
      obj({ kind: 'landmark', id, name, jp, route: '/watchtower', world: [v3.x, v3.y + (id === 'torii' ? 4 : id === 'pagoda' ? 9 : 0), v3.z] });
    }

    publish();
  });
  return null;
}
