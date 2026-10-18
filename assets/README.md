# assets/

The site reads these five files. Keep the filenames exactly as listed; the clips may be
replaced with higher-quality re-renders at any time without touching the code.

| File | What it is | Used when |
|---|---|---|
| `warm-loop.mp4` | sunny Baker Beach, seamless loop | top of the page (scroll progress 0 – 0.15) |
| `transition.mp4` | sunny → foggy, scrubbed by scroll | middle (0.15 – 0.85) |
| `cold-loop.mp4` | foggy Baker Beach, seamless loop | bottom (0.85 – 1) |
| `warm-poster.jpg` | still of the sunny scene | before the videos load, or if `warm-loop` / early `transition` fails |
| `cold-poster.jpg` | still of the foggy scene | before the videos load, or if `cold-loop` / late `transition` fails |

Requirements: all three clips share identical 16:9 framing; the transition's first frame
matches the warm loop's first frame and its last frame matches the cold loop's first frame.
No audio. The phase thresholds (0.15 / 0.85) are constants at the top of `../script.js`.

## Phone versions (assets/mobile/) and the reversed fog clip

`script.js` picks sources per device:

| Device | Files used |
|---|---|
| desktop / laptop (mouse or trackpad) | `assets/*.mp4` — the fog clip is scrubbed by scroll |
| phone or tablet in landscape | `assets/*.mp4` plus `assets/transition-reverse.mp4` — the fog clip is *played* forward / the reversed copy played backward |
| phone in portrait | `assets/mobile/*` — same clips cropped to 9:16 (608×1080, centre-right, x=900) at ~2 MB each |

Regenerate them whenever the three master clips change (free, takes a minute):

```bash
cd assets && X=900
ffmpeg -y -i warm-loop.mp4  -vf "crop=608:1080:$X:0" -c:v libx264 -crf 24 -preset medium -g 48 -pix_fmt yuv420p -movflags +faststart -an mobile/warm-loop.mp4
ffmpeg -y -i cold-loop.mp4  -vf "crop=608:1080:$X:0" -c:v libx264 -crf 24 -preset medium -g 48 -pix_fmt yuv420p -movflags +faststart -an mobile/cold-loop.mp4
ffmpeg -y -i transition.mp4 -vf "crop=608:1080:$X:0" -c:v libx264 -crf 24 -preset medium -g 48 -pix_fmt yuv420p -movflags +faststart -an mobile/transition.mp4
ffmpeg -y -i transition.mp4 -vf "crop=608:1080:$X:0,reverse" -c:v libx264 -crf 24 -preset medium -g 48 -pix_fmt yuv420p -movflags +faststart -an mobile/transition-reverse.mp4
ffmpeg -y -i transition.mp4 -vf "reverse" -c:v libx264 -crf 22 -preset medium -g 48 -pix_fmt yuv420p -movflags +faststart -an transition-reverse.mp4
ffmpeg -y -i warm-poster.jpg -vf "crop=608:1080:$X:0" -q:v 3 mobile/warm-poster.jpg
ffmpeg -y -i cold-poster.jpg -vf "crop=608:1080:$X:0" -q:v 3 mobile/cold-poster.jpg
```

Change `X` to move the portrait crop left or right (0 = left edge, 1312 = right edge).

## Current files (Veo drafts, finalized 2026-10-18)

1920×1080, 24 fps, 8 s, H.264 High, yuv420p, moov atom at the front (streams immediately),
every frame a keyframe. About 41–47 MB each (≈130 MB for the three).

## Re-encoding for the web (recommended before publishing)

The clips are big because *every* frame is a keyframe. That is exactly right for the
scrubbed `transition.mp4` (frame-accurate seeking), but the two loops only ever play
forward and can use a normal keyframe interval. Suggested encodes, all written to new
filenames so nothing is lost:

```bash
cd assets

# Loops: normal GOP, visually lossless-ish, ~3–6 MB each
ffmpeg -i warm-loop.mp4 -c:v libx264 -crf 20 -preset slow -g 48 -pix_fmt yuv420p -movflags +faststart -an warm-loop-web.mp4
ffmpeg -i cold-loop.mp4 -c:v libx264 -crf 20 -preset slow -g 48 -pix_fmt yuv420p -movflags +faststart -an cold-loop-web.mp4

# Transition: keep every frame a keyframe for scrubbing, but at a lighter quality setting (~15–20 MB)
ffmpeg -i transition.mp4 -c:v libx264 -crf 22 -preset slow -g 1 -pix_fmt yuv420p -movflags +faststart -an transition-web.mp4
```

Then either rename the `-web` files over the originals, or point the three `<video src>`
attributes in `../index.html` at them.

## If scroll-scrubbing feels chunky

Re-encode the transition with a keyframe on every frame (all-intra) and audio stripped,
then point the code at the new file:

```bash
ffmpeg -i transition.mp4 -g 1 -c:v libx264 -crf 18 -preset slow -an transition-scrub.mp4
```

(The current Veo output is already encoded this way.)
