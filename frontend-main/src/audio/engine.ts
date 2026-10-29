/**
 * Sound (§10.5). One AudioContext, unlocked by a user gesture (the gate's "Enter with sound", or the
 * sound toggle). Master gain 0.6. A low night-wind bed fades in over 2 s and ducks under whooshes.
 * Every cue is synthesized in Web Audio (filtered noise bursts, plucked partials) — no files needed,
 * so nothing can 404 and the venue Wi-Fi does not matter. Nothing plays before the gate choice.
 *
 * Contract other workstreams rely on (keep these signatures):
 *   unlockAudio()  — call inside a click handler (user gesture) when sound was chosen.
 *   cue(name)      — fire-and-forget; no-op when sound is off or not unlocked.
 */
import { app, useApp } from '@/state/store';

export type Cue = 'pluck' | 'whoosh' | 'whooshReverse' | 'chime' | 'thud' | 'shing' | 'clack' | 'tick';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bed: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let bedStarted = false;

const MASTER = 0.6;
const BED = 0.55;

function build(c: AudioContext) {
  master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);
  bed = c.createGain();
  bed.gain.value = 0;
  bed.connect(master);
  // 2 s of white noise, shared by every noise-based cue and the wind bed
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/** Night wind: two band-limited noise layers with slow LFOs on their filters and levels. */
function startBed(c: AudioContext) {
  if (bedStarted || !bed || !noiseBuf) return;
  bedStarted = true;
  const layer = (freq: number, q: number, level: number, lfoHz: number, depth: number) => {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.5 + Math.random() * 0.2;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = level;
    const lfo = c.createOscillator();
    lfo.frequency.value = lfoHz;
    const lfoGain = c.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain).connect(f.frequency);
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = lfoHz * 0.61;
    const lfo2Gain = c.createGain();
    lfo2Gain.gain.value = level * 0.5;
    lfo2.connect(lfo2Gain).connect(g.gain);
    src.connect(f).connect(g).connect(bed!);
    src.start();
    lfo.start();
    lfo2.start();
  };
  layer(320, 0.7, 0.07, 0.05, 140);
  layer(900, 1.4, 0.025, 0.083, 380);
  layer(140, 0.5, 0.05, 0.031, 40);
}

function ramp(p: AudioParam, to: number, sec: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(to, t + sec);
}

function apply(on: boolean) {
  if (!ctx || !master || !bed) return;
  if (on) {
    if (ctx.state === 'suspended') void ctx.resume();
    startBed(ctx);
    ramp(master.gain, MASTER, 0.4);
    ramp(bed.gain, BED, 2);
  } else {
    ramp(bed.gain, 0, 0.5);
    ramp(master.gain, 0, 0.6);
  }
}

export function unlockAudio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      build(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
  if (ctx && app().sound) apply(true);
  return ctx;
}

export const audioContext = () => ctx;

/** Toggle sound; call from a click handler so the context can be unlocked. */
export function setSound(on: boolean) {
  if (on) unlockAudio();
  app().setSound(on);
}

// Follow the store (the gate may set sound directly).
useApp.subscribe((s, prev) => {
  if (s.sound !== prev.sound) apply(s.sound);
});

// ---------------------------------------------------------------------------------------------- cues

function noise(c: AudioContext, t: number, dur: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.start(t, Math.random() * 1.5, dur + 0.05);
  return src;
}

