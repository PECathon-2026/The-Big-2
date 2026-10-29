# frontend-main · NOTES

Shared coordination file (AGENT_BRIEF §0). Append, don't rewrite other people's lines.

## Foundation (lead, Phase 0) — what exists and how to use it

- **Run:** dev server `http://localhost:3000` (lead runs it), backend `http://localhost:8000`. Typecheck: `npx tsc -b`.
- **Alias:** `@/` → `src/`.
- **State:** `src/state/store.ts` (`useApp`, plus `app()` for non-React code). In `useFrame`, read `app()` and never select with a hook.
  - `skyDate()` = now + `offsetMs`. `setOffset` is ignored while `timeFrozen` is true (during dives).
  - `publishObjects([...SkyObject])` / `objects[id]`: the sky publishes clickable objects (ids so far: `moon`, `polaris`, `M42`).
- **Sky clock:** `src/scene/skyClock.ts`. `skyClock` is recomputed (at most every 20 s of sky time) by the CameraRig each frame:
  - `eqMatrix`: a THREE.Matrix4 from equatorial cartesian to the horizontal frame. **Put catalogue geometry (equatorial × R) in a group with `matrixAutoUpdate={false}` and copy this matrix in.** Time scrubbing is then a matrix update.
  - `sun`, `moon`, `planets`: astronomy-engine positions with `dir` (unit vector, horizontal frame), `alt`/`az`, phase, libration.
  - `palette`: §5.1 colours, `starFade`, `limitingMag`. It also writes the CSS vars `--sky-zenith` and `--sky-horizon`.
  - `override`: B sets a Date here during the intro time-lapse. Set it back to `null` when done.
- **Astro (pure):** `src/astro/`
  - `coords.ts`: `R`, `eqToHorizontal`, `eqToHorizontalMatrix`, `raDecToEquatorial`, `altAzToVec`, `vecToAltAz`, `dirToYawPitch`, `damp`, `round2`
  - `catalog.ts`: `loadCatalog()` (5,044 stars, brightest first, flat `[ra,dec,mag,bv,hip]`; 493 named with `ja`; 89 constellations with `ja` + lines; 132 DSOs incl. Messier), `getStarTargets(cat, date, place, n)` for B's petals, `bvToRgb`, `HIP_POLARIS`
  - `skytime.ts`: `sunMoonPlanets`, `moonState`, `twilight`, `introTimeline(place)` (start/end of the real time-lapse + sunset azimuth), `starRiseSet`, `KOKU`, `kokuAt`, `fmtClock`
  - `skyColor.ts`: `skyPalette(sunAlt)`
  - `moonNames.ts`: `moonName(age)`, `drawMoon(ctx…)`, `isLit(x,y,age)` (for loader particles)
- **Camera:** `src/scene/Director.ts`. **The only thing that moves the camera.** `rig.cur`/`rig.tgt` = `{pos, yaw, pitch, fov}`, eased in CanvasRoot. `Director.station('intro'|'dome'|'sky')`, `diveTo`, `back`, `lookAt`, `drag`, `zoom`, `set`. `rig.dive` (0..1) is for the star streak shader. `rig.domeSpin` (rad/s) is the dome idle rotation.
- **Data:** `src/data/api.ts` (verbatim copy), `useApi.ts`, `format.ts`, `location.ts` (`locate()` GPS→IP→Chandigarh, `searchCity`, `PRESETS`, `sourceGlyph`), `tonight.ts`:
  - `useTonight` holds moon/sun/planets/events/passes/meteors/score per place. It is fetched once, keeps the last good data and marks it stale, and retries. It sets `tz` from the API.
  - `cached(path, place, fetcher)` is a memo for module pages.
- **UI:** `src/ui` exports `Kanji, Eyebrow, Title (put the accent word in <em>), Hairline, Button (primary|secondary|commit), Card (spotlight), Chip (live|mock|stale|provenance), Dialog, InfoPopover, Stamp`.
- **Styles:** `src/styles/tokens.css` (all §5.1 tokens, motion easings, z layers), `globals.css` (Tailwind v4 `@theme` mapped to the tokens: `bg-sumi`, `text-gold`, `font-display`…; classes `.glass .washi-sheet .eyebrow .accent .num .jp .reveal-ink/.reveal-blade/.reveal-kamon/.reveal-stamp`).
- **Lenis:** `src/app/lenis.ts`. One instance driven by the GSAP ticker. Window scroll is released **only in phase `intro`** (App does it). Use `lenis()`, `gsap`, `ScrollTrigger` from there.
- **Quality:** `src/scene/quality.ts` (`useTier()`, `tier()`, `TIERS`). PerformanceMonitor steps it automatically.
- **React Bits:** fetched into `src/vendor/reactbits/`: LiquidEther, GlowCursor, ScrollExpand, DecryptedText, CountUp, StarBorder, SpotlightCard, AnimatedContent, GradualBlur, ScrollReveal, CircularText.
- **Mount points (stubs you replace, in your folder):**
  - A: `scene/sky/SkyLayer.tsx` (in canvas), `scene/sky/SkyOverlay.tsx` (DOM, z10), `scene/dome/DomeLayer.tsx` (in canvas), `scene/dome/DomeOverlay.tsx` (DOM, z10)
  - B: `scene/intro/IntroLayer.tsx` (in canvas), `intro/IntroRoot.tsx` (DOM: gate, loader, intro)
  - C: `hud/HudRoot.tsx` (DOM, z30; also cursor, ink flood, directory), `scene/Director.ts`
  - D: `modules/<name>/index.tsx` (default export page), `modules/_ui/`
- **Phases:** `gate → loading → intro → dome → sky ⇄ diving → module`. App syncs `module` with the route. The canvas wrapper dims (brightness .35, blur 6px) in `module`, and the frameloop switches to `demand` there.

## Status

- **Lead · Phase 0 done:** foundation committed. The flow runs gate (stub) → intro (stub, Skip) → dome (real stars, Moon, glass rim) → sky (drag/zoom) → module stubs. The Watchtower stub shows the real verdict and score with an ⓘ trace.

## Requests

<!-- Format: - [from X → owner] what you need · why · (status) -->
