/**
 * Workstream B's DOM mount point (z 80): gate → loader (only if still loading) → intro scroll → sky.
 * See Gate.tsx (§7.1), Loader.tsx (§7.2), IntroScroll.tsx + IntroFrame.tsx (§7.3), flow.ts.
 */
import { useApp } from '@/state/store';
import Gate from './Gate';
import Loader from './Loader';
import IntroScroll from './IntroScroll';
import './intro.css';

export default function IntroRoot() {
  const phase = useApp((s) => s.phase);
  if (phase === 'gate') return <Gate />;
  if (phase === 'loading') return <Loader />;
  if (phase === 'intro') return <IntroScroll />;
  return null;
}
