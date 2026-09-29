"""Generate PWA icons. Run: uv run --with pillow python web/scripts/make_icons.py"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
EMERALD = (5, 150, 105)
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def icon(size: int, radius_ratio: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size, size), radius=int(size * radius_ratio), fill=EMERALD)
    font = ImageFont.truetype(FONT, int(size * 0.62))
    draw.text((size / 2, size / 2), "đ", font=font, fill="white", anchor="mm")
    return img


OUT.mkdir(parents=True, exist_ok=True)
icon(192, 0.22).save(OUT / "icon-192.png")
icon(512, 0.22).save(OUT / "icon-512.png")
icon(180, 0).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
