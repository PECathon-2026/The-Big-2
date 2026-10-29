/**
 * Small page-level pieces shared by the module pages (D): reveal-on-view, count-up numbers,
 * loading / error lines that never blank, the provenance footer, section headings, moon glyphs.
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import CountUp from '@/vendor/reactbits/CountUp';
import type { Provenance } from '@/data/api';
import { fmtRelative, fmtTime } from '@/data/format';
import { drawMoon } from '@/astro/moonNames';
import { useApp } from '@/state/store';
import { Chip, Eyebrow, Kanji, Title } from '@/ui';

/** The page's own scroll container, so reveals observe the right root. */
export const ScrollerCtx = createContext<HTMLElement | null>(null);

/** True when motion should be skipped (OS setting, field mode or Lite). */
export function useCalm(): boolean {
  return useApp((s) => s.reducedMotion || s.field || s.lite);
}

/**
 * Ink-arrive reveal (§5.3): 24 px slide + 3 px blur → sharp, once, when it scrolls into view.
 * `i` staggers siblings by 70 ms.
 */
export function Reveal({ children, i = 0, as: Tag = 'div', className = '', style, id }: { children: ReactNode; i?: number; as?: 'div' | 'section' | 'li' | 'article'; className?: string; style?: CSSProperties; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const root = useContext(ScrollerCtx);
  const calm = useCalm();
  const [inView, setIn] = useState(calm);
  useEffect(() => {
    if (calm) return setIn(true);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setIn(true);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setIn(true);
          io.disconnect();
        }
      },
      { root, rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root, calm]);
  const T = Tag as 'div';
  return (
    <T ref={ref as React.RefObject<HTMLDivElement>} id={id} className={`mi ${inView ? 'is-in' : ''} ${className}`} style={{ ...style, ['--i' as string]: i }}>
      {children}
    </T>
  );
}

/** A number from the API that counts up on first view (React Bits CountUp); plain text when calm. */
export function Num({ value, decimals = 0, suffix = '', prefix = '', className = '', style }: { value: number | null | undefined; decimals?: number; suffix?: string; prefix?: string; className?: string; style?: CSSProperties }) {
  const calm = useCalm();
  if (value == null || Number.isNaN(value)) return <span className={`num ${className}`} style={style}>—</span>;
  if (calm)
    return (
      <span className={`num ${className}`} style={style}>
        {prefix}
        {value.toFixed(decimals)}
        {suffix}
      </span>
    );
  return <CountUp to={value} decimals={decimals} duration={1.4} prefix={prefix} suffix={suffix} separator="," className={`num ${className}`} style={style} />;
}

/** Loading / error line that sits beside kept data; never replaces it. */
export function DataState({ status, error, stale, hasData, what, onRetry }: { status: string; error: string | null; stale: boolean; hasData: boolean; what: string; onRetry?: () => void }) {
  if (status === 'loading' && !hasData)
    return (
      <p className="pg-loading" role="status">
        <span className="pg-brush-dot" aria-hidden="true" /> {what}
      </p>
    );
  if (error && !hasData)
    return (
      <p className="pg-error" role="alert">
        Could not reach this source yet ({error}). Retrying every 30 s.
        {onRetry && (
          <button className="tw-btn secondary" onClick={onRetry} style={{ minHeight: 32 }}>
            Retry now
          </button>
        )}
      </p>
    );
  if (stale) return <Chip variant="stale" title={error ?? undefined}>stale · showing last good data</Chip>;
  return null;
}

/** Section heading with an anchor id; eyebrow kanji + gloss, title with one accent word. */
export function SectionHead({ id, jp, eyebrow, children, right }: { id?: string; jp?: string; eyebrow: string; children: ReactNode; right?: ReactNode }) {
  return (
    <header className="pg-sec-head" id={id}>
      <div>
        <Eyebrow jp={jp}>{eyebrow}</Eyebrow>
        <Title level={2}>{children}</Title>
      </div>
      {right && <div className="pg-sec-right">{right}</div>}
    </header>
  );
}

