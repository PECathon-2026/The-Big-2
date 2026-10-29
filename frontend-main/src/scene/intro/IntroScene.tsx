/** The sakura dusk (§7.3): landscape at the real sunset azimuth, two cherry trees, petals → stars, title morph. */
import { useEffect, useState } from 'react';
import DuskLandscape from './DuskLandscape';
import SakuraTrees from './SakuraTrees';
import Petals from './Petals';
import StarMorph from './StarMorph';
import { intro } from './introBus';

export default function IntroScene() {
  // The star targets are computed behind the gate; rebuild the petal assignment once they exist.
  const [targetsKey, setKey] = useState(intro.targets ? 1 : 0);
  useEffect(() => {
    if (targetsKey) return;
    const id = setInterval(() => intro.targets && setKey(1), 200);
    return () => clearInterval(id);
  }, [targetsKey]);
  return (
    <>
      <DuskLandscape />
      <SakuraTrees />
      <Petals targetsKey={targetsKey} />
      <StarMorph targetsKey={targetsKey} />
    </>
  );
}
