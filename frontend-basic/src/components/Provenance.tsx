import type { Provenance } from '../api';
import { fmtRelative, fmtTime } from '../format';
import { Chip, Label } from './Card';

/** Global provenance footer: dedupes every source across the page's fetches. */
export function ProvenanceFooter({ lists, computedAt }: { lists: (Provenance[] | undefined)[]; computedAt?: (string | undefined)[] }) {
  const seen = new Map<string, Provenance>();
  for (const l of lists) for (const p of l ?? []) seen.set(`${p.source}|${p.url ?? ''}|${p.note ?? ''}`, p);
  const items = [...seen.values()];
  const latest = (computedAt ?? []).filter((x): x is string => !!x).sort().slice(-1)[0];
  return (
    <footer className="prov">
      <Label en="Provenance" jp="出典" right={latest ? `computed ${fmtTime(latest, undefined, true)} · ${fmtRelative(latest)}` : undefined} />
      {items.length === 0 ? (
        <div className="muted">No sources reported yet.</div>
      ) : (
        <ul>
          {items.map((p, i) => (
            <li key={i}>
              <span className="src">{p.source}</span>
              {p.fetched_at ? <span className="num">fetched {fmtTime(p.fetched_at, undefined, true)}</span> : <span className="muted">computed</span>}
              {p.cached && <Chip tone="mist">cached</Chip>}
              {p.stale && <Chip tone="verm">stale</Chip>}
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" title={p.url}>
                  {p.url}
                </a>
              )}
              {p.note && <span className="note">{p.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}
