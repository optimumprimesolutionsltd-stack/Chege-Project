"""
Builds the 1200x630 card that WhatsApp, X, LinkedIn and Slack show when
somebody shares a Jamvi link.

The site declared `twitter:card: summary_large_image` while pointing at a
512x512 logo. A large-image card wants roughly 1.91:1; given a square, the
platforms either crop it badly or quietly demote the card to a thumbnail. A
shared link is often the first time anybody sees the brand, so it is worth an
image built for the slot.

Light ground because the wordmark is navy with teal and gold accents - on the
brand navy it would disappear.

Run: python scripts/generate-og-image.py
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANDING = ROOT / "public" / "branding"
OUT = BRANDING / "jamvi-og.png"

W, H = 1200, 630
NAVY = (23, 43, 99)
TEAL = (27, 154, 138)
GOLD = (228, 167, 44)
GROUND = (252, 251, 248)
MUTED = (104, 112, 128)

FONTS = Path("C:/Windows/Fonts")


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def centre(draw, text, fnt, y, fill):
    left, top, right, bottom = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((W - (right - left)) / 2 - left, y), text, font=fnt, fill=fill)
    return bottom - top


card = Image.new("RGB", (W, H), GROUND)
draw = ImageDraw.Draw(card)

# A wash of brand colour in the corners, kept faint so the wordmark stays the
# loudest thing on the card.
glow = Image.new("RGB", (W, H), GROUND)
gd = ImageDraw.Draw(glow)
gd.ellipse([-260, -320, 520, 300], fill=TEAL)
gd.ellipse([820, 380, 1500, 900], fill=GOLD)
card = Image.blend(card, glow.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(150)), 0.13)
draw = ImageDraw.Draw(card)

# The wordmark, sized to leave the text room to breathe.
mark = Image.open(BRANDING / "jamvi-horizontal-transparent.png").convert("RGBA")
target_w = 620
mark = mark.resize((target_w, round(mark.height * target_w / mark.width)), Image.LANCZOS)
card.paste(mark, ((W - mark.width) // 2, 150), mark)

# The slogan carries the brand; the line under it carries the search terms, and
# is what a person skims to decide whether this is for them.
centre(draw, "Pesa yetu, wazi", font("georgiab.ttf", 46), 350, NAVY)
centre(draw, "Chama, family and household budgeting - built in Kenya", font("calibri.ttf", 32), 424, MUTED)

draw.line([(W / 2 - 90, 495), (W / 2 + 90, 495)], fill=TEAL, width=4)
centre(draw, "jamvi.co.ke", font("calibrib.ttf", 28), 522, TEAL)

card.save(OUT, "PNG", optimize=True)
print(f"Wrote {OUT.relative_to(ROOT)} ({card.width}x{card.height})")
