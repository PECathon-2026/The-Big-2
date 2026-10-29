import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import './ui.css';

/** Japanese text in Shippori Mincho with lang="ja". Always pair with an English gloss nearby (§5.2). */
export function Kanji({ children, className = '', ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span lang="ja" className={`jp ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** Uppercase gold eyebrow. `jp` renders before the Latin text. */
export function Eyebrow({ children, jp, className = '' }: { children: ReactNode; jp?: string; className?: string }) {
  return (
    <div className={`eyebrow tw-eyebrow ${className}`}>
      {jp && <Kanji>{jp}</Kanji>}
      <span>{children}</span>
    </div>
  );
}

/**
 * Title with one accent word: put it in <em>. e.g. <Title>Choose your <em>chapter</em>.</Title>
 * level: 'hero' | 1 | 2 | 3
 */
export function Title({ children, level = 1, className = '', id }: { children: ReactNode; level?: 'hero' | 1 | 2 | 3; className?: string; id?: string }) {
  const cls = `tw-title ${level === 'hero' ? 'hero' : level === 2 ? 'h2' : level === 3 ? 'h3' : ''} ${className}`;
  if (level === 2) return <h2 id={id} className={cls}>{children}</h2>;
  if (level === 3) return <h3 id={id} className={cls}>{children}</h3>;
  return <h1 id={id} className={cls}>{children}</h1>;
}

export function Hairline({ className = '' }: { className?: string }) {
  return <hr className={`tw-hairline ${className}`} />;
}

export type ButtonVariant = 'primary' | 'secondary' | 'commit';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(function Button(
  { variant = 'primary', className = '', type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={`tw-btn ${variant} ${className}`} {...rest} />;
});

/** Glass panel. `spotlight` adds a gold spotlight following the pointer. Sets data-cursor="off". */
export function Card({ children, spotlight = false, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { spotlight?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!spotlight || !el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    el.addEventListener('pointermove', move);
    return () => el.removeEventListener('pointermove', move);
  }, [spotlight]);
  return (
    <div ref={ref} data-cursor="off" className={`glass tw-card ${spotlight ? 'spotlight' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export type ChipVariant = 'live' | 'mock' | 'stale' | 'provenance' | 'plain';

export function Chip({ variant = 'plain', children, className = '', title }: { variant?: ChipVariant; children?: ReactNode; className?: string; title?: string }) {
  return (
    <span className={`tw-chip ${variant} ${className}`} title={title}>
      {children ?? (variant === 'mock' ? 'MOCK · pipeline pending' : variant === 'stale' ? 'stale' : variant === 'live' ? 'live' : null)}
    </span>
  );
}

/** Native <dialog> with blurred backdrop. Controlled by `open`; Esc / backdrop click call onClose. */
export function Dialog({ open, onClose, children, label, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`tw-dialog ${className}`}
      data-cursor="off"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}
