/**
 * App shell. One persistent canvas under the router (§4.2); DOM layers float over it by z (§5.7):
 *   0 canvas · 10 sky labels · 20 cursor · 30 HUD · 40 pages · 60 ink flood · 80 gate/loader · 95 grain · 100 dialogs
 * Phase flow: gate → (loading) → intro → sky ⇄ diving → module.
 * Product-owner decision: there is NO dome exterior. The intro lands directly inside the night sky,
 * and "home" (chapter 一) is the sky itself. Any leftover request for 'dome' is redirected to 'sky'.
 */
import { Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import CanvasRoot from '@/scene/CanvasRoot';
import { useApp } from '@/state/store';
import { Director, rig } from '@/scene/Director';
import { isModulePath, Watchtower, Scroll, Lens, Dojo, Honor, Science } from './routes';
import { releaseScroll } from './lenis';
import IntroRoot from '@/intro/IntroRoot';
import SkyOverlay from '@/scene/sky/SkyOverlay';
import HudRoot from '@/hud/HudRoot';

function PhaseSync() {
  const { pathname } = useLocation();
  const phase = useApp((s) => s.phase);
  const setPhase = useApp((s) => s.setPhase);
  // No dome: whoever still asks for it lands inside the sky, keeping the current heading.
  useEffect(() => {
    if (phase !== 'dome') return;
    setPhase('sky');
    void Director.station('sky', { yaw: rig.tgt.pos[2] > 50 ? rig.cur.yaw : rig.tgt.yaw, instant: useApp.getState().reducedMotion });
  }, [phase, setPhase]);
  // Route ⇄ phase: a module route after the gate is the 'module' phase; leaving it returns to the sky.
  useEffect(() => {
    if (phase === 'gate' || phase === 'loading' || phase === 'intro') return;
    if (isModulePath(pathname)) {
      if (phase !== 'module' && phase !== 'diving') setPhase('module');
    } else if (phase === 'module') setPhase('sky');
  }, [pathname, phase, setPhase]);
  // Window scrolling belongs to the intro only.
  useEffect(() => {
    releaseScroll(phase === 'intro');
    document.documentElement.dataset.phase = phase;
  }, [phase]);
  return null;
}

export default function App() {
  return (
    <>
      <CanvasRoot />
      <PhaseSync />
      <SkyOverlay />
      <HudRoot />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/watchtower" element={<Watchtower />} />
          <Route path="/scroll" element={<Scroll />} />
          <Route path="/lens" element={<Lens />} />
          <Route path="/dojo/:id" element={<Dojo />} />
          <Route path="/honor" element={<Honor />} />
          <Route path="/science" element={<Science />} />
          <Route path="*" element={null} />
        </Routes>
      </Suspense>
      <IntroRoot />
      <div className="paper-grain" aria-hidden="true" />
    </>
  );
}
