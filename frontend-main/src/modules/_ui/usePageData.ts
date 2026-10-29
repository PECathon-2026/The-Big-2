/**
 * Page-only fetches (spots, calendar, eclipses, launches…) through the shared `cached()` memo, so a
 * dive never refetches. Keeps the last good data and marks it stale on a failed refresh (§6.6), and
 * retries every 30 s while failing. Never blanks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Envelope, Provenance } from '@/data/api';
import { cached } from '@/data/tonight';
import { useApp } from '@/state/store';

export interface PageData<T> {
  data: T | null;
  provenance: Provenance[];
  computedAt: string | null;
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: string | null;
  stale: boolean;
  reload: () => void;
}

export function usePageData<T>(key: string | null, fetcher: () => Promise<Envelope<T>>, ttlMs?: number): PageData<T> {
  const place = useApp((s) => s.place);
  const [st, setSt] = useState<Omit<PageData<T>, 'reload'>>({ data: null, provenance: [], computedAt: null, status: 'idle', error: null, stale: false });
  const [tick, setTick] = useState(0);
  const fRef = useRef(fetcher);
  fRef.current = fetcher;

  useEffect(() => {
    if (!key || !place) return;
    let alive = true;
    let retry = 0;
    setSt((s) => ({ ...s, status: 'loading' }));
    // a forced reload bypasses the memo by adding the tick to the key
    cached(`${key}#${tick}`, place, () => fRef.current(), ttlMs)
      .then((env) => {
        if (!alive) return;
        setSt({ data: env.data, provenance: env.provenance ?? [], computedAt: env.computed_at, status: 'ok', error: null, stale: false });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setSt((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e), stale: s.data != null }));
        retry = window.setTimeout(() => alive && setTick((t) => t + 1), 30_000);
      });
    return () => {
      alive = false;
      window.clearTimeout(retry);
    };
  }, [key, place, tick, ttlMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...st, reload };
}
