"""One pass over the MSD table (mds_V2_5.372k.csv): which categories exist and how often. Standard library only; reads, never writes.

  python msd/scan_dataset.py data/msd/mds_V2_5.372k.csv [--out data/msd/scan.json]       (from pipeline/oracle)

Columns of the file (seen with msd/inspect_dataset.py): apartment_id, site_id, building_id, plan_id, floor_id, unit_id, area_id, unit_usage, entity_type, entity_subtype, geom (a WKT
polygon, metres), elevation, height, zoning, roomtype. One row per entity of a plan: an area (a room), or a separator, or a feature, as entity_type says.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


def scan(path: str) -> dict:
    kinds: Counter = Counter()
    rooms: Counter = Counter()
    usage: Counter = Counter()
    heights: Counter = Counter()
    plans, units = set(), set()
    n = 0
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            n += 1
            kinds[(row["entity_type"], row["entity_subtype"])] += 1
            usage[row["unit_usage"]] += 1
            plans.add(row["plan_id"])
            if row["entity_type"] == "area":
                rooms[(row["entity_subtype"], row["roomtype"])] += 1
                units.add(row["unit_id"])
                heights[row["height"][:4]] += 1
    return {
        "rows": n,
        "plans": len(plans),
        "units": len(units),
        "entities": {f"{a}/{b}": c for (a, b), c in kinds.most_common()},
        "areas": {f"{a} -> {b}": c for (a, b), c in rooms.most_common()},
        "unit_usage": dict(usage.most_common()),
        "area_heights": dict(heights.most_common(8)),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--out")
    a = ap.parse_args()
    res = scan(a.csv)
    print(f"{res['rows']:,} rows, {res['plans']:,} plans, {res['units']:,} units with areas")
    print("\nentity_type / entity_subtype:")
    for k, v in list(res["entities"].items())[:30]:
        print(f"  {v:>9,}  {k}")
    print("\narea: entity_subtype -> roomtype:")
    for k, v in list(res["areas"].items())[:40]:
        print(f"  {v:>9,}  {k}")
    print("\nunit_usage:", res["unit_usage"])
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=1)
