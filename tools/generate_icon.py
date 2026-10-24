#!/usr/bin/env python3
"""Generate ROCKY AI launcher icon + splash art (procedural, original).

Design (per spec): a futuristic blue holographic head inside a CLEAN
CIRCULAR emblem, strong contrast, premium sci-fi identity, NO text
(text would be cropped by adaptive masking). Outputs:
  - mipmap-*/ic_launcher_foreground.png (transparent, adaptive foreground)
  - mipmap-*/ic_launcher.png (square, full-bleed gradient + emblem)
  - mipmap-*/ic_launcher_round.png (circular disc + emblem)
Densities: mdpi 48/108, hdpi 72/162, xhdpi 96/216, xxhdpi 144/324,
xxxhdpi 192/432 (legacy / foreground).
Splash uses the foreground PNG via a layer-list drawable (see
res/drawable/splash_background.xml) — no separate splash image needed.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")

SIZE = 432
CX, CY = SIZE // 2, SIZE // 2


def gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img


def head_mask(size):
    """Silhouette: cranium ellipse + tapering jaw + ear hints."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    s = size / 432.0
    d.ellipse([138 * s, 108 * s, 294 * s, 282 * s], fill=255)
    d.polygon([
        (150 * s, 225 * s), (282 * s, 225 * s),
        (268 * s, 315 * s), (216 * s, 348 * s), (164 * s, 315 * s),
    ], fill=255)
    d.ellipse([126 * s, 212 * s, 150 * s, 256 * s], fill=255)
    d.ellipse([282 * s, 212 * s, 306 * s, 256 * s], fill=255)
    return m


def foreground(size):
    """Transparent adaptive foreground: ring + holographic head + eyes."""
    s = size / 432.0
    art = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Glow pass (blurred head silhouette in cyan, behind everything).
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    mask = head_mask(size)
    glow.paste(Image.new("RGBA", (size, size), (34, 211, 238, 110)), (0, 0), mask)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=18 * s))
    art.alpha_composite(glow)
    # Head body: vertical blue gradient through the silhouette mask.
    body = gradient(size, (122, 178, 255), (24, 74, 220))
    art.paste(body, (0, 0), mask)
    d = ImageDraw.Draw(art)
    # Outer ring (the clean circular emblem edge).
    d.ellipse([66 * s, 66 * s, 366 * s, 366 * s], outline=(34, 211, 238, 255), width=max(2, int(9 * s)))
    d.ellipse([80 * s, 80 * s, 352 * s, 352 * s], outline=(125, 211, 252, 120), width=max(1, int(2 * s)))
    # Circuit accents on the ring (small dots, no text).
    for ang, r in [(35, 150), (145, 150), (215, 150), (325, 150)]:
        import math
        x = CX * s + r * s * math.cos(math.radians(ang))
        y = CY * s + r * s * math.sin(math.radians(ang))
        d.ellipse([x - 6 * s, y - 6 * s, x + 6 * s, y + 6 * s], fill=(165, 243, 252, 255))
    # Eyes: glowing visor bars.
    for (x0, x1) in [(163, 205), (227, 269)]:
        d.rounded_rectangle([x0 * s, 192 * s, x1 * s, 214 * s], radius=9 * s,
                            fill=(224, 254, 255, 255), outline=(34, 211, 238, 255), width=max(2, int(3 * s)))
    # Forehead diamond.
    d.polygon([(216 * s, 138 * s), (228 * s, 152 * s), (216 * s, 166 * s), (204 * s, 152 * s)],
              fill=(34, 211, 238, 255))
    # Brow, nose hint, mouth (subtle, recognisable features).
    d.arc([155 * s, 168 * s, 277 * s, 200 * s], start=200, end=340, fill=(191, 219, 254, 220), width=max(2, int(3 * s)))
    d.line([216 * s, 218 * s, 216 * s, 258 * s], fill=(147, 197, 253, 200), width=max(2, int(4 * s)))
    d.line([206 * s, 258 * s, 226 * s, 258 * s], fill=(147, 197, 253, 200), width=max(2, int(4 * s)))
    d.arc([188 * s, 272 * s, 244 * s, 296 * s], start=15, end=165, fill=(147, 197, 253, 220), width=max(2, int(3 * s)))
    return art


def main():
    fg432 = foreground(432)
    # Square full-bleed version: gradient background + foreground art.
    square432 = gradient(432, (10, 25, 48), (18, 58, 122))
    square432.alpha_composite(fg432)
    # Round version: circular disc + foreground art.
    disc = gradient(432, (10, 25, 48), (18, 58, 122))
    circ_mask = Image.new("L", (432, 432), 0)
    ImageDraw.Draw(circ_mask).ellipse([0, 0, 432, 432], fill=255)
    round432 = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    round432.paste(disc, (0, 0), circ_mask)
    round432.alpha_composite(fg432)
    densities = {
        "mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
        "xxhdpi": (144, 324), "xxxhdpi": (192, 432),
    }
    for dpi, (legacy, fg) in densities.items():
        d = os.path.join(RES, f"mipmap-{dpi}")
        os.makedirs(d, exist_ok=True)
        fg432.resize((fg, fg), Image.LANCZOS).save(os.path.join(d, "ic_launcher_foreground.png"))
        square432.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
        round432.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher_round.png"))
        print(dpi, "foreground", fg, "legacy/round", legacy)
    print("done")


if __name__ == "__main__":
    main()
