/**
 * Fetch once per place (§6.6): moon, sun, planets, events, passes, meteors and the Night Honor Score.
 * Results feed both the HUD and the sky markers. Errors keep the last good data and mark it stale;
 * a failed slice retries after 30 s. Never blanks.
 */
import { create } from 'zustand';
import { api, type Envelope, type Moon, type NightScore, type Pass, type PlanetInfo, type Provenance, type Shower, type SkyEvent, type Sun } from './api';
import { useApp, type Place } from '@/state/store';

export interface Slice<T> {
  data: T | null;
  provenance: Provenance[];
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: string | null;
  /** true when showing older data after a failed refresh */
  stale: boolean;
  computedAt: string | null;
}

const empty = <T,>(): Slice<T> => ({ data: null, provenance: [], status: 'idle', error: null, stale: false, computedAt: null });

export interface Tonight {
  key: string | null;
  moon: Slice<Moon>;
  sun: Slice<Sun>;
  planets: Slice<PlanetInfo[]>;
  events: Slice<SkyEvent[]>;
  passes: Slice<Pass[]>;
  meteors: Slice<Shower[]>;
  score: Slice<NightScore>;
}

type SliceName = Exclude<keyof Tonight, 'key'>;

export const useTonight = create<Tonight>()(() => ({
  key: null,
  moon: empty(),
  sun: empty(),
  planets: empty(),
  events: empty(),
  passes: empty(),
  meteors: empty(),
  score: empty(),
}));

const placeKey = (p: Place) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

const fetchers: Record<SliceName, (p: Place) => Promise<Envelope<unknown>>> = {
  moon: (p) => api.scroll.moon(p),
  sun: (p) => api.scroll.sun(p),
  planets: (p) => api.scroll.planets(p),
  events: (p) => api.scroll.events(p, 7),
  passes: (p) => api.scroll.passes(p, 3),
  meteors: (p) => api.scroll.meteors(p),
  score: (p) => api.watchtower.score(p),
};

const retryTimers = new Map<SliceName, number>();

async function loadSlice(name: SliceName, place: Place, key: string) {
  useTonight.setState((s) => ({ [name]: { ...s[name], status: 'loading' } }) as Partial<Tonight>);
  try {
    const env = await fetchers[name](place);
    if (useTonight.getState().key !== key) return;
    useTonight.setState({ [name]: { data: env.data, provenance: env.provenance ?? [], status: 'ok', error: null, stale: false, computedAt: env.computed_at } } as Partial<Tonight>);
    // The API's timezone is the authority for displayed times (§6.4).
    if ((name === 'moon' || name === 'score') && env.data && typeof (env.data as { timezone?: string }).timezone === 'string') {
      useApp.getState().setTz((env.data as { timezone: string }).timezone);
    }
  } catch (e) {
    if (useTonight.getState().key !== key) return;
    useTonight.setState((s) => ({ [name]: { ...s[name], status: 'error', error: e instanceof Error ? e.message : String(e), stale: s[name].data != null } }) as Partial<Tonight>);
    window.clearTimeout(retryTimers.get(name));
    retryTimers.set(name, window.setTimeout(() => useTonight.getState().key === key && loadSlice(name, place, key), 30_000));
  }
}

/** Start (or reuse) the per-place fetches. Safe to call repeatedly. Returns a promise for the loader's progress. */
export function loadTonight(place: Place, force = false): Promise<void> {
  const key = placeKey(place);
  const st = useTonight.getState();
  if (!force && st.key === key) return Promise.resolve();
  if (st.key !== key) {
    // a new place: never show the previous place's numbers while its own load
    for (const t of retryTimers.values()) window.clearTimeout(t);
    retryTimers.clear();
    useTonight.setState({ key, moon: empty(), sun: empty(), planets: empty(), events: empty(), passes: empty(), meteors: empty(), score: empty() });
  } else useTonight.setState({ key });
  return Promise.all((Object.keys(fetchers) as SliceName[]).map((n) => loadSlice(n, place, key))).then(() => undefined);
}

// Follow the place automatically.
useApp.subscribe((s, prev) => {
  if (s.place && s.place !== prev.place) loadTonight(s.place);
});

/** Small per-key memo cache for module pages, keyed by path + rounded place + hour, so dives never refetch. */
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
export function cached<T>(path: string, place: Pick<Place, 'lat' | 'lon'> | null, fetcher: () => Promise<T>, ttlMs = 15 * 60_000): Promise<T> {
  const hour = Math.floor(Date.now() / 3600_000);
  const key = `${path}|${place ? `${place.lat.toFixed(2)},${place.lon.toFixed(2)}` : ''}|${hour}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fetcher();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  return value;
}
