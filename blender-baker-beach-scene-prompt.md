# Blender Build Prompt — "San Francisco: Hottest & Coldest" (Baker Beach scene)

**For: Fable, working in Blender via Claude Code (bpy scripting), to produce a pre-rendered frame sequence for a scroll-scrubbed website.**

---

## 0. Read this first — how to work

- **Blender version:** target **Blender 4.2 LTS or newer** (4.x API: Geometry Nodes for scattering, Principled BSDF v2, AgX color management, EEVEE Next). State the version you're writing for at the top of the script. Do not use legacy particle systems for scattering — use Geometry Nodes.
- **Units:** metric, real-world scale (1 Blender unit = 1 m). Everything — bridge, ship, waves, fog density, camera height — depends on correct scale. Set `scene.unit_settings` accordingly.
- **Run headless:** scripts must run via `blender -b -P build_scene.py` (no GUI dependency), and must **save a `.blend`** after building so the scene can be opened, inspected, and re-rendered without re-running the build.
- **Modular scripts, one master:** split into `build_terrain.py`, `build_bridge.py`, `build_rocks.py`, `build_water.py`, `build_vegetation.py`, `build_ship.py`, `build_atmosphere.py`, `build_lighting_camera.py`, `animate_timeline.py`, `render_settings.py`, and a `build_scene.py` master that imports and runs them in order. Each module must be re-runnable (clear its own collection before rebuilding).
- **Draft before final:** always produce a fast draft sequence (EEVEE or low-sample Cycles, 960×540) to validate the choreography before any full-quality render.
- **Tunables at the top:** every timing, direction, density, and count referenced below is a named constant in a `CONFIG` dict at the top of `build_scene.py`, with a one-line comment each.

---

## 1. What you're building

A single photorealistic 3D scene of **Baker Beach, San Francisco, looking northeast at the Golden Gate Bridge**, built in Blender and rendered as a **PNG image sequence**. A website will scrub through the sequence as the user scrolls, so scrolling plays one choreographed animation: a container ship advances through the strait under the bridge, marine fog rolls in off the Pacific, the light cools from warm golden-hour to grey overcast, and the camera slowly pushes in to reveal fine foreground detail.

The goal is **extreme, zoom-worthy detail** — individual rocks, pebbles, dune plants, sand grain, lichen, wet-sand reflections — rendered at full path-traced quality with no real-time performance limit. This is a proof-of-concept scene; prioritize fidelity and choreography over render speed. It is expected to take substantial render time.

**Hard exclusions:** no people, no text or logos, no camera shake, no lens flares, no birds in flight, no cars/vehicles unless explicitly enabled by the optional flag in §6.

---

## 2. Reference photograph — match as the warm/start state

Match the attached reference photo for composition and lighting at frame 1:

- **Camera:** low — roughly **1.0–1.3 m above the wet sand**, near the waterline, pointed slightly up so the horizon sits about **40% up the frame**. Focal length ~**28–35 mm** full-frame equivalent (wide but not distorted). Level horizon, no roll.
- **Framing:** the Golden Gate Bridge spans from just left of center to the right edge. The **near (south) tower** is right-of-center with the braced steel approach span and concrete anchorage/pylon continuing to the right edge. The **far (north) tower** is left-of-center, smaller with distance. The main cable catenary dips between them.
- **Foreground:** wet, mirror-like sand filling the lower third, carrying a clear reflection of both towers. Lacy white foam and bubbles at the leading edge of a spent wave, washing in from the **left** (the open ocean is to the left).
- **Mid-ground:** a cluster of dark, wet, barnacled rock outcrops just offshore, center-right; a larger lichen-mottled rock mass and low cliff at the right foreground edge.
- **Background:** the rounded green-brown **Marin Headlands** rising behind the far tower on the left; a lower hillside with small scattered buildings visible under the bridge deck at center (the Sausalito/Marin side); open strait water in between.
- **Light:** low sun from the **left and slightly behind camera** (west/southwest), elevation roughly **8–15°**. Warm orange on the bridge, the tower faces, and the right-hand rocks; long soft shadows; sky a clear gradient from deep blue at top to pale warm near the horizon with a few soft cumulus clouds. Slight aerial haze makes the far headlands a touch bluer than the near rocks.

---

## 3. Geography — get the directions right

