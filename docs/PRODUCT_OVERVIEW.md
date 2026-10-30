# Tsukuyomi Watch: product overview (study guide)

Written 2026-10-30 from the code on `main` (after syncing with the teammate's latest frontend). Not tested for this document: it is a map of what exists, in plain language. Companion docs: `JUDGES_PREP.md` (Q&A), `PROJECT_STATE.md` (engineering log), `API.md` (endpoint contract).

---

## 1. The idea in one breath

A samurai read the sky to decide when to travel and fight. We built the modern version: **one app that tells you whether tonight is worth going out, where to go, what will happen in the sky, and then lets you clean up and inspect the photo you took, with proof that we did not invent anything.**

The product is **one continuous night, not four separate pages.** You open the app and you are standing under your real sky (computed for your location and the current time). Each feature is a "camera move" from that sky: click the Moon and you dive into the Celestial Scroll, click the torii gate and you dive into the Watchtower, and so on.

Our rule: **nothing on screen is faked.** Every number comes from a real calculation or a real data source, and every answer carries a "where did this come from" label (provenance). If a data source is down we say so (stale / recorded / error), never make numbers up.

---

## 2. How the pieces fit

```
Browser (frontend-main: React + Three.js)        Python backend (FastAPI)           Outside world
  Living Sky (3D, computed in browser)   <-->   Watchtower, Scroll, Alerts,   <-->  Open-Meteo (weather), NASA (light, SkyView),
  Pages: Watchtower, Scroll, Lens,               Lens, Honor, Transients,           OpenStreetMap, CelesTrak (satellites),
         Dojo, Honor, Science                    Planner, Horizon, Spectra,         Launch Library, NOAA (aurora), ALeRCE/ZTF,
                                                 Aurora                             SDSS, SIMBAD, astrometry.net
```

- **frontend-main** (teammate): the real, beautiful product. Port 3000.
- **frontend-basic** (ours): a plain test UI that calls every backend endpoint, so we can prove the backend works. Port 5173.
- **backend** (ours): FastAPI, port 8000. Holds all the science. 59 tests.
- **Safety net for the demo:** every successful outside call is recorded. If the internet or a provider fails during the demo, the backend can replay the recording and labels it as replayed.

---

## 3. The five modules, in simple words

### 3.1 Watchtower (見張り): "Should I go out tonight, and where?"

**What the user sees:** a big verdict (Go / Maybe / Stay in, shown as a hanko stamp), a Night Honor Score gauge out of 100, the best two-hour window tonight, warnings (dew, cold, wind), an hour-by-hour chart, a "why this score" breakdown, and a list of nearby spots with a scroll-style map.

**How the Night Honor Score works** (the thing to be able to explain):
`score = 100 × darkness gate × weighted average of quality factors`

| Factor | Weight | Plain meaning |
|---|---|---|
| Low cloud | 30% | Thick low clouds kill the night |
| Mid cloud | 15% | |
| High cloud | 8% | Thin cirrus is the least harmful |
| Humidity | 12% | Haze, dew on lenses |
| Transparency | 10% | Visibility and dust in the air |
| Moonlight | 15% | A bright Moon washes out faint things |
| Light pollution | 10% | City glow |

The **darkness gate** is 0 when the Sun is high, 1 when it is fully dark (Sun 18° below the horizon), and slides in between. So noon scores zero no matter how clear. If an input is missing it is dropped and the rest are re-weighted, and the screen says so.

**Light pollution:** we sample NASA's night-time-lights satellite image (VIIRS Black Marble) at your point and turn the brightness into an estimated Bortle class (1 = pristine, 9 = inner city). It is an estimate, not a meter reading, and we say that.

**Nearby spots:** we ask OpenStreetMap for peaks, viewpoints and hilltop temples/shrines around you, forecast each one, and rank them: `night score × darkness × small elevation bonus − distance penalty`. Shrines, mountains and temples appear as kanji-style markers on an ink-on-parchment map.

**New in the last commits:** polar day / polar night / "never gets dark" nights are handled honestly (a zero-length dark window and a note, rather than invented dusk and dawn times).

### 3.2 Celestial Scroll (巻物): "What is happening in the sky?"

**What the user sees:** a hero Moon (current phase, Japanese moon name, rise/set), a traditional **lunar calendar** (旧暦 scroll you can drag), and event lists you can filter by type and date.

Events covered: moon phases, **meteor showers** (with the expected hourly rate from your location), **eclipses** (solar and lunar, with local circumstances), **ISS passes** (compass-rose plot), **planets**, **rocket launches** (live countdown), and a combined events feed. Each event can be exported to a calendar (`.ics` file) or set as a reminder.

**How it is computed, not just copied:**
- Moon/Sun/planet positions and eclipses: `astronomy-engine` library.
- ISS and other satellites: real orbit data (TLEs from CelesTrak) propagated with SGP4. A pass counts as *visible* only if you are in darkness **and** the satellite is in sunlight (we do a Earth-shadow test).
- Lunar calendar: real lunisolar months plus the 24 *sekki* (solar terms) and 72 *kō* (micro-seasons).
- Launches come from Launch Library 2 (these are global; not all are visible locally).

### 3.3 Alerts: "The Moon rises tonight at 8:14 PM"

This is the alert feature from the brief. The browser subscribes to **Web Push**. The backend stores the subscription and schedules alerts (for example "15 minutes before the ISS passes"); a background worker checks every 30 s and sends a real push notification. We confirmed a real notification arrived on a browser. In the main app this is the **"Remind me"** button on the Scroll page.

### 3.4 Spirit Lens (鏡): "Clean up my space photo, honestly"

User uploads a space image (JPG/PNG/TIFF/FITS) or picks a sample (for example Andromeda). The backend runs a 9-stage job and shows progress:

`load → background → detect → PSF → denoise → deblur → honesty → classify → WCS`

In simple words:
1. **Background / noise:** measure the empty-sky level and noise.
2. **Detect:** find stars/galaxies (photutils) and measure brightness (flux) and size.
3. **PSF:** measure how blurry a *point* of light is in *this* image (from its own stars).
4. **Denoise:** wavelet denoising (BayesShrink). Removes only what looks like noise.
5. **Deblur:** Richardson-Lucy deconvolution using the measured PSF. It stops itself when improvement stops, to avoid ringing artifacts.
6. **Honesty:** the proof step (see below).
7. **Classify:** star / galaxy / unknown, from shape measurements.
8. **WCS:** work out where in the sky the image is (from FITS/AVM metadata, or a blind solve through astrometry.net if the key is set).

**Important wording for judges:** this is classical, deterministic image processing. **There is no generative AI**, so nothing can be hallucinated by design. We do not call it a "trained AI model".

**Proof of Honesty (our signature feature):**
We take the restored image, **blur it again with the measured PSF**, and compare it to the original. If the restoration only removed noise and blur, the leftover difference (the *residual*) should look like pure noise. We report:
- residual map and χ² (does the leftover look like noise?)
- SSIM / PSNR (how much changed)
- **flux conservation** (total brightness of each star preserved)
- **position shift** (stars did not move)
- "invented pixels" count
- **Synthetic-star benchmark:** inject fake stars with known brightness, restore, and measure how well we recover them. This is a test with a known answer.

Caveat to say out loud: these are diagnostics, not an absolute guarantee.

**Extras around Lens:** NASA **SkyView** cutout of the same patch of sky for comparison (bonus #1), SIMBAD name matches for detected stars, and plate solving via astrometry.net.

### 3.5 Dojo Dashboard (道場): "Show me what changed"

The result page for a Lens job (`/dojo/:id`).
- **Katana before/after slider:** a drawn katana is the drag handle; original on one side, restored on the other. Drag, click, keyboard, zoom and pan.
- **Three view modes:** 原 original, 修 restored, 誠 honesty (residual heat map with gold "kintsugi" seams where the difference is above ~2σ).
- **Detection overlays** on the restored side, with an inspector showing each object's brightness and size.
- Honesty metrics, PSF, where-in-the-sky info with SkyView, benchmark button, and ZTF transient alerts inside the solved field.

### 3.6 Honor (誉): the gamification bonus

User logs "I watched the Moon / the meteor shower / the ISS". The server **checks the claim against the real sky** (was the Moon actually up at that place and time? was the event in its window? future dates are refused). Valid claims earn points and ranks; rejected ones get zero points and a "否" seal with the reason. A journal scroll lists past nights. Honest limit: it checks that the claim is *astronomically plausible*, not that the person really stood there.

### 3.7 Science page (学)

Explains the architecture, shows the live formulas and traces, and a provenance table (every data source, its licence, when fetched), plus honesty notes. It is the "show your work" page for judges.

---

## 4. Bonus challenges from the brief

| Bonus | Status |
|---|---|
| NASA SkyView live data | Done. Backend fetches SkyView cutouts; the Dojo shows them next to your image. |
| Spectral / time-domain transient detection | Done in the backend and partly in the UI: ALeRCE/ZTF live supernova/transient feed, light curves, image cutouts, plus **our own two-image subtraction** (align, match blur and brightness, subtract, find what appeared). Tested by injecting a fake supernova and recovering it. Also **Spectra** (SDSS spectra with emission lines like a Seyfert galaxy). |
| Honor Points gamification | Done (server-verified). |

---

## 5. Extra features we added beyond the brief (innovation points)

1. **Living Sky:** a real-time 3D sky: 5,044 catalogue stars, 89 constellations (with Japanese names), Milky Way, the real Moon texture lit by the real Sun, planets, ISS arc, meteor radiant, at your place and time.
2. **Time compass (和時計 wadokei):** drag to move time ±72 h; the sky recomputes locally.
3. **Proof of Honesty** and the synthetic-star benchmark (above).
4. **Provenance and "why this number" traces** on every answer.
5. **Observing Planner:** pick a target (Orion Nebula, Polaris, the Moon…); for each 15 minutes it checks Moon, altitude, darkness, weather, and tells you the best time and the *binding constraint*, plus what-if answers ("what if I had a 70° horizon?").
6. **Horizon / terrain mask:** uses an elevation model (or traced points) to find hills that block your view (for example a 35° wall at Savanadurga).
7. **Aurora:** NOAA Kp index now and forecast, with "can you see it from here?" thresholds.
8. **Replay mode, stale-cache fallback, Dockerfile** for a demo that survives bad Wi-Fi.
9. **PWA / Lite / Field (red night-vision) mode** and reduced motion.
10. **Cinematic intro:** gate → particle loader (tonight's real Moon forming a torii) → sunset time-lapse with sakura petals that become the real stars.

---

## 6. Requirement checklist (problem statement vs. our app)

**Important finding:** the PS-002 text in `Problem_Statements.pdf` does **not** contain the words "bare minimum" (I searched all 12 pages). It has two tiers: **Key Components** (the core requirements) and **Bonus Challenges**, plus Theme Requirements. The table treats every Key Component and Theme bullet as "bare minimum".

### Key components

| Requirement (from the PS) | Backend | Main frontend | Verdict |
|---|---|---|---|
| Real-time weather: cloud cover, humidity, visibility from open APIs | Open-Meteo | Hourly chart + score breakdown | Covered |
| "Night Honor Score" (visibility score) | Yes, with trace | Gauge, verdict, waterfall | Covered |
| Optional light pollution indicator | VIIRS to Bortle | Bortle shown on page and per spot | Covered |
| Top nearby spots on an interactive scroll-style map with shrines, mountains, temples | OSM Overpass + ranking | Leaflet map, ink-on-washi, kanji markers by rank | Covered |
| List meteor showers, eclipses, moon phases, ISS passes, rocket launches | All five | All five on `/scroll` | Covered |
| Filter by event type and date | Yes | Hash filters on events and calendar | Covered |
| Calendar in the traditional lunar calendar style | 旧暦 with sekki/kō | Draggable 旧暦 emakimono | Covered |
| Alert like "The Moon rises tonight at 8:14 PM" | Web Push + scheduler | "Remind me" button + .ics export | Covered |
| Upload a space image and clean it (less noise, less blur) with an AI model | Pipeline: denoise + deblur | Lens upload + samples, 9-stage progress | Covered (classical, not generative) |
| No fake details, stay true to the original | Proof of Honesty metrics | Honesty mode, residual map, metrics | Covered, and a strength |
| Detect stars and galaxies, show brightness and size | photutils + classification | Detection overlays and inspector | Covered |
| Before/after slider with zoom and overlays for detected objects | n/a | Katana slider, zoom/pan, overlays | Covered |

### Theme

| Requirement | Verdict |
|---|---|
| Ink-wash, torii, cherry blossom, katana, red/black/gold | Covered: sumi-e dusk, torii, sakura intro, katana slider. Palette was changed by the product owner to "Crimson Sakura Night" (crimson, sakura pink, gold). Still red/black/gold family; be ready to say so. |
| Moon phase tracker | Covered (Moon hero, lunar calendar, loader Moon, time compass) |
| Night-mode theme | Covered (the whole UI is dark; there is also a red Field mode) |

### Bonus

| Bonus | Verdict |
|---|---|
| NASA SkyView | Covered (Dojo shows the SkyView cutout) |
| Spectral / time-domain transients | Covered (backend full; main UI shows live transients in Lens and in the Dojo field) |
| Honor Points | Covered |

**Result: no Key Component or Theme item is missing.** The remaining gaps are polish, not features (see section 7).

---

## 7. Built in the backend but NOT visible in the main frontend

These work (59 tests, and our test UI `frontend-basic` calls them) but the teammate's `frontend-main` does not use them. If asked in the demo, show them in frontend-basic or `/docs`.

| Feature | Backend endpoint | Where it shows today |
|---|---|---|
| Observing Planner (best time and place for a target, what-if) | `/api/planner/*` | frontend-basic only (the typed client exists in main's `api.ts` but no page uses it) |
| Horizon / terrain mask | `/api/horizon/*` | frontend-basic only (main's `api.ts` does not even have it) |
| Spectra (SDSS spectrum, emission lines) | `/api/spectra/*` | frontend-basic only (Science page) |
| Aurora (Kp index) | `/api/aurora` | Neither frontend calls it; API only (try it at `localhost:8000/docs`) |
| Our own two-image subtraction (transient finder) | `/api/transients/subtract-jobs`, `/{oid}/subtract` | frontend-basic only. Main shows only the ALeRCE live feed and the field alerts. |
| Transients "near a position" search | `/api/transients/near` | frontend-basic only |
| Plate-solve trigger / SIMBAD catalogue match | `/api/lens/jobs/{id}/solve`, `/catalog` | frontend-basic. Main shows solved/unsolved result only; SIMBAD is only mentioned on the Science page. |
| Seasonal info (sekki "season") | `/api/scroll/season` | Calendar shows sekki; the separate endpoint is not called |
| Light-pollution endpoint | `/api/watchtower/light-pollution` | Used indirectly through score and spots (Bortle numbers show) |
| Alert test push | `/api/alerts/test` | frontend-basic |

**Suggestion for the team:** the most "wow per hour" ones to surface in main are the Planner and the Aurora card; they use what the frontend already has (place, time). Do this only if the teammate has time; they own that code.

### In the frontend but only partly working or a known gap (from our earlier review)
- Back button leaves the camera zoomed; heavy main bundle (587 KB gzip); some performance clean-up pending.
- Honor journal has no drag-scroll; no NASA sample images in `public/samples` (Lens serves its own Hubble samples).
- Browser-only Lens mock (`/dojo/mock-42`) exists as a clearly labelled fallback, not real science.

---

## 8. Things worth memorising for the presentation

**One-line pitch:** "Tsukuyomi Watch helps you decide what to observe, where to go, when to go, and then inspect the image you bring back, and it proves it did not invent anything."

**Three things only we have:**
1. Proof of Honesty (re-blur, residual, flux conservation, known-truth benchmark).
2. Every number has a source and a "why" (provenance and traces).
3. Real computation behind every screen (no generative AI, no fake data; failures are shown as stale / replay / error).

**Terms in one line each**
- **Altitude / azimuth:** height above horizon / compass direction.
- **RA / Dec:** the sky's latitude and longitude.
- **Bortle:** 1-9 darkness scale of a site.
- **PSF:** the blur shape of a single point of light.
- **FWHM:** width of that blur at half its peak.
- **Flux:** measured brightness.
- **WCS:** mapping image pixels to sky coordinates.
- **Residual:** original minus what the model predicts.
- **Transient:** something that appears or changes brightness (supernova).
- **SGP4 / TLE:** orbit model / its input data for satellites.
- **Sekki / kō:** 24 solar terms / 72 micro-seasons of the old Japanese calendar.

**Honest limits to volunteer before the judges ask**
- Night score weights are engineering choices, not a calibrated probability of a clear sky.
- Bortle is an estimate from satellite imagery.
- Spots ranking uses straight-line distance, not road travel; no access or safety check.
- Honor checks plausibility, not physical presence.
- Honesty metrics are diagnostics, not an absolute guarantee.
- Restoration is classical (wavelets and deconvolution), not "AI" in the generative sense. Pre-trained models were allowed, but we chose not to risk hallucination.

**A safe 3-minute demo order:** gate → sky (move the time compass, click Moon) → Watchtower (verdict → why → spot) → Scroll (one event, calendar export or Remind me) → open a precomputed Dojo job (slider, honesty mode, benchmark) → Honor or Science. Pre-warm the city and pre-run the two Lens samples before going on stage.
