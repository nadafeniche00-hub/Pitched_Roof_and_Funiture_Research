"""Building footprints of the four Detmold-centre LoD2 tiles for the zoom animation in the deck.

Input : pipeline/data/lod2/LoD2_32_49{0,1}_575{2,3}_1_NW.gml   Output: presentation/data/detmold.json
Per building: footprint path in decimetres (origin south-west corner of the 2 km square, y downwards), roof type, dominant pitch, function group.
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
NS = {"core": "http://www.opengis.net/citygml/1.0", "bldg": "http://www.opengis.net/citygml/building/1.0", "gml": "http://www.opengis.net/gml"}
B, G = "{%s}" % NS["bldg"], "{%s}" % NS["gml"]
E0, N1 = 490000.0, 5754000.0
TILES = ["LoD2_32_490_5752_1_NW.gml", "LoD2_32_490_5753_1_NW.gml", "LoD2_32_491_5752_1_NW.gml", "LoD2_32_491_5753_1_NW.gml"]
ROOF = {"1000": 0, "2100": 1, "3100": 2, "3200": 3, "3300": 4, "3400": 5, "5000": 6}  # flat, shed, gabled, hipped, half-hipped, mansard, mixed


def ring(text):
    v = np.fromstring(text, sep=" ")
    return v[: len(v) // 3 * 3].reshape(-1, 3)


def surfaces(el, kind):
    out = []
    for bb in el.findall(B + "boundedBy"):
        s = bb.find(B + kind)
        if s is not None:
            out += [ring(pl.text) for pl in s.iter(G + "posList") if pl.text]
    return out


def normal(p):
    q = np.roll(p, -1, axis=0)
    return np.array([np.sum((p[:, 1] - q[:, 1]) * (p[:, 2] + q[:, 2])), np.sum((p[:, 2] - q[:, 2]) * (p[:, 0] + q[:, 0])), np.sum((p[:, 0] - q[:, 0]) * (p[:, 1] + q[:, 1]))])


def one(el):
    rt, roofs, grounds = el.findtext(B + "roofType"), surfaces(el, "RoofSurface"), surfaces(el, "GroundSurface")
    if rt is None or not roofs or not grounds:
        return None
    sl, ar = [], []
    for p in roofs:
        n = normal(p); L = np.linalg.norm(n)
        if L > 1e-6:
            sl.append(np.degrees(np.arccos(min(1.0, abs(n[2]) / L)))); ar.append(L / 2)
    sl, ar = np.array(sl), np.array(ar)
    ok = (sl >= 5) & (sl <= 80)
    pitch = None
    if ok.any():
        o = np.argsort(sl[ok]); cs = np.cumsum(ar[ok][o]); pitch = float(sl[ok][o][np.searchsorted(cs, cs[-1] / 2)])
    g = max(grounds, key=lambda p: Polygon(p[:, :2]).area)
    poly = Polygon(g[:, :2])
    if not poly.is_valid or poly.area < 6:
        return None
    poly = poly.simplify(0.4)
    pts = [(round((x - E0) * 10), round((N1 - y) * 10)) for x, y in poly.exterior.coords]
    d = "M" + "L".join(f"{x} {y}" for x, y in pts[:-1]) + "Z"
    fn = (el.findtext(B + "function") or "").replace("31001_", "")[:1]
    return {"d": d, "r": ROOF.get(rt, 7), "p": round(pitch) if pitch else None, "f": fn, "a": round(poly.area)}


rows = []
for t in TILES:
    n0 = len(rows)
    for _, el in ET.iterparse(ROOT / "pipeline/data/lod2" / t, events=("end",)):
        if el.tag in (B + "Building", B + "BuildingPart"):
            r = one(el)
            if r:
                rows.append(r)
        if el.tag == "{%s}cityObjectMember" % NS["core"]:
            el.clear()
    print(t, len(rows) - n0, file=sys.stderr)
out = {"size_m": 2000, "roof_names": ["flat", "shed", "gabled", "hipped", "half-hipped", "mansard", "mixed", "other"], "source": "NRW LoD2 (CityGML), opengeodata.nrw.de, open data", "buildings": rows}
(ROOT / "presentation/data/detmold.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print("ok", len(rows), "buildings,", round(len(json.dumps(out)) / 1024), "KB")
