# Build Brief — "San Francisco: Hottest & Coldest" scroll-driven website

## What to build

Build a single-page, scroll-driven website from scratch. Use plain HTML, CSS, and vanilla JavaScript — no framework, no build step. Structure it as `index.html`, `styles.css`, and `script.js`, plus an `/assets/` folder. It must run as static files on any host (Vercel, Netlify, GitHub Pages) and open directly via a local server.

---

## Concept

The page tracks how many days per year San Francisco is the hottest city and the coldest city in the continental US. It is one continuous cinematic scene of Baker Beach and the Golden Gate Bridge that transitions from a bright sunny day to a foggy day as the user scrolls, with a fixed Apple-style "liquid glass" metrics panel floating over it the whole time. The scene never cuts or disappears — only the weather changes as you scroll.

---

## Assets I will supply

Create the `/assets/` folder and a short `README.md` inside it listing these expected filenames. Reference these paths in code. Until I add them, use solid-color placeholder poster images (generate simple ones or use CSS color fallbacks) so the page runs without errors:

- `/assets/warm-loop.mp4` — sunny beach, seamless loop
- `/assets/transition.mp4` — sunny→foggy weather change, scrubbed by scroll
- `/assets/cold-loop.mp4` — foggy beach, seamless loop
- `/assets/warm-poster.jpg` — fallback still for the warm scene
- `/assets/cold-poster.jpg` — fallback still for the cold scene

All three videos share identical framing, 16:9. The transition clip's first frame matches the warm loop; its last frame matches the cold loop.

---

## Layout & scroll mechanic

- A tall scroll container (~300vh) gives the transition room to breathe. The visual scene is pinned to the viewport with `position: sticky` (fallback `fixed`), filling it 100vw × 100vh, with `object-fit: cover` on all videos so they cover-crop and center at any aspect ratio.
- Map scroll progress through the container to a 0→1 value. Three phases:
  - **0.00–0.15** — `warm-loop.mp4` visible, playing (autoplay, muted, loop, playsinline).
  - **0.15–0.85** — `transition.mp4` visible; its `currentTime` is driven directly by scroll progress (scroll-scrubbing). It stays paused and never auto-plays — scroll position is 100% in control. Scrolling down advances it, scrolling up rewinds it via `currentTime` seeking. Linearly map this scroll band to `0 … transition.duration`. It is acceptable and expected that the video freezes when the user stops scrolling — do NOT add ambient motion to compensate.
  - **0.85–1.00** — `cold-loop.mp4` visible, playing.
- Handoffs: switch which video is visible via opacity/z-index at the phase boundaries. Because the clips share framing and the transition's end frames match the loops, swap on a single frame with NO crossfade — it should look like one continuous scene. Preload all three.
- Put the three phase-boundary thresholds (0.15, 0.85) in clearly-commented constants at the top of `script.js` so I can tune them once my real clips are in.

---

## Scrubbing implementation (critical for smoothness)

- Set `transition.mp4` to `preload="auto"`, `muted`, `playsinline`, and keep it `paused`.
- Never set `currentTime` directly inside the scroll event. Capture scroll in the handler, then apply the seek inside a `requestAnimationFrame` loop (throttle so at most one seek per frame) to avoid jank.
- Only seek once `readyState >= 2`.
- Handle mobile Safari: seeking a paused video often needs a one-time unlock — on the first user touch/interaction, do a muted `play()` then immediately `pause()` to enable programmatic seeking, and call `load()` if needed. Guard so this runs only once.
- If any video fails to load (error event or unsupported), fall back to the corresponding static poster image per phase so the page never breaks.

---

## The fixed glass metrics panel

Always centered, never moves, sits above all video via z-index.

