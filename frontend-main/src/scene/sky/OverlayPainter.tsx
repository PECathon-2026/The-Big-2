/**
 * Paints the overlay canvas every frame (in the R3F loop, after the camera rig): constellation brush
 * strokes (3 widths, demo style) with gold Shippori + Cormorant names, bright-star and planet labels,
 * the Moon's name, compass kanji on the horizon, the ISS arc, the meteor radiant, DSO marks, and the
 * hover reticle with a leader-line label. Also positions the dome hotspot DOM nodes.
 * Per frame it projects ~900 constellation vertices and ~40 labelled points; no allocations.
 */
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STAR_STRIDE, type Catalog } from '@/astro/catalog';
import { DEG, R } from '@/astro/coords';
import { fmtClock } from '@/astro/skytime';
import { skyClock } from '@/scene/skyClock';
import { tier } from '@/scene/quality';
import { app } from '@/state/store';
import { constellationGeom } from './constellations';
import { domeHotspots, eqToWorld, hoverRef, live, outside, overlay, P, project, refreshProjector, tokA } from './shared';
import { moonDraw } from './Moon';
import { issArcAt, issPointAt, METEOR_SCALE, showerRateAt, skyData } from './skyData';
import { meteorStats } from './Meteors';

const F = {
  jp: (px: number, w = 500) => `${w} ${px}px "Shippori Mincho", "Yu Mincho", serif`,
  latin: (px: number) => `italic 500 ${px}px "Cormorant Garamond", Georgia, serif`,
  display: (px: number) => `500 ${px}px "Cinzel", "Times New Roman", serif`,
  ui: (px: number, w = 600) => `${w} ${px}px "Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif`,
};

const tmp = new Float32Array(3);
const iss = new Float32Array(3);
const COMPASS: [string, string, number][] = [
  ['北', 'N', 0],
  ['東', 'E', 90],
  ['南', 'S', 180],
  ['西', 'W', 270],
];

/** Pixels per world unit at view depth d. */
const pxPerUnit = (d: number, camera: THREE.PerspectiveCamera, h: number) => h / (2 * Math.tan((camera.fov * DEG) / 2) * Math.max(d, 1e-3));

