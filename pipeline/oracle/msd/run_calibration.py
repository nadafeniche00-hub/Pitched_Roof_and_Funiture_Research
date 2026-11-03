"""Calibrate the rules on the real plans of MSD: how big are real rooms, how wide are real doors and windows, how thick are real walls, and how many real rooms would the app's provisional
minima call too small? Writes msd/calibration_results.json (small, kept in git) so the numbers are not recomputed to be quoted.

  python msd/run_calibration.py data/msd/mds_V2_5.372k.csv [--wall-every 10]       (from pipeline/oracle; about a minute)

Reading the result honestly: the plans are Swiss apartment buildings, not German attics. A minimum that flags more than a few percent of real rooms of its type is too strict for what people
really build; a minimum far below the 1st percentile checks nothing. Neither says what is right under a slope.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from msd.calibrate import false_alarms, percentile, percentiles_by_type  # noqa: E402
from msd.loader import read_entities  # noqa: E402
from usable_oracle.rules import MIN_NET_AREA  # noqa: E402

# the narrowest net widths of shared/plans.js ROOM_TYPES (m); the hall's is HALL.min
APP_MIN_WIDTH = {"bedroom": 2.4, "living": 3.0, "kitchen": 2.2, "bath": 1.5, "storage": 1.2, "hall": 1.2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--wall-every", type=int, default=10, help="every n-th wall polygon is measured (there are 600,000)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "calibration_results.json"))
    a = ap.parse_args()

    rooms, widths = [], defaultdict(list)
    wall_n = 0
    bad = 0
    n_rooms_by_plan: dict[str, int] = defaultdict(int)
    for e in read_entities(a.csv):
        if e.get("bad"):
            bad += 1
            continue
        k = e["kind"]
        if k == "area":
            from msd.loader import TYPE_OF
            if e["roomtype"] in TYPE_OF:
                rooms.append({"type": TYPE_OF[e["roomtype"]], "net_area": e["area"], "net_width": e["short"]})
                n_rooms_by_plan[e["plan"]] += 1
        elif k == "wall":
            wall_n += 1
            if wall_n % a.wall_every == 0 and e["long"] > 0.5:
                widths["wall_thickness"].append(e["short"])  # the short side of a straight wall piece
        elif k in ("door", "entrance_door", "window"):
            widths[k].append(e["long"])  # the long side of the opening polygon
        elif k == "area":
            pass
    out = {
        "source": "Modified Swiss Dwellings v2 (Kaggle), residential units only; polygons in metres",
        "rooms_used": len(rooms),
        "unreadable_polygons": bad,
        "percentiles_by_type": percentiles_by_type(rooms),
        "false_alarms": false_alarms(rooms, MIN_NET_AREA, APP_MIN_WIDTH),
        "openings_and_walls": {
            k: {"n": len(v), **{f"p{p}": round(percentile(v, p), 3) for p in (5, 25, 50, 75, 95)}, "mean": round(statistics.fmean(v), 3)} for k, v in widths.items() if v
        },
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"{out['rooms_used']:,} rooms, {bad} unreadable polygons -> {a.out}\n")
    print("net area (m2) of real rooms, percentiles:")
    for t, v in out["percentiles_by_type"].items():
        ar = v["net_area"]
        print(f"  {t:<8} n={v['n']:>6,}  p1 {ar['p1']:>5}  p5 {ar['p5']:>5}  p25 {ar['p25']:>5}  median {ar['p50']:>5}  p95 {ar['p95']:>5}   | width median {v['net_width']['p50']}  p5 {v['net_width']['p5']}")
    print("\nshare of REAL rooms below the app's provisional minimum:")
    for t, v in out["false_alarms"].items():
        print(f"  {t:<8} area < {MIN_NET_AREA.get(t, '-')!s:>4} m2: {v['below_min_area'] * 100:5.1f} %   width < {APP_MIN_WIDTH.get(t, '-')!s:>3} m: {v['below_min_width'] * 100:5.1f} %")
    print("\nopenings and walls (m):")
    for k, v in out["openings_and_walls"].items():
        print(f"  {k:<15} n={v['n']:>7,}  p5 {v['p5']}  median {v['p50']}  p95 {v['p95']}")


if __name__ == "__main__":
    main()
