"""Roof patterns from NRW LoD2 (surveyed 3D building models, CityGML): Detmold centre and the residential area to the south (Hiddesen).

Input : pipeline/data/lod2/*.gml   (opengeodata.nrw.de, 3D-Gebaeudemodell LoD2, open data; not committed)
Output: shared/lod2Patterns.json   (aggregates only; read by the app)
        docs/LOD2_PATTERNS.md

Per building (and building part): roof type code, function, measured height, ground footprint, oriented span and length, dominant pitch
(area-weighted median slope of the roof surfaces), eave height. Then: how the pitch, the span and the eave height are distributed for
dwellings with a gable roof, and what our usable-area rule (100 % above 2.0 m, 50 % between 1 and 2 m, 0 below) would count on the real
roof cross sections. The knee wall under the slope is not in LoD2: it is an assumption and is varied.

Code lists (AdV roof types, ALKIS building functions) are used from memory: verify against the product documentation before citing.
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
NS = {"core": "http://www.opengis.net/citygml/1.0", "bldg": "http://www.opengis.net/citygml/building/1.0", "gml": "http://www.opengis.net/gml"}
B = "{%s}" % NS["bldg"]
G = "{%s}" % NS["gml"]
ROOF_NAMES = {"1000": "flat", "2100": "shed", "3100": "gabled", "3200": "hipped", "3300": "half-hipped", "3400": "mansard", "3500": "tent", "3600": "cone", "3700": "dome", "3800": "sawtooth", "3900": "arched", "4000": "tower", "5000": "mixed", "9999": "other"}


def ring(poslist):
    v = np.fromstring(poslist, sep=" ")
    return v[: len(v) // 3 * 3].reshape(-1, 3)


def newell(p):
    """Normal (not unit) of a closed 3D ring; its length is twice the area."""
    q = np.roll(p, -1, axis=0)
    return np.array([np.sum((p[:, 1] - q[:, 1]) * (p[:, 2] + q[:, 2])), np.sum((p[:, 2] - q[:, 2]) * (p[:, 0] + q[:, 0])), np.sum((p[:, 0] - q[:, 0]) * (p[:, 1] + q[:, 1]))])


def surfaces(el, kind):
    out = []
    for bb in el.findall(B + "boundedBy"):
        s = bb.find(B + kind)
        if s is None:
            continue
        for pl in s.iter(G + "posList"):
            if pl.text:
                out.append(ring(pl.text))
    return out


def one(el):
    rt = el.findtext(B + "roofType")
    roofs, grounds = surfaces(el, "RoofSurface"), surfaces(el, "GroundSurface")
    if rt is None or not roofs or not grounds:
        return None
    sl, ar, zmin, zmax = [], [], 1e9, -1e9
    for p in roofs:
        n = newell(p)
        L = np.linalg.norm(n)
        if L < 1e-6:
            continue
        sl.append(np.degrees(np.arccos(min(1.0, abs(n[2]) / L))))
        ar.append(L / 2)
        zmin, zmax = min(zmin, p[:, 2].min()), max(zmax, p[:, 2].max())
    if not sl:
        return None
    sl, ar = np.array(sl), np.array(ar)
    steep = (sl >= 5) & (sl <= 80)
    if steep.any():
        o = np.argsort(sl[steep]); cs = np.cumsum(ar[steep][o]); pitch = float(sl[steep][o][np.searchsorted(cs, cs[-1] / 2)])
    else:
        pitch = None
    g = max(grounds, key=lambda p: Polygon(p[:, :2]).area)
    poly = Polygon(g[:, :2])
    if not poly.is_valid or poly.area < 4:
        return None
    rect = poly.minimum_rotated_rectangle
    xs, ys = rect.exterior.coords.xy
    e1, e2 = np.hypot(xs[1] - xs[0], ys[1] - ys[0]), np.hypot(xs[2] - xs[1], ys[2] - ys[1])
    gz = float(np.mean([p[:, 2].min() for p in grounds]))
    return {"roof": ROOF_NAMES.get(rt, rt), "fn": (el.findtext(B + "function") or "").replace("31001_", ""), "h": float(el.findtext(B + "measuredHeight") or 0),
            "area": poly.area, "span": float(min(e1, e2)), "len": float(max(e1, e2)), "pitch": pitch, "eave": float(zmin - gz), "ridge": float(zmax - gz)}


rows = []
for f in sorted((ROOT / "pipeline/data/lod2").glob("*.gml")):
    n0 = len(rows)
    for _, el in ET.iterparse(f, events=("end",)):
        if el.tag in (B + "Building", B + "BuildingPart"):
            r = one(el)
            if r:
                r["tile"] = f.name
                rows.append(r)
        if el.tag == "{%s}cityObjectMember" % NS["core"]:
            el.clear()
    print(f.name, len(rows) - n0, "buildings", file=sys.stderr)

import pandas as pd

df = pd.DataFrame(rows)
df["group"] = df["fn"].str[:1].map({"1": "dwelling", "2": "commercial", "3": "public"}).fillna("other")
CENTRE = {"LoD2_32_490_5752_1_NW.gml", "LoD2_32_490_5753_1_NW.gml", "LoD2_32_491_5752_1_NW.gml", "LoD2_32_491_5753_1_NW.gml"}
df["zone"] = np.where(df["tile"].isin(CENTRE), "centre", "outskirts")
out = {"source": f"NRW LoD2 (CityGML), {df['tile'].nunique()} tiles of 1 km: the centre of Detmold (4) and the residential area to the south (7), opengeodata.nrw.de, open data", "n": int(len(df)), "tiles": int(df["tile"].nunique())}
out["by_group"] = {k: int(v) for k, v in df["group"].value_counts().items()}
dw = df[df["group"] == "dwelling"]
out["dwellings_n"] = int(len(dw))
out["dwelling_roof_share"] = {k: round(100 * v, 1) for k, v in dw["roof"].value_counts(normalize=True).head(8).items()}
q = lambda s: {p: round(float(s.quantile(v)), 2) for p, v in zip(["p10", "p25", "median", "p75", "p90"], [0.1, 0.25, 0.5, 0.75, 0.9])}

gab = dw[(dw["roof"] == "gabled") & dw["pitch"].notna()]
gab = gab[(gab["pitch"] >= 10) & (gab["pitch"] <= 70)]
out["gabled_n"] = int(len(gab))
out["gabled_pitch"] = q(gab["pitch"])
bins = np.arange(10, 75, 5)
hist, _ = np.histogram(gab["pitch"], bins=bins)
out["gabled_pitch_hist"] = {f"{int(a)}-{int(a) + 5}": int(c) for a, c in zip(bins[:-1], hist)}
out["gabled_span_m"] = q(gab["span"])
out["gabled_length_m"] = q(gab["len"])
out["gabled_eave_m"] = q(gab["eave"])
out["gabled_ridge_m"] = q(gab["ridge"])
out["gabled_footprint_m2"] = q(gab["area"])
out["pitch_by_roof"] = {r: {"n": int(len(g)), "median_deg": round(float(g["pitch"].median()), 1)} for r, g in dw[dw["pitch"].between(5, 80)].groupby("roof") if len(g) >= 15}
out["pitch_vs_span_corr"] = round(float(gab[["pitch", "span"]].corr().iloc[0, 1]), 2)

# our rule on the real cross sections: share of the floor counted if the attic floor sits knee wall k above the eave line
def counted_share(span, pitch, k, wall_thickness=0.0):
    x = np.linspace(0, span, 240)
    h = k + np.tan(np.radians(pitch)) * np.minimum(x, span - x)
    w = np.where(h >= 2.0, 1.0, np.where(h >= 1.0, 0.5, 0.0))
    return float(w.mean())

res = {}
for k in (0.5, 0.9, 1.3):
    s = np.array([counted_share(sp, pt, k) for sp, pt in zip(gab["span"], gab["pitch"])])
    res[str(k)] = {"median_counted_pct": round(100 * float(np.median(s)), 1), "p10": round(100 * float(np.quantile(s, 0.1)), 1), "p90": round(100 * float(np.quantile(s, 0.9)), 1)}
out["counted_share_by_knee_wall_m"] = res
app_pitch, app_span = 38.0, 5.0
def zone_stats(g):
    gg = g[(g["roof"] == "gabled") & g["pitch"].between(10, 70)]
    return {"dwellings": int(len(g)), "roof_share": {k: round(100 * v, 1) for k, v in g["roof"].value_counts(normalize=True).head(6).items()}, "gabled_n": int(len(gg)),
            "pitch": q(gg["pitch"]) if len(gg) >= 20 else None, "span": q(gg["span"]) if len(gg) >= 20 else None,
            "counted_pct_k0.9": round(100 * float(np.median([counted_share(a, b, 0.9) for a, b in zip(gg["span"], gg["pitch"])])), 1) if len(gg) >= 20 else None}
out["zones"] = {z: zone_stats(dw[dw["zone"] == z]) for z in ("centre", "outskirts")}
out["app_default"] = {"pitch_deg": app_pitch, "pitch_percentile": round(100 * float((gab["pitch"] < app_pitch).mean()), 0), "span_m": app_span, "span_percentile": round(100 * float((gab["span"] < app_span).mean()), 0), "counted_pct_k0.9": round(100 * counted_share(app_span, app_pitch, 0.9), 1)}
(ROOT / "shared/lod2Patterns.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")

md = ["# Roof patterns from NRW LoD2 (Detmold centre)", "", f"Source: {out['source']}. {out['n']:,} buildings and building parts with roof and ground surfaces; {out['dwellings_n']:,} dwellings; {out['gabled_n']:,} dwellings with a gable roof and a usable pitch.", "",
      "Surveyed geometry, not volunteered tags. It covers eleven 1 km tiles around Detmold (centre and a residential area): still one town, repeat on more tiles before generalising. Roof-type and function codes are from memory of the AdV/ALKIS code lists.", "",
      "## Roof types of dwellings", ", ".join(f"{k} {v} %" for k, v in out["dwelling_roof_share"].items()), "",
      f"## Gable roofs: pitch (degrees), span, eave and ridge heights", f"- pitch: {out['gabled_pitch']}", f"- span (short side of the footprint, m): {out['gabled_span_m']}", f"- length (m): {out['gabled_length_m']}", f"- eave height above ground (m): {out['gabled_eave_m']}", f"- ridge height above ground (m): {out['gabled_ridge_m']}", f"- footprint (m2): {out['gabled_footprint_m2']}", f"- correlation of pitch and span: {out['pitch_vs_span_corr']}", "",
      "## Centre against outskirts (dwellings)"] + [f"- {z}: {v['dwellings']} dwellings, {v['gabled_n']} gable with pitch; roofs {v['roof_share']}; pitch {v['pitch']}; span {v['span']}; counted share at the median {v['counted_pct_k0.9']} %" for z, v in out["zones"].items()] + ["",
      "## Median pitch by roof type (dwellings)"] + [f"- {k}: {v['median_deg']}° ({v['n']})" for k, v in out["pitch_by_roof"].items()] + ["",
      "## What our usable-area rule counts on these real cross sections", "Share of the floor counted (100 % above 2.0 m, 50 % between 1.0 and 2.0 m) for a gable roof of the real span and pitch, with the attic floor a knee wall above the eave line (not in LoD2: assumed):"] + [f"- knee wall {k} m: median {v['median_counted_pct']} % (p10 {v['p10']} %, p90 {v['p90']} %)" for k, v in res.items()] + ["",
      f"## Our default roof against the region", f"- pitch {app_pitch}°: {out['app_default']['pitch_percentile']:.0f} % of the gable dwellings are shallower; span {app_span} m: {out['app_default']['span_percentile']:.0f} % are narrower (the footprint span is the outer width; the usable attic floor is narrower)", f"- our default room counts {out['app_default']['counted_pct_k0.9']} % of its floor"]
(ROOT / "docs/LOD2_PATTERNS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md))
