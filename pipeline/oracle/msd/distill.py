"""Distil the heavy MSD data into two small files the app can carry: what real flats contain and how they connect (priors), and a few hundred real flats worth copying from (exemplars).

Source: the 5,372 access graphs of MSD (graph_out/*.pickle in the archive, loaded with msd/safe_graphs.py: nothing is executed). A node is a room (type, polygon in metres), an edge a door, an open
passage or the entrance door of a flat. A FLAT is a connected group of rooms: the entrance edges and the public stairs are cut, what stays connected is one dwelling. A group counts as a flat when its
entrance door is among them and it holds a bedroom or a living room and a bath (a public corridor with entrance doors on all sides is none). Net area = the rooms inside the flat without balconies.

  python msd/distill.py "C:/Users/nadaf/Downloads/archive.zip"        (from pipeline/oracle; a minute)

Writes pipeline/oracle/msd/priors_results.json (everything, for the README), shared/msdPriors.js (the statistics) and shared/msdExemplars.js (the flats). Standard library only.
Swiss apartment buildings, not German attics: read it as what real flats contain and how they connect, not as what an attic must be.
Caution: in MSD 34,379 of the 42,584 rooms typed Bedroom are the generic type ROOM (the CSV says ROOM -> Bedroom), so 'bedrooms' means 'habitable rooms that are not the living room, kitchen or bath':
the bedroom counts of the priors are an upper bound, and the exemplars are taken only from flats that name a living room and a kitchen.
"""
from __future__ import annotations

import argparse
import ast
import collections
import json
import math
import os
import statistics
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from msd.loader import _hull, ring_area  # noqa: E402
from msd.safe_graphs import load_graph  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ROOM = {0: "bedroom", 1: "living", 2: "kitchen", 3: "dining", 4: "corridor", 5: "stairs", 6: "storeroom", 7: "bath", 8: "balcony"}
NET = {"bedroom", "living", "kitchen", "dining", "corridor", "storeroom", "bath"}  # inside the flat: a balcony and the public stairs are not
BUCKETS = [0, 35, 50, 65, 80, 100, 130, 1e9]  # net area of the flat, m2
PER_BUCKET = 50  # exemplars per bucket


def read_graphs(path):
    with zipfile.ZipFile(path) as z:
        for n in sorted(z.namelist()):
            if n.endswith(".pickle") and "/graph_out/" in n:
                parts = n.split("/")
                yield parts[-3], os.path.splitext(parts[-1])[0], load_graph(z.read(n))


def rooms_of(g) -> dict:
    out = {}
    for k, a in g.nodes.items():
        t = ROOM.get(int(a["room_type"])) if a.get("room_type") is not None else None
        geo = a.get("geometry")
        try:
            pts = ast.literal_eval(geo) if isinstance(geo, str) else list(geo or [])
            ring = [(float(x), float(y)) for x, y in pts]
        except (ValueError, SyntaxError, TypeError):
            continue
        if t and len(ring) >= 3:
            out[k] = (t, ring)
    return out


def flats_of(g, rooms) -> list[dict]:
    """The flats of one floor: [{ nodes: [...], adj: {node: {neighbour: 'd'|'p'}}, entrance: [nodes] }]."""
    adj = collections.defaultdict(dict)
    entrance = set()
    for a, b, attrs in g.edges:
        if a not in rooms or b not in rooms:
            continue
        kind = attrs.get("connectivity")
        stairs = rooms[a][0] == "stairs" or rooms[b][0] == "stairs"
        if kind in ("door", "passage") and not stairs:
            adj[a][b] = adj[b][a] = kind[0]
        elif kind == "entrance":
            entrance.update(x for x in (a, b) if rooms[x][0] != "stairs")
    seen, out = set(), []
    for k in rooms:
        if rooms[k][0] == "stairs" or k in seen:
            continue
        stack, comp = [k], []
        seen.add(k)
        while stack:
            x = stack.pop()
            comp.append(x)
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        types = {rooms[x][0] for x in comp}
        ent = [x for x in comp if x in entrance]
        if ent and "bath" in types and ({"bedroom", "living"} & types):
            out.append({"nodes": sorted(comp), "adj": adj, "entrance": ent})
    return out


def min_rect(points):
    """(long side, short side, angle that turns the long side along x) of the smallest rectangle around the points."""
    hull = _hull(points)
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
            ang = math.atan2(uy, ux) + (math.pi / 2 if h > w else 0)
            best = (w * h, max(w, h), min(w, h), ang)
    return (best[1], best[2], best[3]) if best else (0.0, 0.0, 0.0)


