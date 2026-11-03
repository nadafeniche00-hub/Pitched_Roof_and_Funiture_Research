"""Calibrate and test the rules on real plans. Pure Python on plain records, so it runs on anything the dataset adapter produces: one record per room,
{ "type": our type name, "net_area": m2, "net_width": m (the shorter side of the room's best-fitting rectangle) }.

The two questions it answers:
  1. percentiles per room type: how small is a real bedroom? (a threshold below the 1st percentile of real rooms is safe; one at the median would flag half of the real plans)
  2. false alarms: with the app's provisional minima (MIN_NET_AREA and the widths of ROOM_TYPES), what share of REAL rooms would the rules call too small? A rule that fires on a large share of
     real plans is a bad rule, whatever it says about the app.
Real plans are Swiss (MSD) or from ResPlan: not German attics. They calibrate the lower end of room sizes; they do not say what is right under a slope.
The adapter that turns a dataset into records is written after msd/inspect_dataset.py has shown the real columns.
"""
from __future__ import annotations

import statistics
from collections import defaultdict

PERCENTILES = (1, 5, 25, 50, 75, 95)


def percentile(values: list[float], p: float) -> float:
    """Linear-interpolated percentile (p in 0..100) of a non-empty list."""
    v = sorted(values)
    if not v:
        raise ValueError("no values")
    k = (len(v) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def percentiles_by_type(records: list[dict]) -> dict:
    by: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"net_area": [], "net_width": []})
    for r in records:
        for k in ("net_area", "net_width"):
            if r.get(k) is not None:
                by[r["type"]][k].append(float(r[k]))
    out = {}
    for t, cols in sorted(by.items()):
        out[t] = {"n": len(cols["net_area"])}
        for k, vals in cols.items():
            if vals:
                out[t][k] = {f"p{p}": round(percentile(vals, p), 2) for p in PERCENTILES} | {"mean": round(statistics.fmean(vals), 2)}
    return out


def false_alarms(records: list[dict], min_area: dict[str, float], min_width: dict[str, float]) -> dict:
    """Share of real rooms that the app's provisional minima would call too small, per type."""
    n: dict[str, int] = defaultdict(int)
    small_area: dict[str, int] = defaultdict(int)
    narrow: dict[str, int] = defaultdict(int)
    for r in records:
        t = r["type"]
        n[t] += 1
        if t in min_area and r.get("net_area") is not None and r["net_area"] < min_area[t]:
            small_area[t] += 1
        if t in min_width and r.get("net_width") is not None and r["net_width"] < min_width[t]:
            narrow[t] += 1
    return {t: {"n": n[t], "below_min_area": round(small_area[t] / n[t], 3), "below_min_width": round(narrow[t] / n[t], 3)} for t in sorted(n)}
