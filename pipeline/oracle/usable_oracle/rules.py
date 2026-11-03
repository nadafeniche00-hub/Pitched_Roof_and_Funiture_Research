"""The rules: pure functions of a case (plain dicts, see export_cases.mjs) that return violations. Standard library only.

Every rule says where its number comes from:
  app        a rule of thumb of the app (shared/plans.js ROOM_TYPES, shared/knowledge.js), not a requirement of a code
  ResPlan    Abouagour and Garyfallidis, arXiv:2508.14006: their automated checks and the values they report for 17,000 residential plans
  MSD        van Engelenburg et al., ECCV 2024, arXiv:2407.10121: how its access graph joins areas and doors
  geometry   arithmetic that needs no source: two solid things cannot occupy the same place
The references give no minimum room size: the "too small" rules are the app's own and are provisional until they are compared with the percentiles of real plans (msd/ in this folder).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from . import geometry as g

EDGE = 0.02  # m: a room edge or wall end within this of the footprint boundary is on it
HALL_MIN = 1.2  # m, shared/plans.js HALL.min
# Provisional minimum NET floor area per room type (m2), after the wall thickness is taken off. Planning rules of thumb, not a code requirement; calibrate against real plans (msd/).
MIN_NET_AREA = {"bedroom": 7.0, "child": 6.0, "living": 12.0, "kitchen": 5.0, "study": 4.0, "bath": 2.5, "wc": 1.2, "storage": 1.0, "hall": 3.0}
THICKNESS_RANGE = (0.10, 0.40)  # ResPlan: 99.3 % of plans have a wall thickness between 10 and 40 cm
AREA_SUM_TOL = 0.25  # ResPlan: summed room area within +-25 % of the gross area (98.7 % of plans)
DOOR_ROOM_GAP = 0.06  # m: MSD joins two areas by a door when the door is within 0.05 m of both (plus 1 cm for rounding)


@dataclass
class Violation:
    rule: str  # short code, stable: counted and filtered by it
    severity: str  # 'error' | 'warn'
    subject: str  # what it is about: a room, a wall, a piece of furniture
    message: str
    measure: dict = field(default_factory=dict)
    source: str = "app"

    def to_dict(self) -> dict:
        return asdict(self)


def net_rect(case: dict, rect) -> g.Rect:
    """The room as a person can use it: the rectangle of the layout minus half a partition wall on an inner edge and a whole outer wall on the footprint edge."""
    W, D = case["room"]["width"], case["room"]["depth"]
    to, ti = case["thickness"]["outer"], case["thickness"]["inner"]
    x0, y0, x1, y1 = rect
    return (
        x0 + (to if x0 <= EDGE else ti / 2),
        y0 + (to if y0 <= EDGE else ti / 2),
        x1 - (to if x1 >= W - EDGE else ti / 2),
        y1 - (to if y1 >= D - EDGE else ti / 2),
    )


def rule_net_size(case: dict) -> list[Violation]:
    """Too small spaces: judged on the net room, not on the rectangle that includes its walls."""
    out = []
    for r in case["rooms"]:
        net = net_rect(case, r["rect"])
        lo = min(g.w(net), g.h(net))
        need = case["types"].get(r["type"], {}).get("min", HALL_MIN if r["type"] == "hall" else 1.0)
        if lo < need:
            out.append(Violation("net-width", "error", r["id"], f"{r['type']} {r['id']} is only {lo:.2f} m wide once the walls are taken off (at least {need} m).", {"net_width": round(lo, 3), "need": need, "net": [round(v, 3) for v in net]}, "app"))
        floor = case["types"].get(r["type"], {}).get("minArea", MIN_NET_AREA.get(r["type"]))  # the case carries the app's own table; the provisional one here is the fallback
        if floor is not None and g.area(net) < floor:
            out.append(Violation("net-area", "error", r["id"], f"{r['type']} {r['id']} has {g.area(net):.1f} m2 net (provisional minimum {floor} m2).", {"net_area": round(g.area(net), 3), "need": floor}, "app (provisional)"))
    return out


def _wall_ends(wl: dict) -> list[tuple[str, float, float]]:
    """Where a partition wall ends: (end, position of the line, coordinate of the end) with end 'x0', 'x1' (horizontal wall) or 'y0', 'y1' (vertical wall)."""
    (x0, y0), (x1, y1) = wl["p0"], wl["p1"]
    if abs(x0 - x1) < 1e-6:  # vertical, on the line x = c
        return [("y0", x0, min(y0, y1)), ("y1", x0, max(y0, y1))]
    return [("x0", y0, min(x0, x1)), ("x1", y0, max(x0, x1))]


def rule_wall_hits_window(case: dict) -> list[Violation]:
    """A partition wall that ends on the outer wall inside a window opening: the window would open onto the wall."""
    W, D = case["room"]["width"], case["room"]["depth"]
    ti, to = case["thickness"]["inner"], case["thickness"]["outer"]
    windows = case["room"]["windows"]
    out = []
    for i, wl in enumerate(case["walls"]):
        for end, c, e in _wall_ends(wl):
            side = {"y0": "N", "y1": "S", "x0": "W", "x1": "E"}[end]
            # a partition meets the outer wall when it ends on the footprint line (it runs through the wall) or at the inner face of the wall (it was trimmed): both are the junction
            on_edge = {"N": e <= to + EDGE, "S": e >= D - to - EDGE, "W": e <= to + EDGE, "E": e >= W - to - EDGE}[side]
            if not on_edge:
                continue
            junction = (c - ti / 2, c + ti / 2)  # along the outer wall
            for win in (o for o in windows if o["wall"] == side):
                span = (win["pos"] - win["width"] / 2, win["pos"] + win["width"] / 2)
                ov = g.span_overlap(junction, span)
                if ov > 0:
                    out.append(Violation("wall-hits-window", "error", f"wall{i}@{c:.2f}", f"The partition wall at {c:.2f} m ends on the {side} wall inside the window {span[0]:.2f} to {span[1]:.2f} m ({ov:.2f} m of the wall meets the opening).", {"wall_at": round(c, 3), "window": [round(span[0], 3), round(span[1], 3)], "overlap": round(ov, 3), "side": side}, "geometry"))
    return out


def rule_furniture_in_wall(case: dict) -> list[Violation]:
    """A piece of furniture that stands inside a wall (an outer wall, or a partition wall that is not open there)."""
    out = []
    solids = g.wall_solids(case)
    for f in case["furniture"]:
        body = tuple(f["body"])
        for s in solids:
            ox, oy = g.overlap(body, s["rect"])
            if ox > 1e-3 and oy > 1e-3 and ox * oy > 1e-4:
                depth = min(ox, oy)
                out.append(Violation("furniture-in-wall", "error", f["id"], f"{f['type']} {f['id']} stands {depth * 100:.0f} cm inside the {s['kind']} wall {s['name']}.", {"depth": round(depth, 3), "area": round(ox * oy, 4), "wall": s["name"], "kind": s["kind"]}, "geometry"))
    return out


def rule_wall_in_wall(case: dict) -> list[Violation]:
    """Walls inside walls: a partition that runs into the outer wall, and two partitions on top of each other."""
    ti = case["thickness"]["inner"]
    solids = g.wall_solids(case)
    outer = [s for s in solids if s["kind"] == "outer"]
    parts = [s for s in solids if s["kind"] == "partition"]
    out = []
    for p in parts:
        for o in outer:
            a = g.inter_area(p["rect"], o["rect"])
            if a > 1e-3:
                ox, oy = g.overlap(p["rect"], o["rect"])
                out.append(Violation("pokes-into-outer-wall", "error", p["name"], f"The partition wall {p['name']} runs {max(ox, oy) * 100:.0f} cm into the {o['name']} outer wall: it should stop at its inner face.", {"area": round(a, 4), "into": o["name"], "depth": round(max(ox, oy), 3)}, "geometry"))
    for i, p in enumerate(parts):
        for q in parts[i + 1:]:
            a = g.inter_area(p["rect"], q["rect"])
            if a > ti * ti * 1.05 + 1e-3:  # a crossing of two partitions overlaps by exactly t x t: that is a junction, more is one wall on top of another
                out.append(Violation("overlapping-walls", "error", f"{p['name']}+{q['name']}", f"The partition walls {p['name']} and {q['name']} overlap by {a:.3f} m2, more than a junction ({ti * ti:.3f} m2).", {"area": round(a, 4)}, "geometry"))
    return out


def rule_openings(case: dict) -> list[Violation]:
    """Windows lie on their wall, not in a corner and not on each other; a door sits between the two rooms it names (MSD: within 0.05 m of both)."""
    W, D = case["room"]["width"], case["room"]["depth"]
    to = case["thickness"]["outer"]
    out = []
    by_wall: dict[str, list] = {}
    for win in case["room"]["windows"]:
        L = W if win["wall"] in ("N", "S") else D
        lo, hi = win["pos"] - win["width"] / 2, win["pos"] + win["width"] / 2
        if lo < to - 1e-6 or hi > L - to + 1e-6:
            out.append(Violation("window-in-corner", "error", f"window {win['wall']}@{win['pos']}", f"The window on {win['wall']} ({lo:.2f} to {hi:.2f} m) reaches into a corner or past the wall.", {"span": [round(lo, 3), round(hi, 3)], "wall_length": L}, "ResPlan (windows align to a wall band in 99.98 %)"))
        by_wall.setdefault(win["wall"], []).append((lo, hi))
    for side, spans in by_wall.items():
        spans.sort()
        for (a0, a1), (b0, b1) in zip(spans, spans[1:]):
            if b0 < a1 - 1e-6:
                out.append(Violation("window-overlap", "error", f"windows {side}", f"Two windows on {side} overlap ({b0:.2f} to {a1:.2f} m).", {"overlap": round(a1 - b0, 3)}, "geometry"))
    rects = {r["id"]: tuple(r["rect"]) for r in case["rooms"]}
    for d in case["doors"]:
        pt = (d["mid"][0], d["mid"][1], d["mid"][0], d["mid"][1])
        ga = g.gap(pt, rects[d["a"]]) if d["a"] in rects else 9.0
        gb = g.gap(pt, rects[d["b"]]) if d["b"] in rects else 9.0
        if ga > DOOR_ROOM_GAP or gb > DOOR_ROOM_GAP:
            out.append(Violation("door-not-between-rooms", "error", f"door {d['a']}-{d['b']}", f"The door {d['a']} to {d['b']} is {max(ga, gb):.2f} m from one of its rooms.", {"gap_a": round(ga, 3), "gap_b": round(gb, 3)}, "MSD (door within 0.05 m of both areas)"))
    return out


def rule_plan_totals(case: dict) -> list[Violation]:
    """Wall thickness in the range real plans have; the rooms add up to the footprint."""
    out = []
    t = case["thickness"]
    for name, v in (("outer", t["outer"]), ("inner", t["inner"])):
        if not THICKNESS_RANGE[0] <= v <= THICKNESS_RANGE[1]:
            out.append(Violation("wall-thickness", "warn", f"{name} wall", f"The {name} wall is {v * 100:.1f} cm; 99.3 % of the plans of ResPlan lie between 10 and 40 cm.", {"thickness": v}, "ResPlan"))
    gross = case["room"]["width"] * case["room"]["depth"]
    total = sum(g.area(tuple(r["rect"])) for r in case["rooms"])
    if abs(total - gross) > AREA_SUM_TOL * gross:
        out.append(Violation("area-sum", "error", "plan", f"The rooms add up to {total:.1f} m2 of a {gross:.1f} m2 footprint.", {"total": round(total, 2), "gross": round(gross, 2)}, "ResPlan (+-25 %, 98.7 % of plans)"))
    return out


# id, function, what it answers: the audit and the docs read this list
RULES = [
    ("net-size", rule_net_size, "too small spaces (net of the walls)"),
    ("wall-hits-window", rule_wall_hits_window, "partition walls that end in a window"),
    ("furniture-in-wall", rule_furniture_in_wall, "furniture inside walls"),
    ("wall-in-wall", rule_wall_in_wall, "walls inside walls"),
    ("openings", rule_openings, "windows and doors on their walls"),
    ("plan-totals", rule_plan_totals, "wall thickness and area sum"),
]


def check_case(case: dict, rules=None) -> list[Violation]:
    out: list[Violation] = []
    for rid, fn, _ in RULES:
        if rules is None or rid in rules:
            out.extend(fn(case))
    return out
