/**
 * One Lenis instance for the window, driven by the GSAP ticker (§6.5). The intro (B) scrolls the
 * window; everywhere else window scrolling is stopped and module pages use their own container.
 */
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let instance: Lenis | null = null;

export function initLenis(): Lenis {
  if (instance) return instance;
  instance = new Lenis({ autoRaf: false, lerp: 0.09, smoothWheel: true });
  instance.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => instance?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  instance.stop();
  return instance;
}

export const lenis = () => instance ?? initLenis();

/** Enable window scrolling (intro only). */
export function releaseScroll(on: boolean) {
  const l = lenis();
  if (on) {
    document.documentElement.style.overflow = '';
    l.start();
  } else {
    l.stop();
    l.scrollTo(0, { immediate: true });
    document.documentElement.style.overflow = 'hidden';
  }
}

export { gsap, ScrollTrigger };
