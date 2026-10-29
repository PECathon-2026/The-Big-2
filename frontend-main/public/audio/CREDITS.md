# Audio credits

Every sound in Tsukuyomi Watch is **synthesized live in the browser with the Web Audio API**
(`src/audio/engine.ts`). No recordings are shipped, so there is nothing to license.

| Cue | When | How it is made |
|---|---|---|
| Night wind (ambient bed) | always, quietly, while sound is on | three band-passed white-noise layers with slow LFOs on filter and level |
| Koto pluck | clicking (and, softer, hovering) a sky object | triangle + sine partials in the in-sen scale, low-pass sweep, noise pick transient |
| Whoosh / reverse whoosh | dive / return | band-pass noise sweep 260 → 2400 Hz (reversed for the return); the bed ducks under it |
| Wood clack (hyoshigi) | opening the directory | two short detuned sine knocks with a band-passed noise click |
| Soft tick | the time compass crossing a koku boundary | 25 ms band-passed noise click |
| Hanko thud | stamping a seal | 110 → 44 Hz sine drop + low-passed noise |
| Katana shing | releasing the before/after slider | resonant band-pass noise sweep 5.2 → 9.8 kHz + inharmonic metallic partials |
| Furin chime | the last stars land in the intro | two strikes of inharmonic glass partials with a long ring |
