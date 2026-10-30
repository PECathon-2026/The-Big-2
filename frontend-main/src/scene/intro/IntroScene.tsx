/** The sakura dusk: a printed-ink landscape, the original cherry trees and petals → stars. */
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { liftLoader } from '@/intro/veil';
import DuskLandscape from './DuskLandscape';
import SakuraTrees from './SakuraTrees';
import Petals from './Petals';
import DuskAtmosphere from './DuskAtmosphere';
import { intro } from './introBus';

export default function IntroScene() {
  const rendered = useRef(false);
  const revealFrame = useRef<number | null>(null);
  // A mounted lazy chunk may not have drawn yet. Keep the loader up until
  // the canvas has rendered the landscape, then lift it on the next frame.
  useFrame(() => {
    if (rendered.current) return;
    rendered.current = true;
    revealFrame.current = requestAnimationFrame(liftLoader);
  });
  useEffect(() => () => {
    if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    rendered.current = false;
  }, []);

  // The star targets are computed behind the gate; rebuild the petal assignment once they exist.
  const [targetsKey, setKey] = useState(intro.targets ? 1 : 0);
  useEffect(() => {
    if (targetsKey) return;
    const id = setInterval(() => intro.targets && setKey(1), 200);
    return () => clearInterval(id);
  }, [targetsKey]);
  return (
    <>
      <DuskAtmosphere />
      <DuskLandscape />
      <SakuraTrees />
      <Petals targetsKey={targetsKey} />
    </>
  );
}
