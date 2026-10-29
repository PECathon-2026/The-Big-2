/** Hanko seal (§5.5): vermilion SVG with a rough-edge turbulence filter, like the demo's #rough. */
import { useId } from 'react';
import './ui.css';

export function Stamp({ kanji, size = 72, animate = false, label, round = false }: { kanji: string; size?: number; animate?: boolean; label?: string; round?: boolean }) {
  const fid = useId().replace(/:/g, '');
  const chars = [...kanji];
  const fs = chars.length === 1 ? 54 : chars.length === 2 ? 36 : 26;
  return (
    <span className={`tw-stamp ${animate ? 'animate' : ''}`} role="img" aria-label={label ?? kanji} style={{ width: size, height: size, transform: animate ? undefined : 'rotate(-6deg)' }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <defs>
          <filter id={`rough-${fid}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" />
          </filter>
        </defs>
        <g filter={`url(#rough-${fid})`} fill="none" stroke="currentColor">
          {round ? <circle cx="50" cy="50" r="44" strokeWidth="5" /> : <rect x="7" y="7" width="86" height="86" rx="7" strokeWidth="5" />}
          <text
            x="50"
            y="50"
            fill="currentColor"
            stroke="none"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Shippori Mincho', serif"
            fontWeight={700}
            fontSize={fs}
            writingMode={chars.length > 1 ? 'vertical-rl' : undefined}
          >
            {kanji}
          </text>
        </g>
      </svg>
    </span>
  );
}
