"""CLIP as a small local service: zero-shot image classification against text labels.

Run (from the project folder):
    .venv\Scripts\python -m uvicorn clip_service:app --port 5001 --app-dir pipeline/services

The app server (server/ai.js) calls POST /classify {image: data URL, labels: [text, ...]} and gets one probability per label.
The model is OpenAI CLIP ViT-B/32 from Hugging Face (about 600 MB, downloaded once into the Hugging Face cache); set CLIP_MODEL for another one.
It runs on the laptop's GPU when there is one, otherwise on the CPU. The same file runs on the GX10 inside a capped container.
"""
import base64
import io
import os
import time

import torch
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel
from transformers import CLIPModel, CLIPProcessor

MODEL = os.environ.get("CLIP_MODEL", "openai/clip-vit-base-patch32")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
model = CLIPModel.from_pretrained(MODEL).to(DEVICE).eval()
processor = CLIPProcessor.from_pretrained(MODEL)
app = FastAPI(title="clip-service")


class Request(BaseModel):
    image: str  # a data URL (data:image/...;base64,....)
    labels: list[str]


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "device": DEVICE}


@app.post("/classify")
def classify(req: Request):
    if not req.labels or len(req.labels) > 64:
        raise HTTPException(400, "send between 1 and 64 labels")
    try:
        raw = base64.b64decode(req.image.split(",", 1)[1])
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"not an image: {e}") from e
    t0 = time.time()
    inputs = processor(text=req.labels, images=img, return_tensors="pt", padding=True).to(DEVICE)
    with torch.no_grad():
        logits = model(**inputs).logits_per_image
    scores = logits.softmax(dim=1)[0].tolist()
    return {"scores": scores, "model": MODEL, "device": DEVICE, "ms": round((time.time() - t0) * 1000)}
