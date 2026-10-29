/**
 * Real preloading behind the gate (§7.1) and the loader's narration (§7.2). Every step is a real piece
 * of work with a real weight; the narration lines only ever describe what actually happened.
 *   catalogue ×3 · intro chunk ×4 · Moon texture ×2 · fonts ×1 · sky over the place ×1 · API ×1 each
 */
import { create } from 'zustand';
import { loadCatalog, getStarTargets } from '@/astro/catalog';
import { introTimeline, moonState } from '@/astro/skytime';
import { moonName } from '@/astro/moonNames';
import { useTonight } from '@/data/tonight';
import type { Place } from '@/state/store';
import { intro, timeAt } from '@/scene/intro/introBus';

export type StepId = 'catalog' | 'chunk' | 'moonTex' | 'fonts' | 'moon' | 'sky' | 'api.moon' | 'api.sun' | 'api.score' | 'api.events';

export interface Step {
  id: StepId;
  weight: number;
  done: boolean;
  /** narration once known (real counts / names) */
  line: string;
}

const initial: Record<StepId, Step> = {
  catalog: { id: 'catalog', weight: 3, done: false, line: 'Reading the star catalogue' },
  chunk: { id: 'chunk', weight: 4, done: false, line: 'Preparing the dusk' },
  moonTex: { id: 'moonTex', weight: 2, done: false, line: 'Unrolling the Moon' },
  fonts: { id: 'fonts', weight: 1, done: false, line: 'Grinding the ink' },
  moon: { id: 'moon', weight: 1, done: false, line: "Finding tonight's Moon" },
  sky: { id: 'sky', weight: 1, done: false, line: 'Asking the sky' },
  'api.moon': { id: 'api.moon', weight: 1, done: false, line: "Fetching tonight's forecast" },
  'api.sun': { id: 'api.sun', weight: 1, done: false, line: "Fetching tonight's forecast" },
  'api.score': { id: 'api.score', weight: 1, done: false, line: "Fetching tonight's forecast" },
  'api.events': { id: 'api.events', weight: 1, done: false, line: "Fetching tonight's forecast" },
};

export const usePreload = create<{ steps: Record<StepId, Step> }>()(() => ({ steps: structuredClone(initial) }));

const mark = (id: StepId, line?: string) =>
  usePreload.setState((s) => ({ steps: { ...s.steps, [id]: { ...s.steps[id], done: true, ...(line ? { line } : {}) } } }));
const relabel = (id: StepId, line: string) => usePreload.setState((s) => ({ steps: { ...s.steps, [id]: { ...s.steps[id], line } } }));

export function progress(steps = usePreload.getState().steps): number {
  let tot = 0;
  let got = 0;
  for (const s of Object.values(steps)) {
    tot += s.weight;
    if (s.done) got += s.weight;
  }
  return tot ? got / tot : 1;
}
export const allDone = (steps = usePreload.getState().steps) => Object.values(steps).every((s) => s.done);

/** The intro's in-canvas chunk (lazy, so the gate paints first). */
export const loadIntroChunk = () => import('@/scene/intro/IntroScene');

let started = false;
/** Place-independent preloads. Safe to call many times; starts on gate mount. */
export function startPreload() {
  if (started) return;
  started = true;
  loadCatalog()
    .then((c) => mark('catalog', `Reading the star catalogue · ${c.starCount.toLocaleString('en')} stars`))
    .catch(() => mark('catalog', 'Star catalogue unavailable · continuing'));
  loadIntroChunk()
    .then(() => mark('chunk'))
    .catch(() => mark('chunk'));
  fetch('/textures/moon_color_2k.webp')
    .then((r) => r.blob())
    .then(() => mark('moonTex'))
    .catch(() => mark('moonTex'));
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('500 64px "Cinzel"'),
        document.fonts.load('700 64px "Shippori Mincho"', '月読'),
        document.fonts.load('500 16px "Shippori Mincho"', '月読の見張り'),
        document.fonts.load('italic 500 24px "Cormorant Garamond"'),
        document.fonts.load('500 15px "Plus Jakarta Sans Variable"'),
      ])
    : Promise.resolve();
  fonts.then(() => mark('fonts')).catch(() => mark('fonts'));
}

let placeKey = '';
let tonightUnsub: (() => void) | null = null;

/** Place-dependent work: tonight's Moon, the real time-lapse + star targets, and the API prefetches. */
export function preloadForPlace(place: Place) {
  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  if (key === placeKey) return;
  placeKey = key;
  usePreload.setState((s) => {
    const steps = { ...s.steps };
    for (const id of ['moon', 'sky', 'api.moon', 'api.sun', 'api.score', 'api.events'] as StepId[]) steps[id] = { ...initial[id] };
    return { steps };
  });
  const city = place.label.replace(/^≈\s*/, '');

  // Moon: computed now (astronomy-engine); the API's name replaces it if it arrives.
  const ms = moonState(new Date(), place);
  const mn = moonName(ms.ageDays);
  mark('moon', `Finding tonight's Moon · ${mn.kanji} ${mn.romaji}`);

  relabel('sky', `Asking the sky over ${city}`);
  // The real time-lapse and the stars the petals will land on (yields first so the line can paint).
  setTimeout(() => {
    const tl = introTimeline(place);
    intro.timeline = tl;
    loadCatalog()
      .then((cat) => {
        const at = timeAt(0.64, tl);
        intro.targets = getStarTargets(cat, at, place, 3000, 3);
        const n = intro.targets.count;
        intro.magMax = n ? intro.targets.mags[n - 1] : 5;
        mark('sky', `Asking the sky over ${city} · ${n.toLocaleString('en')} stars above you`);
      })
      .catch(() => mark('sky'));
  }, 30);

  const slices: [StepId, 'moon' | 'sun' | 'score' | 'events'][] = [
    ['api.moon', 'moon'],
    ['api.sun', 'sun'],
    ['api.score', 'score'],
    ['api.events', 'events'],
  ];
  tonightUnsub?.();
  const check = () => {
    const t = useTonight.getState();
    const steps = usePreload.getState().steps;
    for (const [id, name] of slices) {
      const sl = t[name];
      if (steps[id].done) continue;
      if (sl.status === 'ok') {
        if (name === 'moon' && sl.data) {
          const d = sl.data as { name?: { kanji?: string; romaji?: string } };
          if (d.name?.kanji) relabel('moon', `Finding tonight's Moon · ${d.name.kanji} ${d.name.romaji ?? ''}`.trim());
        }
        mark(id, "Fetching tonight's forecast");
      } else if (sl.status === 'error') mark(id, "Fetching tonight's forecast · offline, using the sky alone");
    }
  };
  tonightUnsub = useTonight.subscribe(check);
  check();
}
