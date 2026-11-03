"""The adapter from the Modified Swiss Dwellings table (mds_V2_5.372k.csv, see scan_dataset.py) to plain records the calibration reads. Standard library only.

One row = one entity of a plan: entity_type area (a room: entity_subtype, roomtype), separator (WALL, COLUMN) or opening (DOOR, WINDOW, ENTRANCE_DOOR); geom = a WKT polygon in metres.
For every polygon we keep its area and the sides of its best-fitting rectangle (the rectangle of least area that holds it, found over the edges of its convex hull): the short side is the
width of a room or the thickness of a wall, the long side the width of a door or a window. Only residential units count. The room polygons are the areas between the walls (the walls are
separate polygons), so they are directly comparable with the "net" rooms of the rules.
"""
from __future__ import annotations

import csv
import math
import sys
from typing import Iterator

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

# MSD room type -> the type names of the app (shared/plans.js ROOM_TYPES). MSD has no child room, no study and no WC: bedrooms stand for the first two, bathrooms include the WC.
TYPE_OF = {"Bedroom": "bedroom", "Bathroom": "bath", "Kitchen": "kitchen", "Livingroom": "living", "Storeroom": "storage", "Corridor": "hall"}


def parse_polygon(wkt: str) -> list[list[tuple[float, float]]]:
    """'POLYGON ((x y, x y, ...), (hole))' -> a list of rings (the first is the outside). MULTIPOLYGON is not used by this table."""
    s = wkt.strip()
    if not s.upper().startswith("POLYGON"):
        raise ValueError("not a POLYGON: " + s[:30])
    body = s[s.index("(") :]
    rings, depth, cur = [], 0, ""
    for ch in body:
        if ch == "(":
            depth += 1
            if depth == 2:
                cur = ""
        elif ch == ")":
            if depth == 2:
                pts = []
                for pair in cur.split(","):
                    x, y = pair.split()[:2]
                    pts.append((float(x), float(y)))
                rings.append(pts)
            depth -= 1
        elif depth == 2:
            cur += ch
    return rings


def ring_area(pts: list[tuple[float, float]]) -> float:
    """Shoelace area of one ring (absolute value)."""
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2


def polygon_area(rings) -> float:
    return ring_area(rings[0]) - sum(ring_area(h) for h in rings[1:])


def _hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def min_rect_sides(ring: list[tuple[float, float]]) -> tuple[float, float]:
    """(long side, short side) of the smallest-area rectangle that holds the ring, in any rotation."""
    hull = _hull(ring)
    if len(hull) < 3:
        return 0.0, 0.0
    best = None
    for i in range(len(hull)):
        (x0, y0), (x1, y1) = hull[i], hull[(i + 1) % len(hull)]
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 1e-9:
            continue
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        us = [(x - x0) * ux + (y - y0) * uy for x, y in hull]
        vs = [-(x - x0) * uy + (y - y0) * ux for x, y in hull]
        w, h = max(us) - min(us), max(vs) - min(vs)
        if best is None or w * h < best[0]:
            best = (w * h, w, h)
    return (max(best[1], best[2]), min(best[1], best[2])) if best else (0.0, 0.0)


def read_entities(path: str, residential_only: bool = True) -> Iterator[dict]:
    """Rows of the table as { plan, unit, kind: 'area'|'wall'|'door'|'window'|..., subtype, roomtype, area, long, short, height }. Polygons that cannot be read are skipped and counted by the caller."""
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            if residential_only and row["unit_usage"] != "RESIDENTIAL":
                continue
            try:
                rings = parse_polygon(row["geom"])
                long_side, short_side = min_rect_sides(rings[0])
                area = polygon_area(rings)
            except (ValueError, IndexError):
                yield {"bad": True}
                continue
            sub = row["entity_subtype"]
            kind = row["entity_type"] if row["entity_type"] == "area" else {"WALL": "wall", "COLUMN": "column", "DOOR": "door", "ENTRANCE_DOOR": "entrance_door", "WINDOW": "window"}.get(sub, sub.lower())
            try:
                height = float(row["height"])
            except ValueError:
                height = None
            yield {"plan": row["plan_id"], "unit": row["unit_id"], "kind": kind, "subtype": sub, "roomtype": row["roomtype"], "area": area, "long": long_side, "short": short_side, "height": height}


def room_records(entities: Iterator[dict]) -> Iterator[dict]:
    """The records calibrate.py reads: one per room of a type the app knows. net_width is the short side of the best-fitting rectangle."""
    for e in entities:
        if e.get("kind") == "area" and e["roomtype"] in TYPE_OF:
            yield {"type": TYPE_OF[e["roomtype"]], "net_area": e["area"], "net_width": e["short"], "plan": e["plan"]}
