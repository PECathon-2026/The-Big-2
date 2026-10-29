import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError, type Envelope, type Provenance } from '../api';

export type ApiState<T> =
  | { status: 'idle'; data?: undefined; provenance: Provenance[]; error?: undefined; computedAt?: undefined }
  | { status: 'loading'; data?: T; provenance: Provenance[]; error?: undefined; computedAt?: string }
  | { status: 'ok'; data: T; provenance: Provenance[]; error?: undefined; computedAt: string }
  | { status: 'error'; data?: T; provenance: Provenance[]; error: Error; computedAt?: string };

export interface UseApi<T> {
  state: ApiState<T>;
  data: T | undefined;
  provenance: Provenance[];
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs `fetcher` whenever `deps` change (and on mount). Aborts an in-flight
 * request when deps change. Pass `enabled=false` to hold off.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<Envelope<T>>, deps: DependencyList, enabled = true): UseApi<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'idle', provenance: [] });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    setState((s) => ({ status: 'loading', data: s.data, provenance: s.provenance, computedAt: s.computedAt }) as ApiState<T>);
    fetcherRef
      .current(ac.signal)
      .then((env) => {
        if (ac.signal.aborted) return;
        setState({ status: 'ok', data: env.data, provenance: env.provenance ?? [], computedAt: env.computed_at });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const e = err instanceof Error ? err : new Error(String(err));
        if (e.name === 'AbortError') return;
        setState((s) => ({ status: 'error', data: s.data, provenance: s.provenance, error: e }) as ApiState<T>);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    state,
    data: state.data,
    provenance: state.provenance,
    error: state.error,
    loading: state.status === 'loading',
    reload,
  };
}

/** Wrap a raw (non-enveloped) promise so useApi can consume it. */
export function asEnvelope<T>(p: Promise<T>): Promise<Envelope<T>> {
  return p.then((data) => ({ data, provenance: [], computed_at: new Date().toISOString() }));
}

export function describeError(e: Error): { title: string; detail: string; body?: string } {
  if (e instanceof ApiError) {
    const p = e.provider;
    if (e.isProviderUnavailable && p) {
      return {
        title: `Provider unavailable · ${p.source ?? 'unknown source'}`,
        detail: p.detail ?? 'The upstream provider did not answer.',
        body: JSON.stringify(e.body, null, 2),
      };
    }
    return {
      title: `HTTP ${e.status}`,
      detail: e.message,
      body: typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2),
    };
  }
  if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
    return {
      title: 'No response from the backend',
      detail: `The request ended without a response (${e.message}). Either the backend is not running on port 8000, or it dropped the connection before answering — slow endpoints such as /spots can exceed a server-side timeout.`,
    };
  }
  return { title: e.name || 'Error', detail: e.message };
}
