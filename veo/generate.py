#!/usr/bin/env python3
"""
Veo generation pipeline for the SF "Hottest & Coldest" site.

Produces the two keyframe stills and the three video clips described in
prompts.py, chained so their framing matches:

    keyframes   -> keyframes/warm.png, keyframes/cold.png
    warm        -> takes/warm_takeN.mp4        (image-to-video from warm.png)
    transition  -> takes/transition_takeN.mp4  (frames-to-video warm.png -> cold.png)
    cold        -> takes/cold_takeN.mp4        (image-to-video from cold.png)
    finalize    -> ../assets/{warm-loop,transition,cold-loop}.mp4 (audio stripped)

Usage (run from the veo/ folder):
    python generate.py check                 # verify key, billing, list available Veo/Imagen models
    python generate.py keyframes             # make both stills (review before continuing!)
    python generate.py keyframes --warm-from keyframes/warm-source.jpg --enhance
                                             # real photo (sharpened/upscaled) as warm, AI fog edit as cold
    python generate.py warm [--takes 2]
    python generate.py transition [--takes 3]
    python generate.py cold [--takes 2]
    python generate.py finalize --warm 1 --transition 2 --cold 1
    python generate.py frames takes/transition_take2.mp4   # dump first/last frame PNGs

Flags: --fast  use the Fast Veo model (cheap drafts).  Default is the standard
       (highest quality) Veo 3.1 model, as requested.

Requires: GEMINI_API_KEY in the environment, `pip install -r requirements.txt`,
and ffmpeg on PATH (brew install ffmpeg).
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    sys.exit("Missing dependency. Run: pip install -r requirements.txt")

import prompts

# ---------------------------------------------------------------------------
# CONFIG — model IDs are looked up by `check`; update here if newer ones exist.
# ---------------------------------------------------------------------------
CONFIG = {
    "veo_model": "veo-3.1-generate-preview",        # standard = best quality
    "veo_fast_model": "veo-3.1-fast-generate-preview",
    "image_model": "gemini-3-pro-image",            # warm keyframe (text-to-image); Imagen is gone from this key
    "image_edit_model": "gemini-3-pro-image",       # cold keyframe (edit warm -> fog, same composition)
    "image_size": "2K",                             # 2K @ 16:9 = 2048x1152, comfortably above Veo's 1080p
    "text_model": "gemini-3.8-flash",               # only used by `check` to prove the key/billing works
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "duration_seconds": 8,
    "poll_seconds": 15,
}

ROOT = Path(__file__).resolve().parent
KEYFRAMES = ROOT / "keyframes"
TAKES = ROOT / "takes"
ASSETS = ROOT.parent / "assets"
for d in (KEYFRAMES, TAKES, ASSETS):
    d.mkdir(parents=True, exist_ok=True)


def client():
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY is not set. Open a new terminal (so ~/.zshrc is loaded) and retry.")
    return genai.Client(api_key=key)


def estimate_cost(model, takes):
    # Approximate list prices per second of 1080p output (video with audio);
    # confirm on ai.google.dev/pricing before large runs.
    per_sec = 0.15 if "fast" in model else 0.40
    return takes * CONFIG["duration_seconds"] * per_sec


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------
def cmd_check(args):
    c = client()
    print("Key OK. Listing models that mention veo / imagen / image:\n")
    found = []
    for m in c.models.list():
        name = m.name.replace("models/", "")
        if any(k in name for k in ("veo", "imagen", "image")):
            found.append(name)
            print("  ", name)
    print()
    for key in ("veo_model", "veo_fast_model", "image_model", "image_edit_model"):
        ok = CONFIG[key] in found
        print(f"{'OK ' if ok else 'MISSING'}  {key} = {CONFIG[key]}")
        if not ok:
            print("          -> pick the newest matching model from the list above and update CONFIG.")
    # tiny text call proves billing/quota works
    r = c.models.generate_content(model=CONFIG["text_model"], contents="Reply with the single word: ready")
    print("\nTest call:", r.text.strip())
    print("ffmpeg:", "found" if shutil_which("ffmpeg") else "NOT FOUND (brew install ffmpeg)")


def shutil_which(binary):
    from shutil import which
    return which(binary)


# ---------------------------------------------------------------------------
# keyframes
# ---------------------------------------------------------------------------
def image_config():
    return types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=CONFIG["aspect_ratio"], image_size=CONFIG["image_size"]),
    )


def save_first_image(response, path):
    """Save the first image part of a generate_content response as PNG. Returns True if one was found."""
    from io import BytesIO
    from PIL import Image
    for part in response.candidates[0].content.parts:
        if getattr(part, "inline_data", None) is not None:
            Image.open(BytesIO(part.inline_data.data)).save(path)
            return True
    return False


def cmd_keyframes(args):
    c = client()
    warm_path = KEYFRAMES / "warm.png"
    cold_path = KEYFRAMES / "cold.png"

    if args.warm_from:
        # Use a real photo as the warm keyframe: center-crop to the video aspect ratio, no generation.
        from PIL import Image
        img = Image.open(args.warm_from).convert("RGB")
        w, h = img.size
        aw, ah = (int(x) for x in CONFIG["aspect_ratio"].split(":"))
        if w * ah > h * aw:          # too wide -> trim the sides
            nw = h * aw // ah
            img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:                        # too tall -> trim top and bottom (mostly sky, keep the beach)
            nh = w * ah // aw
            top = int((h - nh) * 0.75)
            img = img.crop((0, top, w, top + nh))
        print(f"WARM keyframe taken from {args.warm_from}: cropped {w}x{h} -> {img.size[0]}x{img.size[1]}")
        if args.enhance:
            # Re-render the photo sharper at full model resolution (same composition).
            print("  enhancing (sharpen/upscale) with", CONFIG["image_model"])
            r = c.models.generate_content(
                model=CONFIG["image_model"],
                contents=[prompts.KEYFRAME_ENHANCE, img],
                config=image_config(),
            )
            if not save_first_image(r, warm_path):
                sys.exit("Enhance returned no image. Try again or drop --enhance.")
            print(f"  enhanced -> {Image.open(warm_path).size[0]}x{Image.open(warm_path).size[1]}")
        else:
            img.save(warm_path)
        print("  saved", warm_path)
    elif warm_path.exists() and not args.force:
        print(f"{warm_path} exists (use --force to regenerate)")
    else:
        print("Generating WARM keyframe with", CONFIG["image_model"])
        # Gemini image models go through generate_content (not the old Imagen generate_images API).
        r = c.models.generate_content(
            model=CONFIG["image_model"],
            contents=prompts.KEYFRAME_WARM,
            config=image_config(),
        )
        if not save_first_image(r, warm_path):
            sys.exit("Image generation returned no image. Try again or adjust KEYFRAME_WARM.")
        print("  saved", warm_path)

    if cold_path.exists() and not (args.force or args.warm_from):
        print(f"{cold_path} exists (use --force to regenerate)")
    else:
        print("Generating COLD keyframe by editing the warm one with", CONFIG["image_edit_model"])
        from PIL import Image
        warm_img = Image.open(warm_path)
        r = c.models.generate_content(
            model=CONFIG["image_edit_model"],
            contents=[prompts.KEYFRAME_COLD_EDIT, warm_img],
            config=image_config(),
        )
        if not save_first_image(r, cold_path):
            sys.exit("Image edit returned no image. Try again or adjust KEYFRAME_COLD_EDIT.")
        # Veo wants matching first/last frames: make cold.png the same pixel size as warm.png.
        cold_img = Image.open(cold_path)
        if cold_img.size != warm_img.size:
            print(f"  resizing cold {cold_img.size} -> warm {warm_img.size}")
            cold_img.convert("RGB").resize(warm_img.size, Image.LANCZOS).save(cold_path)
        print("  saved", cold_path)

    print("\nOpen both keyframes and confirm identical framing BEFORE generating video."
          "\nRe-run with --force to re-roll either one.")


# ---------------------------------------------------------------------------
# video generation
# ---------------------------------------------------------------------------
def load_image(path):
    return types.Image.from_file(location=str(path))


def generate_videos(c, model, prompt, negative, first_frame, last_frame, out_prefix, takes):
    cost = estimate_cost(model, takes)
    print(f"\nModel: {model}   takes: {takes}   est. cost: ~${cost:.2f}")
    cfg = dict(
        aspect_ratio=CONFIG["aspect_ratio"],
        resolution=CONFIG["resolution"],
        duration_seconds=CONFIG["duration_seconds"],
        negative_prompt=negative,
        number_of_videos=1,
    )
    if last_frame is not None:
        cfg["last_frame"] = load_image(last_frame)
    existing = sorted(TAKES.glob(f"{out_prefix}_take*.mp4"))
    start = len(existing) + 1
    for i in range(start, start + takes):
        print(f"  generating {out_prefix}_take{i} ...", flush=True)
        op = c.models.generate_videos(
            model=model,
            prompt=prompt,
            image=load_image(first_frame),
            config=types.GenerateVideosConfig(**cfg),
        )
        t0 = time.time()
        while not op.done:
            time.sleep(CONFIG["poll_seconds"])
            op = c.operations.get(op)
            print(f"    ... {int(time.time() - t0)}s", flush=True)
        if op.error:
            print("    FAILED:", op.error)
            continue
        vid = op.response.generated_videos[0]
        out = TAKES / f"{out_prefix}_take{i}.mp4"
        c.files.download(file=vid.video)
        vid.video.save(str(out))
        print("    saved", out)


def pick_model(args):
    return CONFIG["veo_fast_model"] if args.fast else CONFIG["veo_model"]


def require(path, hint):
    if not Path(path).exists():
        sys.exit(f"Missing {path}. {hint}")


def cmd_warm(args):
    require(KEYFRAMES / "warm.png", "Run `python generate.py keyframes` first.")
    generate_videos(client(), pick_model(args), prompts.WARM_LOOP, prompts.WARM_NEGATIVE,
                    KEYFRAMES / "warm.png", None, "warm", args.takes)


def cmd_transition(args):
    require(KEYFRAMES / "warm.png", "Run keyframes first.")
    require(KEYFRAMES / "cold.png", "Run keyframes first.")
    generate_videos(client(), pick_model(args), prompts.TRANSITION, prompts.TRANSITION_NEGATIVE,
                    KEYFRAMES / "warm.png", KEYFRAMES / "cold.png", "transition", args.takes)


def cmd_cold(args):
    require(KEYFRAMES / "cold.png", "Run keyframes first.")
    generate_videos(client(), pick_model(args), prompts.COLD_LOOP, prompts.COLD_NEGATIVE,
                    KEYFRAMES / "cold.png", None, "cold", args.takes)


# ---------------------------------------------------------------------------
# post: frames + finalize
# ---------------------------------------------------------------------------
def ffmpeg(*argv):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *argv], check=True)


def cmd_frames(args):
    src = Path(args.video)
    stem = src.with_suffix("")
    ffmpeg("-i", str(src), "-vframes", "1", f"{stem}_first.png")
    ffmpeg("-sseof", "-0.05", "-i", str(src), "-update", "1", "-vframes", "1", f"{stem}_last.png")
    print("wrote", f"{stem}_first.png", "and", f"{stem}_last.png")


def cmd_finalize(args):
    mapping = {
        "warm-loop.mp4": TAKES / f"warm_take{args.warm}.mp4",
        "transition.mp4": TAKES / f"transition_take{args.transition}.mp4",
        "cold-loop.mp4": TAKES / f"cold_take{args.cold}.mp4",
    }
    for name, src in mapping.items():
        require(src, "Check the take number.")
        out = ASSETS / name
        # strip audio, re-encode with frequent keyframes so the site can scrub smoothly
        ffmpeg("-i", str(src), "-an", "-c:v", "libx264", "-g", "1", "-crf", "18",
               "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out))
        print("wrote", out)
    # posters for the site's fallback
    ffmpeg("-i", str(ASSETS / "warm-loop.mp4"), "-vframes", "1", str(ASSETS / "warm-poster.jpg"))
    ffmpeg("-sseof", "-0.05", "-i", str(ASSETS / "cold-loop.mp4"), "-update", "1", "-vframes", "1",
           str(ASSETS / "cold-poster.jpg"))
    print("wrote posters. Assets are ready for the site.")


# ---------------------------------------------------------------------------
def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    k = sub.add_parser("keyframes")
    k.add_argument("--force", action="store_true")
    k.add_argument("--warm-from", metavar="PHOTO",
                   help="use this photo (cropped to 16:9) as warm.png instead of generating one; cold.png is "
                        "then an edit of it. Implies regenerating cold.png.")
    k.add_argument("--enhance", action="store_true",
                   help="with --warm-from: re-render the photo sharper at full model resolution first")
    k.set_defaults(fn=cmd_keyframes)
    for name, fn, default_takes in (("warm", cmd_warm, 2), ("transition", cmd_transition, 3), ("cold", cmd_cold, 2)):
        s = sub.add_parser(name)
        s.add_argument("--takes", type=int, default=default_takes)
        s.add_argument("--fast", action="store_true", help="use the Fast model for cheap drafts")
        s.set_defaults(fn=fn)
    f = sub.add_parser("frames"); f.add_argument("video"); f.set_defaults(fn=cmd_frames)
    z = sub.add_parser("finalize")
    z.add_argument("--warm", type=int, required=True)
    z.add_argument("--transition", type=int, required=True)
    z.add_argument("--cold", type=int, required=True)
    z.set_defaults(fn=cmd_finalize)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
