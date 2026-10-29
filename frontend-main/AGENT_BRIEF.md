# Tsukuyomi Watch — `frontend-main` build brief

> **Audience:** the Claude Code agents building `frontend-main/`.
> **Hard deadline:** 5 hours from kickoff. A finished, smooth core beats an unfinished, ambitious whole.
>
> Read this whole file before writing code. Where this brief disagrees with older docs (README, guideline, PECFEST guide, the demo), **this brief wins**. The product owner made the decisions in §3; don't reopen them.

---

## 0. How to use this brief

- **Lead agent** (one session, strongest model):
  1. Do **Phase 0** in §11 (foundation, about 40 min) and commit it.
  2. Start the four workstreams. Either spawn them as subagents, or have the human open four more sessions with the kickoff prompts in §14.
  3. You own integration, the build, performance and the final demo check.
- **Workstream agents** (A, B, C, D):
  - Read §1–§10 fully, then only your own part of §11.
  - Edit **only the folders you own** (§6.2).
  - If you need something from another folder, add a line under `## Requests` in `frontend-main/NOTES.md`, stub it locally, and keep going.
- **Every agent:**
  - Commit small and often, staging only your own paths (`git add <your paths>`). If `.git/index.lock` exists, wait a few seconds and retry; never delete it while another agent may be committing.
  - Keep `npm run dev` working at every commit.
  - Write what you finished, and what is left, under `## Status` in `frontend-main/NOTES.md`.

---

## 1. What we are building

**Tsukuyomi Watch** (月読の見張り, "The Samurai's Celestial Guide") is one continuous night in the browser. The app opens on the user's **real sky, tonight, where they stand**, and every feature is a camera move inside that sky. The theme is Japanese ink, washi paper, gold leaf and moonlight. The rule of the codebase: **nothing on screen is faked.**

The journey, in order:

1. **Gate.** A sakura-tinted washi screen where live suminagashi ink drifts under the cursor.
   - It asks for location and offers **Enter with sound** or **Enter in silence**.
   - Heavy assets preload behind it.
2. **Loader**, only if assets are still loading.
   - Particles form tonight's Moon phase, then a torii.
   - One line of text narrates the real work being done.
3. **Sakura dusk.** A pagoda before Mt Fuji at dusk, between two cherry trees, framed by crimson lacquer. Scrolling makes the following happen:
   - The frame opens to full bleed.
   - The sun sets at its real azimuth.
   - Petals lift off the trees, stream through the air and land on the real stars above the user, becoming those stars.
   - Some stars gather into **月読 · TSUKUYOMI WATCH**, then return to their places.
   - The Moon rises at tonight's real phase and the constellations ink themselves in.
4. **The dome.** The camera pulls back out through the sky.
   - The sky is revealed as a glass hemisphere over a small floating ink island: the user's real sky, captured.
   - Atelier-style leader-line labels point at a few things. The CTA is "Enter your sky".
5. **Inside.** A first-person planetarium.
   - Drag to look around and use the wheel to zoom. Every object can be hovered and clicked.
   - A click is a **3D dive**: the camera flies toward the object, ink floods out from the click point, and that feature's page appears.
   - Esc or Back reverses the dive.
6. **Always present** (once inside):
   - the **wadokei time compass** (drag it to turn time between day and night)
   - the chapter rail, the directory and the location chip
   - the next-event countdown and the sound toggle
   - the GlowCursor light over the night sky

The approved prototype is `docs/living-sky-demo.html`. It is the same file as `night-sky-reference/Tsukuyomi Concept Stages.html`; open it in a browser.

- **Take its *Living Sky* tab as the structural base and make it pixel-perfect with real data.** Reuse its coordinate math, star shader, ridges, torii, `drawMoon`, moon-name table, ink-blob transition, katana CSS, hanko SVG and kintsugi loader.
- Its hard-coded numbers ("82", "Nandi Hills", the Orionids/ISS/Falcon 9 event strip, the fake moonrise formula) are placeholders and **must not ship**.
- The **reference sites** below are the feel to hit. Study them in a browser if you have one. Don't copy their assets.

| Reference site | What to take from it |
|---|---|
| theateliernewyork.com (the main reference) | The "Enter with sound / in silence" gate; a dot-sphere in a bokeh starfield; leader-line labels; I–V chapter rail; "click to explore" dives that grow the object past the viewport before a text panel fades in; calm luxury pacing |
| webfactorypro.fr | 20k instanced cherry petals forming a torii and moon from one angle, then scattering and streaming on scroll; moonlit water; three.js + GSAP ScrollTrigger + Lenis |
| merkurdesign.com | Particles morphing between shapes (sphere → figure → scattered field → text) on scroll |
| jobhunt.asmcleod.com | Damped orbit, smooth scroll-to-zoom, a glowing nucleus in a starfield, mono micro-labels |
| puture.co.kr/en | Buttery Lenis scrolling with a scroll-scrubbed 3D camera and a chapter indicator |
| suminagashi.app | The ink look: sumi black, vermilion, indigo and green ink floating on washi |
| pecfest.in | Already studied in `JAPANESE-THEME-UI-GUIDE.md` |

---

## 2. What exists in the repo (read in this order, about 15 min)

| File | Use |
|---|---|
| this file | everything |
| `docs/API.md` | **The canonical backend contract.** Envelope = `{ data, provenance: [{source,url,fetched_at,stale,cached,note}], computed_at }`. The README's older `{data, source, fetched_at, stale}` shape is out of date. |
| `frontend-basic/src/api.ts` | A typed client for every endpoint. **Copy it verbatim** to `frontend-main/src/data/api.ts`. |
| `frontend-basic/src/hooks/useApi.ts`, `format.ts`, `components/Provenance.tsx`, `components/MoonGlyph.tsx`, `pages/*.tsx` | Working data logic for every page. **Port and re-skin them; don't rewrite.** |
| `docs/living-sky-demo.html` | Code and visuals to port (§1) |
| `docs/tsukuyomi-final-guideline.md` §7–8 | Intent for the visual layer (X1–X8) |
| `JAPANESE-THEME-UI-GUIDE.md` | The PECFEST study: typography patterns, motion language, components and pitfalls. Its `shots/` images were never committed. |
| `backend/app/**` | **Read only.** Owned by the backend teammate. |

**State of the backend:**

- Watchtower (`/api/watchtower/*`) and Scroll (`/api/scroll/*`) are real.
- Lens is a placeholder (only `/api/lens/status`). Its contract is in `docs/API.md`.
- CORS allows `http://localhost:5173` and `http://localhost:3000`. **Run frontend-main on port 3000**, because frontend-basic already uses 5173.

