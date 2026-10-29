import { useState } from 'react';
import { ensureSubscribed, pushSupported } from '../push';

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

/**
 * "Notify me" button: subscribes this browser to Web Push (once) and then runs `schedule(endpoint)`.
 * `schedule` should return a short confirmation text (e.g. the local fire time).
 */
export function NotifyButton({ label = 'Notify me', schedule, small = true }: { label?: string; schedule: (endpoint: string) => Promise<string>; small?: boolean }) {
  const [st, setSt] = useState<State>({ kind: 'idle' });
  if (!pushSupported()) return <span className="muted small">push not supported here</span>;
  const run = async () => {
    setSt({ kind: 'busy' });
    try {
      const endpoint = await ensureSubscribed();
      const text = await schedule(endpoint);
      setSt({ kind: 'done', text });
    } catch (e) {
      setSt({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <span className="notify">
      <button className={`btn ${small ? 'small' : ''}`} onClick={() => void run()} disabled={st.kind === 'busy'}>
        {st.kind === 'busy' ? 'Subscribing…' : st.kind === 'done' ? 'Scheduled ✓' : label}
      </button>
      {st.kind === 'done' && <span className="gold small"> {st.text}</span>}
      {st.kind === 'error' && <span className="err small"> {st.text}</span>}
    </span>
  );
}