This matters for realism and it is easy to get backwards:

- From Baker Beach you look **north/northeast**. The **Pacific Ocean is to the LEFT** of frame; **San Francisco Bay is to the RIGHT**, beyond and behind the bridge's right side.
- **Fog ("Karl") comes in off the Pacific, i.e. from the LEFT**, and flows east through the Golden Gate toward the bay. It is a low **marine stratus layer**: it arrives low and often sits *below* the tower tops, so the **tops of the towers poke out above the fog** — this is the iconic SF image and should be a deliberate beat in the animation.
- **Ships inbound** to the port come from the Pacific (left) and pass under the bridge heading right; **outbound** the reverse. The **shipping channel runs under the center of the main span**, in the strait *behind* the foreground rocks — the ship must be out in the strait, under/near the span, never in front of the foreground rocks.
- Make fog direction and ship direction **tunables** (`FOG_FROM = "left"`, `SHIP_DIRECTION = "inbound"`), defaulting to the physically accurate values above. If the client later asks for fog from the right, flipping the constant must be all it takes.

---

## 4. Real-world dimensions (use these — do not guess scale)

- **Golden Gate Bridge:** main span **1,280 m**; total suspended length ~**1,966 m**; towers **227 m** above water; deck clearance above water **67 m** at mid-span; tower centers 1,280 m apart; two main cables ~**0.92 m** diameter with suspender cables every **15.2 m**; deck width ~**27 m**. Towers are Art Deco stepped portals: two legs joined by **four horizontal portal struts** with X-bracing, legs stepping inward as they rise.
- **Container ship:** a large container vessel **~300–350 m long**, **~45 m beam**, hull ~**25 m** freeboard, containers stacked **6–8 high** above deck, bridge superstructure aft or three-quarters aft. It must clear the 67 m deck — it will, comfortably, and the scale contrast between ship and bridge is part of the realism.
- **Fog layer:** base near sea level, ceiling initially **~80–120 m** (below tower tops at 227 m), rising/thickening later.
- **Waves at the shore:** calm day — **0.3–0.6 m** swell, long period. Shoreline wash extends **3–6 m** up the sand.
- **Camera height:** **1.0–1.3 m**. Foreground rocks **1–4 m** tall; offshore outcrops **2–6 m**.

Bridge color: **International Orange** — use sRGB ≈ **(0.78, 0.29, 0.13)** / hex **#C84A21**, roughness ~0.55, light weathering/streaking in a second texture layer. Not pure red, not pure orange.

---

## 5. Scene construction (bpy)

Organize into collections: `Terrain`, `Bridge`, `Rocks`, `Water`, `Vegetation`, `Ship`, `Atmosphere`, `Lighting`, `Camera`, `Distant`. Keep high-density scatter and displacement **camera-aware**: use Geometry Nodes proximity to the camera path to reduce density/subdivision far from the lens, so VRAM stays sane.

### 5.1 Terrain & beach
- Beach plane sloping gently to the waterline, displaced with layered noise for natural dune contour; a low dune ridge and the start of a bluff on the right rising toward the rocks.
- **Sand material:** procedural micro-displacement + normal detail so grain reads on close zoom; dry sand matte and slightly lighter upslope; **wet sand** near the waterline glossy and darker with **low roughness (~0.08–0.15)** so it mirrors the bridge like the reference. Drive wet/dry with a **wetness mask** that follows the waterline and is animated to breathe with the wash. Include the **lacy foam/bubble pattern** of a spent wave on the wet sand (procedural Voronoi/noise mask, animated).
- Small-scale realism: **sand ripples** near the waterline, a darker **tide line**, scattered **pebbles and shell fragments** (GN scatter, density falling off with distance from camera), a few **strands of washed-up kelp** and a piece of **driftwood** in the foreground, and — in the warm state — a trail of **footprints and dog pawprints** heading along the beach (there are no people, but there were). Footprints can soften/vanish as the wash advances.