**Run the backend** (Windows, Python 3.12 or newer):

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` to try the endpoints.

---

## 3. Decisions (final)

| Topic | Decision | What it overrides |
|---|---|---|
| Opening | **Sakura dusk merge:** crimson-framed dusk → sunset → petals become the real stars → title morph → Moon rises → pull back to the dome | Guideline X2 (merged into this) |
| Dome | **Outside → inside:** a glass hemisphere over a floating island, then a dive into a first-person view | Demo (inside view only) |
| Devices | **Desktop-first** (laptops at 1080p). Phones get **Lite mode** plus the PWA and red field mode, which the problem statement requires. | Guideline's mid-range-phone budget (now applies to Lite mode only) |
| Data | Real backend for Watchtower and Scroll through `api.ts`. Typed mocks **with visible labels** for Lens only. The sky itself is computed in the browser (star catalogue + `astronomy-engine`), so time scrubbing is instant and works offline. | — |
| Fonts | **PECFEST ceremonial:** Cinzel for display; Plus Jakarta Sans for UI, body and data; Shippori Mincho for all Japanese; Cormorant Garamond Italic for one accent word per title | Guideline (Shippori + Cormorant) and frontend-basic |
| Palette | **Moonlit shrine** (§5.1). Crimson lacquer appears only around the intro frame. | PECFEST crimson-heavy palette |
| Ink fluid | React Bits **LiquidEther**, recoloured as suminagashi ink. Used **only on the gate and in page transitions.** | — |
| Star morph | Particles form shapes **only in the brand title and the loader.** Real stars always return to their true positions. | — |
| Sky → page | **Each object leads to its module** (§8.4) | — |
| Navigation | **Chapter rail 一–五**, a "Choose your chapter" directory, arrow keys, Esc/Back | Demo's station dock |
| Time control | **Wadokei 24 h wheel:** a half-disc at the bottom, drag or flick, range ±72 h | Guideline's Kage slider |
| Gate | Location plus **Enter with sound / Enter in silence**. Notifications are requested later, and only from a "Remind me" button. | — |
| Location fallback | Permission denied → **approximate from IP** (keyless HTTPS service) → last resort **Chandigarh 30.76 N, 76.79 E** (works offline). City search can always correct it. | Demo city presets |
| Centrepiece | A **five-storey pagoda before Mt Fuji**, ink-wash style | — |
| Assets | Whatever stays smooth: GPU-particle blossoms on procedural branches; landscape, pagoda and Fuji drawn in code (SVG or shader layers); NASA Moon texture; **no heavy GLB models** | — |
| Cursor | React Bits **GlowCursor**, over the dark night sky only | — |
| Before/after | **A real katana is the slider divider** (§9.4) | Demo's plain blade |
| Sound | **Off** unless the user picks "Enter with sound". Openverse CC0 / CC BY recordings plus synthesized UI sounds, with licences recorded. | — |

---

## 4. Non-negotiables

1. **Nothing is faked.**
   - Every sky position, Moon phase, time and score comes from computation or the API.
   - Lens mocks wear a visible `MOCK · pipeline pending` chip on every number.
   - Copy contains no placeholder numbers. The loader narrates real steps and real counts.
2. **One world, one camera.**
   - A single persistent R3F `<Canvas>` lives under the router for the whole session.
   - Routes are camera stations, and DOM pages float over the canvas.
   - Never tear down the main WebGL context. Only LiquidEther and GlowCursor get their own small canvases, and they unmount when not in use.
3. **Every theme element has a job:**
   - petals become stars
   - gold marks hierarchy and constellations
   - vermilion means "live now", seals and the torii
   - the ink flood means moving between worlds
4. **Escape hatches everywhere.**
   - "Skip intro" is visible for the whole intro, and the directory is reachable from every screen.
   - Everything works by keyboard.
   - `prefers-reduced-motion` turns flights into crossfades.
5. **Performance.**
   - **60 fps** on the demo laptop (RTX 3050-class GPU at 1080p, quality "high").
   - **45 fps or better** on integrated graphics ("medium").
   - Quality tiers switch automatically (§10.6).
6. **Smoothness beats spectacle.**
   - If an effect stutters, simplify it.
   - Use Lenis smooth scrolling and time-based damping everywhere; every camera move can be interrupted.
7. **Folder boundaries.**
   - Never edit `backend/`, `frontend-basic/` or `docs/`.
   - Inside `frontend-main/`, only the lead edits `package.json`, the lockfile, `vite.config.ts`, `index.html`, `src/app/`, `src/state/`, `src/styles/` and `src/ui/` after Phase 0. Ask through `NOTES.md` for changes there.

---

## 5. Design system

### 5.1 Colour tokens (`src/styles/tokens.css`)

> **PRODUCT-OWNER OVERRIDE (supersedes the "Moonlit shrine" palette below and the §3 Palette row).**
> The palette is now **"Crimson Sakura Night"**: PECFEST colours with high inspiration from **pecfest.in/developer**, plus cherry-blossom pink, traditional Japanese colours and a celestial layer. `src/styles/tokens.css` is the source of truth. **Read it and use its variables; never hard-code hex.**
>
> - **Surfaces:** page `--page-bg #07090C` with `--ambient` (gold `.12` + crimson `.08` radial glow) and `.pecfest-rails` (gold vertical hairlines). Cards use `--card-black #0B0B0B`.
> - **Cards = the PECFEST developer card** (`<Card>` in `src/ui` does it all):
>   - 20 px radius and `--card-shadow`
>   - a 1 px `--card-line` inner frame inset 9 px (14 px radius) with solid `--card-gold #C49A45` corner brackets
>   - an optional header: a crimson `--shu #C62920` kanji seal + Cinzel brand text, and a `№ 01` tag
>   - names in Shippori 600, `--kinu #E8D9B5`, under a crimson brush line (`<BrushLine/>`)
>   - gold gradient `<Divider/>`, `<Tag>` role tags, `.tw-icon-btn` square icon buttons
> - **Buttons are square** (radius 0):
>   - `gold`: solid `--gold-button #C8AA6D` with dark ink. Use it for main CTAs.
>   - `primary`: gold outline
>   - `secondary`: text plus a hairline
>   - `commit`: crimson
>   - Pills are only for the sound toggle and chips.
> - **Crimson is the PECFEST signature** (`--crimson #A70D16`, `--crimson-bright #D81E28`, `--crimson-deep #61070D`, `--shu`). It is used for live/now, seals, torii, commits, brush underlines and ambient glow, and is no longer restricted to the intro frame. `--vermilion*` and `--urushi*` remain as aliases.
> - **Gold is hierarchy** (pecfest `#C99A3A`, bright `#E8C66A`, dark `#73501D`, accent word `#E2C17F`).
> - **Sakura:**
>   - `--sakura #F4C6CF`, `--sakura-deep`, `--nadeshiko #EEBBCB` and `--kobai #E16B8C` (pink accents, hover glows on pink surfaces)
>   - `--beni-zakura #B3141E`: crimson blossoms on black branches, as in the pecfest card art. Use it for petals and tree blossoms mixed with pink.
> - **Celestial layer:** `--murasaki #6A4C9C` (constellation hover, ecliptic, zodiac), `--fuji #8F7FC1` (wisteria), `--nebula #2C1B4E` (Milky Way / panel washes), `--starlight #A9C1F0` (cool star glints), `--moon #D9DDE6` (data numerals).
> - **Text:** `--washi #EFE4CD`, `--ivory #F2E9D5`, `--washi-2/3`, `--jade-fog #829B91` (quiet labels).
> - **Sky by Sun altitude** (`astro/skyColor.ts`): night `#08070F/#120E22` → nautical `#140F2E/#3B1A35` → civil `#2A2150/#9E3329` → golden `#7E6A92/#D3572E` → day `#C9C4CC/#EADBC8`. Dusk runs through the PECFEST rising-sun reds into a murasaki night.
>
> The original block follows for history only.

```css
:root {
  /* night surfaces (~90% of pixels) */
  --sumi: #07070B;        /* page background, deepest night */
  --ink: #121219;         /* raised surfaces */
  --night: #0B1222;       /* sky field */
  --indigo: #101B2B;      /* panels, dialogs */
  --lacquer: rgba(10, 12, 22, .66); /* glass panels over the sky (+ backdrop blur 12px) */

  /* paper / text */
  --washi: #EDE6D6;       /* primary text on dark; paper surfaces */
  --washi-2: #D6CAB0;     /* secondary text */
  --washi-3: #BDB094;     /* tertiary text */
  --paper-ink: #1B1A20;   /* text on washi paper */
  --mist: #8B94A7;        /* quiet labels, ISS, galaxies */

  /* moonlight */
  --moon: #D9DEE8;        /* data numerals (cool silver) */
  --moon-warm: #F3EAD6;   /* the Moon itself, star cores */

  /* gold = hierarchy */
  --gold: #CFA84F;
  --gold-bright: #E8C66A; /* focus ring, hover, cursor core */
  --gold-soft: #C4AA7C;   /* muted borders */
  --gold-accent: #E2C17F; /* the italic accent word */
  --line: rgba(207, 168, 79, .22);
  --line-hover: rgba(232, 198, 106, .55);

  /* vermilion = alive / now */
  --vermilion: #C8372D;
  --vermilion-deep: #B4282D;

  /* intro only */
  --urushi: #6B0F14;      /* crimson lacquer around the intro frame */
  --urushi-deep: #3E080B;
  --sakura: #F4C6CF;
  --sakura-deep: #E79AB0;
  --sakura-washi: #F3E4E2; /* gate paper */

  /* field mode (red night vision) remaps everything to #3A0000…#FF3B30 */
}
:root[data-field="on"] {
  --sumi:#000; --ink:#140000; --night:#0A0000; --indigo:#1A0000;
  --washi:#FF3B30; --washi-2:#C42A22; --washi-3:#8A1C17; --mist:#7A1A14;
  --moon:#FF3B30; --moon-warm:#FF3B30; --gold:#E0352B; --gold-bright:#FF3B30;
  --gold-soft:#8A1C17; --vermilion:#FF3B30; --line:rgba(255,59,48,.25);
}
```

**Rules:**

- **Gold means "look here":** eyebrows, constellation names, hairlines, focus.
- **Vermilion means "happening now":** the live dot, the current-time notch, seals, the torii, an ISS pass in progress. Never use gold and vermilion loudly on the same element.
- **Moon-silver** is for data numerals and **washi** is for text.
- **Sakura** appears only on the gate, in the intro and on petals. **Crimson lacquer** appears only around the intro frame.
- **Borders** are 1 px hairlines: they brighten on hover and never thicken. Prefer glows over drop shadows, e.g. `text-shadow: 0 2px 10px rgba(201,154,58,.35)`.
- **Text selection** uses a vermilion background with washi text.

**Sky colour follows the Sun's real altitude.** It drives the clear colour, fog, ambient light and the CSS `--sky-*` variables, interpolated with smoothstep:

