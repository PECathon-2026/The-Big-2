/**
 * GlowCursor over the night sky (§10.2). On only in sky / diving (or the intro past 55 %, but the
 * HUD is not mounted then), off over [data-cursor="off"] (cards, sheets, inputs, dialogs) and over the HUD,
 * off in Lite mode, on touch devices, with reduced motion and on the `low` tier. Never on the gate.
 */
import { useEffect, useMemo, useState } from 'react';
import GlowCursor from '@/vendor/reactbits/GlowCursor';
import { useApp } from '@/state/store';
import { TIERS } from '@/scene/quality';

function token(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function SkyCursor() {
  const phase = useApp((s) => s.phase);
  const intro = useApp((s) => s.introProgress);
  const lite = useApp((s) => s.lite);
  const reduced = useApp((s) => s.reducedMotion);
  const quality = useApp((s) => s.quality);
  const field = useApp((s) => s.field);
  const [overOff, setOverOff] = useState(false);
  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const tierCursor = TIERS[quality].glowCursor;
  const allowed = !lite && !coarse && !reduced && !field && tierCursor !== 'off';
  const skyDark = phase === 'sky' || phase === 'diving' || (phase === 'intro' && intro > 0.55);

  useEffect(() => {
    if (!allowed) return;
    const move = (e: PointerEvent) => {
      const el = e.target as Element | null;
      const off = !!el?.closest?.('[data-cursor="off"], dialog, input, textarea, button, a, [role="slider"]');
      setOverOff((p) => (p === off ? p : off));
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [allowed]);

  const colors = useMemo(() => ({ core: token('--gold-bright', '#E8C66A'), cool: token('--moon', '#D9DDE6') }), []);
  if (!allowed || !skyDark) return null;
  return (
    <GlowCursor
      style={{ position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'none' }}
      color={colors.core}
      secondaryColor={colors.cool}
      intensity={0.9}
      trailWidth={2}
      linger={0.9}
      glow={1.1}
      hotspot={0.6}
      followSpeed={0.55}
      grain={0.15}
      clickBurst
      theme="dark"
      quality={tierCursor === 'high' ? 'high' : 'medium'}
      maxDevicePixelRatio={1.5}
      enabled={!overOff}
    />
  );
}