### 5.2 The Golden Gate Bridge
- Build **parametrically** from the dimensions in §4 (preferred, so it is editable), or import a free model if one is clearly better — state which. Components:
  - Two Art Deco towers: stepped legs, four portal struts with X-bracing, correct height and spacing.
  - Two main cables as curves with a true **catenary** between towers and down to the anchorages; **suspender cables** every 15.2 m via an array along the cable curve; mid-span sag correct for the dimensions.
  - Deck with stiffening truss beneath, side railings, and **lamp posts** at regular intervals along the deck.
  - The **south approach**: braced steel approach span and the concrete **anchorage/pylon** on the right edge, as in the reference. **Fort Point** (the brick fort) sits at the base of the south tower — include a simplified block of it.
  - **Aviation lights** (red) on the tower tops and **deck lamps** as emissive materials; these are nearly invisible in the warm state and **become visible glows as the fog thickens**.
- Enough truss/cable detail that the push-in holds up. Weathering: subtle streaks and slight roughness variation on the paint.

### 5.3 Rocks & cliffs
- Foreground and offshore outcrops as **real displaced geometry** (multires/sculpt-style displacement, adaptive subdivision in Cycles), not flat meshes with normal maps — these are hero zoom elements. Sharp fractured planes plus weathered rounding.
- Materials: dark basalt/serpentinite base; a **wet zone** (darker, glossier) below the tide line; **barnacle and mussel crust** micro-detail in the intertidal band; **orange/yellow lichen** patches on the dry upper surfaces of the right-hand rock mass (clearly visible in the reference); **green algae/seaweed** sheets at the waterline; a few **tide pools** in the foreground rocks with still, reflective water.
- Scatter smaller boulders and cobbles at the sand/rock boundary. Occasional **spray/mist** where waves meet the offshore rocks (small animated volume or particle sprites, subtle).

### 5.4 Water
- **Open strait water:** Blender's **Ocean modifier** on a large plane, small-to-moderate wave scale per §4, animated so waves travel toward shore (from the left/ocean side). Enable the Ocean **foam** attribute for crest foam.
- **Shoreline:** the Ocean modifier does not model wave run-up on a beach, so handle the shore separately: a shallow-water transition where the water plane meets the sloped sand (transparent, depth-tinted), a **shoreline foam/wash layer** driven by a shader mask of distance-to-shore plus an animated advancing/receding front, and the sand wetness mask from §5.1 synced to that front. The wash should advance and recede on a slow cycle throughout the whole sequence so no frame ever looks frozen.
- Water shader: glossy reflection of bridge and sky, depth-based color (teal-green shallows → deeper steel blue), refraction, slight subsurface in the breaking foam. In the cold state the water goes flatter and greyer.
- **Channel markers:** one or two navigation **buoys** in the strait near the span (small, realistic detail).

### 5.5 Vegetation
- On the right-hand bluff, dune edges, and headlands: **coastal scrub, dune grass, ice plant, beach strawberry, yellow bush lupine, coastal sage** — the actual Baker Beach dune palette. GN scatter with density weighted toward the camera-visible areas; fine enough that a push-in resolves individual leaves and grass blades. Gentle wind sway on grass (subtle, continuous).
- The **Marin Headlands** behind the bridge as sculpted terrain with grass/scrub texture and the characteristic rounded ridgelines; the lower hillside under the deck at center with **small scattered buildings** (simple boxes with roofs, varied, a few windows emissive in the cold state).

### 5.6 The container ship (scroll-animated)
- A large container ship per §4: hull, bulbous bow, stacked containers in **varied realistic colors** (rust red, blue, green, grey, white, with logos **omitted**), aft bridge superstructure, funnel, railings, lifeboats, a radar mast.
- Lights: red **port** / green **starboard** navigation lights, white masthead lights, and a bright **foghorn/forward light** — all emissive, weak in the warm state and **glowing prominently in fog**.
- Interaction with water: a **bow wave** and **wake foam** trailing behind it on the Ocean surface (a wake mask that follows the ship along its path), subtle displacement of the water around the hull.
- Path: follows the shipping channel under the center of the main span, direction per `SHIP_DIRECTION`.

