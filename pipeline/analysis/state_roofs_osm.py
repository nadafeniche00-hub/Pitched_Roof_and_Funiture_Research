"""Roof shapes of dwellings in every German federal state, counted from the OpenStreetMap extracts of Geofabrik.

Usage: python state_roofs_osm.py <folder for the .osm.pbf files> <output json>
Downloads <state>-latest.osm.pbf (5.0 GB for all 16, skipped when already there), streams each file and keeps only ways that carry roof:shape
(the key filter runs in C++, so Python sees a small fraction of the ways). Counts dwellings per roof shape; nothing else is kept.
Source: OpenStreetMap contributors, ODbL (Geofabrik extracts). Volunteered tags: shares are indicative, tagging density differs between states.
"""
import json
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

import osmium

STATES = {
    "baden-wuerttemberg": ("DE-BW", "Baden-Württemberg"), "bayern": ("DE-BY", "Bayern"), "berlin": ("DE-BE", "Berlin"), "brandenburg": ("DE-BB", "Brandenburg"),
    "bremen": ("DE-HB", "Bremen"), "hamburg": ("DE-HH", "Hamburg"), "hessen": ("DE-HE", "Hessen"), "mecklenburg-vorpommern": ("DE-MV", "Mecklenburg-Vorpommern"),
    "niedersachsen": ("DE-NI", "Niedersachsen"), "nordrhein-westfalen": ("DE-NW", "Nordrhein-Westfalen"), "rheinland-pfalz": ("DE-RP", "Rheinland-Pfalz"),
    "saarland": ("DE-SL", "Saarland"), "sachsen": ("DE-SN", "Sachsen"), "sachsen-anhalt": ("DE-ST", "Sachsen-Anhalt"), "schleswig-holstein": ("DE-SH", "Schleswig-Holstein"),
    "thueringen": ("DE-TH", "Thüringen"),
}
SHAPES = ["gabled", "hipped", "half-hipped", "flat", "mansard", "pyramidal", "skillion"]
DWELLING = {"house", "detached", "semidetached_house", "terrace", "residential", "bungalow"}


def fetch(slug, folder):
    path = folder / f"{slug}-latest.osm.pbf"
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    req = urllib.request.Request(f"https://download.geofabrik.de/europe/germany/{slug}-latest.osm.pbf", headers={"User-Agent": "UsableSpace-student-research/0.1 (TH OWL)"})
    tmp = path.with_suffix(".part")
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.rename(path)
    return path


def count(path):
    shapes, n_all, n_dw = Counter(), 0, 0
    for w in osmium.FileProcessor(str(path), osmium.osm.WAY).with_filter(osmium.filter.KeyFilter("roof:shape")):
        b = w.tags.get("building")
        if b is None:
            continue
        n_all += 1
        if b in DWELLING:
            n_dw += 1
            shapes[w.tags["roof:shape"]] += 1
    return n_all, n_dw, shapes


folder, out_path = Path(sys.argv[1]), Path(sys.argv[2])
folder.mkdir(parents=True, exist_ok=True)
out_path.parent.mkdir(parents=True, exist_ok=True)
result = {"source": "OpenStreetMap contributors (ODbL), Geofabrik state extracts, ways with building and roof:shape tags", "when": time.strftime("%Y-%m-%d"), "states": {}}
for slug, (iso, name) in STATES.items():
    t = time.time()
    path = fetch(slug, folder)
    n_all, n_dw, shapes = count(path)
    other = n_dw - sum(shapes[s] for s in SHAPES)
    counts = {s: shapes[s] for s in SHAPES} | {"other": other}
    result["states"][iso] = {"name": name, "n": n_dw, "n_all_buildings_with_roof_shape": n_all, "counts": counts,
                             "share": {k: round(100 * v / n_dw, 1) for k, v in counts.items()} if n_dw else {}, "file_mb": round(path.stat().st_size / 1e6)}
    print(iso, name, n_dw, result["states"][iso]["share"].get("gabled"), f"{time.time() - t:.0f}s", flush=True)
    out_path.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")  # partial results survive an interruption
print("done", len(result["states"]), "states", flush=True)
