import type { ReactNode } from 'react';

/** Section label: small uppercase letter-spaced gold text with a Japanese word, e.g. "NIGHT HONOR · 夜の誉". */
export function Label({ en, jp, right }: { en: string; jp?: string; right?: ReactNode }) {
  return (
    <h3 className="label">
      <span>{en}</span>
      {jp && (
        <>
          <span className="muted">·</span>
          <span className="jp">{jp}</span>
        </>
      )}
      {right !== undefined && <span className="right">{right}</span>}
    </h3>
  );
}

export function Card({
  en,
  jp,
  right,
  children,
  className = '',
  hair = false,
}: {
  en?: string;
  jp?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  hair?: boolean;
}) {
  return (
    <section className={`card ${hair ? 'hair' : ''} ${className}`}>
      {en && <Label en={en} jp={jp} right={right} />}
      {children}
    </section>
  );
}

export function Chip({ children, tone = '', onClick, title }: { children: ReactNode; tone?: string; onClick?: () => void; title?: string }) {
  return (
    <span className={`chip ${tone} ${onClick ? 'btn-chip' : ''}`} onClick={onClick} title={title} role={onClick ? 'button' : undefined}>
      {children}
    </span>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ en, jp, right, children, open = false }: { en: string; jp?: string; right?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="sec" open={open}>
      <summary>
        <Label en={en} jp={jp} right={right} />
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}
