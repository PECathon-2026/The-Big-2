# Japanese Theme UI: Inspiration Guide

> Design reference taken from **[pecfest.in](https://pecfest.in/)** (PECFEST 2026, "A Mystic Mikado"), studied on 2026-10-29.
> Use it for mood, tokens and patterns. Don't clone the site: borrow the *system*, then make it our own.
>
> 📁 Screenshots referenced below live in [`shots/`](shots/). Keep that folder next to this file so the images render.

## Contents

1. [The big idea](#1-the-big-idea)
2. [Visual tour](#2-visual-tour)
3. [Colour palette](#3-colour-palette)
4. [Typography](#4-typography)
5. [Shape, depth & texture](#5-shape-depth--texture)
6. [Motif library](#6-motif-library)
7. [Signature components](#7-signature-components)
8. [Motion language](#8-motion-language)
9. [Sound](#9-sound)
10. [Copywriting voice](#10-copywriting-voice)
11. [Layout & responsiveness](#11-layout--responsiveness)
12. [Accessibility & performance habits](#12-accessibility--performance-habits)
13. [Pitfalls to avoid](#13-pitfalls-to-avoid)
14. [Starter tokens (copy-paste)](#14-starter-tokens-copy-paste)
15. [Starter recipes](#15-starter-recipes)
16. [Ideas for our project](#16-ideas-for-our-project)

---

## 1. The big idea

**The site is a pilgrimage, not a page.** Scrolling moves a camera through a 3D shrine: across a pond, through a torii gate, up stone stairs and into a room of **seven shoji doors**, one per section of the site. Behind the last door is a waterfall and a theme-reveal poster.

The lesson isn't "build a 3D world". It's this:

> **Every functional UI element is reskinned as an object from that world.**
> The loader *narrates*, the cursor is an *ink brush*, a click is a *katana slash*, the navigation is a *door*, and a notice is an *official scroll* with a hanko-style badge.

A few principles hold it together:

- **One vocabulary everywhere:** sumi ink, washi paper, gold leaf, crimson lacquer, kanji, katana, lanterns, petals, taiko.
- **Restraint in colour:** about 90% dark neutrals. Gold carries the hierarchy. Crimson only means *alive / now*.
- **Spectacle with escape hatches:** "Skip intro", "Skip to events" and a flat directory menu are always available.
- **Graceful fallback:** if 3D fails, the page drops to a CSS-only world that keeps the same mood.

---

## 2. Visual tour

| | |
|---|---|
| ![Preloader](shots/01-preloader.jpg) **Preloader**: still poster art behind a narrated progress meter | ![Hero](shots/02-hero-3d.jpg) **Hero**: logo crest, kanji countdown, two CTAs over the 3D scene |
| ![Torii](shots/03-torii-flythrough.jpg) **Ascent**: the camera flies through the torii | ![Stairs](shots/04-shrine-stairs.jpg) **Stairs**: the chapter caption sits bottom-left |
| ![Door](shots/05-shrine-door.jpg) **Shrine door**: the crest on carved wood | ![Room](shots/06-sanctuary-room.jpg) **Sanctuary**: shoji doors labelled as site sections |
| ![Compass](shots/07-room-compass-hud.jpg) **Room compass**: scroll or arrow keys turn to each door | ![Gate](shots/08-open-gate.jpg) **Open gate**: the last door slides open onto the waterfall |
| ![Reveal](shots/09-theme-reveal.jpg) **Theme reveal**: sun disc, line-art dragon and flames | ![Directory](shots/10-directory-menu.jpg) **Directory menu**: "Choose your *chapter*." |
| ![Events](shots/11-events-fan-deck.jpg) **Events**: a fanned card deck with kanji glyphs | ![Events detail](shots/12-events-detail-footer.jpg) **Events detail**: kanji, eyebrow, title, CTA |
| ![Fallback hero](shots/13-fallback-hero-photo.jpg) **Fallback hero** when 3D isn't available | ![Fallback room](shots/14-fallback-css-room.png) **Fallback room**: door cards in CSS only |
| ![Notice](shots/15-notice-modal.png) **Official notice modal** | Close-up of the compass HUD: ![HUD](shots/07b-compass-hud-zoom.png) |

---

## 3. Colour palette

Think **night shrine**: ink-black and indigo surfaces, washi-paper text, gold-leaf hierarchy, crimson lacquer for life.

### Surfaces (≈90% of the screen)

| Name | Hex | Use |
|---|---|---|
| Sumi (ink) | `#090a0c` | page background |
| Ink | `#141416` | raised surfaces |
| Indigo deep | `#07101b` | night base |
| Indigo | `#101b2b` | panels, modals |
| Forest black | `#111916` / `#101b1b` | dialogs, forest sections |

### Paper / text

| Name | Hex | Use |
|---|---|---|
| Washi | `#efe4cd` | primary text on dark |
| Ivory | `#ece5d6` / `#f2e9d5` | headings, UI text |
| Muted | `#bfc6bc` | subtitles |
| Jade fog | `#829b91` | tertiary text |
| Dragon paper | `#e7ddc7` | light "paper" panels |

### Gold leaf (hierarchy and borders)

| Name | Hex | Use |
|---|---|---|
| Gold dark | `#73501d` | gradient start |
| Gold | `#c99a3a` | eyebrows, accents |
| Gold soft | `#c4aa7c` | muted borders |
| Gold bright | `#e8c66a` | highlights, focus ring, cursor |
| Gold line | `rgba(184,154,91,.25)` → `.6` on hover | card borders |

### Crimson lacquer (alive / now / alert, used sparingly)

| Name | Hex | Use |
|---|---|---|
| Crimson deep | `#61070d` | shadows |
| Crimson | `#a70d16` | live beacon, text selection, active cursor |
| Crimson bright | `#d81e28` | hot accent |
| Sun gradient | `#d3572e → #9e3329 → #762922` | rising-sun disc |

**Rules of thumb**
- Gold says "look here". Crimson says "this is happening now". Never use both loudly on the same element.
- Borders are hairlines (1px) of gold at low alpha. They get brighter on hover; they don't get thicker.
- Prefer **glows** over drop shadows: `text-shadow: 0 2px 10px rgba(201,154,58,.35)`.
- Give the text selection colour a theme too: crimson background with washi text.

---

## 4. Typography

| Role | Font | Notes |
|---|---|---|
| Display / headings | **[Cinzel](https://fonts.google.com/specimen/Cinzel)** | Roman inscriptional caps; feels carved and ceremonial |
| Accent word | an italic serif in gold (Georgia italic works; [Shippori Mincho](https://fonts.google.com/specimen/Shippori+Mincho) if you load it) | one word per title: "Choose your *chapter*." / "Find your *way*." |
| Body / UI | **[Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)** | 12–15px UI, a clean modern counterweight to Cinzel |
| Kanji ornaments | any JP serif (e.g. Shippori Mincho / Noto Serif JP) | decoration, never essential information |

**Patterns that make it feel premium**

- **The eyebrow:** a tiny uppercase gold label with very wide tracking above every title ("THE IMPERIAL DIRECTORY", "THE SEVEN GATES").
- **The letter-spacing ladder:** `.04em` for UI, `.08–.16em` for labels, `.22–.27em` for eyebrows, and up to `.5em` for the hero eyebrow. *Tracking does more of the hierarchy work than size does.*
- **Negative tracking on huge display type** (≈ −0.035em at 90px) so big Cinzel stays tight.
- **Numbered, poetic section labels:** `05 / ARCHITECTS OF THE REALM`, then **DEVELOPERS**. The number orients, the subtitle adds flavour, and the plain label stays scannable.
- **Bilingual micro-labels:** countdown units `DAYS 日 · HOURS 時 · MINS 分 · SECS 秒`, and badges like `重要なお知らせ · OFFICIAL ADVISORY`.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) on anything that ticks.
- **Fluid sizes** with `clamp()`, e.g. countdown digits `clamp(22px, 3.2vw, 36px)`.

---

## 5. Shape, depth & texture

- **Radii:** 6px cards, 8px dialogs, pill buttons (`999px`). Mostly crisp, never bubbly.
- **Glass:** `backdrop-filter: blur(8–20px)` on floating panels and dialog backdrops.
- **Paper grain:** a fixed, full-screen SVG noise layer at **~4% opacity**. It costs about 1 KB and turns flat dark UI into "paper". *(Recipe in §15.)*
- **Vignette** layers that darken the edges toward the centre of attention.
- **Hand-cut corners** with `clip-path`:
  - dog-ear: `polygon(0 0,100% 0,100% 94%,92% 100%,0 100%)`
  - torn paper: `polygon(0 2%,96% 0,100% 96%,4% 100%)`
  - roof/gable: `polygon(0 12%,50% 0,100% 12%,100% 100%,0 100%)`
- **Gold hairline frames** on dark panels, with a slightly brighter top edge for a "gilded" look.
- **Elevation through blur and darkness** rather than heavy shadows: dialogs use `0 25px 100px rgba(0,0,0,.7)`.

---

## 6. Motif library

Use these as the vocabulary, applied to *functional* UI, not just as decoration.

| Motif | Where PECFEST uses it | Idea |
|---|---|---|
| ⛩️ Torii / gates | the journey's entrance; "The Seven Gates" | section transitions = passing through a gate |
| 🚪 Shoji doors | the navigation (7 doors = 7 sections) | menus and tabs as sliding panels |
| 🏮 Lanterns | the path lighting; `lanternFlicker` | loading or "active" indicators |
| 🌸 Sakura petals | `petal-fall` ambient particles | celebration / success states |
| 🗡️ Katana | click slash and the blade-wipe reveal | click feedback, horizontal wipes |
| 🖌️ Ink brush / enso ⭕ | custom cursor with an enso ring on hover | cursor, loaders, focus states |
| 🔴 Hanko seal | the `hankoStamp` animation | "confirmed / verified" stamps |
| 🎴 Kamon crest | circular clip-path reveal (`kamon-open`) | badges, avatar reveals |
| 🐉 Dragon + ☀️ sun | the theme-reveal poster | hero art, a big moment |
| 🃏 Hanafuda cards | the Events fan deck with kanji 華 技 文 勝 舞 | category pickers |
| 📜 Scrolls (makimono) | story sections | long-form content, changelogs |
| 🥁 Taiko | the audio cue | big-moment sound |

---

## 7. Signature components

### 7.1 Narrating preloader
![](shots/01-preloader.jpg)
- The **poster art loads first** behind the loader, so the first paint is already beautiful.
- Progress is **weighted by asset cost** (3D model ×6, HDR sky ×4, decoder ×2, everything else ×1), so the bar doesn't sit at 90% while one big file loads.
- The **status line narrates in world language** depending on what's loading: "Opening the gates" → "Loading the cedar forest" → "Preparing the 3D decoder" → "Laying the stone and wood" → "Loading the waterfall" → "Raising the festival crest" → "Polishing the sanctuary".
- A gold gradient bar (`#916922 → #f5d78e → #fff`) with a soft glow.
- "Skip intro ↗" and a "SOUND ON" toggle are always visible.

### 7.2 Kanji countdown
![](shots/02-hero-3d.jpg)
- A glass panel holding `00 : 10 : 05 : 23` in Cinzel with tabular nums and a gold glow.
- Unit labels in English plus kanji: `DAYS 日 / HOURS 時 / MINS 分 / SECS 秒`.
- A **pulsing crimson beacon dot** before the eyebrow (`SANCTUARY COUNTDOWN · 2026`).
- A pill CTA: 12% gold fill, 35% gold border, lifts 1px on hover.

### 7.3 Door navigation and compass HUD
![](shots/07b-compass-hud-zoom.png)
- Sections are presented as doors. A bottom-centre HUD shows `← EVENTS →` and "Open this door ↗".
- **Three ways to move:** scroll, arrow keys, or click. Never just one.
- A chapter caption bottom-left: `03 / THE SANCTUARY`, then *"Every door opens a different world."* in italic serif.

### 7.4 "Choose your chapter" directory
![](shots/10-directory-menu.jpg)
- A flat menu that bypasses the spectacle. It's a native `<dialog>` with a blurred backdrop.
- Two-column rows. Each has: a number (Cinzel 13px, gold), a title (Cinzel ~21px, washi), a subtitle (sans 12px, muted) and a `↗` glyph.
- **Hover:** a 3px gold left border and a ~12% gold wash, eased over 0.2s.
- The title mixes Cinzel caps with one **gold italic word**.

### 7.5 Hanafuda fan deck (category picker)
![](shots/11-events-fan-deck.jpg)
- Five tall dark cards fanned like a hand of cards. Each has a number, a big faint kanji in the corner and a vertical title.
- A **tassel pendant** (gold bead + red cord) marks the selection.
- The detail panel below holds a big glowing gold kanji (華), a crimson micro-eyebrow `01 · ART · CULTURE · EXPRESSION`, a title, one line of copy and a solid gold CTA.

### 7.6 Theme-reveal poster
![](shots/09-theme-reveal.jpg)
- The sun disc is pure CSS: a radial gradient (orange-red → lacquer → transparent edge) with an inner glow and a slow "firelight" pulse.
- Gold line-art dragon and flames, plus rising ember particles.
- A centred round play button and an understated "Watch the reveal" caption.

### 7.7 Official notice modal
![](shots/15-notice-modal.png)
- A navy panel with a gold hairline and a bilingual badge `重要なお知らせ · OFFICIAL ADVISORY`.
- Numbered sub-cards, each with an icon tile and a status chip (`REQUIRED FOR ENTRY` in crimson, `PRIZE TRANSFERS` in gold).
- Key words inline in **gold bold**. "Don't show again" sits beside a gold-gradient primary button.

### 7.8 Cards (sponsors, committee, gallery)
- `rgba(22,28,35,.6)` fill, 1px gold border at 25%, 6px radius.
- **Hover:** a slightly lighter fill, the border goes to 60% gold, and the card lifts 2px.

### 7.9 Ink cursor and click FX
- **Cursor:** a small gold dot with a gold+crimson glow, plus fading trail dots.
- **On hover:** the dot grows, turns crimson, and a **dashed enso ring** springs in, rotating 180°.
- **On click:** a thin horizontal "katana slash" line flashes, ink particles burst, and a slash sound plays.
- Turn it off on touch devices (`pointer: coarse`).

### 7.10 Sound toggle
- A pill showing 4 thin animated bars + "SOUND ON", with a proper `aria-label`.

### 7.11 Journey progress
- A **2px line** along the bottom of the screen that fills with gold as you scroll. Subtle and always readable.

---

## 8. Motion language

### Easing
| Name | Curve | Feel / use |
|---|---|---|
| **Katana** (default) | `cubic-bezier(.16,1,.3,1)` | snaps out fast, settles slow and silky; most transitions |
| **Cinematic** | `cubic-bezier(.25,1,.5,1)` | camera-like moves, big panels |
| **Spring** | `cubic-bezier(.34,1.56,.64,1)` | slight overshoot; cursor, stamps, playful pops |
| **Breath** | `cubic-bezier(.4,0,.6,1)` | looping ambient pulses |

### Reveals are themed, never just fades
- **Blade wipe:** `clip-path` rectangle sweeping left → right.
- **Kamon open:** `clip-path: circle()` growing from a corner, plus a small rotation (−12° → 0).
- **Menu open:** a circle growing *from the menu button's position*.
- **Arrival:** slide 24px, blur 3px → 0, fade in. Blur-to-sharp feels like ink settling.
- **Hanko stamp:** scale 1.4 & −12° → 0.9 → settles at 1 & −6°, like a seal being pressed.

### Ambient life (slow, low-contrast, loopable)
Lantern flicker, a beacon pulse, mist drifting, petals falling with a random sideways drift, embers rising and fading, and a 4px bob on the "scroll" cue.

### Scroll choreography
- Smooth scrolling (Lenis) with scroll-scrubbed timelines (GSAP ScrollTrigger).
- The hero fades out over the first ~8% of the scroll, and **its buttons stop taking clicks once faded** (no invisible click traps).
- One-shot reveals fire when an element reaches ~92% of the viewport height.
- **The scroll cue changes per section:** "Scroll to experience ↓" → "Scroll to explore the sanctuary ↓" → "Keep scrolling to discover the hidden falls ↓" → "Continue through the open gate ↓" → "Your next chapter awaits."

### Reduced motion
All ambient loops and big moves switch off under `prefers-reduced-motion: reduce`, in both CSS and JS.

---

## 9. Sound

- An **ambience loop** plus **one sprite file** holding all the short cues: *clack* (wood), *slash* (katana), *taiko* (drum hit). One request and zero latency on click.
- The sound toggle is always visible.
- 💡 In demos, judging halls and offices, **default to sound off** and let people opt in.

---

## 10. Copywriting voice

Ceremonial, short and second person. Every functional label gets a poetic twin.

| Plain | Themed |
|---|---|
| Loading… | "Opening the gates" / "Laying the stone and wood" |
| Enter site | "Enter the sanctuary ↗" |
| Navigation | "The Imperial Directory: Choose your *chapter*." |
| Events | "01 / The Five Paths" |
| Schedule | "02 / The Programme" |
| Sponsors | "03 / Patrons of the Realm" |
| Organisers | "04 / Guardians of the Mikado" |
| Developers | "05 / Architects of the Realm" |
| Gallery | "06 / Festival Chronicles" |
| Contact | "07 / The Imperial Courier" |
| Notice | "重要なお知らせ · Official Advisory" |

Keep the **plain word visible as well** (e.g. "SPONSORS" under "Patrons of the Realm"), so it stays usable.

---

## 11. Layout & responsiveness

- A page gutter token: `clamp(1.25rem, 4vw, 4.5rem)`.
- **Height-based media queries** (`max-height: 820 / 700 / 650 / 500px`) as well as width ones. They're what keeps full-screen heroes from clipping on short laptops and landscape phones.
- Hero sizes are re-tokenised per breakpoint (logo size, column width, digit size, gap) instead of being scaled ad hoc.
- Fixed corners: top-left quick link ("Events ↗"), top-right menu ("✦ Explore"), bottom-left sound, bottom-right skip.
- Content pages drop the spectacle for a conventional top nav, but keep the same tokens.
- Dialogs: `width: min(980px, 100% - 32px)` and `max-height: calc(100dvh - 32px)`.

---

## 12. Accessibility & performance habits

- **Focus ring** in the theme: `2px solid` gold-bright with a `6px` offset.
- **44px minimum touch targets** on cues and buttons.
- Every decorative layer (grain, vignette, cursor, particles) has `pointer-events: none`.
- An ARIA `progressbar` on the loader, labelled sound toggle, and alt text on the art.
- **Poster-first:** a single ~200 KB WebP is the loader backdrop, the fallback and the first impression.
- 3D assets are compressed (Draco GLB) and served from a CDN; trees are **instanced billboards** rather than individual models.
- Fonts are self-hosted WOFF2, **split per script subset**, so only Latin downloads.
- **A CSS-only fallback world plus a "Retry immersive view" button** when WebGL or assets fail.

---

## 13. Pitfalls to avoid

These came up while testing PECFEST. Learn from them:

- ❌ **The loader can hang forever** on slow Wi-Fi or devices without a graphics chip (it stuck at 0% and then 48% on a slow connection, and never loaded in headless mobile). ✅ Add a **hard timeout that falls back to the CSS world**, not just an error path.
- ❌ **The loader and hero showed at the same time** (countdown digits bleeding through "0%"). ✅ Hide the hero until the loader finishes.
- ❌ **A heading font was declared but never loaded**, so it silently fell back to Georgia. ✅ Load every font you name, or name the fallback on purpose.
- ❌ **7–9px gold-on-black micro labels** are hard to read. ✅ Keep the wide tracking but **floor at 11px** and check contrast.
- ❌ **A notice popup over the cinematic intro** breaks the mood. ✅ Use a toast, or show it after the intro.
- ❌ **Scroll-jacked phases** can feel stuck. ✅ Always offer skip, arrow keys and a flat directory.

---

## 14. Starter tokens (copy-paste)

```css
:root {
  /* surfaces */
  --sumi: #090a0c;
  --ink: #141416;
  --indigo-deep: #07101b;
  --indigo: #101b2b;
  --forest-black: #111916;

  /* paper / text */
  --washi: #efe4cd;
  --ivory: #f2e9d5;
  --text-muted: #bfc6bc;
  --jade-fog: #829b91;

  /* gold = hierarchy */
  --gold-dark: #73501d;
  --gold: #c99a3a;
  --gold-soft: #c4aa7c;
  --gold-bright: #e8c66a;
  --line: rgba(184, 154, 91, .25);
  --line-hover: rgba(212, 175, 100, .6);

  /* crimson = alive */
  --crimson-deep: #61070d;
  --crimson: #a70d16;
  --crimson-bright: #d81e28;

  /* type */
  --font-display: "Cinzel", Georgia, serif;
  --font-accent: "Shippori Mincho", Georgia, serif;
  --font-body: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
  --track-ui: .04em;
  --track-label: .16em;
  --track-eyebrow: .27em;

  /* space & shape */
  --space-page: clamp(1.25rem, 4vw, 4.5rem);
  --r-card: 6px;
  --r-dialog: 8px;
  --r-pill: 999px;

  /* motion */
  --ease-katana: cubic-bezier(.16, 1, .3, 1);
  --ease-cinematic: cubic-bezier(.25, 1, .5, 1);
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
  --ease-breath: cubic-bezier(.4, 0, .6, 1);
}

body { background: var(--sumi); color: var(--washi); font-family: var(--font-body); }
::selection { background: var(--crimson); color: var(--washi); }
:where(a, button, [tabindex]):focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 6px; }
```

Google Fonts import:

```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Shippori+Mincho:wght@400;600&display=swap" rel="stylesheet">
```

---

## 15. Starter recipes

### Paper grain overlay
```css
.paper-grain {
  position: fixed; inset: 0; z-index: 55; pointer-events: none; opacity: .04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' filter='url(%23n)' opacity='.6' d='M0 0h180v180H0z'/%3E%3C/svg%3E");
}
```

### Eyebrow and title with an accent word
```html
<p class="eyebrow">The Imperial Directory</p>
<h2 class="title">Choose your <em>chapter</em>.</h2>
```
```css
.eyebrow { font: 400 11px/1 var(--font-body); letter-spacing: var(--track-eyebrow); text-transform: uppercase; color: var(--gold); margin: 0 0 16px; }
.title   { font: 400 clamp(32px, 5vw, 52px)/1.1 var(--font-display); color: var(--ivory); margin: 0; }
.title em { font-family: var(--font-accent); font-style: italic; color: #e2c17f; text-transform: none; }
```

### Numbered directory row
```html
<a class="chapter-row" href="/events">
  <span class="num">01</span>
  <span class="body"><strong>Events</strong><small>Find your competition</small></span>
  <span class="arrow">↗</span>
</a>
```
```css
.chapter-row { display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 12px;
  padding: 16px 18px; border: 1px solid var(--line); border-left: 3px solid transparent;
  color: var(--ivory); text-decoration: none; transition: background .2s, border-color .2s; }
.chapter-row:hover { background: rgba(200,180,123,.12); border-left-color: #dfc48c; }
.chapter-row .num { font: 13px var(--font-display); color: var(--gold-soft); }
.chapter-row strong { display: block; font: 400 21px var(--font-display); }
.chapter-row small { font-size: 12px; color: var(--text-muted); }
```

### Kanji countdown slot
```html
<div class="cd-slot"><span class="cd-digit">10</span><span class="cd-unit">Hours <b>時</b></span></div>
```
```css
.cd-digit { font: 500 clamp(22px, 3.2vw, 36px)/1 var(--font-display); letter-spacing: .04em; color: #f7e7c4;
  font-variant-numeric: tabular-nums; text-shadow: 0 2px 10px rgba(201,154,58,.35); }
.cd-unit { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--gold-soft); }
.beacon { width: 7px; height: 7px; border-radius: 50%; background: var(--crimson);
  box-shadow: 0 0 10px #e63946; animation: beacon 2s var(--ease-breath) infinite; }
@keyframes beacon { 50% { opacity: .4; transform: scale(.85); } }
```

### Themed card
```css
.card { background: rgba(22,28,35,.6); border: 1px solid var(--line); border-radius: var(--r-card);
  padding: 16px 18px; transition: all .3s var(--ease-katana); }
.card:hover { background: rgba(28,36,45,.85); border-color: var(--line-hover); transform: translateY(-2px); }
```

### Themed reveals
```css
@keyframes blade-reveal { from { clip-path: inset(0 100% 0 0); opacity: .2; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
@keyframes kamon-open   { from { clip-path: circle(0 at 85% 85%); rotate: -12deg; scale: .8; opacity: 0; }
                          to   { clip-path: circle(120% at 85% 85%); rotate: 0deg; scale: 1; opacity: 1; } }
@keyframes ink-arrive   { from { opacity: 0; transform: translateX(24px); filter: blur(3px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes hanko-stamp  { 0% { transform: scale(1.4) rotate(-12deg); opacity: .6; } 50% { transform: scale(.9) rotate(0); opacity: 1; } 100% { transform: scale(1) rotate(-6deg); } }

.reveal-blade { animation: blade-reveal .9s var(--ease-katana) both; }
.reveal-kamon { animation: kamon-open 1s var(--ease-cinematic) both; }
.reveal-ink   { animation: ink-arrive .7s var(--ease-katana) both; }
.stamp        { animation: hanko-stamp .5s var(--ease-spring) both; color: var(--crimson); border: 2px solid currentColor; }

@media (prefers-reduced-motion: reduce) {
  .reveal-blade, .reveal-kamon, .reveal-ink, .stamp, .beacon { animation: none; }
}
```

### Falling petals (ambient)
```css
.petal { position: fixed; top: -5vh; width: 10px; height: 8px; border-radius: 60% 0 60% 0;
  background: #f4c6cf; opacity: .8; pointer-events: none;
  animation: petal-fall var(--dur, 9s) linear var(--delay, 0s) infinite; }
@keyframes petal-fall { to { transform: translate(var(--drift, 60px), 115vh) rotate(500deg); } }
```
Give each petal random `--drift`, `--dur` and `--delay` values from JS, and cap them at about 20 on mobile.

### Enso hover cursor (desktop only)
```css
@media (pointer: fine) {
  .cursor { position: fixed; width: 14px; height: 14px; pointer-events: none; z-index: 9999; translate: -50% -50%; }
  .cursor-core { width: 100%; height: 100%; border-radius: 50%; background: var(--gold-bright);
    box-shadow: 0 0 10px rgba(232,198,106,.8); transform: scale(.4); transition: transform .2s var(--ease-spring), background .2s; }
  .cursor-ring { position: absolute; inset: -6px; border-radius: 50%; border: 1.5px dashed rgba(232,198,106,.6);
    opacity: 0; transform: scale(.6); transition: opacity .25s, transform .3s var(--ease-spring); }
  .cursor.is-hover .cursor-core { transform: scale(1); background: var(--crimson); }
  .cursor.is-hover .cursor-ring { opacity: 1; transform: scale(1.3) rotate(180deg); }
}
```

---

## 16. Ideas for our project

Tsukuyomi is the Shinto **moon god**, so this aesthetic transfers almost directly. Shift it from "fire festival" to "**moonlit observatory**":

| PECFEST pattern | Our version |
|---|---|
| Crimson = alive | Keep crimson for live events (a satellite passing now, a transient detected). Add **moon silver `#d9dde6`** beside the gold for lunar content |
| Narrating preloader | Narrate the **real work**: "Computing lunar ephemeris…", "Propagating satellite orbits…", "Fetching sky survey tile…", weighted by actual cost |
| Kanji countdown 日時分秒 | Countdown to the **next sky event** (moonrise, ISS pass, eclipse), with a crimson beacon when it's under 1 hour away |
| Seven doors / "Choose your chapter." | Module directory with numbered rows and poetic subtitles (e.g. "01 / The Night Sky: Sky Tonight") |
| Hanko stamp | A "Verified" stamp on a computed result |
| Enso cursor | A star-point cursor with an enso ring on hover |
| Paper grain + gold hairlines | Use as-is: instant premium feel |
| CSS fallback + retry | Required, because venue Wi-Fi is exactly the stall case |
| Sound sprite | Optional chime on detections, **off by default** |

**Suggested build order:** tokens (§14) → eyebrow and numbered typography → directory dialog → cards → countdown → narrating loader → micro-FX (stamp, cursor, petals) → *only if time allows*, a 3D camera path.

---

*Reference study for internal inspiration. All PECFEST artwork, logos and screenshots belong to their owners. Don't reuse their assets directly.*
