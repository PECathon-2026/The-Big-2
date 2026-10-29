/**
 * Ink-flood controller (§7.6). Non-React code (the Director) calls `inkClose` / `inkOpen` / `inkFade`;
 * the <InkFlood/> layer mounts only while `useInk().active` is true and registers its renderer here.
 * Every call cancels the one before it, so transitions stay interruptible.
 */
import { create } from 'zustand';

export interface InkImpl {
  close(x: number, y: number, ms: number): Promise<void>;
  open(x: number, y: number, ms: number): Promise<void>;
  fade(to: 0 | 1, ms: number): Promise<void>;
}

export const useInk = create<{ active: boolean }>()(() => ({ active: false }));

let impl: InkImpl | null = null;
let waiters: ((i: InkImpl | null) => void)[] = [];

export function registerInk(i: InkImpl | null) {
  impl = i;
  if (i) {
    waiters.forEach((w) => w(i));
    waiters = [];
  }
}

/** Mount the layer and wait (≤ 400 ms) for its renderer. Resolves null if it never arrives. */
function ready(): Promise<InkImpl | null> {
  useInk.setState({ active: true });
  if (impl) return Promise.resolve(impl);
  return new Promise((resolve) => {
    waiters.push(resolve);
    window.setTimeout(() => resolve(impl), 400);
  });
}

/** Ink floods out from (x, y) until the screen is covered. */
export async function inkClose(x: number, y: number, ms = 700) {
  const i = await ready();
  await i?.close(x, y, ms);
}

/** Ink clears from (x, y) (default: centre) outward, then the layer unmounts. */
export async function inkOpen(ms = 620, x = window.innerWidth / 2, y = window.innerHeight / 2) {
  const i = impl;
  if (i) await i.open(x, y, ms);
  useInk.setState({ active: false });
}

/** Reduced motion: a plain crossfade through sumi. */
export async function inkFade(to: 0 | 1, ms = 150) {
  const i = to === 1 ? await ready() : impl;
  await i?.fade(to, ms);
  if (to === 0) useInk.setState({ active: false });
}
