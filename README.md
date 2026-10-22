# sf-weather — "How often is San Francisco the hottest or coldest city in America?"

A single-page, scroll-driven site: one continuous Baker Beach scene goes from a sunny
afternoon to a foggy one as you scroll, with a fixed glass panel showing the year-to-date
counts. Two ways to produce the scene are set up here; the site consumes either.

## Folder layout

```
sf-weather/
├── README.md                              <- this file
├── sf-weather-site-build-brief.md         <- Claude Code brief: the website + data pipeline
├── blender-baker-beach-scene-prompt.md    <- Claude Code brief: the Blender scene (frame sequence)
├── reference-baker-beach.jpg              <- the look to match (warm/start state)
├── assets/                                <- the site reads from here (filled by veo/ or Blender)
└── veo/                                   <- AI-video path: Veo 3.1 generation pipeline
    ├── generate.py                        <- the pipeline (check / keyframes / warm / transition / cold / finalize)
    ├── prompts.py                         <- all prompts in one place
    ├── requirements.txt
    ├── keyframes/                         <- warm.png, cold.png (generated)
    └── takes/                             <- every generated take, numbered
```

## Path A — AI video (fast mockup, hours not days)

Prereqs: `GEMINI_API_KEY` in your shell (already set in `~/.zshrc`), Python 3.10+, ffmpeg
(`brew install ffmpeg`).

```bash
cd ~/Documents/sf-weather/veo
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python generate.py check          # key + billing + confirms the model IDs exist
python generate.py keyframes      # makes warm.png and cold.png  -> LOOK AT THEM before continuing
python generate.py warm           # 2 takes by default
python generate.py transition     # 3 takes (the hard one; pick the best)
python generate.py cold           # 2 takes
python generate.py finalize --warm 1 --transition 2 --cold 1   # -> ../assets/*.mp4 + posters
```

Add `--fast` to any video command for cheap drafts. Default is the standard Veo 3.1 model
(best quality). Rough cost: ~$3 per 8-second standard take, ~$1 per fast take.

The keyframe step matters most: `cold.png` is produced by *editing* `warm.png`, so the two
share an identical composition, and the transition is generated frames-to-video between
them. If the two stills don't line up, re-roll (`--force`) before spending on video.

Hand to Claude Code with: *"Run the Veo pipeline in `veo/` per README.md; stop after
`keyframes` and show me the two stills before generating video."*

## Path B — Blender (maximum detail, the real build)

Install Blender 4.2 LTS+ at `/Applications/Blender.app`. Then hand Claude Code
`blender-baker-beach-scene-prompt.md` with `reference-baker-beach.jpg`. It renders a PNG
frame sequence that replaces the three videos; the site scrubs frames instead of video.

## The website + data (built)

`sf-weather-site-build-brief.md` describes the page, the glass panel, the scroll-scrubbing,
and the Open-Meteo data pipeline. It is now built:

```
index.html / styles.css / script.js      <- the site (static, no build step)
data.json                                <- what the panel shows; written by the pipeline
data/cities.js                           <- the ~40 cities compared with SF (edit to adjust)
data/compute.js                          <- per-day hottest/coldest rule + Open-Meteo fetch
data/backfill.js                         <- `npm run backfill`: Jan 1 -> yesterday seed run
data/update.js                           <- `npm run update`: adds the latest completed day(s)
.github/workflows/update-tally.yml       <- daily GitHub Action that runs the update and commits data.json
serve.js                                 <- `npm start`: local preview server (Range-capable, Safari-friendly)
assets/README.md                         <- expected asset filenames + ffmpeg encode notes
```

### Live site

https://lreinhardjr.github.io/sf-weather/ — served by GitHub Pages from the `main` branch of
https://github.com/lreinhardjr/sf-weather (public). Every push to `main` redeploys within a
minute or two, including the daily `data.json` commit from the Action.

### Preview locally

```bash
cd ~/Documents/sf-weather && npm start
```

then open http://localhost:8000. (Use this rather than `python3 -m http.server`: Python's
server doesn't support byte-range requests, so Safari won't play or seek the videos.)
Scroll-phase thresholds are the two constants at the top of `script.js`.

### Data pipeline

The panel's numbers come from `data.json`, which counts the days this year on which
San Francisco had the highest daily high (hottest) or the lowest overnight low (coldest)
among the cities in `data/cities.js`. Data is from Open-Meteo (free, no key).

1. **Seed it once:** `npm run backfill` tallies January 1 through yesterday and writes
   `data.json`. Run it any time you want to rebuild from scratch (e.g. after editing the
   city list).
2. **Keep it current:** `npm run update` adds every completed day not yet counted. It is
   safe to run repeatedly. `.github/workflows/update-tally.yml` runs it daily at 14:30 UTC
   once the folder is a GitHub repository, and commits `data.json` if it changed.
3. **Adjust the cities:** edit `data/cities.js` (name + lat/lon), then re-run the backfill.

"Hottest" compares daily highs, "coldest" compares overnight lows (see the comment at the
top of `data/compute.js`; an earlier version compared lowest daily *high*, which made SF
"coldest" on ~65 days a year because of its cool foggy afternoons). Ties count as a win
for SF — nobody was hotter/colder.
