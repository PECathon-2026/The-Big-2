/**
 * PHASE-0 STUB (lead) — workstream C owns src/audio/ and fills this in (§10.5).
 * Contract other workstreams rely on:
 *   unlockAudio()  — call inside the gate's click handler (user gesture) when sound was chosen.
 *   cue(name)      — fire-and-forget; no-op when sound is off or not unlocked.
 */
import { app } from '@/state/store';

export type Cue = 'pluck' | 'whoosh' | 'whooshReverse' | 'chime' | 'thud' | 'shing' | 'clack' | 'tick';

let ctx: AudioContext | null = null;

export function unlockAudio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

export const audioContext = () => ctx;

export function cue(name: Cue): void {
  if (!ctx || !app().sound) return;
  void name; // C: play the recording or synthesized sound for `name`
}