export default function OverlayPainter({ cat }: { cat: Catalog }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const geo = constellationGeom(cat);
  // labelled bright stars (proper name + Japanese), brightest first
  const bright: { i: number; name: string; ja: string }[] = [];
  for (const [hip, n] of cat.names) {
    const i = cat.indexOfHip.get(hip);
    if (i !== undefined && cat.stars[i * STAR_STRIDE + 2] < 1.0 && n.ja) bright.push({ i, name: n.name, ja: n.ja });
  }
  let frame = 0;

  useFrame((state) => {
    const cv = overlay.canvas;
    if (!cv) return;
    const s = app();
    const phase = s.phase;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, tier(s.quality).overlayDpr);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    refreshProjector(camera, W, H, frame++);
    positionHotspots(phase === 'dome');
    if (phase === 'gate' || phase === 'loading' || phase === 'module') return;

    const out = outside();
    const inside = 1 - out;
    // constellations ink themselves in during the intro (82–90%), then stay
    const reveal = phase === 'intro' ? THREE.MathUtils.smoothstep(s.introProgress, 0.82, 0.9) : 1;
    const labelsOn = phase === 'sky' || phase === 'diving' ? 1 : phase === 'intro' ? reveal : 0;
    const night = 0.25 + 0.75 * skyClock.palette.starFade;
    const e = skyClock.eqMatrix.elements;
    const zoom = Math.min(2, 62 / Math.max(12, camera.fov));
    const hoverCon = hoverRef.con;
    const t = state.clock.elapsedTime;

    /* ---------- constellation figures ---------- */
    const conAlpha = reveal * night * (out > 0.5 ? 0.7 : 1);
    if (conAlpha > 0.01) {
      const scr = geo.scr, v = geo.verts;
      for (let i = 0; i < geo.count; i++) {
        eqToWorld(e, v[i * 3], v[i * 3 + 1], v[i * 3 + 2], tmp, 0, R);
        const ok = tmp[1] > -0.3 && project(tmp[0], tmp[1], tmp[2]);
        scr[i * 3] = P.x;
        scr[i * 3 + 1] = P.y;
        scr[i * 3 + 2] = ok ? 1 : 0;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const passes: [number, string, number][] = [
        [9, '--kinu', 0.04],
        [4, '--gold', 0.12],
        [1.3, '--gold', 0.42],
      ];
      for (const [w, col, a] of passes) {
        ctx.strokeStyle = tokA(col, a * conAlpha);
        ctx.lineWidth = w * (out > 0.5 ? 0.6 : Math.min(2, zoom));
        ctx.beginPath();
        strokeFigures(ctx, -1, hoverCon, W, H);
        ctx.stroke();
      }
      if (hoverCon) {
        const ci = geo.names.findIndex((n) => n.id === hoverCon);
        for (const [w, col, a] of [
          [12, '--murasaki', 0.28],
          [5, '--fuji', 0.3],
          [1.8, '--gold-bright', 0.95],
        ] as [number, string, number][]) {
          ctx.strokeStyle = tokA(col, a * reveal);
          ctx.lineWidth = w * Math.min(2, zoom);
          ctx.beginPath();
          strokeFigures(ctx, ci, null, W, H);
          ctx.stroke();
        }
      }

      /* names (rank filter by zoom) */
      if (labelsOn > 0.01 && inside > 0.5) {
        const maxRank = camera.fov < 36 ? 3 : camera.fov < 66 ? 2 : 1;
        ctx.textAlign = 'center';
        for (let ci = 0; ci < geo.names.length; ci++) {
          const n = geo.names[ci];
          const hovered = n.id === hoverCon;
          if (n.rank > maxRank && !hovered) continue;
          const c = geo.centers;
          eqToWorld(e, c[ci * 3], c[ci * 3 + 1], c[ci * 3 + 2], tmp, 0, R);
          if (tmp[1] < 6 || !project(tmp[0], tmp[1], tmp[2])) continue;
          if (P.x < -80 || P.x > W + 80 || P.y < -40 || P.y > H + 40) continue;
          const a = labelsOn * night * (hovered ? 1 : n.rank === 1 ? 0.85 : 0.6);
          ctx.fillStyle = tokA(hovered ? '--gold-bright' : '--gold', 0.85 * a);
          ctx.font = F.jp(hovered ? 17 : 14);
          ctx.fillText(n.ja, P.x, P.y - 6);
          ctx.fillStyle = tokA('--kinu', 0.55 * a);
          ctx.font = F.latin(hovered ? 15 : 13);
          ctx.fillText(n.name, P.x, P.y + 10);
        }
      }
    }

    if (inside < 0.5 && phase !== 'intro') return;

    /* ---------- bright star labels ---------- */
    if (labelsOn > 0.01) {
      ctx.textAlign = 'left';
      for (const b of bright) {
        const ra = cat.stars[b.i * STAR_STRIDE], dec = cat.stars[b.i * STAR_STRIDE + 1];
        eqToWorld(e, Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG), tmp, 0, R);
        if (tmp[1] < 3 || !project(tmp[0], tmp[1], tmp[2])) continue;
        if (P.x < -50 || P.x > W + 50 || P.y < -20 || P.y > H + 20) continue;
        const a = labelsOn * skyClock.palette.starFade;
        ctx.fillStyle = tokA('--kinu', 0.7 * a);
        ctx.font = F.latin(14);
        ctx.fillText(b.name, P.x + 9, P.y + 4);
        ctx.fillStyle = tokA('--gold', 0.65 * a);
        ctx.font = F.jp(11);
        ctx.fillText(b.ja, P.x + 9, P.y + 17);
      }
    }

    /* ---------- planets ---------- */
    for (const p of skyClock.planets) {
      if (p.dir[1] < 0.01 || !project(p.dir[0] * R, p.dir[1] * R, p.dir[2] * R)) continue;
      const a = labelsOn * (0.4 + 0.6 * skyClock.palette.starFade);
      if (a < 0.02) continue;
      ctx.textAlign = 'left';
      ctx.fillStyle = tokA('--gold', 0.85 * a);
      ctx.font = F.jp(13);
      ctx.fillText(p.jp, P.x + 10, P.y - 3);
      ctx.fillStyle = tokA('--kinu', 0.7 * a);
      ctx.font = F.latin(13);
      ctx.fillText(p.name, P.x + 10, P.y + 11);
    }

    /* ---------- Moon name ---------- */
    const moon = live.get('moon');
    if (moon && moon.world[1] > 0 && project(moon.world[0], moon.world[1], moon.world[2])) {
      const r = moonDraw.radius * pxPerUnit(P.depth, camera, H);
      const kanji = String(moon.info?.kanji ?? ''), romaji = String(moon.info?.romaji ?? '');
      ctx.textAlign = 'left';
      ctx.fillStyle = tokA('--moon-warm', 0.9 * Math.max(labelsOn, phase === 'intro' ? reveal : 0));
      ctx.font = F.jp(15);
      ctx.fillText(`${kanji} · ${romaji}`, P.x + r + 12, P.y + 5);
    }

    /* ---------- DSO marks (Lens targets + brightest up) ---------- */
    if (labelsOn > 0.01) {
      for (const id of ['M42', 'M31', 'M45', 'lens-best']) {
        const o = live.get(id);
        if (!o || o.world[1] < 2 || !project(o.world[0], o.world[1], o.world[2])) continue;
        if (id === 'lens-best' && ['M42', 'M31', 'M45'].includes(String(o.info?.id))) continue;
        const a = labelsOn * skyClock.palette.starFade;
        ctx.strokeStyle = tokA('--fuji', 0.55 * a);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(P.x, P.y, 7 * Math.min(1.6, zoom), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'left';
        ctx.fillStyle = tokA('--fuji', 0.8 * a);
        ctx.font = F.ui(10);
        ctx.letterSpacing = '0.12em';
        ctx.fillText((id === 'lens-best' ? String(o.info?.id) : id).toUpperCase(), P.x + 11, P.y - 6);
        ctx.letterSpacing = '0px';
      }
    }

    /* ---------- ISS arc (dotted gold), crimson live dot ---------- */
    const now = skyClock.date.getTime();
    const arc = issArcAt(now);
    if (arc && labelsOn > 0.01) {
      ctx.setLineDash([1.5, 6]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = tokA('--gold', 0.75 * labelsOn);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let pen = false;
      let lx = 0, ly = 0, have = false;
      for (let i = 0; i < arc.n; i++) {
        const x = arc.dirs[i * 3] * R * 0.96, y = arc.dirs[i * 3 + 1] * R * 0.96, z = arc.dirs[i * 3 + 2] * R * 0.96;
        if (y > 0 && project(x, y, z)) {
          if (pen) ctx.lineTo(P.x, P.y);
          else ctx.moveTo(P.x, P.y);
          pen = true;
          if (!have) {
            lx = P.x;
            ly = P.y;
            have = true;
          }
        } else pen = false;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const sun = issPointAt(arc, now, iss);
      if (sun >= 0 && project(iss[0] * R * 0.96, iss[1] * R * 0.96, iss[2] * R * 0.96)) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 4);
        ctx.fillStyle = tokA('--crimson-bright', sun ? 1 : 0.45);
        ctx.beginPath();
        ctx.arc(P.x, P.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = tokA('--crimson-bright', 0.5 * pulse);
        ctx.beginPath();
        ctx.arc(P.x, P.y, 7 + 3 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        lx = P.x;
        ly = P.y;
        have = true;
      }
      if (have) {
        ctx.textAlign = 'left';
        ctx.font = F.ui(10.5);
        ctx.letterSpacing = '0.14em';
        ctx.fillStyle = tokA(sun >= 0 ? '--crimson-bright' : '--gold', 0.9 * labelsOn);
        const when = sun >= 0 ? 'NOW' : fmtClock(new Date(arc.start), s.tz);
        ctx.fillText(`ISS · ${when}${arc.pass.visible ? '' : ' · NOT VISIBLE'}`, lx + 10, ly - 8);
        ctx.letterSpacing = '0px';
      }
    }

    /* ---------- meteor radiant ---------- */
    const rad = live.get('meteor-radiant');
    if (rad && skyData.shower && rad.world[1] > 2 && labelsOn > 0.01 && project(rad.world[0], rad.world[1], rad.world[2])) {
      const real = showerRateAt(skyData.shower, now);
      const a = labelsOn * (0.35 + 0.65 * skyClock.palette.starFade);
      ctx.strokeStyle = tokA('--sakura', 0.6 * a);
      ctx.lineWidth = 1;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + t * 0.05;
        ctx.beginPath();
        ctx.moveTo(P.x + Math.cos(ang) * 5, P.y + Math.sin(ang) * 5);
        ctx.lineTo(P.x + Math.cos(ang) * 11, P.y + Math.sin(ang) * 11);
        ctx.stroke();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = tokA('--sakura', 0.85 * a);
      ctx.font = F.jp(12);
      ctx.fillText(skyData.shower.shower.jp, P.x + 15, P.y - 4);
      ctx.fillStyle = tokA('--kinu', 0.6 * a);
      ctx.font = F.ui(10);
      const shown = meteorStats.shownPerHour;
      const speed = real > 0 ? Math.round(shown / real) : 0;
      ctx.fillText(`${skyData.shower.shower.name} · ${real.toFixed(1)}/h from here${real > 0 ? ` · drawn ×${speed || METEOR_SCALE}` : ''}`, P.x + 15, P.y + 10);
    }

    /* ---------- compass kanji on the horizon ---------- */
    if (inside > 0.5) {
      ctx.textAlign = 'center';
      for (const [j, l, az] of COMPASS) {
        if (!project(Math.sin(az * DEG) * R, 0.8, -Math.cos(az * DEG) * R)) continue;
        if (P.x < -20 || P.x > W + 20) continue;
        ctx.fillStyle = tokA('--crimson-bright', 0.92);
        ctx.font = F.jp(15, 700);
        ctx.fillText(j, P.x, P.y - 6);
        ctx.fillStyle = tokA('--washi-3', 0.75);
        ctx.font = F.ui(10);
        ctx.fillText(l, P.x, P.y + 9);
      }
    }

    /* ---------- hover reticle + leader-line label ---------- */
    const h = hoverRef.obj;
    if (h && (phase === 'sky' || phase === 'diving') && project(h.world[0], h.world[1], h.world[2])) {
      const age = Math.min(1, (performance.now() - hoverRef.since) / 220);
      const ease = 1 - Math.pow(1 - age, 3);
      let r = 11;
      if (h.kind === 'moon') r = moonDraw.radius * pxPerUnit(P.depth, camera, H) + 6;
      if (h.kind === 'sun') r = moonDraw.sunRadius * pxPerUnit(P.depth, camera, H) + 6;
      r *= 1.5 - 0.5 * ease;
      const x = P.x, y = P.y;
      ctx.strokeStyle = tokA('--gold-bright', 0.9 * ease);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      const spin = t * 0.4;
      for (let k = 0; k < 4; k++) {
        const ang = spin + (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * (r + 3), y + Math.sin(ang) * (r + 3));
        ctx.lineTo(x + Math.cos(ang) * (r + 8), y + Math.sin(ang) * (r + 8));
        ctx.stroke();
      }
      // leader line: diagonal up-right, then a horizontal hairline under the label
      const dx = x > W - 260 ? -1 : 1;
      const x1 = x + dx * (r + 22 * ease), y1 = y - (r + 22 * ease);
      const len = 150 * ease;
      ctx.strokeStyle = tokA('--gold', 0.7 * ease);
      ctx.beginPath();
      ctx.moveTo(x + dx * r * 0.7, y - r * 0.7);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + dx * len, y1);
      ctx.stroke();
      ctx.textAlign = dx > 0 ? 'left' : 'right';
      const tx = x1 + dx * 2;
      ctx.globalAlpha = ease;
      ctx.fillStyle = tokA('--kinu', 1);
      ctx.font = F.display(15);
      ctx.letterSpacing = '0.08em';
      const nm = h.name.toUpperCase();
      ctx.fillText(nm, tx, y1 - 8);
      const wName = ctx.measureText(nm).width;
      ctx.letterSpacing = '0px';
      if (h.jp) {
        ctx.fillStyle = tokA('--gold', 1);
        ctx.font = F.jp(13);
        ctx.fillText(h.jp, tx + dx * (wName + 10), y1 - 8);
      }
      ctx.fillStyle = tokA('--jade-fog', 1);
      ctx.font = F.ui(10);
      ctx.letterSpacing = '0.16em';
      ctx.fillText(subline(h), tx, y1 + 13);
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
    }
  });

  function strokeFigures(ctx: CanvasRenderingContext2D, only: number, skipId: string | null, W: number, H: number) {
    const scr = geo.scr;
    for (let p = 0; p < geo.polyCount; p++) {
      const ci = geo.polyCon[p];
      if (only >= 0 && ci !== only) continue;
      if (skipId && geo.names[ci].id === skipId) continue;
      const st = geo.polyStart[p];
      for (let k = 0; k < geo.polyLen[p] - 1; k++) {
        const a = (st + k) * 3, b = a + 3;
        if (!scr[a + 2] || !scr[b + 2]) continue;
        const ax = scr[a], ay = scr[a + 1], bx = scr[b], by = scr[b + 1];
        if ((ax < -300 && bx < -300) || (ax > W + 300 && bx > W + 300) || (ay < -300 && by < -300) || (ay > H + 300 && by > H + 300)) continue;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    }
  }

  function positionHotspots(on: boolean) {
    for (const { el, anchor } of domeHotspots.values()) {
      const o = live.get(anchor);
      const ok = on && o && o.world[1] > -2 && project(o.world[0], o.world[1], o.world[2]);
      if (!ok) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.style.transform = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`;
    }
  }

  return null;
}

function subline(h: { kind: string; route?: string; info?: Record<string, string | number | null | undefined> }): string {
  const i = h.info ?? {};
  const bits: string[] = [];
  if (h.kind === 'star') bits.push('STAR');
  if (h.kind === 'planet') bits.push('PLANET');
  if (h.kind === 'dso') bits.push(String(i.desig || 'DEEP SKY'));
  if (h.kind === 'constellation') bits.push('CONSTELLATION');
  if (h.kind === 'moon') bits.push(`${i.illumination ?? ''}% LIT`);
  if (h.kind === 'iss') bits.push(i.live ? 'PASSING NOW' : `NEXT PASS ${i.start ?? ''}`);
  if (h.kind === 'meteor') bits.push(`${i.rate_per_hour ?? 0}/H FROM HERE`);
  if (i.mag !== undefined && i.mag !== null) bits.push(`MAG ${i.mag}`);
  if (h.kind === 'landmark') bits.push('WHERE TO WATCH');
  bits.push(h.route ? 'CLICK TO ENTER' : 'CLICK FOR DETAILS');
  return bits.join(' · ');
}