| Sun altitude | Zenith | Horizon | Mood |
|---|---|---|---|
| above +6° | `#C9CCD0` | `#E6DCC6` | day, ink-wash washi; stars hidden |
| 0° | `#8C7E98` | `#E2A06A` | golden hour |
| −6° | `#2A2F55` | `#B4553A` | civil dusk (the demo's dusk palette) |
| −12° | `#121735` | `#2B2140` | nautical dusk |
| −18° or lower | `#07070B` | `#0E1222` | astronomical night |

### 5.2 Typography

Self-host every font (the venue Wi-Fi is unreliable): `@fontsource/cinzel` (400–700), `@fontsource-variable/plus-jakarta-sans`, `@fontsource/shippori-mincho` (500, 700), `@fontsource/cormorant-garamond` (italic 400 and 500 only). Before drawing any font into a canvas (star-morph text, labels), wait for `document.fonts.load(...)`.

| Role | Font | Size / tracking |
|---|---|---|
| Hero display | Cinzel 500 | `clamp(44px, 6vw, 96px)`, tracking −0.03em |
| Page title (H1) | Cinzel 500 | `clamp(32px, 4vw, 56px)`, tracking −0.01em |
| H2 / H3 | Cinzel 500 | 28 px / 20 px, tracking .06em |
| Accent word | Cormorant Garamond Italic 500, `--gold-accent` | same size as the title it sits in |
| Eyebrow | Plus Jakarta Sans 600, uppercase, `--gold` | 11–12 px, tracking .27em (hero eyebrow up to .5em) |
| Body | Plus Jakarta Sans 400, `--washi` at 88% | 15–16 px, line-height 1.6 |
| UI / labels | Plus Jakarta Sans 500 | 13 px, tracking .04em |
| Data numbers | Plus Jakarta Sans 600, `tabular-nums`, `--moon` | as needed |
| Big numbers (score, countdown) | Cinzel 500, gold glow | `clamp(36px, 5vw, 84px)` |
| Japanese | Shippori Mincho 500 or 700 | never below 12 px |

- **Title pattern:** an eyebrow, then a title with one accent word. Examples: `THE IMPERIAL DIRECTORY` / **Choose your *chapter*.** and `TONIGHT · 十六夜` / **The *hesitant* moon.**
- **The tracking ladder does more of the hierarchy work than size does:** .04em for UI, .08–.16em for labels, .27em for eyebrows.
- **Never go below 11 px.**
- **Kanji always come with an English gloss:** kanji, then romaji (secondary), then English. Kanji alone are never the only carrier of meaning.

### 5.3 Motion

```css
--ease-katana: cubic-bezier(.16, 1, .3, 1);    /* UI default: snaps out, settles silky */
--ease-cinematic: cubic-bezier(.25, 1, .5, 1); /* camera, big panels */
--ease-spring: cubic-bezier(.34, 1.56, .64, 1);/* stamps, cursor pops */
--ease-breath: cubic-bezier(.4, 0, .6, 1);     /* ambient loops */
```

- **GSAP equivalents:** katana ≈ `expo.out`, cinematic ≈ `power3.inOut`, spring ≈ `back.out(1.6)`.
- **Durations:**
  - micro feedback: 180 ms
  - UI reveals: 320–450 ms
  - dives and page changes: 1.4–1.8 s
  - ambient loops: 6–20 s
- **Camera** always uses time-based damping (`k = 1 - Math.pow(0.05, dt)`, as in the demo) or GSAP tweens that a new input can interrupt.
- **Reveals are themed, never plain fades:**
  - blade wipe (`clip-path` sweep)
  - kamon open (circle grows from a corner, −12° → 0°)
  - ink arrive (24 px slide with blur 3 px → 0)
  - hanko stamp (scale 1.4 at −12°, then 0.9, settling at 1 at −6°)

  Recipes are in `JAPANESE-THEME-UI-GUIDE.md` §15.

### 5.4 Surfaces and texture

- **Paper grain:** a fixed, full-screen SVG noise layer at 4% opacity (`pointer-events: none`). Recipe in the PECFEST guide §15.
- **Vignette:** a soft vignette darkens the edges toward whatever needs attention.
- **Glass panels** over the sky:
  - `--lacquer` fill with `backdrop-filter: blur(12px)`
  - a 1 px `--line` border with a slightly brighter top edge (the "gilded" look)
- **Washi paper sheets** for long content (lunar calendar, journal, science): `--washi` paper with grain, text in `--paper-ink`.
- **Radii:** cards 6 px, dialogs 8 px, pills 999 px. Crisp, never bubbly.
- **Optional hand-cut corners** with `clip-path`: dog-ear `polygon(0 0,100% 0,100% 94%,92% 100%,0 100%)`.

### 5.5 UI primitives (the lead builds these in `src/ui/`)

- **Layout and text:** `Eyebrow`, `Title` (supports one `<em>` accent word), `Hairline`.
- **`Button`:**
  - **primary:** a gold hairline pill whose fill is 12% gold, lifting 1 px on hover, with an optional React Bits StarBorder
  - **secondary:** text with an underline hairline
  - **commit:** vermilion fill, used only for "Log tonight's watch" and similar commits
- **`Card`:** a glass panel. The `SpotlightCard` variant has a gold spotlight that follows the pointer.
- **`Chip`:** variants `live` (vermilion beacon dot), `mock` (vermilion outline, "MOCK · pipeline pending"), `stale`, `provenance`.
- **`InfoPopover`:** the ⓘ button. It shows provenance (source, fetched time, cached/stale) and, when a `trace` exists, the formula and each contribution. Never hard-code an explanation.
- **`Stamp`:** a hanko seal (SVG with the demo's `#rough` turbulence filter).
- **`Dialog`:** a native `<dialog>` with a blurred backdrop.
- **`Kanji`:** Shippori Mincho text with `lang="ja"`.

### 5.6 Copy voice

Ceremonial, short and second person. A plain label is always visible beside the poetic one.

| Where | Copy |
|---|---|
| Gate eyebrow | `月読 · TSUKUYOMI WATCH` |
| Gate title | **Your sky, *tonight*.** |
| Gate body | "To draw the real stars above you, we need to know where you stand. We round it to about a kilometre and use it only to compute your sky and fetch tonight's forecast." |
| Gate buttons | `Enter with sound` · `Enter in silence` · link `Choose a place instead` |
| Loader lines (real steps only) | "Reading the star catalogue · {n} stars" → "Finding tonight's Moon · {name}" → "Asking the sky over {city}" → "Fetching tonight's forecast" → "Opening the gate" |
| Intro hint | "Scroll into the night ↓" |
| Dome CTA | **Enter your *sky*** ↘ |
| Chapters | 一 The Sky (Tonight) · 二 見張り Watchtower · 三 巻物 Celestial Scroll · 四 鏡 Spirit Lens · 五 誉 Honor (plus 学 Science in the directory) |
| Directory | eyebrow `THE IMPERIAL DIRECTORY`, title **Choose your *chapter*.** |
| Back | `← Return to the sky` (Esc) |

### 5.7 Layers (z-index)

| z | Layer |
|---|---|
| 0 | main `<Canvas>` |
| 10 | in-sky DOM labels and leader lines |
| 20 | GlowCursor canvas |
| 30 | HUD: time compass, chapter rail, location chip, countdown, sound toggle |
| 40 | module pages |
| 60 | ink-flood transition (LiquidEther) |
| 80 | gate and loader |
| 95 | paper grain |
| 100 | toasts and dialogs |

`pointer-events: none` is set on every decorative layer.

---

## 6. Tech stack and architecture

### 6.1 Stack

The lead installs everything in Phase 0, at the latest stable versions, pinned exactly.

- **App:** Vite + React 19 + TypeScript (strict). Dev server on **port 3000**.
- **Routing:** `react-router` v7.
- **State:** `zustand` v5. Use transient `subscribe` plus refs inside `useFrame`; never re-render React every frame.
- **3D:**
  - `three` + `@types/three`
  - `@react-three/fiber` v9, `@react-three/drei` v10
  - `@react-three/postprocessing` + `postprocessing` (bloom, vignette, noise)
- **Motion:**
  - `gsap` (all plugins are free now: ScrollTrigger, SplitText…) + `@gsap/react` (`useGSAP`)
  - `lenis` (`lenis/react` for `ReactLenis`)
  - `motion` (only because some React Bits components need it)
- **Astronomy:** `astronomy-engine`.
- **Styling:** `tailwindcss` v4 + `@tailwindcss/vite`. React Bits' TS-TW variants expect Tailwind. Token CSS variables stay the source of truth: map them in `@theme`.
- **Map:** `leaflet` + `react-leaflet` v5 (v5 is the React 19 version; frontend-basic uses v4 with React 18).
- **Fonts:** `@fontsource/*` as in §5.2.
- **Phase 3:** `vite-plugin-pwa`.
- **Dev only:** `r3f-perf`.

### 6.2 Folders and owners

```
frontend-main/
  AGENT_BRIEF.md  NOTES.md                                   (lead)
  index.html  vite.config.ts  package.json  tsconfig*.json   (lead)
  scripts/rb.mjs                                             (lead)  React Bits fetcher, §10.1
  public/
    data/sky/        stars.6.json, constellations.lines.json, constellations.json,
                     starnames.json, mw.json, dsos.bright.json, messier.json      (lead)
    textures/        moon_color_2k.jpg, moon_disp_1k.jpg, …                        (A)
    samples/         public-domain NASA images for Lens mocks + CREDITS.md         (D)
    audio/           sounds + CREDITS.md                                           (C)
  src/
    app/             main.tsx, App.tsx, routes.tsx, providers                      (lead)
    styles/          tokens.css, fonts.css, globals.css                            (lead)
    state/           store.ts                                                      (lead)
    ui/              primitives from §5.5                                          (lead; D may add page-level UI in modules/_ui)
    data/            api.ts (copied), useApi.ts, format.ts, location.ts           (lead)
    data/mocks/      lens.ts                                                       (D)
    astro/           catalog.ts, coords.ts, skytime.ts, moonNames.ts, skyColor.ts  (lead)
    scene/           CanvasRoot.tsx, Director.ts, quality.ts                       (lead)
    scene/sky/       Stars, MilkyWay, Moon, Sun, Planets, Constellations, Satellites,
                     Meteors, SkyDome (colour), Picking, SkyLabels                 (A)
    scene/dome/      DomeGlass, Island, Horizon, DomeHotspots                      (A)
    scene/intro/     SakuraTrees, Petals, Centrepiece, DuskLandscape, StarMorph    (B)
    intro/           Gate.tsx, Loader.tsx, IntroScroll.tsx, IntroFrame.tsx, BrandTitle  (B)
    hud/             TimeCompass, ChapterRail, Directory, LocationChip, Countdown,
                     SoundToggle, SkyCursor (GlowCursor), InkFlood, InfoCard       (C)
    audio/           engine.ts, cues.ts                                            (C)
    modules/         watchtower/, scroll/, lens/, dojo/, honor/, science/, _ui/    (D)
    vendor/reactbits/  fetched components (shared; whoever fetches commits only that file)
```

### 6.3 Shared contracts (the lead writes these before anyone else starts)

```ts
// src/state/store.ts  (zustand)
type Phase = 'gate' | 'loading' | 'intro' | 'dome' | 'sky' | 'diving' | 'module';
type Quality = 'high' | 'medium' | 'low';
interface Place {
  lat: number; lon: number; label: string; tz?: string;
  source: 'gps' | 'ip' | 'default' | 'manual';
}

interface AppState {
  phase: Phase; setPhase(p: Phase): void;
  place: Place | null; setPlace(p: Place): void;
  // Sky time = real now + offset. The time compass writes offsetMs; everything else reads skyDate().
  offsetMs: number; setOffset(ms: number): void; skyDate(): Date;
  sound: boolean; setSound(on: boolean): void;
  quality: Quality; setQuality(q: Quality): void;
  lite: boolean;            // phone / no WebGL2 / low-end
  reducedMotion: boolean;
  introProgress: number;    // 0..1, written by the intro ScrollTrigger
  hovered: SkyObject | null; selected: SkyObject | null;
  setHovered(o: SkyObject | null): void; select(o: SkyObject | null): void;
}

// A clickable thing in the sky
type SkyKind = 'star' | 'planet' | 'moon' | 'sun' | 'dso' | 'constellation'
             | 'iss' | 'meteor' | 'landmark';
interface SkyObject {
  kind: SkyKind; id: string; name: string; jp?: string;
  route?: string;            // where a dive goes, see §8.4
  world: [number, number, number];  // current position in the horizontal frame (§6.4)
}

// src/scene/Director.ts: the only thing that moves the camera
interface Director {
  station(name: 'intro' | 'dome' | 'sky', opts?: { instant?: boolean }): Promise<void>;
  diveTo(obj: SkyObject, screenPt: { x: number; y: number }): Promise<void>; // flight + ink flood, then navigate(route)
  back(): Promise<void>;   // reverse flight to the previous sky orientation
  lookAt(dir: [number, number, number], fov?: number): void;  // eased
}

// src/astro/*: pure functions, no React
loadCatalog(): Promise<Catalog>   // stars (ra, dec, mag, bv, hip, name?, jp?), constellation lines, Milky Way, DSOs
lstDeg(date: Date, lonDeg: number): number
eqToHorizontal(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): [x, y, z] // unit vector, §6.4
sunMoonPlanets(date: Date, place: Place): {...}   // astronomy-engine wrappers: alt/az, phase, illumination, libration
skyPalette(sunAltDeg: number): { zenith: string; horizon: string; starFade: number }
moonName(ageDays: number): { kanji, romaji, meaning }   // reuse the demo table; prefer /api/scroll/moon's name when available
```

### 6.4 Coordinate conventions (everyone uses these)

- **Horizontal frame:** x = east, y = up, −z = north, sky sphere radius **R = 100**. This is the demo's `eqToVec` convention.
- **Observer:** at the origin. Stars below the horizon (y < 0) are discarded in the shader, and that is what makes the dome a hemisphere.
- **Times:** all times come from `skyDate()`. Display times in the **location's IANA timezone** (from the API `timezone` field; the browser timezone only until that arrives) with `Intl.DateTimeFormat(…, { timeZone })`.
- **Rounding:** round coordinates to 2 decimals before they leave the device.

### 6.5 Scroll and render wiring

- **One Lenis instance**, driven by the GSAP ticker:

  ```ts
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  ```

- **The intro is one master ScrollTrigger timeline** (`scrub: 1`) over a tall track (about 650 vh). It writes `introProgress`; scene components read it in `useFrame`.
- **After the intro:** scrolling is released. Inside the sky, the wheel zooms the FOV instead of scrolling the page. Module pages use their own Lenis-scrolled container.
- **Canvas settings:** `dpr` comes from the quality tier. Use `gl={{ antialias: false, powerPreference: 'high-performance' }}` plus postprocessing SMAA or FXAA. When a module page fully covers the sky, switch `frameloop` to `"demand"`.

### 6.6 Data layer

- **Hooks:** wrap `api.ts` with the ported `useApi` hook, or a tiny cache keyed by `path + rounded lat/lon + hour`, so dives never refetch.
- **Fetch once per place:** `/api/scroll/moon`, `/sun`, `/planets`, `/events?days=7`, `/passes?days=3`, `/meteors`, and `/api/watchtower/score`. Results feed both the HUD and the sky markers.
- **Errors:** keep the last good data, show a `stale` chip, and retry. Never blank the screen.
- **Lens:** check `/api/lens/samples`. If it returns 200, use the real API; otherwise use `data/mocks/lens.ts`, which has the exact `LensResult` type from `api.ts`, `provenance: [{ source: 'mock', note: 'Spirit Lens pipeline not live yet' }]`, and the `mock` chip shown everywhere.

---

## 7. The journey, scene by scene

### 7.1 Gate (B) — shown first, at a fully interactive first paint

- **Background:** `--sakura-washi` paper with grain. Over it, a full-screen **LiquidEther** layer with `mix-blend-mode: multiply`, colours `['#1A1A22', '#C8372D', '#2B4A7A']` (sumi, vermilion, indigo), and `autoDemo` on so ink drifts before the user moves. It should feel like ink floating on water (suminagashi.app).
- **Centre card:** glass on paper (`rgba(255,255,255,.35)` + blur). It holds the eyebrow, title and body from §5.6, then two buttons and the link.
- **Click "Enter with sound" or "Enter in silence"** (this is the user gesture):
  1. Create and resume the `AudioContext` if sound was chosen. Store the sound choice.
  2. Call `navigator.geolocation.getCurrentPosition` (timeout 6 s, `maximumAge` 10 min).
  3. **If it succeeds:** store a `gps` place. Get the label from the API timezone/name, or reverse-geocode later if time allows.
  4. **If it's denied or times out:** call `https://get.geojs.io/v1/ip/geo.json`, then `https://ipwho.is/` as a second option. Store an `ip` place labelled "≈ {city}".
  5. **If both fail:** store the `default` place (Chandigarh, 30.76 N, 76.79 E).
  6. The location chip always says where the place came from (📍 GPS · ≈ IP · default) and opens a city search.
- **Already granted?** If `navigator.permissions.query({ name: 'geolocation' })` returns `granted`, show the gate anyway (it is also the sound choice), but say "We found you · {city}".
- **Preloading behind the gate:**
  - JS chunks for the intro and the sky
  - the star catalogue
  - the Moon texture
  - fonts
  - prefetches of `/moon`, `/sun`, `/score`, `/events` the moment a place exists
- **"Choose a place instead"** opens the city search. Use the Photon geocoder (`https://photon.komoot.io/api/?q=`), which is keyless with CORS. Keep a short preset list as backup: Chandigarh, Delhi, Bengaluru, Mumbai, Kyoto.

### 7.2 Loader (B) — only if something is still loading after the gate

- **Visual:** a dark sumi screen with about 3,000 GPU points (reuse the star shader).
  1. The points form a disc lit at **tonight's real phase** (sample points inside the lit region with the demo's `drawMoon` geometry).
  2. Then they morph into a **torii silhouette**.
  3. They hold until loading finishes, then scatter into the intro.
- **Progress:**
  - **Weighted by real cost:** catalogue ×3, intro chunk ×4, Moon texture ×2, fonts ×1, API ×1 each.
  - Shown as a gold hairline bar (`#916922 → #F5D78E`) plus the narration line from §5.6.
  - Use React Bits **DecryptedText**, with kana and kanji as the scramble characters, so each line resolves out of glyphs.
- **Hard timeout of 10 s:** continue anyway, and let the scene stream in. Never hang (PECFEST pitfall).
- **Never show the loader and the intro at the same time.**

### 7.3 Sakura dusk intro (B)

**Staging (3D, inside the same world as the sky):**

- The camera stands at the origin at eye height and faces **the real sunset azimuth for today at this place** (from `/api/scroll/sun` or astronomy-engine).
- **Centrepiece at that azimuth**, roughly 30–60 units out:
  - **Mt Fuji:** a large snow-capped cone silhouette with ink-wash gradients and soft bleed edges.
  - **Five-storey pagoda** in front of Fuji, slightly off-centre: layered roofs with upturned eaves, a sōrin spire, dark ink against the sky.
  - **Ink ridges and mist bands** between them: reuse the demo's `mkRidge` and mist ideas.
  - Draw these as layered SVG/canvas textures on billboards, or as shader planes. Parallax comes from depth.
- **Two cherry trees** frame the left and right edges, close to the camera:
  - Procedural branches (a few recursive splits → `TubeGeometry`, dark ink bark).
  - **Blossoms are instanced petals** (§7.3.1) clustered on the branch tips.
- **The real sky is already there but invisible:** stars fade in with sun altitude.

**The first frame (cheap, recommended):** ScrollExpand-style crimson frame.

- The canvas wrapper starts clipped to a centred frame: `clip-path: inset(21% 29% round 6px)`.
- **Outside the frame:**
  - `--urushi` crimson lacquer with a faint gold seigaiha wave pattern (SVG, 6% opacity)
  - a 1 px gold hairline around the frame
  - the eyebrow and hero title above it
  - a scroll hint below it
- **Scroll 0–8%:**
  - The frame opens to full bleed: interpolate the inset, ending at radius 0.
  - The camera FOV eases 38° → 55°, which plays the role of ScrollExpand's `mediaZoom`.
- The math comes from React Bits **ScrollExpand** (fetch it for reference with `node scripts/rb.mjs ScrollExpand-TS-TW`), but drive it from the master timeline, not from its own scroll listener.

**Scroll map** (the master timeline, scrubbed). The "sky time" during the intro is a **real time-lapse**: from 20 min before today's real sunset to the target night time. The target is now if it is already dark; otherwise tonight's astronomical dusk + 1 h. A small clock top-right shows the real time and its koku name (酉の刻…), as in the demo's dusk clock.

| Scroll | What happens |
|---|---|
| 0–8% | Crimson frame opens (above). Petals drift gently from the trees. |
| 8–30% | The sun sinks at its real azimuth (vermilion ink disc with a glow). The sky follows §5.1. Ink bleed passes on the ridges, as in the demo's `bleed`. Petals start detaching, more and more. |
| 30–55% | Petals lift and stream upward in a curl-noise flow field: a river of petals sweeping across and above the camera (webfactorypro feel). Stars begin igniting, brightest first. |
| 55–72% | **Petal → star.** Each petal homes on an assigned real star (§7.3.1), shrinks, turns emissive and lands. On arrival the real `Stars` point at that spot fades in while the petal fades out, so the handoff is invisible. |
| 72–82% | **Brand title morph:** about 1,500 faint field stars (never named ones) lift into **月読 · TSUKUYOMI WATCH** on a plane in front of the camera, hold, then return exactly to their true positions. Cinzel and Shippori are sampled into points from an offscreen canvas. |
| 82–90% | The Moon rises at its real position and phase. Constellation lines draw in as brush strokes (stroke reveal, gold names). Ambient petals stop. |
| 90–100% | **Pull back.** The camera rises and dollies back out through the sky sphere to the dome view (§7.4). The intro ends; scrolling is released. |

- **"Skip intro"** jumps straight to the dome; with reduced motion it crossfades.
- **Returning visitors** (a `localStorage` flag) get the gate, then a shortened 8-second auto-played version, with Skip.

#### 7.3.1 Petals (the signature effect)

- **Rendering:** one `InstancedMesh` with a curved petal geometry (two-triangle quad bent in the vertex shader) and a sakura gradient with a darker notch at the tip.
  - Counts: **high 12k, medium 6k, low 2.5k.**
- **All motion runs in the vertex shader**, driven by uniforms (`uProgress`, `uTime`) and per-instance attributes:
  - `aBranchPos` — where it sits on the tree
  - `aSeed`
  - `aDetach` — scroll value at which it leaves
  - `aStar` — target star position on the sphere, or a Milky Way point
  - `aLand` — scroll value at which it lands
- **Path:** a branch wobble, then detach, then a curl-noise drift (cheap 3D noise in GLSL), then a cubic Bézier toward `aStar` (control points above and behind the camera), then shrink to the star's point size and blend toward the star's colour.
- **Star assignment:**
  - Petals take the visible stars (y > 0 at the target sky time), **brightest first**, so the brightest stars land first: "the way your eyes would find them".
  - Leftover petals go to Milky Way points and fade.
- **No CPU per-frame work** for petals beyond setting the uniforms.

### 7.4 The dome, seen from outside (A)

- **It's the same scene.** Because below-horizon stars are discarded, pulling the camera back to about `(0, 70, 290)` looking at the origin shows the sky as a **hemisphere of real stars**.
  - Star sizes attenuate with distance but keep a minimum.
  - Constellation lines stay drawn.
- **Glass:** a hemisphere mesh at R = 101 with a cheap fresnel-rim shader (gold-silver rim, faint inner reflection streak). No transmission material; it's too costly.
- **Floating island** (radius 100):
  - the ink ground disc
  - the demo's three ridge rings (later replaced by the real horizon)
  - small versions of the pagoda, Fuji and one sakura tree at the sunset azimuth
  - an inverted rocky underside fading into mist
  - slow mist sprites below
- **Atelier-style hotspots:** hairline leader lines from a small ring on the object to an uppercase label.
  - 3 or 4 of them: `TONIGHT'S MOON · 十六夜` (real name), `THE WATCHTOWER · where to watch`, `THE SCROLL · what is coming` (on the ISS arc or ecliptic), `THE LENS · look closer` (on M42 or the brightest DSO above the horizon).
  - Clicking a hotspot dives to that module.
- **Ambient motion:** the dome rotates very slowly (0.5° per second) unless the pointer is moving; dragging orbits it (damped, as on jobhunt).
- **CTA:** **Enter your *sky*** ↘ plus a scroll hint. Clicking or scrolling flies the camera back to the origin through the glass (a brief refraction shimmer flash, about 300 ms), which leads to §7.5.
- **The dome is "home"** (chapter 一). The rail, directory and compass are available here too.

### 7.5 Inside the sky (A, with HUD from C)

- **Looking around:** drag to look, damped (demo math). The pitch range is −8° to +88°.
  - Wheel or pinch changes FOV between 12° and 80° (jobhunt feel).
  - A double-click centres on the point.
  - Arrow keys move between chapters (§8.5).
- **Rendering:** everything in §8. On hover:
  - The cursor gets a thin gold reticle (drawn in the scene).
  - The name appears with a leader line, in Cinzel plus Shippori.
  - A soft koto pluck plays if sound is on (C).
- **Plain stars and constellations:** a click opens an **InfoCard** (C) beside the object:
  - name (Cinzel) and Japanese name (Shippori)
  - constellation
  - magnitude
  - altitude and azimuth at sky time
  - rise and set (astronomy-engine `DefineStar` + `SearchRiseSet`)
  - distance in light-years, if the lead ships a small HYG subset for named stars
  - a `Look closer` button that narrows the FOV onto the object
- **Objects with a route** (§8.4): a click starts a **dive**.

### 7.6 Dive and return (C owns the transition; A provides object positions)

1. **0–600 ms.** The camera eases its look direction onto the object and the FOV narrows (Atelier: the object grows past the viewport). Nearby stars streak slightly radially (a vertex-shader stretch along the view vector while `uDive` > 0).
2. **400–1,100 ms.** **Ink flood** from the click point: a full-screen LiquidEther overlay in sumi, indigo and moon-silver.
   - **Fork the component** (it's copied source) to expose an imperative `splat(x, y, dx, dy, radius)` and `burst(x, y)`.
   - Fire 12–16 radial splats from the click point, plus a feathered noise mask that grows to full cover.
   - If forking runs over its time-box, use a shader ink-flood quad in the same palette.
3. **Then:** `navigate(route)`. The page mounts under the ink, the ink clears from the centre outward, and the page content arrives (blur → sharp).
4. **Esc or Back:** the reverse. The ink closes, the page unmounts, the camera returns to the exact saved orientation and FOV.

- Stars must not re-place during a dive: freeze `offsetMs` changes until it ends.
- **Reduced motion:** a 300 ms crossfade, no flight.

---

## 8. The sky: correctness and interactivity (A, with contracts from the lead)

### 8.1 Data (the lead downloads it into `public/data/sky/` in Phase 0)

- **d3-celestial** (BSD-3), from `https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/<file>`:
  - **Files:** `stars.6.json` (to magnitude 6, about 5,000 stars), `starnames.json`, `constellations.json`, `constellations.lines.json`, `mw.json`, `dsos.bright.json`, `messier.json`.
  - **Format:** GeoJSON at epoch J2000. Longitude = RA mapped into −180…180°, so `ra = lon < 0 ? lon + 360 : lon`. Star properties include `mag` and `bv`.
  - **Japanese names:** check the name files for `ja` keys. If they are missing, use the demo's katakana table for the bright stars and constellations.
- **Moon:** NASA SVS **CGI Moon Kit** (svs.gsfc.nasa.gov/4720): the LROC colour map (2k) and the displacement map (1k). Convert to WebP or KTX2.
- **Optional:** a HYG v4 subset (CC BY-SA) with distances for about 150 named stars.
- **Credits:** record every source in `frontend-main/CREDITS.md`, and show them on `/science`.

### 8.2 Rendering

- **Stars:**
  - One `Points` object with a custom shader (port the demo's), point size = `clamp(9.4 − 1.55·mag, 1.6, 12) · dprScale`.
  - **Colour from B−V:** use Ballesteros, `T = 4600·(1/(0.92·bv+1.7) + 1/(0.92·bv+0.62))`, then a small blackbody lookup table. Desaturate about 60% so it stays ink-like: warm and cool hints, never neon.
  - **Twinkle:** subtle, stronger near the horizon.
  - **Extinction:** fade below 8° altitude.
  - **Daylight:** stars fade by `skyPalette().starFade` (limiting magnitude drops as the Sun rises).
- **Milky Way:** the `mw.json` polygons, rasterised once into an equirectangular alpha texture on the sky sphere (with a cool tint), plus a sparse point cloud for sparkle. Its brightness follows darkness.
- **Constellations:** lines from `constellations.lines.json`.
  - Drawn as layered brush strokes, with 3 widths and alphas as in the demo. Either do it in a 2D overlay canvas (projected every frame, as the demo does), or as screen-space ribbons in WebGL if overlay cost is too high.
  - Gold Shippori names with Cormorant italic Latin names.
  - Hovering a constellation brightens its lines.
- **Moon:**
  - A sphere with the NASA map, lit by a directional light from the real Sun direction (astronomy-engine), so the phase is automatic.
  - Libration applied as rotation, from `Libration()`.
  - A halo sprite.
  - Its size is exaggerated about 3× for presence; say so in `/science`.
  - Label: `{kanji} · {romaji}` from `/api/scroll/moon`.
- **Sun:** a vermilion ink disc with a glow when above the horizon. Daytime colour comes from §5.1.
- **Planets:** positions from astronomy-engine (cross-check against `/api/scroll/planets`). Small warm discs labelled with their Japanese names (`jp` from the API).
- **ISS:** the next pass from `/api/scroll/passes` drawn as a dotted gold arc using its `track` (alt/az), with a start-time label.
  - If sky time falls inside a pass, a vermilion dot moves along the arc.
  - Lit or shadowed state comes from `track[].sunlit`.
- **Meteors:** shooting stars from the radiant of tonight's most active shower (`/api/scroll/meteors`). Frequency is proportional to `rate_per_hour`, scaled up for visibility; the label states the real rate and `/science` states the scale.
- **Horizon and ground:** the demo's ridges and mist band. Compass kanji 北 東 南 西 sit on the horizon in vermilion with Latin letters below.
- **Postprocessing:**
  - **high:** mipmap-blur bloom on stars, the Moon and the Sun; vignette; fine noise
  - **medium:** bloom at half resolution
  - **low:** none

### 8.3 Picking

- **Points:**
  - On `pointermove` (throttled to one per frame), project the **clickable set** to screen space: named stars (about 150), the Moon, the Sun, planets, DSOs above the horizon, the ISS arc and the landmarks. That's about 400 points.
  - Pick the nearest one within 14 px. For the Moon, use its angular radius.
- **Constellations:** distance to line segments within 8 px.
- **Meshes** (torii, pagoda, ridges, dome hotspots): use the R3F raycaster.
- **Keyboard and screen readers:** the directory includes "Tonight's highlights", a list that triggers the same dives (also the safest path in a live demo).

### 8.4 Sky object → destination

| Object | Route | Lands on |
|---|---|---|
| ☾ Moon | `/scroll#moon` | Tonight's Moon: name, phase, rise/set, lunar calendar |
| ⛩ torii / pagoda / horizon ridges | `/watchtower` | Verdict, Honor Score, best window, spots map |
| ISS arc | `/scroll#passes` | Passes with compass and arc |
| Meteor / radiant | `/scroll#meteors` | Showers, rate from here |
| Planets | `/scroll#planets` | Planets tonight |
| M42 · M31 · M45 · brightest DSO up | `/lens?target=<id>` | Spirit Lens on a sample image of that target |
| ★ Polaris | `/honor` | Ranks, journal, seals |
| Any other star or constellation | (none) | InfoCard (§7.5) |
| Sun (by day) | `/watchtower` | "Come back after dusk" verdict view |

### 8.5 Chapters (rail on the right; C)

Each chapter is a camera station. Arrow keys step through them.

| Chapter | Name | Camera station | Page |
|---|---|---|---|
| 一 | The Sky | dome exterior (home) | none (the sky itself) |
| 二 | 見張り Watchtower | tilts to the horizon toward the best spot | `/watchtower` |
| 三 | 巻物 Celestial Scroll | pans along the ecliptic to the Moon | `/scroll` |
| 四 | 鏡 Spirit Lens | narrows onto M42 or the brightest DSO | `/lens` |
| 五 | 誉 Honor | rises to Polaris | `/honor` |

- The rail is a set of roman-style kanji numerals with hairlines. The active one is gold and long, as on Atelier.
- Hovering a numeral shows the chapter name.
- `/science` lives in the directory and the footer.

### 8.6 The wadokei time compass (C)

- **Shape:** a half-disc rising from the bottom centre, radius `min(40vh, 340px)`, with a 1 px gold rim and lacquer glass.
- **The ring** is divided into the **12 koku**: 子 丑 寅 卯 辰 巳 午 未 申 酉 戌 亥, as equal 2-hour hours centred on 0:00, 2:00, … (state in `/science` that real wadokei used unequal hours).
  - The **day half** is washi with a vermilion sun glyph; the **night half** is indigo with a Moon glyph drawn at tonight's phase.
- **The pointer** is a fixed vermilion notch at the top. It reads `23:40 · 子の刻` in tabular figures, plus a date when not today, plus a `LIVE` beacon when the offset is 0.
- **Interaction:**
  - Drag rotates the ring (360° = 24 h), with inertia and friction when flicked.
  - Keyboard ←/→ moves ±15 min and Shift moves ±1 h.
  - A `Now` button eases back to the present.
  - The range is ±72 h.
  - Each koku boundary gives a tiny tick sound.
- **Marks on the ring** come from the API: sunset and sunrise, astronomical dusk and dawn, moonrise and moonset, the best window from `/api/watchtower/score` as a gold arc, and ISS pass ticks.
- **Effect:** it writes `offsetMs`, and everything follows instantly — star field rotation, Sun, Moon, sky colour, ISS dot. No refetching while dragging: reuse the hourly arrays; refetch only beyond the cached range.
- **Visibility:** hidden during the intro. Visible on the dome and in the sky. It folds down to a small chip on module pages.

### 8.7 Other HUD (C)

- **Location chip** (top-left): `📍 Chandigarh · 30.76 N 76.79 E` plus its source. Click opens the city search.
- **Next-event countdown** (top-right): the next visible event from `/api/scroll/events`, written as `DAYS 日 · HOURS 時 · MINS 分 · SECS 秒` in Cinzel with tabular figures. A crimson beacon appears when it is under an hour away. Clicking dives to it.
- **Sound toggle** (bottom-left): 4 animated bars plus `SOUND ON`/`OFF`, with an `aria-label`.
- **Directory button** (top-right): `✦ Chapters`. It opens the "Choose your chapter" dialog: numbered rows with a hover gold left border, a "Tonight's highlights" list, and Science.
- **GlowCursor** (§10.2).
- **Wordmark** (top-left, above the location chip): `月読 · TSUKUYOMI` in Cinzel and Shippori. Clicking it returns to the dome.

---

## 9. Module pages (D)

### 9.1 Shared page frame

- **Over the sky:** a page mounts over the dimmed sky (canvas brightness 35%, blur 6 px via a CSS filter on the canvas wrapper).
- **Header:**
  - `← Return to the sky`
  - the eyebrow, e.g. `二 · 見張り · THE WATCHTOWER`
  - a title with an accent word
  - the place and sky-time chips
- **Content:**
  - Glass cards for data. Use washi paper sheets for long, scroll-like content (calendar, journal, science).
  - Content arrives with ink-arrive and stagger. Numbers count up with React Bits **CountUp**.
  - The page scrolls in its own Lenis container, with React Bits **GradualBlur** at the top and bottom edges.
- **Every number from the API** gets a ⓘ `InfoPopover` built from `provenance` and `trace`.
- **Start from frontend-basic:** `frontend-basic/src/pages/*.tsx` already call every endpoint correctly. Port that logic and re-skin it.

### 9.2 `/watchtower` — 見張り "where and whether"

- **Verdict card:**
  - A big hanko-style seal: **行 GO**, **迷 MAYBE** or **留 STAY IN** (vermilion).
  - The headline and reason from `verdict`.
  - Warnings (dew, cold) as chips.
- **Night Honor Score:** the demo's brush-arc gauge with the 0–100 score, plus Bortle and the best window (`best_window.start_local → end_local`, with its reason).
- **Tonight's timeline:**
  - Hourly scores (`hours[]`) as brush-textured bars.
  - The best window is a gold band; the current sky time is a vermilion notch, linked to the compass.
- **Why this score:** a waterfall chart from `trace.contributions` (factor, value, weight, contribution).
- **Spots:**
  - A list (name, kind glyph, distance, Bortle, score, best window, verdict) plus a Leaflet map styled as ink on washi:
    - OSM tiles with `filter: grayscale(1) sepia(.25) contrast(1.05)`, attribution kept
    - markers are Shippori kanji glyphs (山 peak, ⛩ shrine, 寺 temple, 湖 lake, 園 park, 望 viewpoint), sized and darkened by `rank_score`
    - the selected spot gets a vermilion ring
  - **List and map are hover-linked.** Lazy-load Leaflet.
  - Overpass can be slow, so show "Searching the mountains…" while it loads.

### 9.3 `/scroll` — 巻物 "what and when"

Anchors: `#moon #calendar #events #passes #meteors #planets #eclipses #launches`.

- **Moon hero:**
  - a large phase-correct Moon (canvas with the demo's `drawMoon`, or a small R3F Moon)
  - kanji name large, romaji, meaning
  - illumination, rise and set, next quarters
- **Lunar calendar (旧暦):**
  - a horizontal **emakimono**: a washi strip that scrolls sideways by drag or wheel
  - each day shows a Moon glyph, the date, the lunar day, sekki and kō names, and event seals (gold = meteor, grey = ISS, vermilion = eclipse)
  - today is ringed in vermilion
- **Events** (`/api/scroll/events`):
  - filter chips (Moon, Meteors, Eclipses, ISS, Launches, Planets); keep the filter in the URL hash
  - each card shows: title and `jp`, local time, `visible_from_here` (yes/no with reason), direction compass, peak altitude
  - **Add to calendar:** `/api/scroll/ics?...` download.
  - **Remind me:** request Notification permission here, and only here. Schedule a local notification. Be honest: "while this tab is open".
- **ISS passes:** an SVG compass rose with the arc from `start_az` to `end_az`, max altitude and duration. The "visible" ones are highlighted.
- **Meteors:** a rate-per-hour sparkline from `hours[]`, ZHR now, radiant altitude.
- **Planets:** cards with name, `jp`, magnitude, rise and set, up now, naked-eye.
- **Eclipses** and **launches:** lists. Launches get a countdown and a webcast link.

### 9.4 `/lens` and `/dojo/:id` — 鏡 Spirit Lens + the Katana slider

**Lens** (backend pipeline not live, so mocks per §6.6):

- A "misted mirror" upload zone (a frosted glass panel that clears where the cursor moves) and a sample picker (M42, M31, M45).
  - Optional: React Bits **DomeGallery** to show samples on a dome.
- Use 2–3 **NASA public-domain** images, at most 2000 px, as WebP in `public/samples/`, credited in `public/samples/CREDITS.md`. Verify each one is NASA-produced.
- **Stages timeline:** `load → background → detect → psf → denoise → deblur → honesty → classify → wcs`, with the demo's **kintsugi** gold-crack loader while it runs.
  - With mocks, the stages advance on a timer and carry the `MOCK` chip.
- **The mock "original"** is a client-side degraded copy of the sample (blur 2.2 px plus noise, as in the demo's lens pane), labelled "simulated degradation · mock".

**Dojo — the katana slider** (`modules/_ui/KatanaSlider.tsx`):

- **Layers:** two stacked images (or canvases) in a frame.
  - The restored layer sits on top, clipped with `clip-path: inset(0 0 0 var(--cut))`.
  - Labels: left `原 ORIGINAL`, right `修 RESTORED` (gold).
- **The divider is a drawn katana** (inline SVG, vertical, at `x = --cut`):
  - **Kissaki (tip):** pokes about 10 px above the top edge of the frame.
  - **Blade:** 7–9 px wide, with a steel gradient (`#F4F6FA → #A9B1BE → #6E7684`), a darker mune (back edge), and a milky **hamon** temper line along the cutting edge (a wavy notare band; an `feTurbulence`-displaced path at about 35% opacity). A specular glint travels the blade every few seconds and on hover.
  - **Habaki:** a gold collar (`--gold`) just above the bottom edge of the frame.
  - **Tsuba (guard):** a dark iron oval with a gold rim, sitting on the bottom edge.
  - **Tsuka (handle):** 70–90 px below the frame, with white samegawa under a black **ito diamond wrap** (a repeating SVG pattern), a gold menuki and a kashira cap.
    - The tsuka is the grab handle: `cursor: grab`, at least a 44 px hit area. The blade itself is draggable too.
- **Interaction:**
  - Drag with pointer capture.
  - Clicking inside the frame moves the cut there over 250 ms with `--ease-katana`.
  - **Keyboard (ARIA slider):** `role="slider"`, `aria-valuenow`, label "Before and after: drag the katana". ←/→ moves 2%, Shift+arrow 10%, Home/End jump to the ends.
  - **On release, a "slash":**
    - a white-gold flash runs down the blade (450 ms)
    - a hair-thin diagonal slash line flashes across the frame (180 ms)
    - a katana *shing* plays if sound is on
  - **First view, "unsheathe":** the blade slides up out of the tsuba (600 ms), then sweeps from 20% to 50%.
- **Detections** (true-shape ellipses: stars gold, galaxies mist, unknown vermilion) appear **only on the restored side**, clipped by the same `--cut`. Labels flip side near the edges. Clicking a detection opens an inspector drawer (position, flux or instrumental magnitude, FWHM, kind, catalogue name if any).
- **Three modes:** `原 Original · 修 Restored · 誠 Honesty`.
  - **Honesty:** the residual as a heat map (sumi → vermilion → gold), plus **kintsugi seams**: contours where change exceeds a threshold, drawn as gold strokes with a glow over lacquer black.
  - Also show the metrics (SSIM, PSNR, χ², flux conservation, invented pixels), each with a `MOCK` chip until the real API exists.
- **Zoom and pan:** wheel to zoom, drag with Space held (or whenever zoomed in) to pan. One transform applies to both layers so they stay aligned.

### 9.5 `/honor` — 誉

- **Rank banner** with a seal: 足軽 Ashigaru → 侍 Samurai → 大名 Daimyō → 将軍 Shōgun. The ledger lives in `localStorage`.
- **"Log tonight's watch":** the vermilion commit button. It stamps a **hanko** (the demo's SVG and animation) and snapshots conditions from `/api/watchtower/score`.
  - Only allow it when the current verdict is not `stay_in`, or when an event is visible at sky time. Say why when it's blocked.
- **Journal:** a horizontal washi emakimono of entries, each with a seal, date, Moon glyph and conditions.

### 9.6 `/science` — 学 "is this real?"

- **Architecture:** one diagram (inline SVG): browser sky engine + FastAPI providers.
- **Formulas:** every formula, read from `trace` objects returned by the API. Never retype them.
- **Data sources:** each with licence and cache time, from `provenance`.
- **Honesty notes:**
  - the Moon is drawn about 3× its real size
  - the meteor visual rate is scaled ×N for visibility
  - wadokei hours are equal-length
  - the IP location is approximate
  - the star catalogue is d3-celestial / Hipparcos, magnitude ≤ 6, with its star count
  - Lens is mocked until the pipeline lands
- **Credits:** fonts, data, audio, images and React Bits.
- **Layout:** React Bits **ScrollReveal** for long text.

---

## 10. Effects, sound, performance and fallbacks

### 10.1 React Bits (lead fetches in Phase 0)

Fetch exact sources from the registry rather than retyping them. Add `scripts/rb.mjs`:

```js
// usage: node scripts/rb.mjs GlowCursor-TS-TW LiquidEther-TS-TW …
import fs from 'node:fs';
import path from 'node:path';
for (const id of process.argv.slice(2)) {
  const res = await fetch(`https://reactbits.dev/r/${id}`);
  if (!res.ok) { console.error(id, res.status); continue; }
  const item = await res.json();
  for (const f of item.files) {
    const out = path.join('src/vendor/reactbits', path.basename(f.path));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, f.content);
    console.log('wrote', out);
  }
  if (item.dependencies?.length) console.log(`  npm deps for ${id}:`, item.dependencies.join(' '));
}
```

Run it with `node scripts/rb.mjs LiquidEther-TS-TW GlowCursor-TS-TW ScrollExpand-TS-TW DecryptedText-TS-TW CountUp-TS-TW StarBorder-TS-TW SpotlightCard-TS-TW AnimatedContent-TS-TW GradualBlur-TS-TW ScrollReveal-TS-TW`, then install the printed dependencies. The index of all 206 components is at `https://reactbits.dev/llms.txt`.

| Component | Job | Owner |
|---|---|---|
| **LiquidEther** | Suminagashi ink on the gate, plus the ink flood in dives (forked to expose `splat`/`burst`) | B (gate), C (flood) |
| **GlowCursor** | Moonlight trail over the night sky | C |
| **ScrollExpand** | Reference math for the crimson frame (not mounted as-is) | B |
| **DecryptedText** | Loader narration resolving out of kana and kanji | B |
| **CountUp** | Scores and counts on reveal | D |
| **StarBorder** | A star travelling the gold hairline of primary CTAs | lead (`ui/Button`) |
| **SpotlightCard** | Gold spotlight on data cards | lead (`ui/Card`) |
| **AnimatedContent** | Ink-arrive reveals on pages | D |
| **GradualBlur** | Soft edges of scrolling pages | D |
| **ScrollReveal** | Long text on `/science` | D |
| *Optional:* **CircularText** | Slow rotating `月読 · TSUKUYOMI WATCH ·` ring at the compass hub | C |
| *Optional:* **DomeGallery** | Lens sample picker on a dome | D |

**Rules for React Bits:**

- Recolour everything to the tokens; no default purples or blues ever ship.
- Add nothing beyond this list unless it has a job in §1.
- Everything respects reduced motion.

### 10.2 GlowCursor setup (C)

```tsx
<GlowCursor
  style={{ position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'none' }} // inline style beats the component's own `relative` class
  color="#F1DFA8"            // warm gold-white where freshly drawn
  secondaryColor="#AEB6C8"   // cools to moon-silver
  intensity={1.0} trailWidth={2} linger={0.9} glow={1.1}
  hotspot={0.6} followSpeed={0.55} grain={0.15}
  clickBurst theme="dark"
  quality={quality === 'high' ? 'high' : 'medium'}
  maxDevicePixelRatio={1.5}
  enabled={cursorOn}
/>
```

Mount it without children: it listens on `window`.

- **`cursorOn` is true only when** the phase is `dome`, `sky` or `diving`, or the intro is past 55% (the sky is dark).
- **It is false when:**
  - the pointer is over an element with `data-cursor="off"` (washi sheets, inputs, cards; check with `closest()` on pointermove)
  - in Lite mode, on touch devices, or with reduced motion
- **On the gate:** unmount it completely (the gate has LiquidEther).

### 10.3 LiquidEther setup

- **Gate (B):**
  - colours `['#1A1A22', '#C8372D', '#2B4A7A']`
  - `isViscous` on, a moderate `viscous` value, `resolution` 0.5, `autoDemo` on, slow `autoSpeed`
  - in a full-screen layer with `mix-blend-mode: multiply` at about 85% opacity over `--sakura-washi` with grain
  - Check the fetched source for the exact prop names. Tune until it reads like ink floating on water (suminagashi.app), not neon smoke.
- **Ink flood (C):** sumi, indigo and moon-silver, with no `autoDemo`, driven by the forked `splat()`.
- **Mounting:** mount only on the gate and during a transition; unmount afterwards. Never leave two fluid sims running.

### 10.4 Crimson frame (B)

This is §7.3's first frame. It's cheap (a `clip-path` on the canvas wrapper plus an FOV ease), so keep it unless time is very short.

### 10.5 Sound (C, Phase 3, time-box 40 min)

- **Engine:**
  - one `AudioContext`, unlocked by the gate click
  - master gain 0.6
  - ambient bed fades in over 2 s and ducks under a whoosh
  - nothing plays before the gate choice; the toggle always works
- **Cues:**

  | Cue | When |
  |---|---|
  | wind/night ambience | low, always while sound is on |
  | koto pluck | clicking a sky object |
  | whoosh / reverse whoosh | dive / back |
  | furin chime | the last stars land, in the intro |
  | hanko thud | stamping |
  | katana *shing* | slider release |
  | wood clack | directory open |
  | soft tick | crossing a koku boundary |

- **Recordings:** use the **Openverse** API (keyless, rate-limited, so search sparingly):
  - endpoint: `https://api.openverse.org/v1/audio/?q=<terms>&license=cc0,by&page_size=20`
  - **use CC0 or CC BY only.** No NC/ND (ND forbids even trimming).
  - Record title, creator, licence and URL in `public/audio/CREDITS.md`, and show them on `/science`.
  - Trim and normalise each file, then encode it to `.ogg` (with `.mp3` fallback): 150 KB or less each, 1.5 MB total.
- **Synthesized UI sounds:** clicks, ticks and whooshes are fine to synthesize in Web Audio directly (filtered noise bursts, short sine plucks).
- **Optional:** **earshot** (MIT, CPU-only; installing it pulls a CPU build of PyTorch, so only do it if an agent has spare time) can synthesize and critique sounds through its MCP (`forge`, `sfx`, `critique`).

### 10.6 Quality tiers (lead, with A, B and C)

Use drei `<PerformanceMonitor>` while the loader and intro start. Step **down** on decline, step **up** at most once, and limit flip-flops to 3.

| Setting | high (discrete GPU) | medium (integrated) | low |
|---|---|---|---|
| DPR | 2 (cap) | 1.5 | 1 |
| Petals | 12k | 6k | 2.5k |
| Milky Way sparkle points | 22k | 12k | 6k |
| Bloom | full | half resolution | off |
| Constellation overlay | full DPR | 1× | 1× |
| LiquidEther resolution | 0.5 | 0.35 | 0.25 |
| GlowCursor | high | medium | off |

### 10.7 Lite mode, PWA and field mode (Phase 3)

- **Lite mode** turns on when there is no WebGL2, or `(pointer: coarse)` with a viewport under 900 px, or quality falls to low twice. In Lite mode:
  - the intro is a static dusk poster with CSS petals, then a 2 s crossfade into the sky
  - stars down to magnitude 5 only
  - no LiquidEther (a static ink gradient instead) and no GlowCursor
  - the compass becomes a horizontal swipe band
  - all pages fully usable
- **PWA:** `vite-plugin-pwa` with a manifest (icon = the 月読 hanko seal), caching the shell, catalogue, fonts and the last API responses.
- **Field mode** (a red night-vision toggle in the directory, and in the HUD in Lite mode):
  - sets `data-field="on"`, which applies the token remap (§5.1)
  - stars tinted red through a uniform, bloom off, animations off, type +2 px

### 10.8 Reduced motion and accessibility

- **`prefers-reduced-motion`:** the intro becomes 4 crossfaded tableaux; no twinkle, meteors or LiquidEther motion; dives are crossfades; the compass jumps with no inertia.
- **Focus ring:** `2px solid var(--gold-bright)` with a 6 px offset. Touch targets are at least 44 px. The loader has `role="progressbar"`, and every chart has screen-reader text.
- **Keyboard:** every sky destination is reachable from the directory's "Tonight's highlights".

---

## 11. Parallel plan and timeline

**Setup:** one branch, `feat/frontend-main`, and **one working tree** with strict folder ownership (§6.2).

- **Only the lead** runs `git pull`, `git push`, branch switches, rebases or stashes. Everyone else only commits their own paths.
- **Only the lead** runs the dev servers: Vite on :3000 and uvicorn on :8000. Everyone else uses those; Vite HMR updates all of them.
- **Only the lead** installs packages. Ask through `NOTES.md` if you need one.

### Phase 0 — Lead (T+0:00 → T+0:40)

1. `git pull`, then `git checkout -b feat/frontend-main`. Start the backend (§2).
2. Scaffold Vite + React 19 + TS in `frontend-main/`, keeping its README. Use port 3000 and the `@/` alias for `src`. Install **all** of §6.1 and set up Tailwind v4 and the fonts.
3. Create `styles/` (tokens, fonts, globals, grain) and minimal `ui/` primitives (time-box 20 min; they can be refined later).
4. Create `state/store.ts` (§6.3) and `scene/CanvasRoot.tsx` (one persistent canvas under the router).
   - Also a `scene/Director.ts` skeleton, **handed to C after Phase 0**, and `scene/quality.ts`.
   - Port the demo's procedural sky as a placeholder so everyone sees something.
5. Routes `/`, `/watchtower`, `/scroll`, `/lens`, `/dojo/:id`, `/honor`, `/science`, each lazy with a placeholder page.
6. `data/`: copy `api.ts`, `useApi.ts` and `format.ts`, and write `location.ts` (GPS → IP → default, with rounding).
7. `astro/`: `catalog.ts`, `coords.ts`, `skytime.ts`, `skyColor.ts`, `moonNames.ts`. Download the sky data into `public/data/sky/`.
   - Export `getStarTargets(date, place, n)`: world positions of visible stars sorted by brightness, for B's petals.
8. Add `scripts/rb.mjs`, fetch the components from §10.1 and install their dependencies.
9. Create `NOTES.md` with `## Status` and `## Requests`. Commit "frontend-main: foundation", then start A–D.

### Workstream A — Sky and dome

**Owns:** `src/scene/sky/`, `src/scene/dome/`, `public/textures/`.

Build in this order:

1. Real stars from the catalogue: positions, B−V colours, size, twinkle, extinction, day fade. **Validate against Stellarium Web** (stellarium-web.org) for Chandigarh at two times; Orion, Sirius, the Moon and one planet should be within about 1°.
2. The Moon (NASA texture, real phase and libration, label), the Sun, and sky colour from Sun altitude.
3. Constellation brush lines and names, and the Milky Way.
4. Picking, hover labels and the reticle. Publish `SkyObject`s (positions for dives, InfoCard data).
5. The dome exterior: glass rim, island, hotspots, slow rotation, orbit.
6. Planets, the ISS arc, meteors.
7. Postprocessing per tier.

### Workstream B — Gate, loader, intro

**Owns:** `src/intro/`, `src/scene/intro/`.

Build in this order:

1. The gate: LiquidEther, the location flow, the sound choice, preloading. **First 45 min.**
2. The master ScrollTrigger timeline with Lenis, the scroll map from §7.3 with placeholder visuals, and Skip.
3. Dusk landscape, ridges, pagoda and Fuji centrepiece, and the real-azimuth sunset.
4. Sakura trees and instanced petals (detach and drift).
5. Petal → star homing and the invisible handoff (uses `getStarTargets`).
6. The crimson frame (ScrollExpand math).
7. The brand title star-morph.
8. Loader particles plus DecryptedText narration.
9. The shortened return-visit intro.

If B falls behind, cut in this order: loader particles (keep the narration line), the title morph, the crimson frame.

### Workstream C — HUD, navigation, transitions, cursor, sound

**Owns:** `src/hud/`, `src/audio/`, `public/audio/`, and `src/scene/Director.ts` (after Phase 0).

Build in this order:

1. `Director`: the dive flight, back, stations; the InkFlood (forked LiquidEther `splat`).
2. The chapter rail, the directory dialog with "Tonight's highlights", and keyboard handling.
3. The wadokei time compass (§8.6).
4. The location chip and city search.
5. The countdown.
6. The GlowCursor overlay with its enable rules.
7. The InfoCard UI.
8. Sound (§10.5): Phase 3, time-boxed.

### Workstream D — Module pages

**Owns:** `src/modules/`, `src/data/mocks/`, `public/samples/`.

Build in this order:

1. The page frame (§9.1).
2. Watchtower.
3. Scroll.
4. Lens and Dojo with the **katana slider**.
5. Honor.
6. Science.
7. Field mode and Lite pass on the pages.

### Checkpoints (the lead runs them; each ends with a Playwright screenshot set in `frontend-main/qa/`)

| When | What must be true |
|---|---|
| **T+1:45** | It runs gate → intro (rough) → dome → sky with **real stars** → one dive → one real page. Fix integration blockers only. |
| **T+3:00** | Every §8.4 dive works; the compass drives the sky; petals become stars; Watchtower and Scroll show real data; the katana slider works. |
| **T+3:00 → 4:15** | Polish, quality tiers, sound, Lite mode, PWA, field mode, copy pass. |
| **T+4:15** | **Feature freeze.** Bug fixes only. `npm run build` (must pass `tsc`), `npm run preview`, run the §13 demo script twice on the demo laptop with the backend up. Push and open a PR into `main`. |

**The cut list.** If behind at T+3:00, cut in this order:

1. sound
2. loader particle morph
3. brand title morph
4. crimson frame
5. dome exterior (go straight into the sky after the intro)
6. meteors and the ISS arc in the sky
7. Lens Honesty mode

**Never cut:**

- the gate and location flow
- the real star sky with the Moon
- petals becoming stars
- dives with the ink flood
- the time compass
- Watchtower and Scroll with real data
- the katana slider
- the no-fake rule

---

## 12. Tooling for the agents (install before kickoff, about 5 min)

- **Anthropic frontend-design skill:** `/plugin install frontend-design@claude-plugins-official`
- **GSAP official skills** (core, timeline, scrolltrigger, react, performance…): `/plugin marketplace add greensock/gsap-skills`, then install its skills. Alternatively: `npx skills add https://github.com/greensock/gsap-skills`.
- **three.js skills** (fundamentals, shaders, postprocessing, interaction; written for r160+): `npx skills add https://github.com/cloudai-x/threejs-skills`. Check that they landed in `.claude/skills/`.
- **Playwright MCP**, for visual self-checks against the references: `claude mcp add playwright -- npx @playwright/mcp@latest`
- **Context7 MCP**, for current library docs: `claude mcp add context7 -- npx -y @upstash/context7-mcp`. R3F v9, drei v10, Lenis, react-router v7 and Tailwind v4 have all changed recently, so check the docs rather than guessing APIs.
- **Optional, sound:** earshot (`https://github.com/Leonxlnx/earshot`, MIT). It's an MCP server plus `skills/earshot` and `skills/real-sound`; follow its README.
- **Sky correctness:** Stellarium Web (stellarium-web.org).

---

## 13. Definition of done and the demo script

**Acceptance checks:**

- **Gate:** interactive within 1.5 s on localhost, with the ink moving.
- **Location:**
  - allowed → GPS
  - blocked → IP city shown with "≈"
  - offline → Chandigarh default
- **Intro:** scrubs forwards and backwards at 60 fps on high with no hitch at the petal → star handoff. Skip works.
- **Sky accuracy:** within about 1° of Stellarium Web for three named stars, the Moon and one planet, at two different times.
- **Time compass:** drag from now to +12 h and the stars wheel, the sky turns to day and the Sun appears. `Now` returns.
- **Dives:** Moon, torii, ISS arc, M42 and Polaris all land on their pages. Esc returns to the exact view.
- **Pages:** real API data with ⓘ provenance; Lens shows MOCK chips everywhere.
- **Katana:** drag, keyboard, slash on release, unsheathe on first view.
- **Build:** no console errors; `npm run build` passes.
- **Fallbacks:** reduced motion and Lite mode (narrow window) both work.
- **Hallway test:** a stranger finds tonight's verdict and the best spot within 20 s.

**Demo script** (about 3 minutes):

1. Open → gate → allow location → *Enter with sound*. The loader narrates.
2. The crimson frame opens. Scroll: sunset, petals stream and become the stars above Chandigarh, the title forms and dissolves, the Moon rises with tonight's name.
3. Pull back to the dome and point out the hotspots. *Enter your sky.*
4. Hover Orion and Sirius. Click the Moon → dive → Moon tonight and the lunar calendar. Esc.
5. Drag the wadokei to 23:00: the sky wheels and the best window lights up in gold.
6. Click the torii → Watchtower: verdict seal, score, spots map.
7. Click M42 → Lens and Dojo: unsheathe the katana and slice between before and after; show Honesty (labelled mock).
8. Directory → Honor → stamp tonight. Open `/science`: "every number here is traceable".

---

## 14. Kickoff prompts (paste these)

**Lead — session 1:**

```
You are the LEAD agent building the Tsukuyomi Watch frontend for PECathon 2026. Hard deadline: 5 hours from now.
Repo = current folder. Run `git pull`, then read frontend-main/AGENT_BRIEF.md completely (it is the spec; the decisions in §3 are final), then docs/API.md and frontend-basic/src/api.ts, and open docs/living-sky-demo.html in a browser.
Do Phase 0 exactly as §11 says (≤ 40 min) and commit it. Then launch workstreams A, B, C and D in parallel: if you can spawn subagents, give each one its kickoff prompt from §14; otherwise print the four prompts so I can paste them into new sessions.
After that you own integration, NOTES.md requests, the dev servers, the checkpoints at T+1:45 and T+3:00 (Playwright screenshots into frontend-main/qa/), quality tiers, the T+4:15 freeze, the build, the §13 demo script, the push and the PR into main.
Never edit backend/, frontend-basic/ or docs/. Keep the app runnable at every commit. Smoothness beats spectacle; nothing on screen may be faked.
```

**Workstream template** (fill in X):

```
You are WORKSTREAM {X} on the Tsukuyomi Watch frontend. The lead has committed the foundation on branch feat/frontend-main; the dev server is on http://localhost:3000 and the backend on http://localhost:8000.
Read frontend-main/AGENT_BRIEF.md §1–§10 completely, then your section in §11. You own ONLY: {folders}. Do not edit anything else. Do not run git pull/push/checkout/stash/rebase, npm install, or a second dev server. Put cross-folder needs under "## Requests" in frontend-main/NOTES.md and stub them locally.
Build your deliverables in the listed order. Commit after each one (git add only your paths). Screenshot your work with Playwright and compare it against the reference sites named in §1. Update "## Status" in NOTES.md at each checkpoint (T+1:45, T+3:00). If you fall behind, follow your cut order. Never break `npm run dev`.
```

| X | Name | Folders |
|---|---|---|
| A | Sky and dome | `src/scene/sky/`, `src/scene/dome/`, `public/textures/` |
| B | Gate, loader and intro | `src/intro/`, `src/scene/intro/` |
| C | HUD, navigation, transitions, cursor and sound | `src/hud/`, `src/audio/`, `public/audio/`, `src/scene/Director.ts` |
| D | Module pages | `src/modules/`, `src/data/mocks/`, `public/samples/` |
