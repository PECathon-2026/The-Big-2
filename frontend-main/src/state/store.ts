/**
 * Global app state (AGENT_BRIEF §6.3). zustand v5.
 *
 * Inside useFrame never select with a hook — read `useApp.getState()` or use
 * `useApp.subscribe` into a ref, so React does not re-render every frame.
 */
import { create } from 'zustand';

export type Phase = 'gate' | 'loading' | 'intro' | 'dome' | 'sky' | 'diving' | 'module';
export type Quality = 'high' | 'medium' | 'low';

export interface Place {
  lat: number;
  lon: number;
  label: string;
  tz?: string;
  source: 'gps' | 'ip' | 'default' | 'manual';
}

export type SkyKind = 'star' | 'planet' | 'moon' | 'sun' | 'dso' | 'constellation' | 'iss' | 'meteor' | 'landmark';

/** A clickable thing in the sky. `world` is in the horizontal frame (§6.4), radius ~R. */
export interface SkyObject {
  kind: SkyKind;
  id: string;
  name: string;
  jp?: string;
  route?: string;
  world: [number, number, number];
  /** free-form data for the InfoCard (mag, constellation, ra/dec…) */
  info?: Record<string, string | number | null | undefined>;
}

export const OFFSET_LIMIT_MS = 72 * 3600_000;

export interface AppState {
  phase: Phase;
  setPhase(p: Phase): void;

  place: Place | null;
  setPlace(p: Place): void;
  /** IANA timezone of the place (from the API `timezone` field), browser zone until it arrives. */
  tz: string;
  setTz(tz: string): void;

  /** Sky time = real now + offset. The time compass writes offsetMs; everything else reads skyDate(). */
  offsetMs: number;
  setOffset(ms: number): void;
  /** While a dive runs the sky must not re-place; setOffset is ignored when frozen. */
  timeFrozen: boolean;
  setTimeFrozen(f: boolean): void;
  skyDate(): Date;

  sound: boolean;
  setSound(on: boolean): void;

  quality: Quality;
  setQuality(q: Quality): void;
  lite: boolean;
  setLite(on: boolean): void;
  reducedMotion: boolean;
  field: boolean;
  setField(on: boolean): void;

  /** 0..1, written by the intro ScrollTrigger. */
  introProgress: number;
  setIntroProgress(p: number): void;

  hovered: SkyObject | null;
  selected: SkyObject | null;
  setHovered(o: SkyObject | null): void;
  select(o: SkyObject | null): void;

  /** Published by the sky (A) so HUD/Director can find objects by id (moon, polaris, m42, iss…). */
  objects: Record<string, SkyObject>;
  publishObjects(list: SkyObject[]): void;

  directoryOpen: boolean;
  setDirectoryOpen(open: boolean): void;
  citySearchOpen: boolean;
  setCitySearchOpen(open: boolean): void;
}

const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function detectLite(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(location.search).has('lite')) return true;
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2')) return true;
  } catch {
    return true;
  }
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
}

const browserTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

export const useApp = create<AppState>()((set, get) => ({
  phase: 'gate',
  setPhase: (phase) => set({ phase }),

  place: null,
  setPlace: (place) => set({ place, ...(place.tz ? { tz: place.tz } : {}) }),
  tz: browserTz,
  setTz: (tz) => set({ tz }),

  offsetMs: 0,
  setOffset: (ms) => {
    if (get().timeFrozen) return;
    set({ offsetMs: Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, ms)) });
  },
  timeFrozen: false,
  setTimeFrozen: (timeFrozen) => set({ timeFrozen }),
  skyDate: () => new Date(Date.now() + get().offsetMs),

  sound: false,
  setSound: (sound) => set({ sound }),

  quality: 'high',
  setQuality: (quality) => set({ quality }),
  lite: detectLite(),
  setLite: (lite) => set({ lite }),
  reducedMotion: !!prefersReduced,
  field: false,
  setField: (field) => {
    document.documentElement.dataset.field = field ? 'on' : 'off';
    set({ field });
  },

  introProgress: 0,
  setIntroProgress: (introProgress) => set({ introProgress }),

  hovered: null,
  selected: null,
  setHovered: (hovered) => {
    if (get().hovered?.id === hovered?.id) return;
    set({ hovered });
  },
  select: (selected) => set({ selected }),

  objects: {},
  publishObjects: (list) =>
    set((s) => {
      const objects = { ...s.objects };
      for (const o of list) objects[o.id] = o;
      return { objects };
    }),

  directoryOpen: false,
  setDirectoryOpen: (directoryOpen) => set({ directoryOpen }),
  citySearchOpen: false,
  setCitySearchOpen: (citySearchOpen) => set({ citySearchOpen }),
}));

// Keep reducedMotion live if the OS setting changes.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) =>
    useApp.setState({ reducedMotion: e.matches }),
  );
}

/** Non-hook accessor for imperative code (useFrame, Director, audio). */
export const app = () => useApp.getState();
