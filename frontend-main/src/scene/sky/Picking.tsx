/**
 * Picking (§8.3), throttled to one evaluation per frame on pointer move:
 *  points — named stars, DSOs, Moon (by its drawn disc), Sun, planets, ISS, meteor radiant — nearest
 *  within 14 px; landmarks (torii, pagoda, ridges) by raycast; constellations by distance to the
 *  projected figure segments (8 px). Hover → store.setHovered; a click (moved < 5 px) → store.select.
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STAR_STRIDE, HIP_POLARIS, type Catalog } from '@/astro/catalog';
import { DEG, R } from '@/astro/coords';
import { skyClock } from '@/scene/skyClock';
import { app, useApp, type SkyObject } from '@/state/store';
import { constellationGeom, pickConstellation } from './constellations';
import { eqToWorld, hoverRef, landmarks, live, P, project } from './shared';
import { moonDraw } from './Moon';
import { conName, LENS_TARGETS } from './Objects';

const tmp = new Float32Array(3);
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hits: THREE.Intersection[] = [];

export default function Picking({ cat }: { cat: Catalog }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const geo = constellationGeom(cat);
  const ptr = useMemo(() => ({ x: 0, y: 0, dirty: false, inside: false, downX: 0, downY: 0, down: false }), []);
  const named = useMemo(() => {
    const out: number[] = [];
    for (const hip of cat.names.keys()) {
      const i = cat.indexOfHip.get(hip);
      if (i !== undefined) out.push(i);
    }
    return out;
  }, [cat]);

  /** Best object at screen point (x, y) in CSS px of the canvas, or null. */
  function pick(x: number, y: number): SkyObject | null {
    const fade = skyClock.palette.limitingMag;
    const e = skyClock.eqMatrix.elements;
    const pxU = window.innerHeight / (2 * Math.tan((camera.fov * DEG) / 2));
    let best = null as SkyObject | null;
    let bestD = 14 * 14;
    let bestStar = -1;
    const consider = (o: SkyObject, extraPx = 0) => {
      if (o.world[1] < 0 || !project(o.world[0], o.world[1], o.world[2])) return;
      const dx = P.x - x, dy = P.y - y;
      const d = Math.max(0, Math.sqrt(dx * dx + dy * dy) - extraPx);
      if (d * d < bestD) {
        bestD = d * d;
        best = o;
        bestStar = -1;
      }
    };
    for (const o of live.values()) {
      if (o.kind === 'landmark') continue;
      if (o.id === 'lens-best' && LENS_TARGETS.includes(String(o.info?.id))) continue;
      if (o.kind === 'moon') {
        if (!project(o.world[0], o.world[1], o.world[2])) continue;
        consider(o, (moonDraw.radius * pxU) / P.depth);
      } else if (o.kind === 'sun') {
        if (skyClock.sun.dir[1] > 0 && project(o.world[0], o.world[1], o.world[2])) consider(o, (moonDraw.sunRadius * pxU) / P.depth);
      } else consider(o);
    }
    for (const i of named) {
      const m = cat.stars[i * STAR_STRIDE + 2];
      if (m > fade) continue;
      const ra = cat.stars[i * STAR_STRIDE] * DEG, dec = cat.stars[i * STAR_STRIDE + 1] * DEG;
      eqToWorld(e, Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), tmp, 0, R);
      if (tmp[1] < 0 || !project(tmp[0], tmp[1], tmp[2])) continue;
      const dx = P.x - x, dy = P.y - y;
      // brighter stars win ties: shrink their distance a little
      const d = (dx * dx + dy * dy) * (1 + Math.max(0, m) * 0.08);
      if (d < bestD) {
        bestD = d;
        bestStar = i;
        best = null;
      }
    }
    for (const d of cat.dsos) {
      if (LENS_TARGETS.includes(d.id) || d.mag > 8) continue;
      const ra = d.ra * DEG, dec = d.dec * DEG;
      eqToWorld(e, Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), tmp, 0, R);
      if (tmp[1] < 0 || !project(tmp[0], tmp[1], tmp[2])) continue;
      const dx = P.x - x, dy = P.y - y;
      if (dx * dx + dy * dy < bestD * 0.6) {
        bestD = dx * dx + dy * dy;
        bestStar = -1;
        const lb = live.get('lens-best');
        best = lb && lb.info?.id === d.id ? lb : { kind: 'dso', id: d.id, name: d.name, world: [tmp[0], tmp[1], tmp[2]], info: { type: d.type, mag: d.mag, desig: d.desig, ra: d.ra, dec: d.dec } };
      }
    }
    if (bestStar >= 0) return starObject(bestStar);
    if (best) return best;
    // landmarks by raycast
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const id of ['torii', 'pagoda', 'ridges']) {
      const o = landmarks.get(id);
      if (!o) continue;
      hits.length = 0;
      ray.intersectObject(o, true, hits);
      if (hits.length) return live.get(id) ?? null;
    }
    const ci = pickConstellation(geo, x, y, 8);
    if (ci >= 0) {
      const c = cat.constellations[ci];
      eqToWorld(e, Math.cos(c.center[1] * DEG) * Math.cos(c.center[0] * DEG), Math.cos(c.center[1] * DEG) * Math.sin(c.center[0] * DEG), Math.sin(c.center[1] * DEG), tmp, 0, R);
      return { kind: 'constellation', id: `con-${c.id}`, name: c.name, jp: c.ja, world: [tmp[0], tmp[1], tmp[2]], info: { abbr: c.id, ra: c.center[0], dec: c.center[1] } };
    }
    return null;
  }

  function starObject(i: number): SkyObject {
    const hip = cat.stars[i * STAR_STRIDE + 4];
    if (hip === HIP_POLARIS && live.get('polaris')) return live.get('polaris')!;
    const n = cat.names.get(hip);
    const ra = cat.stars[i * STAR_STRIDE], dec = cat.stars[i * STAR_STRIDE + 1];
    eqToWorld(skyClock.eqMatrix.elements, Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG), tmp, 0, R);
    return {
      kind: 'star',
      id: `hip-${hip}`,
      name: n?.name ?? `HIP ${hip}`,
      jp: n?.ja || undefined,
      world: [tmp[0], tmp[1], tmp[2]],
      info: {
        mag: Math.round(cat.stars[i * STAR_STRIDE + 2] * 100) / 100,
        bv: Math.round(cat.stars[i * STAR_STRIDE + 3] * 100) / 100,
        constellation: n ? conName(cat, n.con) : null,
        bayer: n?.bayer || null,
        ra: Math.round(ra * 1000) / 1000,
        dec: Math.round(dec * 1000) / 1000,
        hip,
      },
    };
  }

  function setHover(o: SkyObject | null) {
    const prev = hoverRef.obj;
    if ((prev?.id ?? null) !== (o?.id ?? null)) {
      hoverRef.obj = o;
      hoverRef.since = performance.now();
      hoverRef.con = o?.kind === 'constellation' ? (o.info?.abbr as string) : null;
      app().setHovered(o);
      gl.domElement.style.cursor = o ? 'pointer' : '';
    } else if (o) hoverRef.obj = o;
  }

  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.dirty = true;
      ptr.inside = true;
    };
    const leave = () => {
      ptr.inside = false;
      ptr.dirty = true;
    };
    const down = (e: PointerEvent) => {
      ptr.down = true;
      ptr.downX = e.clientX;
      ptr.downY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!ptr.down) return;
      ptr.down = false;
      if (Math.hypot(e.clientX - ptr.downX, e.clientY - ptr.downY) >= 5) return;
      if (app().phase !== 'sky') return;
      const r = el.getBoundingClientRect();
      const o = pick(e.clientX - r.left, e.clientY - r.top);
      if (o) app().select({ ...o, world: [...o.world] as [number, number, number] });
      else if (app().selected && !app().selected?.route) app().select(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    // leaving the sky clears the hover
    const unsub = useApp.subscribe((s, p) => {
      if (s.phase !== p.phase && s.phase !== 'sky') setHover(null);
    });
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useFrame(() => {
    // the overlay painter refreshed the projector this frame (it runs first); re-evaluate on move,
    // and also every ~10 frames while hovering so the hover follows a moving sky
    if (app().phase !== 'sky') return;
    if (!ptr.dirty && !(hoverRef.obj && P.frame % 10 === 0)) return;
    ptr.dirty = false;
    setHover(ptr.inside && !ptr.down ? pick(ptr.x, ptr.y) : ptr.down ? hoverRef.obj : null);
  });

  return null;
}
