# The oracle: a pure-Python rule system that checks the arithmetic of a floor plan

**A model proposes, rules decide.** Grounded-SAM and Grounding DINO say *what* is in a plan picture (a bedroom, a window on the north wall); a language model reads words; **pure-Python rules
(`usable_oracle`, standard library only) decide whether the numbers hold**: sizes between the walls, walls against windows, furniture against walls, walls against walls. No model is
ever asked whether a wall hits a window.

```
picture ──► Grounding DINO + SAM 2.1 (GX10)  ──► extraction.json   (boxes, labels)        semantic/gx10_extract.py   NOT RUN YET
words   ──► Qwen (Open WebUI, GX10)           ──► brief / rooms     (JSON, checked)        server/ai.js + shared/planCheck.js
the app ──► shared/plans.js + furnish + walls ──► cases.json        (plain geometry)       export_cases.mjs
                                   all three ──►  semantic/to_case.py ──► case ──► usable_oracle.rules ──► violations
```

## Run

```
node pipeline/oracle/export_cases.mjs --n 60 --seed 1          # plans from the app's own code, as geometry (writes out/cases.json)
cd pipeline/oracle
python -m usable_oracle.audit out/cases.json                   # how often each rule fires, with examples; exit 1 if any plan has an error
python -m unittest discover -s tests -t .                      # 27 tests of the rules, the converter and the calibration
```

## The rules (`usable_oracle/rules.py`), each with its source

| Rule | Answers | Source |
|---|---|---|
| `net-width`, `net-area` | too small spaces: judged on the room **between the walls** | the app's own minima (`ROOM_TYPES` in `shared/plans.js`); the areas are **provisional**, to be calibrated on real plans (`msd/`) |
| `wall-hits-window` | a partition wall ends on the outer wall inside a window opening | geometry |
| `furniture-in-wall` | a piece stands inside an outer wall or a closed partition | geometry |
| `pokes-into-outer-wall`, `overlapping-walls` | walls inside walls | geometry |
| `window-in-corner`, `window-overlap`, `door-not-between-rooms` | openings on their walls; a door within 0.05 m of both rooms it joins | ResPlan (windows align to a wall band in 99.98 %); MSD (door within 0.05 m of both areas) |
| `wall-thickness`, `area-sum` | wall thickness 10 to 40 cm; rooms add up to the footprint within +-25 % | ResPlan (99.3 % and 98.7 % of its 17,000 plans) |

The references (arXiv:2508.14006 ResPlan, arXiv:2407.10121 MSD, arXiv:2605.14117 on verifiable rewards, Grounded-Segment-Anything) are **training and reference material, not training data**:
nothing here is trained on them. They give the checks real plans pass and the numbers to calibrate against. **They state no minimum room size**: that rule is the app's.

## What the app was doing wrong, measured (same 60 seeded plans, before and after the fixes of 3 Nov 2026)

| Complaint | plans with the problem, before | after |
|---|---|---|
| too small spaces | 87 % | **35 %**, every one of them a plan the app itself flagged (a brief that does not fit the roof) |
| walls that hit windows | 75 % | **2 %** (1 plan) |
| furniture inside walls | 100 % | **0 %** |
| walls inside walls | 100 % | **0 %** |
| plans with any error | 60 of 60 | 22 of 60 |

The cause was one missing idea: rooms are rectangles that tile the footprint **including the walls**, and the outer wall (36.5 cm) lies inside it. Sizes, areas, furniture and doors were judged
on those rectangles. Now `WALLS` (`shared/knowledge.js`) is a shared fact: `netRect` gives the room between the walls and the plan builder judges it; furniture is limited to it
(`shared/furnish.js`) and the engine treats the outer wall as no floor (`shared/engine.js`); doors start inside the clear wall run (`shared/doors.js`); the technical plan stops partitions at the
inner face of the outer wall (`trimOuter` in `client/src/lib/walls.js`); the plan builder penalises a wall on a window and slides it away when it can (`repairWindows`).

**Side effect to know before you present:** areas are now counted between the walls (WoFlV § 3 counts clear dimensions; verify). The same attic shows a smaller floor and a smaller counted area than before
(the small test attic: 43 to 34 m² of floor). The numbers are the honest ones; slides that quote old values have to be checked.