### 5.7 Atmosphere / fog (scroll-animated)
- Implement as a **large volume mesh** (a box spanning the strait and beach) with a **Principled Volume** shader. Density = (animated 4D noise, several octaves, slowly drifting in the wind direction) × (a **sweep gradient** that advances across the scene from the ocean side) × (a **vertical gradient** that confines fog below a ceiling height). Keyframe the sweep position, the ceiling height, and the overall density multiplier across the timeline. Anisotropy ~0.3–0.5 for soft forward scatter.
- Behavior: arrives as thin wisps low over the water from the ocean side; thickens into banks that **partially veil the bridge, leaving the tower tops poking above the fog**; later rises and thickens until the bridge is mostly obscured with only glimpses. Fog should keep drifting internally (noise animation) the whole time so banks visibly move even when the sweep is paused.
- Alternative: imported **VDB cloud/fog volumes** (free packs exist) animated along the path — acceptable if the result is better; note the asset.
- Also add a faint constant **aerial haze** even at frame 1 (very low density) for depth.

### 5.8 Lighting & sky
- **Sun lamp:** per §2 — low, warm, from frame-left/behind-camera. Angular diameter ~0.5–1° for soft-edged shadows. Keyframe **strength, color temperature, and elevation**: warm strong golden (≈3,800–4,500 K, strong) at frame 1 → dim, neutral-cool (≈6,500–7,500 K, weak, higher-elevation-feeling diffuse) at the end.
- **Sky/ambient:** an HDRI environment. Use **two HDRIs** — a clear warm late-afternoon sky and a flat overcast grey sky — mixed in the World shader with a **keyframed mix factor** that follows the fog timeline. Alternatively the Nishita sky texture with keyframed turbidity/sun parameters, if HDRI matching is poor.
- **Clouds:** soft cumulus in the warm state (from the HDRI or a low-density upper volume); they flatten into a uniform grey ceiling as the overcast state takes over.
- The overall grade should move from **warm/saturated** to **cool/desaturated steel grey-blue** — do this physically through light/sky changes first, then only a light touch in the compositor.

### 5.9 Camera
- Per §2 placement and lens. Keyframe a **slow dolly push-in of ~8–12% of the camera-to-rocks distance** over the sequence, with a very slight downward tilt so the foreground sand/rocks grow in frame and resolve more detail. Keep the bridge fully in frame throughout; never clip through foreground geometry. Depth of field: very deep (f/11–f/16 equivalent) so everything stays sharp; a barely-there focus on the foreground rocks is acceptable. No shake, no roll, no zoom (focal length constant).

---

## 6. Scroll choreography — one keyframed timeline

Timeline length: **`FRAME_COUNT = 240`** (tunable; 180–300 is the sensible range — scroll-scrubbing does not need 24 fps, and fewer frames means less to download). Frame 1 = warm reference state; last frame = cold foggy state. The website maps scroll 0→1 linearly onto frames 1→N.

Phase targets (as fractions of the timeline; all tunable in `CONFIG`):

| Progress | Fog | Ship | Light & sky | Camera |
|---|---|---|---|---|
| 0.00 | None (aerial haze only) | Just entering frame-left in the strait | Full warm golden, clear sky | Start position |
| 0.15 | First thin wisps low over the water from the left | Approaching the span | Still warm; first high cloud thickening | Push-in begins (eased) |
| 0.40 | Banks forming; deck half-veiled, **tower tops clear above fog** | Bow reaching the main span | Sun weakening, warming fading, sky greying | Continuing |
| 0.65 | Dense below ~150 m; bridge seen in gaps; ship's lights now glowing | **Directly under mid-span** | Mostly overcast; shadows soft | Continuing |
| 0.85 | Ceiling rising; towers now also veiled, glimpses only | Emerging on the far side, half-lost in fog | Flat grey, cool, desaturated | Nearing end |
| 1.00 | Full cold SF summer fog; bridge mostly hidden, lights glowing | Fading into fog beyond the bridge | Cold overcast, steel grey-blue | End position |

Always-on throughout: waves and shoreline wash, foam, grass sway, fog internal drift, water reflections. **No frame may look frozen.**

Use eased (Bezier) interpolation on all keyframes; the fog sweep and ship motion should feel slow and inevitable, not linear or snappy.

**Optional (flag `ENABLE_DECK_TRAFFIC`, default off):** a sparse stream of small instanced cars moving along the bridge deck, tiny at this distance, headlights becoming visible in fog. Only if cheap.

---

## 7. Render settings