/** Deduped list of every source the page used. */
export function ProvenanceFooter({ lists, computedAt }: { lists: (Provenance[] | undefined)[]; computedAt?: (string | null | undefined)[] }) {
  const tz = useApp((s) => s.tz);
  const seen = new Map<string, Provenance>();
  for (const l of lists) for (const p of l ?? []) seen.set(`${p.source}|${p.url ?? ''}|${p.note ?? ''}`, p);
  const items = [...seen.values()];
  const latest = (computedAt ?? []).filter((x): x is string => !!x).sort().slice(-1)[0];
  return (
    <footer className="pg-prov" data-cursor="off">
      <Eyebrow jp="出典">Provenance · every number on this page</Eyebrow>
      {latest && (
        <p className="pg-quiet num">
          computed {fmtTime(latest, tz, true)} · {fmtRelative(latest)}
        </p>
      )}
      {items.length === 0 ? (
        <p className="pg-quiet">No sources reported yet.</p>
      ) : (
        <ul>
          {items.map((p, i) => (
            <li key={i}>
              <strong>{p.source}</strong>
              {p.fetched_at ? <span className="num"> · fetched {fmtTime(p.fetched_at, tz, true)}</span> : <span> · computed</span>}
              {p.cached && <Chip variant="provenance">cached</Chip>}
              {p.stale && <Chip variant="stale" />}
              {p.note && <span className="pg-quiet"> · {p.note}</span>}
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" className="pg-link">
                  source ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}

/** SVG Moon glyph from the phase angle (0 new · 90 first quarter · 180 full · 270 last quarter). Ported from frontend-basic. */
export function MoonGlyph({ phaseDeg, size = 22, lit = 'var(--moon-warm)', dark = 'var(--ink)', label }: { phaseDeg: number; size?: number; lit?: string; dark?: string; label?: string }) {
  const p = ((phaseDeg % 360) + 360) % 360;
  const waxing = p < 180;
  const k = (1 - Math.cos((p * Math.PI) / 180)) / 2;
  const r = 10;
  const rx = Math.abs(Math.cos((p * Math.PI) / 180)) * r;
  const half = `M0,${-r} A${r},${r} 0 0 ${waxing ? 1 : 0} 0,${r} Z`;
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22" role="img" aria-label={label ?? `Moon phase ${p.toFixed(0)}°`}>
      <circle r={r} fill={dark} stroke="rgba(232,217,181,.28)" strokeWidth="0.6" />
      <path d={half} fill={lit} />
      <ellipse rx={Math.max(rx, 0.01)} ry={r} fill={k > 0.5 ? lit : dark} />
    </svg>
  );
}

/** A large phase-correct Moon on a canvas using the demo's drawMoon (ageDays), with a soft halo. */
export function MoonDisc({ ageDays, size = 220, label }: { ageDays: number; size?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const field = useApp((s) => s.field);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const css = getComputedStyle(document.documentElement);
    const lit = css.getPropertyValue('--moon-warm').trim() || '#F3EAD6';
    const r = size * 0.4;
    const halo = g.createRadialGradient(size / 2, size / 2, r * 0.9, size / 2, size / 2, size / 2);
    halo.addColorStop(0, 'rgba(243,234,214,.16)');
    halo.addColorStop(1, 'rgba(243,234,214,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    drawMoon(g, size / 2, size / 2, r, ageDays, { color: lit, earthshine: 'rgba(169,193,240,.07)' });
  }, [ageDays, size, field]);
  return <canvas ref={ref} role="img" aria-label={label} style={{ width: size, height: size, display: 'block' }} />;
}

/** Kanji glyph + romaji + English, the §5.2 rule for Japanese text. */
export function Gloss({ jp, romaji, en }: { jp: string; romaji?: string; en?: string }) {
  return (
    <span className="pg-gloss">
      <Kanji>{jp}</Kanji>
      {romaji && <span className="r">{romaji}</span>}
      {en && <span className="e">{en}</span>}
    </span>
  );
}
