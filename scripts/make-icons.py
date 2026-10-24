#!/usr/bin/env python3
"""Generate the PWA icons (a green ticket with a dollar sign, on black). Requires Pillow.

    python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BG = (0, 0, 0, 255)
TICKET = (47, 224, 107, 255)
STUB = (20, 140, 60, 255)


def ticket(size, scale):
    """Draw the ticket at `size` px; `scale` shrinks it for the maskable safe zone."""
    ss = 4  # supersample for smooth edges
    s = size * ss
    img = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(img)
    w, h = s * 0.80 * scale, s * 0.52 * scale
    x0, y0 = (s - w) / 2, (s - h) / 2
    x1, y1 = x0 + w, y0 + h
    d.rounded_rectangle((x0, y0, x1, y1), radius=h * 0.12, fill=TICKET)
    # notches punched out of the left and right edges
    r = h * 0.14
    for cx in (x0, x1):
        d.ellipse((cx - r, (y0 + y1) / 2 - r, cx + r, (y0 + y1) / 2 + r), fill=BG)
    # perforation between stub and body
    px = x0 + w * 0.28
    dash = h * 0.07
    y = y0 + h * 0.08
    while y < y1 - h * 0.08:
        d.rectangle((px - dash / 3, y, px + dash / 3, y + dash), fill=STUB)
        y += dash * 2
    # dollar sign on the body
    from PIL import ImageFont
    font = ImageFont.load_default(size=int(h * 0.62))
    d.text((x0 + w * 0.64, (y0 + y1) / 2), "$", font=font, fill=BG, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
ticket(192, 1.0).save(OUT / "icon-192.png")
ticket(512, 1.0).save(OUT / "icon-512.png")
ticket(512, 0.78).save(OUT / "icon-maskable-512.png")
print("wrote icons to", OUT)
