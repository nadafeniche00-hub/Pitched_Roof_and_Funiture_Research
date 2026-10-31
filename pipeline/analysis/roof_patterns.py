"""Mine roof patterns from OpenStreetMap tags (buildings with a roof:shape tag, Kreis Lippe).

Input : pipeline/data/osm_roofs_lippe.json   (Overpass API, `out tags`; ODbL, not committed)
Output: shared/roofPatterns.json              (read by the app: regional check, roof suggestions)
        docs/ROOF_PATTERNS.md                 (what was found, how far to trust it)

Method (CRISP-DM, data understanding and modelling): counts and cross-tabs first, then a small decision tree and association rules
as a transparent baseline. OSM tags are volunteered: coverage is uneven and nothing here is a survey of the real stock.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier, export_text

ROOT = Path(__file__).resolve().parents[2]
rows = [dict(e["tags"], osm_id=e["id"]) for e in json.loads((ROOT / "pipeline/data/osm_roofs_lippe.json").read_text(encoding="utf-8"))["elements"]]
df = pd.DataFrame(rows)
n = len(df)

HOUSE = {"house", "detached", "semidetached_house", "terrace", "residential", "bungalow", "farm", "apartments", "yes"}
df["btype"] = df["building"].where(df["building"].isin(HOUSE | {"garage", "garages", "shed", "barn", "industrial", "commercial", "retail", "church", "school", "roof", "carport", "farm_auxiliary", "service"}), "other")
df["levels"] = pd.to_numeric(df.get("building:levels"), errors="coerce")
df["rlevels"] = pd.to_numeric(df.get("roof:levels"), errors="coerce")
df["shape"] = df["roof:shape"]
MAIN = ["gabled", "flat", "hipped", "half-hipped", "pyramidal", "skillion", "mansard", "gambrel"]
df["shape_g"] = df["shape"].where(df["shape"].isin(MAIN), "other")

def pct(x): return round(100 * float(x), 1)

out = {"source": "OpenStreetMap, buildings with roof:shape in Kreis Lippe, Overpass API, 31 Oct 2026 (ODbL)", "n": n}
out["shape_share"] = {k: pct(v) for k, v in (df["shape_g"].value_counts(normalize=True)).items()}

# the part that matters for a roof storey: dwellings with a pitched roof, and how often the roof holds a level
dwell = df[df["btype"].isin({"house", "detached", "semidetached_house", "terrace", "residential", "bungalow", "farm", "apartments"})]
out["dwellings_n"] = int(len(dwell))
out["dwelling_shape_share"] = {k: pct(v) for k, v in dwell["shape_g"].value_counts(normalize=True).items()}
known = dwell.dropna(subset=["rlevels"])
att = {}
for s in ["gabled", "hipped", "half-hipped", "mansard", "flat", "pyramidal", "skillion"]:
    sub = known[known["shape_g"] == s]
    if len(sub) >= 20:
        att[s] = {"n": int(len(sub)), "with_roof_level_pct": pct((sub["rlevels"] >= 1).mean()), "two_or_more_pct": pct((sub["rlevels"] >= 2).mean())}
out["roof_level_by_shape"] = att
out["roof_level_known_n"] = int(len(known))

lv = dwell.dropna(subset=["levels", "rlevels"])
lv = lv[(lv["levels"] >= 1) & (lv["levels"] <= 4) & (lv["shape_g"].isin(["gabled", "hipped", "half-hipped"]))]
tab = {}
for L, g in lv.groupby("levels"):
    tab[str(int(L))] = {"n": int(len(g)), "attic_pct": pct((g["rlevels"] >= 1).mean())}
out["attic_by_building_levels_pitched"] = tab

mat = dwell.dropna(subset=["roof:material"])
out["material_share_pitched"] = {k: pct(v) for k, v in mat[mat["shape_g"].isin(["gabled", "hipped", "half-hipped", "mansard"])]["roof:material"].value_counts(normalize=True).head(6).items()}
out["material_n"] = int(len(mat))
angle = pd.to_numeric(df.get("roof:angle"), errors="coerce").dropna()
out["roof_angle"] = {"n": int(len(angle)), "note": "too few tagged to give a pitch distribution" if len(angle) < 200 else "ok"}

# decision tree: can the roof shape be read from the other tags? (a transparent baseline, not a model to ship)
feat = pd.DataFrame({
    "levels": df["levels"].fillna(-1), "roof_levels": df["rlevels"].fillna(-1),
    "has_material": df["roof:material"].notna().astype(int), "has_orientation": df["roof:orientation"].notna().astype(int),
    "is_house": df["btype"].isin({"house", "detached", "semidetached_house", "terrace", "residential", "bungalow"}).astype(int),
    "is_outbuilding": df["btype"].isin({"garage", "garages", "shed", "barn", "carport", "roof", "farm_auxiliary", "service"}).astype(int),
    "is_big": df["btype"].isin({"industrial", "commercial", "retail", "apartments", "school", "church"}).astype(int),
})
y = df["shape_g"].where(df["shape_g"].isin(["gabled", "flat", "hipped", "half-hipped"]), "other")
tree = DecisionTreeClassifier(max_depth=3, min_samples_leaf=50, random_state=0).fit(feat, y)
cv = cross_val_score(DecisionTreeClassifier(max_depth=3, min_samples_leaf=50, random_state=0), feat, y, cv=5).mean()
base = y.value_counts(normalize=True).max()
out["tree"] = {"accuracy_cv5": pct(cv), "majority_baseline": pct(base), "rules": export_text(tree, feature_names=list(feat.columns)).splitlines()}

# association rules over a handful of tag facts
b = pd.DataFrame({
    f"shape={s}": df["shape_g"] == s for s in ["gabled", "flat", "hipped", "half-hipped"]
} | {
    "house": df["btype"].isin({"house", "detached", "semidetached_house", "terrace", "residential", "bungalow"}),
    "outbuilding": df["btype"].isin({"garage", "garages", "shed", "barn", "carport", "roof", "farm_auxiliary"}),
    "levels>=2": df["levels"] >= 2, "levels=1": df["levels"] == 1,
    "roof_level": df["rlevels"] >= 1, "material_tagged": df["roof:material"].notna(),
})
fi = apriori(b, min_support=0.04, use_colnames=True)
ar = association_rules(fi, metric="lift", min_threshold=1.15, num_itemsets=len(fi))
ar = ar[ar["consequents"].apply(lambda s: any(x.startswith("shape=") or x == "roof_level" for x in s)) & (ar["confidence"] >= 0.7)].sort_values(["lift", "support"], ascending=False)
out["rules"] = [{"if": sorted(a), "then": sorted(c), "support": pct(r.support), "confidence": pct(r.confidence), "lift": round(float(r.lift), 2)} for a, c, r in zip(ar["antecedents"], ar["consequents"], ar.itertuples()) ][:8]

(ROOT / "shared/roofPatterns.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")

md = ["# Roof patterns from OpenStreetMap (Kreis Lippe)", "", f"Source: {out['source']}. {n:,} buildings carrying `roof:shape`; {out['dwellings_n']:,} of them dwellings.", "",
      "Volunteered data: tagging is uneven, outbuildings are over-represented and nothing here is a survey of the real stock. It shows what a regional pattern looks like and how to mine one; February repeats it on LoD2 (surveyed) data.", "",
      "## Shapes", ", ".join(f"{k} {v} %" for k, v in out["shape_share"].items()), "", "Dwellings only: " + ", ".join(f"{k} {v} %" for k, v in out["dwelling_shape_share"].items()), "",
      "## How often the roof holds a level (roof:levels), dwellings"]
for s, v in att.items(): md.append(f"- {s}: {v['with_roof_level_pct']} % have at least one roof level ({v['n']} buildings with the tag), {v['two_or_more_pct']} % two or more")
md += ["", "## Attic by building levels (pitched dwellings)"] + [f"- {k} level(s): {v['attic_pct']} % have a roof level ({v['n']})" for k, v in tab.items()]
md += ["", "## Roof material (pitched dwellings)", ", ".join(f"{k} {v} %" for k, v in out["material_share_pitched"].items()) + f" (n = {out['material_n']})", "",
       f"## Decision tree (depth 3): predicts the roof shape from the other tags with {out['tree']['accuracy_cv5']} % cross-validated accuracy; always guessing 'gabled' gives {out['tree']['majority_baseline']} %", "```"] + out["tree"]["rules"] + ["```", "", "## Association rules (support, confidence, lift)"]
md += [f"- if {', '.join(r['if'])} then {', '.join(r['then'])}: support {r['support']} %, confidence {r['confidence']} %, lift {r['lift']}" for r in out["rules"]]
(ROOT / "docs/ROOF_PATTERNS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md))