- Apple "liquid glass" style: `backdrop-filter: blur(30px) saturate(180%)` (include `-webkit-` prefix), translucent white fill ~`rgba(255,255,255,0.4)`, `0.5px` light border, a `1px` inner top highlight via a `::before` gradient, and a soft drop shadow.
- Neutral and clear — do NOT tint or color-shift it based on scroll position.
- Must stay legible over BOTH bright sunny footage and dark foggy footage: add a subtle contrast floor behind the text (a barely-visible darkening layer or a slight text-shadow) so numbers read in both scenes without looking heavy.
- Typography: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif`.
- Contents:
  - Uppercase eyebrow, letter-spacing ~4px: `SAN FRANCISCO · 2026`
  - Two metrics side by side: `HOTTEST IN USA` and `COLDEST IN USA`. Each has a large display numeral (letter-spacing ~-0.05em, `font-variant-numeric: tabular-nums`) above a small lowercase `days` label.
  - Footer line: `Out of 138 days so far this year.`
  - All panel data comes from `/data.json` (see the Data layer section below), fetched on load. Shape: `{ "hot": 3, "cold": 1, "totalDays": 138, "year": 2026, "lastUpdated": "2026-07-12" }`. If the fetch fails, fall back to a hardcoded default object so the panel always renders. Everything on the panel reads from this one source.
- On load, the two numerals count up from 0 to their values with an ease-out over ~1.8s.

---

## Motion & polish

- Count-up runs on load only.
- Glass panel specular highlight: a soft radial white gradient that follows the cursor (update CSS custom properties on `mousemove`), fading in on hover. Skip on touch devices.
- Ease everything with `cubic-bezier(0.16, 1, 0.3, 1)`; no snapping.
- Respect `prefers-reduced-motion`: if set, show final numbers immediately (no count-up) and step the transition scrub in coarser increments to reduce motion.

---

## Responsive

- Mobile: scene fills the viewport, scrubbing works (with the Safari unlock handled). The glass panel scales down, stays centered and legible, numbers remain the dominant element. Test portrait — rely on `object-fit: cover` and centering so the 16:9 video crops cleanly.

---

## Data layer — computing the hottest/coldest tally

The panel numbers are real, not hardcoded. They count how many days year-to-date San Francisco was the **hottest major city in the continental US** and how many days it was the **coldest**. Build this as a small Node.js data pipeline plus a daily scheduled job, kept entirely separate from the static front-end.

### Source
Use **Open-Meteo** (`https://api.open-meteo.com`). It is free, needs no API key, and has both a forecast endpoint and a historical archive endpoint (`https://archive-api.open-meteo.com/v1/archive`) which is required for backfilling. Query daily maximum temperature (`daily=temperature_2m_max`) and daily minimum where needed.

Compare a fixed list of ~40 major continental US cities (plus SF). Hardcode this list with lat/long in a `cities.js` file. Include a geographically diverse set so the comparison is fair — e.g. Phoenix, Las Vegas, Los Angeles, San Diego, Sacramento, Portland, Seattle, Denver, Salt Lake City, Dallas, Houston, Austin, San Antonio, Oklahoma City, Kansas City, Minneapolis, Fargo, Chicago, Detroit, Indianapolis, Nashville, Atlanta, Miami, Orlando, Charlotte, New Orleans, St. Louis, Boston, New York, Philadelphia, Washington DC, Pittsburgh, Buffalo, Caribou ME, International Falls MN, Bismarck ND, Great Falls MT, Duluth MN, El Paso, Albuquerque, and San Francisco itself. (Exclude Alaska and Hawaii — continental US only.)

### The counting logic (per day)
For a given date:
1. Fetch that date's daily **high** temperature for every city in the list.
2. Find the city with the highest high → that's the "hottest city" that day.
3. Find the city with the lowest high → that's the "coldest city" that day. (Use daily high for both comparisons so it's an apples-to-apples "warmest/coolest daytime" measure. Note this choice in a code comment; min-temperature is an alternative but keep one consistent definition.)
4. If San Francisco is the hottest city → increment `hot`. If SF is the coldest → increment `cold`. Record the date and the runner-up city in a `winDates` log for possible future use.
5. `totalDays` = number of days elapsed in the current year so far.

### Output
Write results to `/data.json` at the site root (the front-end fetches this):
```json
{
  "hot": 3,
  "cold": 1,
  "totalDays": 138,
  "year": 2026,
  "lastUpdated": "2026-07-12",
  "hotDates": ["2026-06-22", "..."],
  "coldDates": ["2026-02-11"]
}
```
The front-end only reads `hot`, `cold`, `totalDays`, `year`; the date arrays are stored for later features.

### Backfill (first run)
On first run, backfill from **January 1 of the current year through yesterday** using the Open-Meteo historical archive endpoint, running the per-day logic for every date so the YTD tally is accurate at launch. Write the full `data.json`. Make this a separate command (e.g. `npm run backfill`) so it's only run intentionally.

