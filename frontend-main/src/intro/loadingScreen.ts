import gsap from 'gsap';

let animation: gsap.core.Timeline | null = null;
const screen = () => document.getElementById('loading-screen');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Show the panels only when loading after the entry gate. */
export function closeLoadingScreen() {
  const root = screen();
  if (!root) return;
  animation?.kill();
  root.querySelectorAll<HTMLElement>('.passage-door').forEach((door) => { door.style.animation = 'none'; });
  gsap.set(root, { visibility: 'visible', pointerEvents: 'auto' });
  root.removeAttribute('aria-hidden');
  document.getElementById('root')?.setAttribute('inert', '');
  animation = gsap.timeline()
    .fromTo(root.querySelector('.passage-door-left'), { x: 0, xPercent: reduced() ? 0 : -102 }, { x: 0, xPercent: 0, duration: reduced() ? 0 : .48, ease: 'power3.inOut' }, 0)
    .fromTo(root.querySelector('.passage-door-right'), { x: 0, xPercent: reduced() ? 0 : 102 }, { x: 0, xPercent: 0, duration: reduced() ? 0 : .48, ease: 'power3.inOut' }, 0);
}

/** PECFEST's .65 s opening after the dusk canvas has drawn its first frame. */
export function openLoadingScreen() {
  const root = screen();
  if (!root || root.getAttribute('aria-hidden') === 'true') return;
  animation?.kill();
  root.querySelectorAll<HTMLElement>('.passage-door').forEach((door) => { door.style.animation = 'none'; });
  gsap.set(root.querySelectorAll('.passage-door'), { x: 0, xPercent: 0 });
  animation = gsap.timeline({ onComplete: () => {
    gsap.set(root, { visibility: 'hidden', pointerEvents: 'none' });
    root.setAttribute('aria-hidden', 'true');
    document.getElementById('root')?.removeAttribute('inert');
    if (root.contains(document.activeElement)) document.querySelector<HTMLElement>('main button, main a, main input')?.focus({ preventScroll: true });
  } })
    .to(root.querySelector('.passage-door-left'), { x: 0, xPercent: -102, duration: reduced() ? .12 : .65, ease: 'power3.inOut' }, 0)
    .to(root.querySelector('.passage-door-right'), { x: 0, xPercent: 102, duration: reduced() ? .12 : .65, ease: 'power3.inOut' }, '<');
}