function env(c: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number, bendTo?: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (bendTo) o.frequency.exponentialRampToValueAtTime(bendTo, t + attack + decay);
  const g = env(c, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Duck the bed under a big transition. */
function duck(sec: number) {
  if (!ctx || !bed || !app().sound) return;
  const t = ctx.currentTime;
  bed.gain.cancelScheduledValues(t);
  bed.gain.setValueAtTime(bed.gain.value, t);
  bed.gain.linearRampToValueAtTime(BED * 0.35, t + 0.15);
  bed.gain.linearRampToValueAtTime(BED, t + sec);
}

// In-sen scale (D Eb G A Bb) — the koto's mode.
const INSEN = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33];
let lastTick = 0;

let lastPluck = 0;

/** Fire a cue. `gain` (0..1) scales it, e.g. a quieter pluck on hover. */
export function cue(name: Cue, gain = 1): void {
  if (!ctx || !master || !noiseBuf || !app().sound) return;
  const c = ctx;
  const t = c.currentTime + 0.005;
  let out: AudioNode = master;
  if (gain !== 1) {
    const g = c.createGain();
    g.gain.value = gain;
    g.connect(master);
    out = g;
  }
  if (name === 'pluck') {
    const now = performance.now();
    if (now - lastPluck < 90) return;
    lastPluck = now;
  }
  switch (name) {
    case 'pluck': {
      // koto: bright attack, two partials, gentle pitch settle
      const f = INSEN[Math.floor(Math.random() * INSEN.length)];
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5200, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.9);
      lp.connect(out);
      tone(c, lp, 'triangle', f * 1.005, t, 0.22, 0.004, 1.3, f);
      tone(c, lp, 'sine', f * 2.01, t, 0.07, 0.003, 0.6);
      tone(c, lp, 'sine', f * 3.02, t, 0.03, 0.002, 0.3);
      const n = noise(c, t, 0.03);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 4;
      n.connect(bp).connect(env(c, t, 0.05, 0.001, 0.03)).connect(out);
      break;
    }
    case 'whoosh':
    case 'whooshReverse': {
      const rev = name === 'whooshReverse';
      const dur = 1.0;
      const n = noise(c, t, dur);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(rev ? 2600 : 260, t);
      bp.frequency.exponentialRampToValueAtTime(rev ? 240 : 2400, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + (rev ? 0.2 : 0.55));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp).connect(g).connect(out);
      duck(1.8);
      break;
    }
    case 'tick': {
      const now = performance.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      const n = noise(c, t, 0.02);
      const hp = c.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 3800;
      hp.Q.value = 4;
      n.connect(hp).connect(env(c, t, 0.12, 0.001, 0.025)).connect(out);
      break;
    }
    case 'clack': {
      // hyoshigi wood blocks: two knocks
      for (const [dt, f] of [
        [0, 1180],
        [0.085, 980],
      ] as const) {
        tone(c, out, 'sine', f, t + dt, 0.18, 0.001, 0.07, f * 0.92);
        const n = noise(c, t + dt, 0.02);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * 1.6;
        bp.Q.value = 3;
        n.connect(bp).connect(env(c, t + dt, 0.14, 0.001, 0.03)).connect(out);
      }
      break;
    }
    case 'thud': {
      tone(c, out, 'sine', 110, t, 0.5, 0.004, 0.32, 44);
      const n = noise(c, t, 0.12);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      n.connect(lp).connect(env(c, t, 0.35, 0.002, 0.11)).connect(out);
      break;
    }
    case 'shing': {
      const n = noise(c, t, 0.7);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 8;
      bp.frequency.setValueAtTime(5200, t);
      bp.frequency.exponentialRampToValueAtTime(9800, t + 0.5);
      n.connect(bp).connect(env(c, t, 0.2, 0.01, 0.6)).connect(out);
      for (const [f, p] of [
        [2637, 0.05],
        [3951, 0.035],
        [5274.6, 0.025],
      ] as const)
        tone(c, out, 'sine', f, t + 0.02, p, 0.005, 1.4);
      break;
    }
    case 'chime': {
      // furin: inharmonic glass partials, long ring, slight detune between strikes
      for (const [i, dt] of [0, 0.32].entries()) {
        const base = i ? 1975.5 : 1318.5;
        for (const [m, p] of [
          [1, 0.08],
          [2.76, 0.03],
          [5.4, 0.012],
        ] as const)
          tone(c, out, 'sine', base * m * (1 + (Math.random() - 0.5) * 0.004), t + dt, p, 0.003, 2.6);
      }
      break;
    }
  }
}
