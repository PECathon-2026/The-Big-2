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

/** gold = solid gold CTA · primary = gold outline · secondary = text + hairline · commit = crimson */
export type ButtonVariant = 'gold' | 'primary' | 'secondary' | 'commit';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(function Button(
  { variant = 'primary', className = '', type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={`tw-btn ${variant} ${className}`} {...rest} />;
});

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** crimson + gold spotlight following the pointer */
  spotlight?: boolean;
  /** translucent blurred body instead of solid #0B0B0B (for cards floating directly over the sky) */
  glassy?: boolean;
  /** PECFEST header row: crimson seal + Cinzel brand text on the left */
  brand?: { kanji: string; text: string };
  /** header tag on the right, e.g. "№ 01" */
  tag?: ReactNode;
  /** hide the inner gold frame + corner brackets (dense lists) */
  plain?: boolean;
}

/** PECFEST developer card (pecfest.in/developer): #0B0B0B, 20px radius, gold inner frame + corner brackets. */
export function Card({ children, spotlight = false, glassy = false, brand, tag, plain = false, className = '', ...rest }: CardProps) {
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
    <div ref={ref} data-cursor="off" className={`tw-card ${glassy ? 'glassy' : ''} ${spotlight ? 'spotlight' : ''} ${className}`} {...rest}>
      {!plain && (
        <>
          <span className="tw-card-frame" aria-hidden="true" />
          <span className="tw-card-corner tl" aria-hidden="true" />
          <span className="tw-card-corner tr" aria-hidden="true" />
          <span className="tw-card-corner bl" aria-hidden="true" />
          <span className="tw-card-corner br" aria-hidden="true" />
        </>
      )}
      <div className="tw-card-content">
        {(brand || tag) && (
          <div className="tw-card-head">
            {brand ? (
              <span className="tw-card-brand">
                <span className="tw-card-brand-kanji" lang="ja">
                  {brand.kanji}
                </span>
                {brand.text}
              </span>
            ) : (
              <span />
            )}
            {tag && <span className="tw-tag num">{tag}</span>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Small dark tag with gold hairline (PECFEST role tag / № box). */
export function Tag({ children, num = false, className = '' }: { children: ReactNode; num?: boolean; className?: string }) {
  return <span className={`tw-tag ${num ? 'num' : ''} ${className}`}>{children}</span>;
}

/** Gold gradient divider and crimson brush underline from the PECFEST card. */
export const Divider = () => <span className="tw-divider" aria-hidden="true" />;
export const BrushLine = () => <span className="tw-brush" aria-hidden="true" />;

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