### Daily update
Provide a second command (e.g. `npm run update`) that computes just the most recent completed day and increments the existing `data.json` (reading current values, adding the new day, updating `totalDays` and `lastUpdated`). It must be idempotent — if run twice for the same date, it should not double-count (check the date isn't already in `hotDates`/`coldDates` and track the last processed date).

### Scheduling
Set it up to run automatically once per day via a **GitHub Action** (free, keeps the site static). Include a `.github/workflows/update-tally.yml` that runs `npm run update` on a daily cron, commits the updated `data.json` back to the repo, and thereby redeploys. Add a README note explaining how to run the backfill once manually before enabling the daily action, and how to adjust the city list.

### Structure these as separate files from the site
```
/data.json                     ← the front-end reads this
/data/cities.js                ← city list with coordinates
/data/compute.js               ← per-day hottest/coldest logic
/data/backfill.js              ← Jan 1 → yesterday seed run
/data/update.js                ← single-day incremental update
/.github/workflows/update-tally.yml
package.json                   ← scripts: backfill, update
```
Keep this pipeline fully decoupled from `index.html` / `styles.css` / `script.js`. The only contract between them is `data.json`.

---

## Video encoding step

After building, if I report that scroll-scrubbing feels chunky, re-encode `transition.mp4` for frame-accurate seeking using ffmpeg with a dense keyframe interval:

```
ffmpeg -i transition.mp4 -g 1 -c:v libx264 -crf 18 -preset slow -an transition-scrub.mp4
```

(all-intra / keyframe-every-frame, audio stripped) and point the code at the re-encoded file. Include this command in the assets README so I have it documented. All three clips are silent background loops — expect no audio.

---

## Run it

When done, start a local static server (e.g. `python3 -m http.server` or equivalent) and give me the URL so I can preview immediately. It should run with the placeholder posters until I drop my real MP4s into `/assets/`, and with a placeholder `data.json` (`{ "hot": 3, "cold": 1, "totalDays": 138, "year": 2026 }`) until I run the backfill. Build the data pipeline files too, but I'll run `npm run backfill` myself when ready.

---

## Priorities, in order

1. Seamless phase handoffs (looks like one continuous scene).
2. Smooth scroll-scrubbing with no jank.
3. Glass panel legibility over both bright and foggy footage.
4. A correct, decoupled data pipeline that produces `data.json` (backfill + daily update).

Build it to actually run end to end. Add clear code comments at each scroll-phase boundary and at the tunable threshold constants.

---
---

## Reference: what the three videos contain

> **For context only — do NOT implement these. They describe the footage I'm supplying so you understand the scene, the motion, the framing, and how the clips relate. Use this to inform the poster fallbacks, the phase handoffs, and your comments — nothing else.**

All three share the identical locked-off 16:9 framing: a fixed tripod view from the sand at Baker Beach, San Francisco, looking across the water at the Golden Gate Bridge. Horizon roughly one-third up the frame, bridge in the left-center. Only ambient elements move (waves, fog); people are static. This shared framing is why the phase handoffs can be single-frame swaps with no crossfade.

**Clip 1 — `warm-loop.mp4` (top of scroll):** Bright clear midday, deep blue sky, the bridge sharp on the horizon. A few people rest motionless on beach towels, sunbathing. Only motion: gentle ocean waves rolling in and receding, calm rippling water, warm even midday light. Seamless loop.

**Clip 2 — `transition.mp4` (scrubbed by scroll):** Starts on the exact warm scene, ends on the exact cold scene. Over the clip, thick fog drifts in from the RIGHT edge and spreads slowly left across the water, progressively veiling the bridge until only glimpses remain between fog banks. Sky shifts blue→overcast grey; light flattens and cools; color desaturates warm gold→steel grey. The sunbathers are gradually hidden by the incoming fog, leaving a single bundled figure standing at the waterline facing the ocean by the end. Slow, continuous, gradual weather change. Its first frame = warm-loop; its last frame = cold-loop.

**Clip 3 — `cold-loop.mp4` (bottom of scroll):** Cold foggy summer day, overcast grey-blue flat light. The bridge is partly veiled in fog. A single person in a puffer jacket and beanie stands still at the waterline, seen from behind, facing the ocean — motionless. Only motion: fog drifting slowly across the frame from the right, and slow steel-grey waves. Seamless loop.

**Implication for poster fallbacks:** `warm-poster.jpg` should read as bright/blue/sunny; `cold-poster.jpg` as grey/foggy. If generating placeholder colors before I supply real posters, use a warm light tone for the warm phase and a cool grey tone for the cold phase.
