"""Simplified outlines of the 16 federal states as SVG paths, from Geofabrik's .poly boundary files (OpenStreetMap data, ODbL).

Input : pipeline/data/poly/<state>.poly      Output: presentation/data/states_svg.json  (viewBox 0 0 W H, UTM zone 32N, simplified to about 1.2 km)
"""
import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
ISO = {"baden-wuerttemberg": "DE-BW", "bayern": "DE-BY", "berlin": "DE-BE", "brandenburg": "DE-BB", "bremen": "DE-HB", "hamburg": "DE-HH", "hessen": "DE-HE", "mecklenburg-vorpommern": "DE-MV",
       "niedersachsen": "DE-NI", "nordrhein-westfalen": "DE-NW", "rheinland-pfalz": "DE-RP", "saarland": "DE-SL", "sachsen": "DE-SN", "sachsen-anhalt": "DE-ST", "schleswig-holstein": "DE-SH", "thueringen": "DE-TH"}
NAME = {"DE-BW": "Baden-Württemberg", "DE-BY": "Bayern", "DE-BE": "Berlin", "DE-BB": "Brandenburg", "DE-HB": "Bremen", "DE-HH": "Hamburg", "DE-HE": "Hessen", "DE-MV": "Mecklenburg-Vorpommern", "DE-NI": "Niedersachsen",
        "DE-NW": "Nordrhein-Westfalen", "DE-RP": "Rheinland-Pfalz", "DE-SL": "Saarland", "DE-SN": "Sachsen", "DE-ST": "Sachsen-Anhalt", "DE-SH": "Schleswig-Holstein", "DE-TH": "Thüringen"}
tr = Transformer.from_crs(4326, 25832, always_xy=True)


def read_poly(path):
    lines = [l.strip() for l in path.read_text().splitlines() if l.strip()][1:]  # first line: area name
    rings, cur, hole = [], None, False
    for t in lines:
        if cur is None:
            if t == "END":  # closing line of the file
                break
            hole, cur = t.startswith("!"), []  # ring name line ("1", "!2", ...)
        elif t == "END":
            if len(cur) >= 3:
                rings.append((hole, cur))
            cur = None
        else:
            lon, lat = (float(v) for v in t.split()[:2])
            cur.append(tr.transform(lon, lat))
    outer = [Polygon(r) for h, r in rings if not h]
    holes = [Polygon(r) for h, r in rings if h]
    g = unary_union(outer)
    for h in holes:
        g = g.difference(h)
    return g


shapes = {ISO[p.stem]: read_poly(p) for p in sorted((ROOT / "pipeline/data/poly").glob("*.poly"))}
whole = unary_union(list(shapes.values()))
minx, miny, maxx, maxy = whole.bounds
S = 1000 / (maxx - minx)
H = round((maxy - miny) * S)


def path(g):
    polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    d = []
    for p in polys:
        if p.area < 4e6:  # drop islets under 4 km2
            continue
        for ring in [p.exterior, *p.interiors]:
            pts = [((x - minx) * S, (maxy - y) * S) for x, y in ring.coords]
            d.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
    return "".join(d)


out = {"viewBox": [0, 0, 1000, H], "source": "OpenStreetMap contributors (ODbL), Geofabrik .poly boundaries, simplified", "states": {}}
for iso, g in shapes.items():
    gs = g.simplify(1200, preserve_topology=True)
    c = gs.representative_point()
    out["states"][iso] = {"name": NAME[iso], "d": path(gs), "cx": round((c.x - minx) * S, 1), "cy": round((maxy - c.y) * S, 1)}
(ROOT / "presentation/data/states_svg.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print("ok", len(out["states"]), "states, height", H, "size", sum(len(v["d"]) for v in out["states"].values()) // 1024, "KB")
