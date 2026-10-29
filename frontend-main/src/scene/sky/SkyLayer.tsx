/**
 * Workstream A — the real sky (§8). Everything here is computed: catalogue stars and the Milky Way in
 * ONE equatorial frame rotated by skyClock.eqMatrix; the Sun, Moon and planets from astronomy-engine;
 * the ISS from the backend's pass track; meteors from the most active shower's radiant.
 * Order matters for the frame loop: Objects → OverlayPainter (refreshes the projector) → Picking.
 */
import { Suspense } from 'react';
import Stars from './Stars';
import SkyGradient from './SkyGradient';
import MilkyWay from './MilkyWay';
import MoonAndSun from './Moon';
import Horizon from './Horizon';
import Planets from './Planets';
import Meteors from './Meteors';
import Objects from './Objects';
import OverlayPainter from './OverlayPainter';
import Picking from './Picking';
import { useCatalog } from './shared';

export default function SkyLayer() {
  const cat = useCatalog();
  return (
    <>
      <SkyGradient />
      <MilkyWay />
      {cat && <Stars cat={cat} />}
      <Planets />
      <Suspense fallback={null}>
        <MoonAndSun />
      </Suspense>
      <Horizon />
      <Meteors />
      {cat && (
        <>
          <Objects cat={cat} />
          <OverlayPainter cat={cat} />
          <Picking cat={cat} />
        </>
      )}
    </>
  );
}
