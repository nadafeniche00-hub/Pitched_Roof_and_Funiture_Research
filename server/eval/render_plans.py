"""Draws the cases of make_cases.mjs as plain floor-plan pictures: walls in black, the room name in the middle of each room, the outline dimensions along the top and the left.
No per-room dimensions are written, so the model has to measure the rooms from the drawing. Clean and synthetic: the results are the best case, not the typical one.
python server/eval/render_plans.py"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
CASES = HERE / "cases"
SCALE, MARGIN = 90, 110
LABEL = {"bedroom": "Bedroom", "child": "Child room", "living": "Living room", "kitchen": "Kitchen", "study": "Study", "bath": "Bathroom", "wc": "WC", "storage": "Storage", "hall": "Hall"}


def font(size):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


for f in sorted(CASES.glob("case_*.json")):
    case = json.loads(f.read_text(encoding="utf-8"))
    w, d = case["footprint"]["w"], case["footprint"]["d"]
    img = Image.new("RGB", (int(w * SCALE) + 2 * MARGIN, int(d * SCALE) + 2 * MARGIN), "white")
    g = ImageDraw.Draw(img)
    for r in case["rooms"]:
        x0, y0 = MARGIN + r["x"] * SCALE, MARGIN + r["y"] * SCALE
        x1, y1 = x0 + r["w"] * SCALE, y0 + r["d"] * SCALE
        g.rectangle([x0, y0, x1, y1], outline="black", width=4)
        label = LABEL.get(r["type"], r["type"])
        fnt = font(20)
        tw = g.textlength(label, font=fnt)
        g.text(((x0 + x1) / 2 - tw / 2, (y0 + y1) / 2 - 10), label, fill="black", font=fnt)
    g.rectangle([MARGIN, MARGIN, MARGIN + w * SCALE, MARGIN + d * SCALE], outline="black", width=8)
    fnt = font(24)
    top = f"{w:.2f} m"
    g.text((MARGIN + w * SCALE / 2 - g.textlength(top, font=fnt) / 2, MARGIN - 48), top, fill="black", font=fnt)
    left = Image.new("RGBA", (200, 40), (255, 255, 255, 0))
    ImageDraw.Draw(left).text((0, 4), f"{d:.2f} m", fill="black", font=fnt)
    left = left.rotate(90, expand=True)
    img.paste(left, (MARGIN - 56, MARGIN + int(d * SCALE / 2) - 100), left)
    img.save(CASES / f"{case['name']}.png")
print("drawn:", len(list(CASES.glob('case_*.png'))))
