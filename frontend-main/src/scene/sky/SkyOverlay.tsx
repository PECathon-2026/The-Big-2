/**
 * The 2D overlay canvas (z 10, pointer-events none) for constellation brush lines, names, labels,
 * the compass kanji, the ISS arc and hover reticles (§8.2–8.3). It is painted from inside the R3F
 * frame loop (sky/OverlayPainter.tsx) so it stays in lock-step with the camera.
 */
import { useEffect, useRef } from 'react';
import { overlay } from './shared';
import ArrivalHints from './ArrivalHints';

export default function SkyOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    overlay.canvas = ref.current;
    // fonts the overlay draws with (§5.2: wait for them before canvas text; we redraw every frame anyway)
    const f = document.fonts;
    Promise.all([
      f.load('500 15px "Shippori Mincho"', '月'),
      f.load('italic 500 13px "Cormorant Garamond"'),
      f.load('500 15px "Cinzel"'),
      f.load('600 11px "Plus Jakarta Sans Variable"'),
    ]).catch(() => undefined);
    return () => {
      overlay.canvas = null;
    };
  }, []);
  return (
    <>
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 10, pointerEvents: 'none' }}
    />
    <ArrivalHints />
    </>
  );
}
