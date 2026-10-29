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

## Decisions log

- **Palette changed by the product owner → "Crimson Sakura Night".** It takes PECFEST colours with high inspiration from pecfest.in/developer cards, plus sakura pink, traditional Japanese colours and a celestial layer. See the override box at the top of AGENT_BRIEF §5.1 and `src/styles/tokens.css`. Use `<Card brand tag>`, `<Button variant="gold|primary|secondary|commit">`, `<Tag>`, `<Divider/>`, `<BrushLine/>` from `@/ui`.
- **Web Push exists in the backend now** (`/api/alerts/*`). `src/data/push.ts` (`ensureSubscribed`, `unsubscribe`) and `public/sw.js` are copied from frontend-basic. "Remind me" on /scroll (D) should use `POST /api/alerts/schedule-event` after `ensureSubscribed()`. The PWA plugin (Phase 3) must keep `/sw.js` push handling: the lead will use injectManifest or import it.

## Cross-workstream contracts (lead)

- **Dev shortcut:** `http://localhost:3000/?dev=dome`, `?dev=sky` and `?dev=intro` skip the gate with the default place (Chandigarh). `/watchtower?dev=sky` opens a module directly.
- **Selection → dive (A ↔ C):**
  - A's picking calls `useApp.getState().setHovered(obj)` on hover and `useApp.getState().select(obj)` on click. Only count a click when the pointer moved less than 5 px since pointerdown, because drag-look uses the same canvas.
  - C subscribes to `selected`. If `obj.route` is set, C runs `Director.diveTo(obj, lastPointer)`, then the ink flood and `navigate(route)`. Otherwise C shows the InfoCard beside the object.
  - A puts InfoCard data in `obj.info` (mag, constellation, ra/dec…). C computes alt/az and rise/set itself with `astro/skytime.ts`.
- **Object ids** published by A that C and D rely on: `moon`, `sun`, `polaris`, `M42`, `M31`, `M45`, `iss`, `meteor-radiant`, planet names in lowercase (`jupiter`…), `torii`, `pagoda`, `ridges`.
- **Drag/zoom:** `SkyInput` in `scene/CanvasRoot.tsx` (lead) handles drag-look and wheel-zoom in phase `sky` through `Director.drag/zoom`. Request changes here rather than adding a second handler.
- **Audio (B → C):** `src/audio/engine.ts` is a stub that C owns. B calls `unlockAudio()` inside the gate click when sound is chosen. Anyone may call `cue('pluck' | 'whoosh' | …)`.
- **Intro canvas frame (B):** B may set `document.getElementById('canvas-root')!.style.clipPath` during the intro (crimson frame) and must clear it when leaving the intro. B drives the camera only through `Director.set({...})` / `Director.station(...)`, and the sky time-lapse through `skyClock.override` (set it back to `null` at the end). At the end of the intro B calls `setPhase('dome')` + `Director.station('dome')`.
- **Playwright is one shared browser.** Open your own tab (`browser_tabs` → new), use only that tab, and close it when done. Save screenshots to `frontend-main/qa/<A|B|C|D>-*.png`. Keep screenshots few.

## Status

- **Lead · Phase 0 done:** foundation committed. The flow runs gate (stub) → intro (stub, Skip) → dome (real stars, Moon, glass rim) → sky (drag/zoom) → module stubs. The Watchtower stub shows the real verdict and score with an ⓘ trace.

- **C · HUD done (verified E2E in Playwright):** dives Moon→/scroll#moon, Polaris→/honor, M42→/lens?target=M42, torii→/watchtower all land under the ink flood and Esc restores the exact yaw/pitch/FOV; chapter rail 一–五 + ←/→ + directory (Tonight's highlights dive too); wadokei compass (drag+inertia, ←/→ ±15 min, Shift ±1 h, PgUp/PgDn ±6 h, Home/Now; +12 h turns the sky to day; compact at the dome so the CTA stays clear; folds to a chip on pages; Lite = horizontal swipe band); location chip + Photon city search; countdown (dives to /scroll#…); GlowCursor (moon-silver, off over cards/HUD, Lite/touch/reduced/low tier); InfoCard; synthesized sound (no files; `public/audio/CREDITS.md`); reduced motion = 300 ms crossfade. HUD floats above module pages (z41) with a pecfest header bar. Transitions never hang if rAF stalls (timer fallbacks). Left: real recordings (optional), the forked-LiquidEther ink swirl could not be screenshot-verified in the shared browser (too many WebGL contexts across tabs); the noise-blob mask carries the flood regardless.

## Requests

<!-- Format: - [from X → owner] what you need · why · (status) -->
- [C → lead] Tailwind preflight zeroes `<dialog>` margin, so `showModal()` dialogs sit top-left. Fix in `ui.css`: `.tw-dialog[open] { margin: auto; }` (C scoped it locally with `.hud-dialog`). · (done by lead: `.tw-dialog[open] { margin: auto; }`)
- [C → D] `PageFrame` back: call only `Director.back()` — it closes the ink over the page and navigates to `/` itself. Calling `nav('/')` first skips the ink close (it still works, just without the transition). · (open)
- [C → A] InfoCard reads `obj.info.{ra, dec}` (degrees, J2000) for live alt/az + rise/set, plus optional `mag`, `constellation`, `bayer`, `dist_ly`. `rig.dive` (0..1) rises during dives for the star streak. · (open)
- [B → A] **Petal → star handoff** (the one thing that makes it invisible): in `scene/sky/Stars.tsx` add `import { INTRO_REVEAL_GLSL, introRevealProgress, intro } from '@/scene/intro/introBus'`, paste `INTRO_REVEAL_GLSL` into the vertex shader, multiply the star alpha by `introReveal(aMag)`, and per frame set `uIntroP = introRevealProgress()` (1 outside the intro) and `uIntroMagMax = intro.magMax`. Each star then fades in exactly as its petal lands (petals use the same `landForMag`). Without it the stars simply fade in with the real sun altitude (still correct, just not a handoff). · (open)
- [B → A] During `phase === 'intro'` please hide your Sun disc (B draws the real-azimuth crimson ink sun at the same position, `scene/intro/DuskLandscape.tsx`), or keep it — it only shows as a smaller disc inside B's. · (open)
