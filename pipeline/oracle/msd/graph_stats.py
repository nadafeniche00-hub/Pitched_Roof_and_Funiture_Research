"""How real apartments connect their rooms: statistics over the 5,372 access graphs of MSD (graph_out/*.pickle, read from the zip, loaded with msd/safe_graphs.py: nothing is executed).

Nodes are rooms (integer room_type: 0 Bedroom, 1 Livingroom, 2 Kitchen, 3 Dining, 4 Corridor, 5 Stairs, 6 Storeroom, 7 Bathroom, 8 Balcony: the order of ROOM_NAMES in the MSD repository,
confirmed on 17,130 rooms by matching graph polygons to the CSV by floor_id and area: 100 % agreement). Edges are connections of three kinds: 'door' (a door joins two rooms), 'passage' (they are
open to each other: no door) and 'entrance' (the entrance door of a flat). So an open kitchen is a passage to its living room, not a door: "connected" below means a door OR a passage.

They test the hand-written graph rules of shared/knowledge.js against real plans: ADJACENCY "avoid" (a bath or WC door straight into the kitchen or living room) and "want" kitchen with living,
and CIRCULATION "no walk through a bedroom". What they cannot test: "a bath next to the bedrooms" is about a SHARED WALL (one plumbing stack), and an access graph only knows doors and openings.
Swiss apartment buildings, not German attics: read it as evidence, not as law.

  python msd/graph_stats.py "C:/Users/nadaf/Downloads/archive.zip" [--out msd/adjacency_results.json]       (from pipeline/oracle; a few seconds)
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from msd.safe_graphs import load_graph  # noqa: E402

ROOM = {0: "bedroom", 1: "living", 2: "kitchen", 3: "dining", 4: "corridor", 5: "stairs", 6: "storeroom", 7: "bath", 8: "balcony"}
OFFICE = ("corridor", "stairs", "living", "kitchen", "dining", "bedroom", "bath", "storeroom")  # nodes the entrance door can open into


def reach(adj, starts, skip=None):
    seen = {s for s in starts if s != skip}
    queue = collections.deque(seen)
    while queue:
        x = queue.popleft()
        for y in adj[x]:
            if y != skip and y not in seen:
                seen.add(y)
                queue.append(y)
    return seen


def analyse(graphs) -> dict:
    n_graphs = 0
    nodes = collections.Counter()
    pair_door, pair_any = collections.Counter(), collections.Counter()
    door_to = collections.defaultdict(collections.Counter)  # type -> neighbour type -> rooms of the type with a DOOR to one of it
    any_to = collections.defaultdict(collections.Counter)  # ... with a door OR a passage
    edge_kinds = collections.Counter()
    bedrooms = connectors = checked = 0
    depth = collections.Counter()
    for g in graphs:
        n_graphs += 1
        typ = {k: (ROOM.get(int(a["room_type"]), "other") if a.get("room_type") is not None else "other") for k, a in g.nodes.items()}
        d_adj, a_adj = collections.defaultdict(set), collections.defaultdict(set)
        entrance = set()
        for a, b, attrs in g.edges:
            kind = attrs.get("connectivity", "?")
            edge_kinds[kind] += 1
            if kind in ("door", "passage"):
                a_adj[a].add(b)
                a_adj[b].add(a)
                pair_any[tuple(sorted((typ.get(a, "other"), typ.get(b, "other"))))] += 1
            if kind == "door":
                d_adj[a].add(b)
                d_adj[b].add(a)
                pair_door[tuple(sorted((typ.get(a, "other"), typ.get(b, "other"))))] += 1
            elif kind == "entrance":
                entrance.update((a, b))
        for k, t in typ.items():
            nodes[t] += 1
            for nb in {typ[m] for m in d_adj[k] if m in typ}:
                door_to[t][nb] += 1
            for nb in {typ[m] for m in a_adj[k] if m in typ}:
                any_to[t][nb] += 1
        starts = [k for k in entrance if typ.get(k) in OFFICE]
        if not starts:
            continue
        base = reach(a_adj, starts)
        dist = {s: 0 for s in starts}
        queue = collections.deque(starts)
        while queue:
            x = queue.popleft()
            for y in a_adj[x]:
                if y not in dist:
                    dist[y] = dist[x] + 1
                    queue.append(y)
        for k, t in typ.items():
            if t != "bedroom" or k not in base:
                continue
            bedrooms += 1
            if k in starts:
                continue
            checked += 1
            cut = reach(a_adj, starts, skip=k)
            lost = [m for m in base if m != k and m not in cut and typ.get(m) != "balcony"]  # rooms that can no longer be reached once this bedroom is closed (a balcony only off the bedroom does not count)
            if lost:
                connectors += 1
            depth[min(dist.get(k, 9), 4)] += 1
    sh = lambda table, t, nb: round(table[t][nb] / nodes[t], 3) if nodes[t] else None  # noqa: E731
    return {
        "graphs": n_graphs,
        "rooms": dict(nodes.most_common()),
        "edge_kinds": dict(edge_kinds),
        "door_edges_by_pair": {f"{a}-{b}": c for (a, b), c in pair_door.most_common(15)},
        "share_of_rooms_with_a_DOOR_to": {f"{t} -> {nb}": sh(door_to, t, nb) for t, nb in [("bath", "kitchen"), ("bath", "living"), ("bath", "bedroom"), ("bath", "corridor"), ("bedroom", "corridor"), ("bedroom", "bath"), ("bedroom", "living")]},
        "share_of_rooms_CONNECTED_to": {f"{t} -> {nb}": sh(any_to, t, nb) for t, nb in [("kitchen", "living"), ("kitchen", "dining"), ("kitchen", "corridor"), ("living", "kitchen"), ("bedroom", "bedroom")]},
        "bedrooms_checked_for_a_way_through": checked,
        "bedrooms_that_are_a_way_through": round(connectors / checked, 4) if checked else None,
        "bedroom_depth_from_the_entrance": {str(k): v for k, v in sorted(depth.items())},  # connections from the nearest end of an entrance edge: 1 = directly off the room the front door opens into
    }


def read_zip(path: str):
    with zipfile.ZipFile(path) as z:
        for n in sorted(z.namelist()):
            if n.endswith(".pickle") and "/graph_out/" in n:
                yield load_graph(z.read(n))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("zip")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "adjacency_results.json"))
    a = ap.parse_args()
    res = analyse(read_zip(a.zip))
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print(f"{res['graphs']:,} graphs, {sum(res['rooms'].values()):,} rooms; edges: {res['edge_kinds']}\n")
    print("share of rooms with a DOOR to ...:")
    for k, v in res["share_of_rooms_with_a_DOOR_to"].items():
        print(f"  {k:<22} {v * 100:5.1f} %")
    print("\nshare of rooms CONNECTED (door or open passage) to ...:")
    for k, v in res["share_of_rooms_CONNECTED_to"].items():
        print(f"  {k:<22} {v * 100:5.1f} %")
    print(f"\nbedrooms that are a way through to another room: {res['bedrooms_that_are_a_way_through'] * 100:.1f} % of {res['bedrooms_checked_for_a_way_through']:,}")
    print("bedroom depth (connections passed from the entrance):", res["bedroom_depth_from_the_entrance"])
