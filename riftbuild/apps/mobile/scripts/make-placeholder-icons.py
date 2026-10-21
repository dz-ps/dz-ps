"""Original placeholder app icons (no Riot art, no official logos; spec §8).

A hexagon outline with three ascending bars (a build getting stronger). Replace with final art before
publishing. Run: uv run --project ../../pipeline python scripts/make-placeholder-icons.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (11, 14, 20, 255)
GOLD = (232, 179, 65, 255)
WHITE = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "assets"
SS = 4  # supersampling for smooth edges


def motif(size: int, scale: float, color, background=None) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = big / 2
    r = big * scale / 2
    hexagon = [(cx + r * math.cos(math.radians(60 * i - 90)), cy + r * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    d.polygon(hexagon, outline=color, width=max(1, int(r * 0.11)))
    bar_w = r * 0.24
    gap = r * 0.12
    base = cy + r * 0.42
    heights = (0.42, 0.66, 0.9)
    left = cx - (3 * bar_w + 2 * gap) / 2
    for i, h in enumerate(heights):
        x0 = left + i * (bar_w + gap)
        d.rounded_rectangle([x0, base - r * h, x0 + bar_w, base], radius=bar_w * 0.25, fill=color)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    icon = motif(1024, 0.72, GOLD, BG).convert("RGB")
    icon.save(OUT / "icon.png", optimize=True)
    motif(512, 0.5, GOLD).save(OUT / "android-icon-foreground.png", optimize=True)  # adaptive safe zone
    Image.new("RGBA", (512, 512), BG).save(OUT / "android-icon-background.png", optimize=True)
    motif(432, 0.55, WHITE).save(OUT / "android-icon-monochrome.png", optimize=True)
    motif(1024, 0.6, GOLD).save(OUT / "splash-icon.png", optimize=True)
    motif(48, 0.86, GOLD, BG).save(OUT / "favicon.png", optimize=True)


if __name__ == "__main__":
    main()
