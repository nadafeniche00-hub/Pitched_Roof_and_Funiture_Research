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

### Functional plans (3 Nov 2026, night): real-plan patterns became rules, and the brief is made to fit

`shared/plans.js` now carries numbers checked on 127,908 real rooms (MSD): `maxAspect` per room type (the 95th percentile of long side over short side: bedroom 1.95, bath 2.2, kitchen 2.46, living 2.45, storage
2.72, hall 3.96), and minimum widths where an old rule flagged a third of real rooms (kitchen 2.2 to 1.8 m, storage 1.2 to 0.8 m). A room longer than `maxAspect` x 1.3 is too thin (rule `net-aspect`).
`fitToRoof` makes a brief that asks for more than the roof gives fit it: wanted areas scale down towards the minimum area of their types, and if even the minima do not fit the least important rooms go
first (storage, study, WC, child room, kitchen, living room, bath, bedroom). `generatePlans` then searches harder when a layout still has a room too small or a wall on a window, and as a last step tries
every area 15 % smaller and then one room less: every plan carries `adjusted`, a plain sentence for each change, shown in the plan builder. `fit: false, degrade: false` gives the old behaviour.

| Plans with any error (oracle audit) | Share |
|---|---|
| at the start of the night (60 plans) | 100 % |
| after the wall fixes (same 60) | 37 % |
| after real-plan rules and fitting (120 plans, two seeds, 8 % and 13 %) | **11 %**: furniture in walls 0 %, walls in walls 0 %, a room too small or too thin about 9 %, a wall on a window about 3 % |

The rest are briefs for which no functional layout was found; every one comes with warnings. 26 of 60 plans were changed to be functional (23 rooms left out, 25 area scalings). The cost is honest:
a plan may have fewer rooms than asked, and it says which.

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

### The training files of the archive: graphs used, image tensors not (yet)

The archive's other 21,488 files are the ML-ready form of the same 5,372 plans: per plan an access graph in (`graph_in`, 1 KB) and out (`graph_out`, about 16 KB), and two 512-px images
(`struct_in`: the structure to start from; `full_out`: the finished plan; 1.5 MB each; 14 GB in all). Train 4,572 plans, test 800.

* **Graphs: used, and safely.** A `.pickle` is a program. The files import only NetworkX `Graph`, `dict`, `OrderedDict` and torch tensor rebuilders, one of which unpickles more data inside it, so
  `msd/safe_graphs.py` never imports networkx or torch: every allowed class is a stand-in, tensors become None, anything else is refused (a test feeds it a pickle that would run `os.system`).
  `msd/graph_stats.py` reads them straight from the zip (2 seconds). The room-type codes are the order of `ROOM_NAMES` in the MSD repository, **checked** by matching graph polygons to the CSV
  (graph file name = `floor_id`; 100 % agreement on 17,130 rooms).
* **Image tensors: not put on the GX10, for four reasons.** (1) They train plan *generators* for Swiss apartment buildings; they contain no roofs and no heights, so a model trained on them cannot learn
  the thing this product is about (the usable floor under a slope). (2) The server is shared: the language model and the GPU memory are one pool for the team, and a training job would take it from them.
  (3) Training would turn "nothing is trained" (what the deck and the guide say, truthfully) into a trained model that has to be evaluated and licensed: the dataset page says only "code and data are open", and the
  licence has not been checked. (4) The server was not reachable from here (no sign-in). **What would change this:** a training task that serves the product, for example a model that proposes
  room adjacencies, evaluated against the oracle, run in a night the team agrees to. The data is ready (`archive.zip` stays where it is; nothing needs unpacking until then).

**What real access graphs say about the app's hand-written graph rules** (`msd/adjacency_results.json`; 5,372 graphs, 165,341 rooms; edges: 126,114 door, 21,564 passage, 20,492 entrance):

| Rule in `shared/knowledge.js` | Real flats | Reading |
|---|---|---|
| unwelcome: a bath or WC door straight into the kitchen | 1.3 % of bathrooms have a door to a kitchen | confirmed: rare |
| unwelcome: a bath door straight into the living room | 5.1 % | confirmed: rare |
| no walk through a bedroom | **5.3 %** of 38,029 bedrooms are a way through to another room (closing the bedroom cuts a room off) | confirmed: 95 % of real bedrooms are dead ends |
| wanted: kitchen with the living room | 49.8 % of kitchens and 66.5 % of living rooms are connected (door or open passage) | common, not universal: right as a soft wish (`info`), wrong as a hard rule |
| sleeping rooms at most 2 doors from the entrance | 76 % of bedrooms are 1 connection from the entrance room, 16 % 2, 8 % deeper | consistent |
| wanted: a bath next to the bedrooms | not testable: it is about a shared wall (one plumbing stack), an access graph knows only doors; 87.8 % of baths and 86.1 % of bedrooms both hang on a corridor | needs the CSV geometry |

## Status

