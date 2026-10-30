/**
 * Workstream B's DOM mount point (z 80): gate → loader (only if still loading) → intro scroll → sky.
 * See Gate.tsx (§7.1), Loader.tsx (§7.2), IntroScroll.tsx + IntroFrame.tsx (§7.3), flow.ts.
 * The loader keeps one slot so it can stay over the first frames of the intro (veil.ts).
 */
import { useApp } from '@/state/store';
import Gate from './Gate';
import Loader from './Loader';
import IntroScroll from './IntroScroll';
import { useLoaderVeil } from './veil';
import './intro.css';

export default function IntroRoot() {
  const phase = useApp((s) => s.phase);
  const veil = useLoaderVeil((s) => s.up);
  return (
    <>
      {(phase === 'gate' || phase === 'loading') && <Gate />}
      {phase === 'intro' && <IntroScroll />}
      {(phase === 'loading' || (phase === 'intro' && veil)) && <Loader />}
    </>
  );
}
