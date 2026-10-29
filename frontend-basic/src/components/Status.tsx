import type { ReactNode } from 'react';
import { describeError } from '../hooks/useApi';
import type { UseApi } from '../hooks/useApi';

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <div className="status loading">{what}…</div>;
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const d = describeError(error);
  return (
    <div className="status error">
      <div className="t">{d.title}</div>
      <div>{d.detail}</div>
      {d.body && <code>{d.body}</code>}
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <button className="btn small ghost" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export function Empty({ children = 'Nothing to show.' }: { children?: ReactNode }) {
  return <div className="status">{children}</div>;
}

/**
 * Renders loading / error / empty states for a useApi result, otherwise calls
 * `children(data)`. Keeps stale data visible while reloading (with a hint).
 */
export function Await<T>({
  q,
  what,
  isEmpty,
  emptyText,
  children,
}: {
  q: UseApi<T>;
  what?: string;
  isEmpty?: (d: T) => boolean;
  emptyText?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { state } = q;
  if (state.status === 'idle') return <Empty>Waiting…</Empty>;
  if (state.status === 'loading' && state.data === undefined) return <Loading what={what} />;
  if (state.status === 'error') return <ErrorBox error={state.error} onRetry={q.reload} />;
  const data = state.data as T;
  if (isEmpty && isEmpty(data)) return <Empty>{emptyText ?? 'Nothing to show.'}</Empty>;
  return (
    <>
      {state.status === 'loading' && <div className="muted small" style={{ marginBottom: 6 }}>Refreshing…</div>}
      {children(data)}
    </>
  );
}
