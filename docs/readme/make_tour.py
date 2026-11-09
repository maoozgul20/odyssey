"""Rebuild docs/readme/tour.gif from the screenshots in docs/screenshots.

Run from the repository root after taking new screenshots:
    pip install pillow
    python docs/readme/make_tour.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "docs" / "readme" / "tour.gif"
SLIDES = [
    ("01-home.png", "HOME", "Six stations, one universe"),
    ("02-mission-control.png", "STATION 1 · MISSION CONTROL", "Apollo 13 replayed in mission time"),
    ("03-decision.png", "STATION 1 · CRISIS DECISION", "The clock stops. Your call."),
    ("04-decision-result.png", "STATION 1 · VERDICT", "Houston's real decision, retrieved from the transcript"),
    ("06-mars.png", "STATION 2 · MARS", "CLIP image search + cited briefing"),
    ("07-starship.png", "STATION 3 · STARSHIP", "Table RAG over 6,000 exoplanets"),
    ("08-planet-lab.png", "STATION 4 · PLANET LAB", "Three AI scientists debate your planet"),
    ("09-knowledge-map.png", "STATION 5 · KNOWLEDGE MAP", "GraphRAG across every station"),
    ("10-evaluation.png", "EVALUATION", "Retrieval quality, measured"),
]
SIZE = (880, 550)
MINT = (78, 229, 154)


def font(size):
    for name in ("DejaVuSansMono-Bold.ttf", "consolab.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def slide(path, tag, text):
    im = Image.open(path).convert("RGB").resize(SIZE, Image.LANCZOS)
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([0, SIZE[1] - 64, SIZE[0], SIZE[1]], fill=(6, 11, 20, 225))
    d.rectangle([0, SIZE[1] - 64, 4, SIZE[1]], fill=MINT)
    d.text((22, SIZE[1] - 54), tag, font=font(13), fill=MINT)
    d.text((22, SIZE[1] - 32), text, font=font(17), fill=(239, 238, 230))
    return im


frames, durations = [], []
slides = [slide(SHOTS / f, t, s) for f, t, s in SLIDES if (SHOTS / f).exists()]
for i, im in enumerate(slides):
    frames.append(im)
    durations.append(2600)
    nxt = slides[(i + 1) % len(slides)]
    for a in (0.25, 0.5, 0.75):  # crossfade
        frames.append(Image.blend(im, nxt, a))
        durations.append(90)
pal = [f.quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
pal[0].save(OUT, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(f"Saved {OUT} ({OUT.stat().st_size / 1e6:.1f} MB, {len(slides)} slides)")
