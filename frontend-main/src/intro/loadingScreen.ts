/**
 * PECFEST's pale yellow sliding panels (#loading-screen in index.html): the curtain between the sky and
 * the chapter pages. The Director closes them, swaps the page underneath, then opens them again.
 * Every call cancels the one before it, so a reversed transition starts where the last one stopped.
 */
import gsap from 'gsap';

let animation: gsap.core.Timeline | null = null;
let settle: (() => void) | null = null;
const screen = () => document.getElementById('loading-screen');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function run(build: (root: HTMLElement, tl: gsap.core.Timeline) => void, onDone?: (root: HTMLElement) => void): Promise<void> {
  const root = screen();
  if (!root) return Promise.resolve();
  animation?.kill();
  settle?.();
  root.querySelectorAll<HTMLElement>('.passage-door').forEach((door) => {
    door.style.animation = 'none';
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(guard);
      settle = null;
      onDone?.(root);
      resolve();
    };
    settle = finish;
    const tl = gsap.timeline({ onComplete: finish });
    build(root, tl);
    // rAF stalls in background tabs: never let a transition hang on it
    const guard = window.setTimeout(() => {
      tl.progress(1);
      finish();
    }, tl.duration() * 1000 + 300);
    animation = tl;
  });
}

/** Slide both panels shut over the screen. Resolves once it is covered. */
export function closePanels(): Promise<void> {
  const root = screen();
  if (root) {
    gsap.set(root, { visibility: 'visible', pointerEvents: 'auto' });
    root.removeAttribute('aria-hidden');
    document.getElementById('root')?.setAttribute('inert', '');
  }
  const duration = reduced() ? 0.12 : 0.48;
  return run((r, tl) =>
    tl
      .to(r.querySelector('.passage-door-left'), { x: 0, xPercent: 0, duration, ease: 'power3.inOut' }, 0)
      .to(r.querySelector('.passage-door-right'), { x: 0, xPercent: 0, duration, ease: 'power3.inOut' }, 0),
  );
}

/** PECFEST's .65 s opening onto whatever is now underneath. Resolves once the panels are gone. */
export function openPanels(): Promise<void> {
  const root = screen();
  if (!root || root.getAttribute('aria-hidden') === 'true') return Promise.resolve();
  const duration = reduced() ? 0.12 : 0.65;
  return run(
    (r, tl) =>
      tl
        .to(r.querySelector('.passage-door-left'), { x: 0, xPercent: -102, duration, ease: 'power3.inOut' }, 0)
        .to(r.querySelector('.passage-door-right'), { x: 0, xPercent: 102, duration, ease: 'power3.inOut' }, 0),
    (r) => {
      gsap.set(r, { visibility: 'hidden', pointerEvents: 'none' });
      r.setAttribute('aria-hidden', 'true');
      document.getElementById('root')?.removeAttribute('inert');
      if (r.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    },
  );
}
