"""Grounded-SAM / Grounding DINO on a floor-plan picture, to run ON THE GX10 (it needs a GPU and the Hugging Face models). NOT RUN YET: written from the working cells of
pipeline/notebooks/02_vision_clip.ipynb (the same models and calls), pointed at plans instead of photos. Zero-shot: nothing is trained, and nobody has measured how well Grounding DINO
finds doors and windows on line drawings: that is what the first run must measure against plans with a known truth (server/eval/cases).

  python gx10_extract.py plan.png --outline-m 6.0 8.0 [--out plan.extraction.json]

Writes the extraction format of to_case.py. Convert and check on any machine (from pipeline/oracle):
  python -c "import json; from semantic.to_case import case_from_extraction as c; from usable_oracle.rules import check_case; print(check_case(c(json.load(open('plan.extraction.json')))))"
"""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor, Sam2Model, Sam2Processor

dev = "cuda" if torch.cuda.is_available() else "cpu"
PROMPT = "a room. a bedroom. a living room. a kitchen. a bathroom. a door. a window."  # one prompt: the words Grounding DINO is asked to ground


def detect(im: Image.Image, threshold=0.30, text_threshold=0.25):
    proc = AutoProcessor.from_pretrained("IDEA-Research/grounding-dino-tiny")
    model = AutoModelForZeroShotObjectDetection.from_pretrained("IDEA-Research/grounding-dino-tiny").to(dev).eval()
    inp = proc(images=im, text=PROMPT, return_tensors="pt").to(dev)
    with torch.no_grad():
        out = model(**inp)
    kw = dict(threshold=threshold, text_threshold=text_threshold, target_sizes=[im.size[::-1]])
    try:
        r = proc.post_process_grounded_object_detection(out, inp.input_ids, **kw)[0]
    except TypeError:  # older transformers name the argument box_threshold
        kw["box_threshold"] = kw.pop("threshold")
        r = proc.post_process_grounded_object_detection(out, inp.input_ids, **kw)[0]
    labels = r.get("text_labels", r.get("labels"))
    del model
    torch.cuda.empty_cache()
    return [{"label": str(l), "score": round(float(s), 2), "box": [round(float(v)) for v in b]} for l, s, b in zip(labels, r["scores"], r["boxes"])]


def mask_box(im: Image.Image, box):
    """SAM 2.1 cuts the thing out of the picture from its box; the tight box of the mask is the box the rest of the pipeline uses (the model's own box can include the label text)."""
    proc = Sam2Processor.from_pretrained("facebook/sam2.1-hiera-tiny")
    model = Sam2Model.from_pretrained("facebook/sam2.1-hiera-tiny").to(dev).eval()
    inp = proc(images=im, input_boxes=[[box]], return_tensors="pt").to(dev)
    with torch.no_grad():
        out = model(**inp, multimask_output=False)
    m = proc.post_process_masks(out.pred_masks.cpu(), inp["original_sizes"])[0][0, 0].numpy() > 0
    del model
    torch.cuda.empty_cache()
    ys, xs = np.where(m)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--outline-m", nargs=2, type=float, required=True, metavar=("W", "D"), help="outer dimensions in metres (from the dimension text of the plan)")
    ap.add_argument("--out")
    a = ap.parse_args()
    im = Image.open(a.image).convert("RGB")
    dets = detect(im)
    rooms = [d for d in dets if any(w in d["label"] for w in ("room", "kitchen", "bath"))]
    openings = [{**d, "label": "door" if "door" in d["label"] else "window"} for d in dets if d["label"] in ("door", "window")]
    for d in rooms:
        d["box"] = mask_box(im, d["box"])
    # the outline: with none given, the largest room box stands for the building. A plan with a drawn outline should pass it explicitly (not implemented yet)
    outline = max((d["box"] for d in rooms), key=lambda b: (b[2] - b[0]) * (b[3] - b[1])) if rooms else [0, 0, im.width, im.height]
    ex = {"image": {"w": im.width, "h": im.height}, "outline": outline, "outline_m": a.outline_m, "rooms": rooms, "openings": openings, "models": ["grounding-dino-tiny", "sam2.1-hiera-tiny"]}
    path = Path(a.out or Path(a.image).with_suffix(".extraction.json"))
    path.write_text(json.dumps(ex, indent=1), encoding="utf-8")
    print(len(rooms), "rooms,", len(openings), "openings ->", path)


if __name__ == "__main__":
    main()