| Piece | Status |
|---|---|
| rules, audit, exporter | built; 27 Python tests, 96 server tests |
| fixes in the app | built and measured (table above) |
| `semantic/to_case.py` | built and tested on synthetic extractions |
| `semantic/gx10_extract.py` | **written, not run**: needs the GX10; zero-shot, never measured on line drawings |
| MSD calibration | **built and run** on 127,908 real rooms (results above, `msd/calibration_results.json`); 35 Python tests. ResPlan not loaded |
| Python rules inside the app | no: the app checks in JavaScript (`shared/`) for the browser; the Python rules audit and gate the pipeline. The two agree on windows (15 of 15 plans the JS flagged were found by the Python rule) |

### Distilled MSD: what real flats contain and how they connect (4 Nov 2026)

`msd/distill.py` reads the 5,372 access graphs of the MSD archive (13 seconds, standard library only, nothing in a pickle is executed) and writes the heavy data down to three small files:
`shared/msdPriors.js` (8 KB), `shared/msdExemplars.js` (450 KB, 350 real flats) and `msd/priors_results.json`. The raw archive and the 14 GB of image tensors stay on the computer and the server; the app carries only these.
A **flat** is a connected group of rooms: entrance edges and the public stairs are cut, what stays connected is one dwelling (16,744 of them, each with its entrance door, a bath and a bedroom or living room).

| What | Result (Swiss flats, not attics) |
|---|---|
| Bedrooms by size | 28 m² median: 70 % have one; 73 m²: 2 bedrooms 52 %; 89 m²: 2 bedrooms 49 %, 3 bedrooms 37 %; 109 m²: 3 bedrooms 64 %; 143 m²: 4 or more 71 % |
| Share of a flat's net area (65 to 80 m²) | bedrooms 43 %, living 26 %, hall 12 %, kitchen 12 %, bath 7 % |
| Where the front door opens | corridor 92 %, living room 4 %, bedroom 2 % |
| A bath is connected (door or open passage) to | the corridor 89 %, a bedroom **5 %**, the living room 5 %: baths have their door on the corridor, almost never into a bedroom. This is about DOORS: whether the two share a WALL is measured below |
| A bedroom is connected to | the corridor 89 %, a balcony 22 %, another bedroom 6 %, the living room 9 % |
| Kitchen and living room | connected in 50 % to 66 % of the flats, mostly by an open passage |

**Caution.** In MSD 34,379 of the 42,584 rooms typed Bedroom are the generic type ROOM (the CSV maps ROOM to Bedroom): "bedrooms" means habitable rooms that are not the living room, kitchen or bath, and the counts above are an upper bound
(26 % of the flats of 65 to 80 m² have no room that the data calls a living room). The exemplars are therefore taken only from flats of 40 m² and more that name a bedroom, a kitchen and a living room, no room over half of the flat,
a compact outline: 50 per size band, the ones furthest apart in size, bedrooms and proportion. Each carries its source (split, floor id). `server/test/msdPriors.test.js` checks the files against what the script promises.

#### Which rooms share a wall (the neighbour wishes, measured instead of written by hand)

The access graphs know doors, not walls, and the plan builder's wishes ("the bath next to the bedroom") are about shared walls. So `distill.py` also measures, from the room polygons, which rooms of a flat share a wall:
the boundary of one lies within 0.45 m of the other's for at least 0.9 m (a door fits; 2.5 minutes over 16,744 flats). Of the real flats that have both kinds of room, one room of the first kind shares a wall with one of the second kind in:

| Pair | Flats | Share a wall | Door of the rooms of the first kind (for comparison) |
|---|---|---|---|
| bath and a bedroom | 16,075 | **71 %** | 5 % of baths have a door into a bedroom |
| kitchen and living room | 12,343 | **79 %** | 21 % of kitchens have a door, 50 % are connected (open passage included) |
| bath and kitchen | 16,430 | 54 % | **1 %** of baths have a door into the kitchen |
| bath and living room | 12,417 | 44 % | 5 % |
| bath and corridor (the hall) | 15,997 | 98 % | 89 % |
| bedroom and corridor | 15,447 | 95 % | 87 % |

So the hand-written wishes were right, and they are now measured: the bath next to the sleeping rooms and the kitchen next to the living room are what most real flats do, and a door from the bath straight into the kitchen or the living room is what almost none do.
(My first reading, "a bath next to a bedroom is not how real flats connect", mixed the two questions: it is true for doors and false for walls.) What changed in the code: `shared/links.js` holds the measured shares; every rule of
`ADJACENCY` (`shared/knowledge.js`) carries its evidence and quotes it in its finding; the example brief and the question tree take their links from `defaultLinks` (only neighbours that at least half of the real flats have, one pair each),
and the rulebook sent to the language model quotes the numbers. `server/test/links.test.js` fails when a "want" rule is followed by less than half of the real flats or an "avoid" rule by more than a tenth of the real rooms.
A rule of the app that the data does not support can no longer be added without saying so. Rule audit after the change: 12 of 120 generated plans with any error (10 %), as before.
