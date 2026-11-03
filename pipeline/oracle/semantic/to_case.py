"""From what Grounded-SAM and Grounding DINO see in a floor-plan picture (boxes in pixels) to the case the rules check (rectangles and walls in metres). Pure Python, no models.

The models say WHAT is where (a room called "bedroom", a window symbol on the north wall); this file turns pixels into metres with the outline dimensions the plan carries, and builds the walls
the way the app does (the unique inner edges of the room rectangles, stopped at the inner face of the outer wall). It never tidies the rooms: overlaps, holes and sticking out are what
usable_oracle.rules then measure. The wall thicknesses are the app's (WALLS), unless the picture gives its own.

Extraction format (what gx10_extract.py writes):
  { "image": { "w": px, "h": px }, "outline": [x0, y0, x1, y1] (px, the outer face of the outer wall),
    "outline_m": [W, D] (metres, read from the dimension text or given),
    "rooms": [ { "label": "Schlafen", "box": [x0, y0, x1, y1], "score": 0.8 } ],
    "openings": [ { "label": "window" | "door", "box": [x0, y0, x1, y1], "score": 0.7 } ] }
"""
from __future__ import annotations

EDGE = 0.15  # m: a room edge this close to the outline is taken to be on it (a drawing is never exact to the pixel)
TYPE_WORDS = {
    "bedroom": ("bedroom", "schlaf", "master"),
    "child": ("child", "kind"),
    "living": ("living", "wohn", "lounge"),
    "kitchen": ("kitchen", "küche", "kueche", "kochen"),
    "study": ("study", "office", "arbeit", "büro", "buero"),
    "bath": ("bath", "bad", "dusch"),
    "wc": ("wc", "toilet", "gäste", "gaeste"),
    "storage": ("storage", "abstell", "kammer", "store"),
    "hall": ("hall", "flur", "diele", "corridor", "stair", "treppe"),
}


def room_type(label: str) -> str:
    low = (label or "").lower()
    for t, words in TYPE_WORDS.items():
        if any(w in low for w in words):
            return t
    return "unknown"


def _to_m(box, outline, sx, sy):
    return [(box[0] - outline[0]) * sx, (box[1] - outline[1]) * sy, (box[2] - outline[0]) * sx, (box[3] - outline[1]) * sy]


def _snap(rect, W, D):
    x0, y0, x1, y1 = rect
    x0 = 0.0 if x0 < EDGE else x0
    y0 = 0.0 if y0 < EDGE else y0
    x1 = W if x1 > W - EDGE else x1
    y1 = D if y1 > D - EDGE else y1
    return [x0, y0, x1, y1]


def partition_walls(rects: list[list[float]], W: float, D: float, outer: float, doors: list[dict] | None = None) -> list[dict]:
    """One wall per line: the unique inner edges of the rectangles, joined where they touch, stopped at the inner face of the outer wall, with the doors cut in as openings."""
    lines: dict[tuple[str, float], list[list[float]]] = {}
    for x0, y0, x1, y1 in rects:
        for x in (x0, x1):
            if EDGE < x < W - EDGE:
                lines.setdefault(("v", round(x, 2)), []).append([y0, y1])
        for y in (y0, y1):
            if EDGE < y < D - EDGE:
                lines.setdefault(("h", round(y, 2)), []).append([x0, x1])
    walls = []
    for (kind, c), spans in sorted(lines.items()):
        merged: list[list[float]] = []
        for a, b in sorted(spans):
            if merged and a <= merged[-1][1] + 0.02:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        lim = D if kind == "v" else W
        for a, b in merged:
            a = outer if a < 0.02 else a
            b = lim - outer if b > lim - 0.02 else b
            if b - a < 0.05:
                continue
            op = []
            for d in doors or []:
                dc, dalong = (d["mid"][0], d["mid"][1]) if kind == "v" else (d["mid"][1], d["mid"][0])
                if abs(dc - c) < 0.1 and a - 1e-6 <= dalong <= b + 1e-6:
                    half = d.get("width", 0.9) / 2
                    op.append([max(0.0, dalong - half - a), min(b - a, dalong + half - a)])
            p0, p1 = ([c, a], [c, b]) if kind == "v" else ([a, c], [b, c])
            walls.append({"p0": [round(v, 3) for v in p0], "p1": [round(v, 3) for v in p1], "op": op})
    return walls


def _gap_to(pt, rect):
    dx = max(rect[0] - pt[0], 0.0, pt[0] - rect[2])
    dy = max(rect[1] - pt[1], 0.0, pt[1] - rect[3])
    return (dx * dx + dy * dy) ** 0.5


def case_from_extraction(ex: dict, case_id: str = "extracted", thickness: dict | None = None, types: dict | None = None) -> dict:
    ox0, oy0, ox1, oy1 = ex["outline"]
    W, D = ex["outline_m"]
    sx, sy = W / (ox1 - ox0), D / (oy1 - oy0)
    th = thickness or {"outer": 0.365, "inner": 0.115}
    rooms = []
    for i, r in enumerate(ex["rooms"]):
        rect = _snap(_to_m(r["box"], ex["outline"], sx, sy), W, D)
        t = room_type(r.get("label", ""))
        rooms.append({"id": f"{t}{i + 1}", "type": t, "rect": [round(v, 3) for v in rect], "score": r.get("score")})
    windows, doors = [], []
    for o in ex.get("openings", []):
        x0, y0, x1, y1 = _to_m(o["box"], ex["outline"], sx, sy)
        if o["label"] == "window":
            # on the outer wall it is nearest to: N/S windows run along x, W/E windows along y
            dist = {"N": y0, "S": D - y1, "W": x0, "E": W - x1}
            side = min(dist, key=dist.get)
            along = (x0, x1) if side in ("N", "S") else (y0, y1)
            windows.append({"wall": side, "pos": round((along[0] + along[1]) / 2, 3), "width": round(along[1] - along[0], 3)})
        elif o["label"] == "door":
            mid = ((x0 + x1) / 2, (y0 + y1) / 2)
            near = sorted(rooms, key=lambda r: _gap_to(mid, r["rect"]))[:2]
            if len(near) == 2:
                doors.append({"a": near[0]["id"], "b": near[1]["id"], "mid": [round(mid[0], 3), round(mid[1], 3)], "vertical": (x1 - x0) < (y1 - y0), "width": round(max(x1 - x0, y1 - y0), 3)})
    return {
        "id": case_id,
        "room": {"width": W, "depth": D, "windows": windows, "doors": [], "stair": None},
        "thickness": th,
        "types": types or {},
        "rooms": rooms,
        "doors": doors,
        "walls": partition_walls([r["rect"] for r in rooms], W, D, th["outer"], doors),
        "furniture": [],
        "source": "semantic extraction (Grounded-SAM, Grounding DINO): unverified until the rules have run",
    }
