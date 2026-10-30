# Audio credits

Tsukuyomi Watch features **authentic cultural Japanese background music** along with live synthesized Web Audio UI cues (`src/audio/engine.ts`).

### Background Music
- **Title:** *Ishikari Lore*
- **Composer:** Kevin MacLeod ([incompetech.com](https://incompetech.com))
- **Instrumentation:** Traditional Japanese Koto, Shakuhachi Bamboo Flute, and Cultural Percussion
- **License:** Creative Commons: By Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))
- **Routing:** Streamed via Web Audio API, balanced at low volume (`gain: 0.22`) with smooth 2.5s fade-ins and dynamic ducking during sky dives and chapter transitions.
- **Procedural Fallback:** In-sen modal pentatonic triangle drone and koto harmonics generated via Web Audio API if network is offline.

### Sound Cues & UI Effects

| Cue | When | How it is made |
|---|---|---|
| Japanese Ambient Bed | always, quietly, while sound is on | *Ishikari Lore* (koto, shakuhachi, percussion) routed through low-pass bed gain with transition ducking |
| Koto pluck | clicking (and, softer, hovering) a sky object | triangle + sine partials in the in-sen scale, low-pass sweep, noise pick transient |
| Whoosh / reverse whoosh | dive / return | band-pass noise sweep 260 → 2400 Hz (reversed for the return); the bed ducks under it |
| Wood clack (hyoshigi) | opening the directory | two short detuned sine knocks with a band-passed noise click |
| Soft tick | the time compass crossing a koku boundary | 25 ms band-passed noise click |
| Hanko thud | stamping a seal | 110 → 44 Hz sine drop + low-passed noise |
| Katana shing | releasing the before/after slider | resonant band-pass noise sweep 5.2 → 9.8 kHz + inharmonic metallic partials |
| Furin chime | the last stars land in the intro | two strikes of inharmonic glass partials with a long ring |