**Not fixed:** a brief that cannot fit the roof still produces a plan; it comes with warnings and the audit counts it. The remaining step is to refuse it, or to propose fewer rooms (`capacity()`).
The Revit export keeps its numbers: `wallsOf` still runs to the footprint line unless `trimOuter` is asked for.

## The real plans: MSD (Modified Swiss Dwellings, Kaggle), integrated

The Kaggle archive (`archive.zip`, 5 GB, 16 GB unpacked) holds `mds_V2_5.372k.csv` (383 MB: **1,086,846 entities of 5,372 plans and 18,903 units**, one WKT polygon in metres per row) and about 21,000
`.npy` / `.pickle` files (image tensors and graphs for training models, **not used here**). Only the CSV is unpacked, to `pipeline/oracle/data/msd/` (git-ignored). The room polygons are the areas
between the walls, so they compare directly with the "net" rooms of the rules.

```
python msd/inspect_dataset.py data/msd           # files, columns, first rows
python msd/scan_dataset.py data/msd/mds_V2_5.372k.csv      # which categories exist (6 s)
python msd/run_calibration.py data/msd/mds_V2_5.372k.csv   # percentiles and false alarms (40 s) -> msd/calibration_results.json
```

**What 127,908 real rooms say about the app's provisional minima** (residential units; MSD has no child room, study or WC, and its "bathrooms" include WCs):

| Type | real net area: 5th percentile / median | share of real rooms BELOW the app's minimum (area) | (width) | Reading |
|---|---|---|---|---|
| bedroom | 10.0 / 14.3 m² | 0.1 % (min 7 m²) | 3.8 % (min 2.4 m) | the minima check what they should |
| living | 16.4 / 27.6 m² | 0.4 % (min 12 m²) | 0.7 % (min 3.0 m) | fine |
| kitchen | 4.5 / 8.0 m² | 7.5 % (min 5 m²) | **31 %** (min 2.2 m) | the width rule is too strict: real kitchens are often 1.6 to 2.2 m wide |
| bath | 1.5 / 3.8 m² | **21 %** (min 2.5 m²) | **29 %** (min 1.5 m) | too strict for what MSD calls bathrooms, but MSD lumps WCs in: the data cannot settle it |
| hall | 2.1 / 7.6 m² | 12 % (min 3 m²) | 8.8 % (min 1.2 m) | borderline |
| storage | 0.5 / 2.2 m² | 13 % (min 1 m²) | **48 %** (min 1.2 m) | the width rule is wrong for storerooms: half the real ones are narrower |

Real **openings and walls** against the app's assumptions: doors median 0.84 m wide (5th to 95th percentile 0.65 to 1.66: the app's 0.9 m is a normal door); windows median 1.40 m (0.58 to 2.78 m: wider
than the 0.9 to 1.6 m the audit generates); wall pieces median 0.175 m thick (0.07 to 0.45 m: the app's 11.5 cm partition is at the thin end, the 36.5 cm outer wall is normal).

**What follows, and what does not.** A rule that flags a large share of real rooms is a bad rule, so the kitchen and storage width minima should come down (to about 1.6 m and 0.8 m); the bath rule
needs a dataset that separates WCs. **These are recommendations: the app's minima are not changed yet**, because the plans are Swiss apartment buildings, not German attics, and a lower end of
real rooms is not a design target. Bedroom and living-room minima are validated as safe, not as right.
**ResPlan** (arXiv:2508.14006, 17,000 plans) is not loaded: it is a second dataset with the same purpose and would give a check on these numbers from a different country.

## Status

| Piece | Status |
|---|---|
| rules, audit, exporter | built; 27 Python tests, 96 server tests |
| fixes in the app | built and measured (table above) |
| `semantic/to_case.py` | built and tested on synthetic extractions |
| `semantic/gx10_extract.py` | **written, not run**: needs the GX10; zero-shot, never measured on line drawings |
| MSD calibration | **built and run** on 127,908 real rooms (results above, `msd/calibration_results.json`); 35 Python tests. ResPlan not loaded |
| Python rules inside the app | no: the app checks in JavaScript (`shared/`) for the browser; the Python rules audit and gate the pipeline. The two agree on windows (15 of 15 plans the JS flagged were found by the Python rule) |
