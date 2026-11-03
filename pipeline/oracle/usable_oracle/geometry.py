"""Plain geometry for the rule system: axis-aligned rectangles (x0, y0, x1, y1) in metres, x right, y down. Standard library only.

The app draws walls as rectangles (the outer walls as four bands inside the footprint, every partition wall as a strip on a room edge), so rectangles are all the rules need.
"""
from __future__ import annotations

Rect = tuple[float, float, float, float]


def w(r: Rect) -> float:
    return r[2] - r[0]


def h(r: Rect) -> float:
    return r[3] - r[1]


def area(r: Rect) -> float:
    return max(0.0, w(r)) * max(0.0, h(r))


def overlap(a: Rect, b: Rect) -> tuple[float, float]:
    """(overlap along x, overlap along y); both above zero means the rectangles share area."""
    return min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])


def inter_area(a: Rect, b: Rect) -> float:
    ox, oy = overlap(a, b)
    return ox * oy if ox > 0 and oy > 0 else 0.0


def gap(a: Rect, b: Rect) -> float:
    """Distance between two rectangles (0 when they touch or overlap)."""
    dx = max(a[0] - b[2], b[0] - a[2], 0.0)
    dy = max(a[1] - b[3], b[1] - a[3], 0.0)
    return (dx * dx + dy * dy) ** 0.5


def span_overlap(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Length two intervals share (negative when apart)."""
    return min(a[1], b[1]) - max(a[0], b[0])


def wall_solids(case: dict) -> list[dict]:
    """Every solid piece of wall of a case: the four outer bands and the partition walls cut by their openings.

    thickness.outer is the outer wall (inside the footprint, outer face on its edge); thickness.inner the partition, centred on its line.
    Returns [{ 'kind': 'outer' | 'partition', 'name': str, 'rect': Rect }].
    """
    W, D = case["room"]["width"], case["room"]["depth"]
    to, ti = case["thickness"]["outer"], case["thickness"]["inner"]
    out = [
        {"kind": "outer", "name": "N", "rect": (0.0, 0.0, W, to)},
        {"kind": "outer", "name": "S", "rect": (0.0, D - to, W, D)},
        {"kind": "outer", "name": "W", "rect": (0.0, to, to, D - to)},
        {"kind": "outer", "name": "E", "rect": (W - to, to, W, D - to)},
    ]
    for i, wl in enumerate(case["walls"]):
        (x0, y0), (x1, y1) = wl["p0"], wl["p1"]
        vertical = abs(x0 - x1) < 1e-6
        a, b = (min(y0, y1), max(y0, y1)) if vertical else (min(x0, x1), max(x0, x1))
        c = x0 if vertical else y0
        pieces, start = [], a
        for o0, o1 in sorted((a + s, a + e) for s, e in wl.get("op", [])):
            if o0 > start + 1e-6:
                pieces.append((start, o0))
            start = max(start, o1)
        if b > start + 1e-6:
            pieces.append((start, b))
        for s, e in pieces:
            rect = (c - ti / 2, s, c + ti / 2, e) if vertical else (s, c - ti / 2, e, c + ti / 2)
            out.append({"kind": "partition", "name": f"wall{i}{'v' if vertical else 'h'}@{c:.2f}", "rect": rect})
    return out
