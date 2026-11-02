"""deck_images.py <dir with revit_<name>.png> <deck img dir> <name>...: the pictures Revit exported, as 1280 x 800 JPEG (quality 86) revit_<name>.jpg for the deck.
A picture that is missing is skipped; presentation/build.mjs shows a marked placeholder for it until the demo has been run."""
import os
import sys
from PIL import Image

src_dir, dst_dir = sys.argv[1], sys.argv[2]
for name in sys.argv[3:]:
    src = os.path.join(src_dir, "revit_" + name + ".png")
    if not os.path.exists(src):
        print("missing", src)
        continue
    im = Image.open(src).convert("RGB")
    w, h = im.size
    box = min(w / 1280, h / 800)  # crop to the 8:5 of the deck, from the centre, then scale
    cw, ch = round(1280 * box), round(800 * box)
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    dst = os.path.join(dst_dir, "revit_" + name + ".jpg")
    im.crop((x0, y0, x0 + cw, y0 + ch)).resize((1280, 800), Image.LANCZOS).save(dst, quality=86, optimize=True)
    print(dst, os.path.getsize(dst) // 1024, "KB")
