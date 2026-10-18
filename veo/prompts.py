"""
All prompts for the Veo pipeline, in one place so they're easy to tune.

Geography note: from Baker Beach you look northeast. The Pacific is to the LEFT
of frame, the bay to the RIGHT. Fog comes in off the ocean = from the LEFT.

The scene contains NO people. The warm keyframe is normally a real photo
(`keyframes --warm-from keyframes/warm-source.jpg`); the cold keyframe is an
edit of it, so the only thing that changes between the two is the weather.
"""

# ---------------------------------------------------------------------------
# Keyframe stills
# ---------------------------------------------------------------------------
# Only used when no --warm-from photo is given.
KEYFRAME_WARM = (
    "Photorealistic still, cinematic. Fixed wide shot from the wet sand at Baker Beach, "
    "San Francisco, looking across the water at the Golden Gate Bridge. Clear late-afternoon "
    "golden-hour light, warm sun on the rocks, blue sky fading to a soft warm haze at the "
    "horizon, the bridge fully visible and sharp. Rocky outcrops on the right and a few rocks "
    "in the surf on the left; a sheet of water on the sand reflecting the sky. Completely "
    "empty beach — no people anywhere. Calm ocean, small waves. Horizon line about 40% up "
    "the frame, bridge in the right-center. 16:9, high detail, natural light. "
    "No text, no watermark."
)

# Optional `--enhance` pass on a --warm-from photo: re-render it sharper at full resolution.
KEYFRAME_ENHANCE = (
    "Reproduce this exact photograph at high resolution with crisp, sharp detail throughout. "
    "This is an upscale, not a re-imagining: the composition, camera position, framing, every "
    "rock, the driftwood log, the sand, the waterline, the hills, the bridge, the sky, the "
    "colors and the warm golden light must all stay exactly as they are. Sharpen the distant "
    "hills and the bridge cables so they are clearly defined, recover fine texture in the rocks "
    "and sand, remove JPEG blur and compression artifacts. Do not add any people, animals, "
    "boats or objects. Photorealistic. No text, no watermark."
)

# Applied as an EDIT of the warm image so the composition is pixel-identical.
KEYFRAME_COLD_EDIT = (
    "Edit this photo to change ONLY the weather and lighting. This must be the exact same "
    "photograph from the exact same camera position: do not move, add, remove or reshape "
    "anything. Every rock, the driftwood log, the sand, the waterline, the wet reflective "
    "sand, the shoreline, the hills, the bridge and the horizon stay in exactly the same "
    "place and shape. Do not add any people, animals, boats or objects. "
    "New weather: a cold, foggy San Francisco summer day. Thick grey fog has rolled in from "
    "the left (ocean side); the sky is overcast grey-blue with no sun; the light is flat and "
    "soft with no shadows; colors are cool and desaturated (the warm golden tones are gone). "
    "The Golden Gate Bridge is mostly veiled in fog, only partly visible between drifting "
    "banks. The water is steel grey and the reflections on the wet sand are grey too. "
    "Photorealistic. No text, no watermark."
)

# ---------------------------------------------------------------------------
# Clip 1 — warm loop (image-to-video from warm.png)
# ---------------------------------------------------------------------------
WARM_LOOP = (
    "Fixed tripod shot. The camera is completely locked and still — no camera movement, "
    "no zoom, no pan, no parallax. "
    "Scene: Baker Beach, San Francisco, clear late-afternoon golden light, the Golden Gate "
    "Bridge sharp across the water, rocks in the foreground, an empty beach with no people. "
    "Motion: only gentle ocean waves rolling in and receding in a slow steady rhythm, a thin "
    "sheet of water sliding over the wet sand, and calm rippling water. Everything else is "
    "still — the rocks, the log and the bridge do not change. "
    "Light: warm, golden, even, unchanging. "
    "Style: photorealistic, cinematic, natural color. Silent, no sound."
)
WARM_NEGATIVE = (
    "camera movement, zoom, pan, dolly, shake, people, person, crowd, walking, swimmer, "
    "surfer, dog, boats, ships, birds, blowing sand, dust, lens flare, sparkles, flickering, "
    "text, captions, watermark, logo, sudden lighting changes, morphing, warping, music, speech"
)

# ---------------------------------------------------------------------------
# Clip 2 — transition (frames-to-video: warm.png -> cold.png)
# ---------------------------------------------------------------------------
TRANSITION = (
    "Fixed tripod shot. The camera is completely locked and still throughout — no movement, "
    "no zoom, no pan. Framing stays identical from the first frame to the last, matching the "
    "provided start and end frames. The rocks, the log, the sand and the bridge never move or "
    "change shape; only the weather changes. "
    "Action: the weather changes gradually from the sunny start frame to the foggy end frame. "
    "Thick fog drifts in from the left edge of the frame (the ocean side) and spreads slowly "
    "to the right across the water, progressively hiding the Golden Gate Bridge behind moving "
    "banks of fog until only glimpses of it remain. The sky turns overcast grey; the light "
    "flattens and cools; colors desaturate from warm gold to steel grey. "
    "Motion: slow drifting fog and gentle waves only. No other movement. No people appear. "
    "Style: photorealistic, cinematic, continuous, gradual. Silent, no sound."
)
TRANSITION_NEGATIVE = (
    "camera movement, zoom, pan, shake, people, person, crowd, walking, dog, boats, ships, "
    "birds, crossfade, dissolve, flashing, strobing, text, captions, watermark, logo, abrupt "
    "cuts, scene change, morphing, warping, music, speech"
)

# ---------------------------------------------------------------------------
# Clip 3 — cold loop (image-to-video from cold.png)
# ---------------------------------------------------------------------------
COLD_LOOP = (
    "Fixed tripod shot. The camera is completely locked and still — no camera movement, "
    "no zoom, no pan, no parallax. "
    "Scene: Baker Beach, San Francisco, cold foggy summer day, overcast grey-blue light, flat "
    "and soft. The Golden Gate Bridge is partly veiled in fog across the water, rocks in the "
    "foreground, an empty beach with no people. "
    "Motion: only thick fog drifting slowly and continuously across the frame from the left, "
    "and slow steel-grey waves rolling in and receding over the wet sand. The rocks, the log "
    "and the bridge do not change. "
    "Light: cool, grey, diffused, unchanging. "
    "Style: photorealistic, cinematic, quiet, atmospheric. Silent, no sound."
)
COLD_NEGATIVE = (
    "camera movement, zoom, pan, dolly, shake, people, person, crowd, walking, dog, boats, "
    "ships, birds, lens flare, text, captions, watermark, logo, sudden lighting changes, "
    "morphing, warping, music, speech"
)
