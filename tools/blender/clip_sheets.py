"""Join the per-phase renders of review_clips.py into one labelled strip per clip."""
import os, sys
from PIL import Image, ImageDraw

out = sys.argv[1]
for meta in sorted(f for f in os.listdir(out) if f.endswith(".frames")):
    name = meta[1:-7]
    lines = open(os.path.join(out, meta)).read().split("\n")
    frames = [Image.open(p) for p in lines[1:] if os.path.exists(p)]
    if not frames:
        continue
    w, h = frames[0].size
    strip = Image.new("RGB", (w * len(frames), h + 22), (30, 34, 38))
    for i, im in enumerate(frames):
        strip.paste(im, (i * w, 22))
    ImageDraw.Draw(strip).text((6, 5), f"{name}  frames {lines[0]}", fill=(240, 240, 240))
    strip.save(os.path.join(out, f"{name}.png"))
    for p in lines[1:]:
        if os.path.exists(p):
            os.remove(p)
    os.remove(os.path.join(out, meta))
    print(name)
