/**
 * The ⓘ button (§5.5). Shows provenance (source, fetched time, cached/stale) and, when a `trace`
 * exists, the formula and each contribution. Never hard-code an explanation — pass what the API returned.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Provenance, Trace } from '@/data/api';
import { fmtRelative } from '@/data/format';
import './ui.css';

export interface InfoPopoverProps {
  title: string;
  provenance?: Provenance[];
  trace?: Partial<Trace> | null;
  computedAt?: string | null;
  /** extra notes (e.g. "drawn 3× real size") — must be true statements */
  notes?: ReactNode;
  label?: string;
}

export function InfoPopover({ title, provenance = [], trace, computedAt, notes, label }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const b = btn.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    let x = b.left + b.width / 2 - p.width / 2;
    x = Math.max(16, Math.min(window.innerWidth - p.width - 16, x));
    let y = b.bottom + 10;
    if (y + p.height > window.innerHeight - 16) y = Math.max(16, b.top - p.height - 10);
    setPos({ x, y });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof KeyboardEvent) e.stopPropagation();
      if (e instanceof PointerEvent && (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close, true);
    };
  }, [open]);

  const contributions = trace?.contributions ?? [];
  return (
    <>
      <button ref={btn} className="tw-info-btn" aria-label={label ?? `How ${title} is computed`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        i
      </button>
      {open &&
        createPortal(
          <div ref={pop} id={id} role="dialog" aria-label={title} className="glass tw-popover" data-cursor="off" style={{ left: pos.x, top: pos.y }}>
            <h4>{title}</h4>
            {trace?.formula && <div className="formula">{trace.formula}</div>}
            {contributions.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Value</th>
                    <th>Weight</th>
                    <th>Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.map((c) => (
                    <tr key={c.factor}>
                      <td>{c.label || c.factor}</td>
                      <td className="num">{c.value == null ? '—' : `${typeof c.value === 'number' ? +c.value.toFixed(2) : c.value}${c.unit ? ` ${c.unit}` : ''}`}</td>
                      <td className="num">{c.weight.toFixed(2)}</td>
                      <td className="num">{c.contribution >= 0 ? '+' : ''}{c.contribution.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {trace?.notes?.map((n, i) => (
              <p key={i} style={{ margin: '4px 0', color: 'var(--washi-2)' }}>
                {n}
              </p>
            ))}
            {notes && <div style={{ margin: '6px 0', color: 'var(--washi-2)' }}>{notes}</div>}
            {provenance.length > 0 ? (
              provenance.map((p, i) => (
                <div key={i} className="src">
                  <strong style={{ color: 'var(--washi-2)' }}>{p.source}</strong>
                  {p.fetched_at && <> · fetched {fmtRelative(p.fetched_at)}</>}
                  {p.cached && <> · cached</>}
                  {p.stale && <span style={{ color: 'var(--gold)' }}> · stale</span>}
                  {p.note && <> · {p.note}</>}
                  {p.url && (
                    <>
                      {' '}
                      ·{' '}
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-soft)' }}>
                        source
                      </a>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div className="src">Computed in your browser (astronomy-engine).</div>
            )}
            {computedAt && <div className="src">computed {fmtRelative(computedAt)}</div>}
          </div>,
          document.body,
        )}
    </>
  );
}
