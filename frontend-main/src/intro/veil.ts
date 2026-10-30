/**
 * The loader stays over the screen into the first moments of the intro and lifts only once the dusk
 * canvas has drawn a frame (IntroScene calls liftLoader), so the hand-off never shows an empty frame.
 */
import { create } from 'zustand';

export const useLoaderVeil = create<{ up: boolean; lifting: boolean }>()(() => ({ up: false, lifting: false }));

export const raiseLoader = () => useLoaderVeil.setState({ up: true, lifting: false });

/** Start the loader's fade-out (no-op when it is not showing). */
export function liftLoader() {
  if (useLoaderVeil.getState().up) useLoaderVeil.setState({ lifting: true });
}

/** The fade-out has finished: unmount the loader. */
export const dropLoader = () => useLoaderVeil.setState({ up: false, lifting: false });
