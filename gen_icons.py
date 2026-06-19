# Test Cases: None required. Static icon generation script.
"""
EcoSprout icon generator — produces icons/icon16.png, icon48.png, icon128.png.
Pure PIL, no external assets, so it's fully reproducible. Re-run any time
you want to tweak the colors or proportions.
"""
from PIL import Image, ImageDraw
import os

os.makedirs('icons', exist_ok=True)

OUTER = (15, 36, 28, 255)     # deep moss
INNER = (31, 107, 69, 255)    # chlorophyll-deep
LEAF = (223, 250, 235, 255)   # pale mist


def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(1, int(size * 0.04))
    draw.ellipse([margin, margin, size - margin, size - margin], fill=OUTER)

    inner_margin = margin + int(size * 0.05)
    draw.ellipse([inner_margin, inner_margin, size - inner_margin, size - inner_margin], fill=INNER)

    leaf_w, leaf_h = max(2, int(size * 0.30)), max(3, int(size * 0.46))
    leaf = Image.new('RGBA', (leaf_w, leaf_h), (0, 0, 0, 0))
    ImageDraw.Draw(leaf).ellipse([0, 0, leaf_w - 1, leaf_h - 1], fill=LEAF)

    leaf_left = leaf.rotate(38, expand=True, resample=Image.BICUBIC)
    leaf_right = leaf.rotate(-38, expand=True, resample=Image.BICUBIC)

    cx, cy = size // 2, int(size * 0.40)
    gap = max(1, int(size * 0.01))
    img.paste(leaf_left, (cx - leaf_left.width - gap, cy - leaf_left.height // 2), leaf_left)
    img.paste(leaf_right, (cx + gap, cy - leaf_right.height // 2), leaf_right)

    stem_w = max(2, int(size * 0.05))
    draw.rounded_rectangle(
        [cx - stem_w // 2, cy - int(size * 0.02), cx + stem_w // 2, int(size * 0.84)],
        radius=stem_w // 2, fill=LEAF
    )
    return img


for s in (16, 48, 128):
    make_icon(s).save(f'icons/icon{s}.png')

print('Icons generated:', os.listdir('icons'))
