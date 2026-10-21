"""Turn the before/after junction renders into labelled side-by-side JPEGs for the README.

Usage: python make_comparisons.py RENDERS_DIR OUT_DIR
Reads junction-NN-before.png / junction-NN-after.png and writes OUT_DIR/junction-NN.jpg.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
except OSError:
    font = ImageFont.load_default()

for before_path in sorted(src.glob("junction-??-before.png")):
    nn = before_path.name[9:11]
    before = Image.open(before_path).convert("RGB")
    after = Image.open(src / f"junction-{nn}-after.png").convert("RGB")
    w, h = before.size
    gap = 8
    sheet = Image.new("RGB", (w * 2 + gap, h), (255, 255, 255))
    sheet.paste(before, (0, 0))
    sheet.paste(after, (w + gap, 0))
    draw = ImageDraw.Draw(sheet)
    for x, label, colour in ((0, "BEFORE", (192, 58, 43)), (w + gap, "AFTER", (40, 120, 60))):
        draw.rectangle([x + 16, 16, x + 16 + 150, 62], fill=colour)
        draw.text((x + 30, 22), label, fill=(255, 255, 255), font=font)
    if sheet.width > 2000:  # keep README images light
        sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.save(out / f"junction-{nn}.jpg", quality=85, optimize=True)
    print(out / f"junction-{nn}.jpg")
