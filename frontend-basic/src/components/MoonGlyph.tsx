/**
 * Moon phase glyph drawn from phase angle (0 = new, 90 = first quarter,
 * 180 = full, 270 = last quarter). Circle + half-disc + terminator ellipse.
 * Lit side is on the right while waxing (northern-hemisphere convention).
 */
export function MoonGlyph({ phaseDeg, size = 22, lit = '#f3ead6', dark = '#2a2b36' }: { phaseDeg: number; size?: number; lit?: string; dark?: string }) {
  const p = ((phaseDeg % 360) + 360) % 360;
  const waxing = p < 180;
  const k = (1 - Math.cos((p * Math.PI) / 180)) / 2; // illuminated fraction
  const r = 10;
  const rx = Math.abs(Math.cos((p * Math.PI) / 180)) * r;
  const sweep = waxing ? 1 : 0; // right half if waxing
  const half = `M0,${-r} A${r},${r} 0 0 ${sweep} 0,${r} Z`;
  const ellipseFill = k > 0.5 ? lit : dark;
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22" aria-label={`moon phase ${p.toFixed(0)}°`} role="img">
      <circle r={r} fill={dark} stroke="rgba(233,224,204,0.25)" strokeWidth="0.6" />
      <path d={half} fill={lit} />
      <ellipse rx={Math.max(rx, 0.01)} ry={r} fill={ellipseFill} />
    </svg>
  );
}
