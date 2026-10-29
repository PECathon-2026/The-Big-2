/**
 * Workstream B's in-canvas mount point. The intro scene is a lazy chunk (prefetched behind the gate,
 * see intro/preload.ts) and renders only while phase === 'intro'.
 */
import { lazy, Suspense } from 'react';
import { useApp } from '@/state/store';

const IntroScene = lazy(() => import('./IntroScene'));

export default function IntroLayer() {
  const phase = useApp((s) => s.phase);
  if (phase !== 'intro') return null;
  return (
    <Suspense fallback={null}>
      <IntroScene />
    </Suspense>
  );
}
