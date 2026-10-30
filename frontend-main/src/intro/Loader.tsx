/** Real preload work behind PECFEST's pale yellow sliding panels. */
import { useEffect, useLayoutEffect } from 'react';
import { allDone, usePreload } from './preload';
import { startIntro } from './flow';
import { closeLoadingScreen } from './loadingScreen';

export default function Loader() {
  const steps = usePreload((s) => s.steps);
  const ready = allDone(steps);

  useLayoutEffect(() => {
    closeLoadingScreen();
    const timeout = setTimeout(startIntro, 10_000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(startIntro, 600);
    return () => clearTimeout(timer);
  }, [ready]);

  return null;
}