def _seg_dist2(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + t * dx - px, ay + t * dy - py
    return qx * qx + qy * qy


def _boundary_near(a, b, gap=0.45, step=0.3):
    """Length of the boundary of ring a that lies within `gap` metres of the boundary of ring b: the wall the two rooms share (the polygons are the rooms between the walls, so there is a wall's thickness between them)."""
    segs = [(b[i], b[(i + 1) % len(b)]) for i in range(len(b))]
    g2, total = gap * gap, 0.0
    for i in range(len(a)):
        (x0, y0), (x1, y1) = a[i], a[(i + 1) % len(a)]
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 0.05:
            continue
        n = max(1, int(L / step))
        for k in range(n):
            t = (k + 0.5) / n
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if any(_seg_dist2(px, py, p[0], p[1], q[0], q[1]) <= g2 for p, q in segs):
                total += L / n
    return total


def shared_wall(a, b):
    """Length of the wall two room polygons share: the mean of both directions."""
    return 0.5 * (_boundary_near(a, b) + _boundary_near(b, a))


def share(counter, key, n):
    return round(counter[key] / n, 4) if n else 0.0


def distil(graphs):
    n_floors = n_flats = bad_geo = 0
    flat_recs = []
    per_bucket = collections.defaultdict(lambda: collections.defaultdict(list))  # bucket -> feature -> values
    bedrooms_dist = collections.defaultdict(collections.Counter)
    baths_dist = collections.defaultdict(collections.Counter)
    has = collections.defaultdict(collections.Counter)
    n_in_bucket = collections.Counter()
    conn, door = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
    n_of_type = collections.Counter()
    entrance_into = collections.Counter()
    wall = {0.5: collections.defaultdict(collections.Counter), 0.9: collections.defaultdict(collections.Counter)}  # min shared length -> type -> neighbour type -> rooms
    flats_with, flats_wall = collections.Counter(), collections.Counter()  # (type, type) -> flats that have both, flats where one touches the other for 0.9 m
    for split, floor, g in graphs:
        n_floors += 1
        rooms = rooms_of(g)
        for fl in flats_of(g, rooms):
            nodes, adj = fl["nodes"], fl["adj"]
            types = [rooms[k][0] for k in nodes]
            area = {k: ring_area(rooms[k][1]) for k in nodes}
            net = sum(area[k] for k in nodes if rooms[k][0] in NET)
            if not (10 <= net <= 250):
                continue
            n_flats += 1
            b = next(i for i in range(len(BUCKETS) - 1) if BUCKETS[i] <= net < BUCKETS[i + 1])
            n_in_bucket[b] += 1
            cnt = collections.Counter(types)
            bedrooms_dist[b][min(cnt["bedroom"], 4)] += 1
            baths_dist[b][min(cnt["bath"], 3)] += 1
            for t in ("kitchen", "living", "dining", "storeroom", "balcony"):
                if cnt[t]:
                    has[b][t] += 1
            per_bucket[b]["net"].append(net)
            per_bucket[b]["rooms"].append(sum(1 for t in types if t in NET))
            for t in NET:
                per_bucket[b]["share_" + t].append(sum(area[k] for k in nodes if rooms[k][0] == t) / net)
            for k in nodes:
                t = rooms[k][0]
                n_of_type[t] += 1
                for nb, kind in adj[k].items():
                    if nb in nodes:
                        conn[t][rooms[nb][0]] += 0  # make the key exist
                reach_c, reach_d = set(), set()
                for nb, kind in adj[k].items():
                    reach_c.add(rooms[nb][0])
                    if kind == "d":
                        reach_d.add(rooms[nb][0])
                for u in reach_c:
                    conn[t][u] += 1
                for u in reach_d:
                    door[t][u] += 1
            for k in fl["entrance"]:
                entrance_into[rooms[k][0]] += 1
            # which rooms share a wall: 0.5 m is the "near" of the app's wishes, 0.9 m a wall in which a door fits (the app's access graph)
            box = {k: (min(p[0] for p in rooms[k][1]), min(p[1] for p in rooms[k][1]), max(p[0] for p in rooms[k][1]), max(p[1] for p in rooms[k][1])) for k in nodes}
            touch = {0.5: {k: set() for k in nodes}, 0.9: {k: set() for k in nodes}}
            pairs09 = set()
            for ii, ka in enumerate(nodes):
                for kb in nodes[ii + 1:]:
                    ba, bb2 = box[ka], box[kb]
                    if math.hypot(max(bb2[0] - ba[2], ba[0] - bb2[2], 0), max(bb2[1] - ba[3], ba[1] - bb2[3], 0)) > 0.45:
                        continue
                    L = shared_wall(rooms[ka][1], rooms[kb][1])
                    for th in (0.5, 0.9):
                        if L >= th:
                            touch[th][ka].add(rooms[kb][0])
                            touch[th][kb].add(rooms[ka][0])
                    if L >= 0.9:
                        pairs09.add(tuple(sorted((rooms[ka][0], rooms[kb][0]))))
            for th in (0.5, 0.9):
                for k in nodes:
                    for u in touch[th][k]:
                        wall[th][rooms[k][0]][u] += 1
            kinds = sorted(set(types))
            for i1, t1 in enumerate(kinds):
                for t2 in kinds[i1:]:
                    if t1 == t2 and cnt[t1] < 2:
                        continue
                    flats_with[(t1, t2)] += 1
                    if (t1, t2) in pairs09:
                        flats_wall[(t1, t2)] += 1
            # the flat as an exemplar candidate: the rooms turned so that the long side lies along x, moved to the origin, in metres to 1 cm
            pts = [p for k in nodes for p in rooms[k][1]]
            long_s, short_s, ang = min_rect(pts)
            hull = _hull(pts)
            hull_area = ring_area(hull) if len(hull) >= 3 else 0
            c, s = math.cos(-ang), math.sin(-ang)
            rot = {k: [(x * c - y * s, x * s + y * c) for x, y in rooms[k][1]] for k in nodes}
            x0 = min(p[0] for r in rot.values() for p in r)
            y0 = min(p[1] for r in rot.values() for p in r)
            index = {k: i for i, k in enumerate(nodes)}
            flat_recs.append({
                "net": net, "bucket": b, "bedrooms": cnt["bedroom"], "aspect": long_s / max(short_s, 1e-9), "compact": net / hull_area if hull_area else 0,
                "source": {"split": split, "floor": floor, "nodes": len(nodes)},
                "rooms": [{"type": rooms[k][0], "polygon": [[round(x - x0, 2), round(y - y0, 2)] for x, y in rot[k]]} for k in nodes],
                "edges": sorted([min(index[a], index[b2]), max(index[a], index[b2]), kind] for a in nodes for b2, kind in adj[a].items() if b2 in index and index[a] < index[b2]),
                "entrance": [index[k] for k in fl["entrance"]],
                "area": round(net, 1),
            })
    buckets = []
    for i in range(len(BUCKETS) - 1):
        n = n_in_bucket[i]
        pb = per_bucket[i]
        buckets.append({
            "from": BUCKETS[i], "to": None if BUCKETS[i + 1] > 1e6 else BUCKETS[i + 1], "flats": n,
            "net_area_median": round(statistics.median(pb["net"]), 1) if n else None,
            "rooms_median": statistics.median(pb["rooms"]) if n else None,
            "bedrooms": {str(k): share(bedrooms_dist[i], k, n) for k in range(5)},
            "baths": {str(k): share(baths_dist[i], k, n) for k in range(1, 4)},
            "has": {t: share(has[i], t, n) for t in ("kitchen", "living", "dining", "storeroom", "balcony")},
            "area_share": {t: round(statistics.mean(pb["share_" + t]), 3) for t in sorted(NET)} if n else {},
        })
    adjacency = {
        "connected_to": {t: {u: round(conn[t][u] / n_of_type[t], 3) for u in sorted(NET | {"balcony"}) if conn[t][u]} for t in sorted(NET)},
        "door_to": {t: {u: round(door[t][u] / n_of_type[t], 3) for u in sorted(NET | {"balcony"}) if door[t][u]} for t in sorted(NET)},
    }
    adjacency["shares_wall_09"] = {t: {u: round(wall[0.9][t][u] / n_of_type[t], 3) for u in sorted(NET | {"balcony"}) if wall[0.9][t][u]} for t in sorted(NET)}
    adjacency["shares_wall_05"] = {t: {u: round(wall[0.5][t][u] / n_of_type[t], 3) for u in sorted(NET | {"balcony"}) if wall[0.5][t][u]} for t in sorted(NET)}
    # of the flats that have both kinds of room: in how many does one share a wall of 0.9 m with the other (the question "does the bath sit next to a bedroom")
    adjacency["flats_with_both_that_share_a_wall"] = {f"{a}-{b}": {"flats": flats_with[(a, b)], "share": round(flats_wall[(a, b)] / flats_with[(a, b)], 3)} for (a, b) in sorted(flats_with) if flats_with[(a, b)] >= 200 and a != "balcony" and b != "balcony"}
    total_ent = sum(entrance_into.values())
    return {
        "floors_read": n_floors, "flats_used": n_flats,
        "buckets": buckets,
        "adjacency": adjacency,
        "entrance_opens_into": {t: round(c / total_ent, 3) for t, c in entrance_into.most_common()},
    }, flat_recs


def pick(recs):
    """A few hundred flats that cover what exists: per size bucket the PER_BUCKET that are furthest apart in (size, bedrooms, proportion), among the clean ones (compact outline, whole rooms of a sane size, not a copy)."""
    chosen, seen = [], set()
    for b in range(len(BUCKETS) - 1):
        cand = []
        for r in recs:
            if r["bucket"] != b or r["compact"] < 0.72 or r["aspect"] > 3.2:
                continue
            areas = [ring_area([tuple(p) for p in room["polygon"]]) for room in r["rooms"]]
            if min(areas) < 0.8 or max(areas) > 90 or len(r["rooms"]) > 12 or len(r["rooms"]) < 3:
                continue
            # a flat of 40 m2 or more that has no bedroom, or one room that is over half of it, has rooms that the data does not tell apart (a loft, an open plan): no model to copy
            net_areas = [a for a, room in zip(areas, r["rooms"]) if room["type"] in NET]
            if (r["net"] >= 40 and r["bedrooms"] < 1) or (r["net"] >= 50 and max(net_areas) / r["net"] > 0.5):
                continue
            # most MSD 'bedrooms' are the generic type ROOM (34,379 of 42,584): a flat without an explicit living room and kitchen may have its living room under that name, so it is no model
            kinds = {room["type"] for room in r["rooms"]}
            if r["net"] >= 40 and not ({"kitchen", "living"} <= kinds):
                continue
            key = (r["source"]["floor"], round(r["net"], 1))
            if key in seen:
                continue
            seen.add(key)
            cand.append(r)
        if not cand:
            continue
        feat = lambda r: (r["net"] / 60.0, r["bedrooms"] / 2.0, r["aspect"] / 2.0, r["compact"] * 2.0)  # noqa: E731
        cand.sort(key=lambda r: (r["net"], r["source"]["floor"]))
        first = cand[len(cand) // 2]
        picked = [first]
        dist = [math.dist(feat(first), feat(r)) for r in cand]
        while len(picked) < min(PER_BUCKET, len(cand)):
            i = max(range(len(cand)), key=lambda j: dist[j])
            picked.append(cand[i])
            fi = feat(cand[i])
            dist = [min(d, math.dist(fi, feat(r))) for d, r in zip(dist, cand)]
        chosen.extend(picked)
    chosen.sort(key=lambda r: (r["net"], r["source"]["floor"]))
    out = []
    for i, r in enumerate(chosen):
        out.append({"id": f"msd{i:03d}", "area": r["area"], "bedrooms": r["bedrooms"], "aspect": round(r["aspect"], 2), "source": r["source"], "rooms": r["rooms"], "edges": r["edges"], "entrance": r["entrance"]})
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("zip")
    a = ap.parse_args()
    priors, recs = distil(read_graphs(a.zip))
    exemplars = pick(recs)
    meta = {"source": "Modified Swiss Dwellings v2 (Kaggle), the access graphs of 5,372 floors; a flat = a connected group of rooms with its entrance door", **priors}
    with open(os.path.join(HERE, "priors_results.json"), "w", encoding="utf-8") as f:
        json.dump({**meta, "exemplars": len(exemplars)}, f, indent=1)
    head = "// Written by pipeline/oracle/msd/distill.py from the MSD access graphs. Do not edit by hand." + chr(10)
    with open(os.path.join(ROOT, "shared", "msdPriors.js"), "w", encoding="utf-8") as f:
        f.write(head + "export const MSD_PRIORS = " + json.dumps(meta, indent=1) + ";" + chr(10))
    with open(os.path.join(ROOT, "shared", "msdExemplars.js"), "w", encoding="utf-8") as f:
        f.write(head + "// Real flats, turned so that the long side lies along x, moved to the origin, metres; edges: [room, room, 'd' door | 'p' open passage]; entrance: the rooms the front door opens into." + chr(10)
                + "export const MSD_EXEMPLARS = " + json.dumps(exemplars, separators=(",", ":")) + ";" + chr(10))
    print(f"{priors['floors_read']:,} floors, {priors['flats_used']:,} flats, {len(exemplars)} exemplars")
    for b in priors["buckets"]:
        print(f"  {b['from']:>4}-{str(b['to'] or '+'):<4} m²  {b['flats']:>5} flats  median {b['net_area_median']} m², {b['rooms_median']} rooms, bedrooms {b['bedrooms']}")
    print("entrance opens into:", priors["entrance_opens_into"])