- **Engine:** **Cycles**, GPU, path tracing. Enable **adaptive sampling**, **persistent data**, and **OpenImageDenoise** with albedo + normal guiding passes (essential for clean volumetrics). Use an **animated noise seed** so denoised grain doesn't look frozen between frames.
- **Color management:** **AgX** view transform, medium contrast; render to 16-bit PNG (or EXR if you prefer a compositor pass, then convert).
- **Resolution strategy:** draft at **960×540**; final master at **2560×1440 (QHD)** — enough for zoom detail on any current display. Render **3840×2160** only as an optional hero pass once QHD is approved; 4K volumetrics across 240 frames is very slow.
- **Samples:** final ~**512–1024** with adaptive threshold ~0.01 and denoising; volumetric step rate tuned so fog is smooth without crushing render time. Max bounces modest (diffuse 4, glossy 6, transmission 8, volume 2).
- **Displacement:** adaptive subdivision (Cycles experimental feature set) on rocks and sand near camera; dicing rate ~1 px for final, ~4–8 px for draft.
- **Output:** PNG sequence, zero-padded (`frame_0001.png … frame_0240.png`) into `/render/draft/` and `/render/final/`. Also write a `render_log.txt` with per-frame times so render cost is visible.
- **Web export step (after final):** generate a web-ready sequence with ffmpeg/ImageMagick: **1920×1080 WebP (quality ~80)** for desktop and **1280×720** for mobile, same frame numbering, into `/web/desktop/` and `/web/mobile/`. Include the exact commands in the README. The site scrubs these, not the 16-bit masters.
- **Idle loops (optional):** if the site should keep moving when parked at the top or bottom, additionally render a short seamless loop (e.g. 96 frames) of the frame-1 state and the final state with only waves/fog drifting; name them `idle_warm_####.png` and `idle_cold_####.png`.

Provide a `README.md`: Blender version, how to run draft vs. final, approximate render time per frame observed in the draft, all tunables, external assets and where the script expects them, and the web export commands.

---

## 8. Known failure modes — check these before calling it done

1. Fog or ship moving from the wrong side (see §3). Fog comes from the Pacific = frame-left by default.
2. Bridge at the wrong scale relative to the ship or camera — verify against §4 dimensions with a measurement in the scene.
3. Ship placed in front of the foreground rocks instead of out in the strait under the span.
4. Towers fully hidden too early — the **towers-above-the-fog** beat around 0.40–0.65 must be visible.
5. Sand reflection missing because wet-sand roughness is too high or the foreground is too bumpy — the bridge must reflect in the foreground at frame 1 like the reference.
6. Frozen-looking frames: wash, waves, grass, and fog drift must animate continuously, independent of the sweep.
7. Camera push-in clipping into sand or rocks, or the bridge leaving frame.
8. Volumetric noise/fireflies — fix with denoiser guiding passes, volume step size, and clamping, not by piling on samples.
9. VRAM blowups from unbounded scatter — camera-aware density and instancing are mandatory.
10. Non-reproducible build — the `.blend` must be saved and every module re-runnable from a clean file.

---

## 9. Deliverables

1. The modular bpy scripts + `build_scene.py` master, fully commented, with the `CONFIG` tunables block.
2. The saved `.blend` after build.
3. A list of any external assets used (bridge model, ship model, HDRIs, VDBs, plant assets) with free sources (e.g. Poly Haven for HDRIs, BlenderKit/Sketchfab CC0 for models) and the paths the scripts expect.
4. `/render/draft/` sequence for approval, then `/render/final/` masters, then `/web/desktop/` and `/web/mobile/` WebP sequences.
5. `README.md` per §7.

## Priorities, in order
1. Photorealism and fine zoom-level detail (rocks, lichen, sand grain, foam lace, wet-sand reflection, plants).
2. A smooth, legible scroll choreography — fog in from the ocean, ship under the span, towers above the fog, warm→cold light, gentle push-in — all on one frame range.
3. Faithfulness to the reference framing and warm-light start state, with correct SF geography.
4. Clean, tunable, reproducible scripts and a documented render/export pipeline.

Take the time to make it detailed — this scene is meant to reward close inspection.

---

## Note for later (website side — not part of this prompt)
The web-ready frame sequence plugs into the scroll-scrubbed website being built separately: scroll position maps to frame index, and a fixed Apple-glass metrics panel (hottest/coldest day counts) floats over it. Don't build the website here; just produce the sequences, keep 16:9, and keep the frame numbering consistent.
