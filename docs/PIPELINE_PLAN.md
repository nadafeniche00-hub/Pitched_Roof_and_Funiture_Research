# From tools to one pipeline: step by step

Written 31 Oct 2026 for the MID 3000 mid-term (4 Nov) and the finals (Feb). CRISP-DM is the frame: every loop below is one
turn of business understanding, data understanding, preparation, modelling, evaluation, deployment.

## The idea in one sentence

Pretrained models already read plans and segment images. Nobody scores what a person can use under a pitched roof.
So we **do not train a generator**: we collect what exists, wire the pieces into one pipeline, and put our own engine
(height field, usable area, rules, circulation) at the centre as the part that is new.

```
site + law  ─┐
plan image ──┼─► read (CV / VLM) ─► rooms JSON ─► Rooms builder ─► Furnish ─► Evaluate (engine, rules, escape routes) ─► explain
bubble brief ┘                                      ▲                                         │
                                                    └──────────── Repeat loop (Swalloop style) ┘
```

## What exists now (verified by running it)

| Piece | Where | State |
|---|---|---|
| Engine: height field, usable area, fit, circulation | `shared/engine.js` | tested |
| Fact check and 10 layout rules | `shared/rules.js` | tested |
| Pattern tree and Repeat/Fold loop | `shared/patterns.js`, `shared/iterate.js` | tested |
| Room builder: brief to 3 scored layouts, escape routes | `shared/plans.js`, tab **Rooms** | tested |
| Furnish the rooms of a layout | `shared/furnish.js` | tested |
| Knowledge base: 35 sources (data, models, vocabularies, law, tools) | `shared/sources.json`, view **Knowledge** | written; licences marked "to verify" |
| Airflow stack and a data-audit DAG | `pipeline/airflow/` | written, **not run yet** |
| Server inventory notebook | `pipeline/notebooks/00_inventory.ipynb` | written, **not run yet** |

## Steps

Each step ends in something you can show. Steps 1 to 4 are for 4 Nov.

### 1. Look before building (Sat 1 Nov)
- Run `00_inventory.ipynb` in your Real2Twin lab. It writes `inventory.json`: GPU and memory, which of geopandas, SAM,
  Grounding DINO, rdflib, momepy and others are installed, and whether the team LLM serves an image model.
- Ask Hrithik Shetty (GX10 contact) two things: is a vision model behind vllm, and is a 4 GB Airflow container fine.
- **Learn:** read a Dockerfile and a compose file line by line (yours in `Real2Twin/gx10-server/real2twin-stack`).
- **Show:** the inventory table as a slide: "what we already have on the server".

### 2. Airflow, small (Sat to Sun)
- Deploy `pipeline/airflow/docker-compose.yml` in Portainer as stack `nada-airflow` (check the volume name and port first).
- Upload `pipeline/airflow/dags/catalog_audit.py` and `shared/sources.json` to `/workspace/usable-space/` through JupyterLab
  (`dags/` and the file next to it). Trigger the DAG `catalog_audit` in the web UI.
- **Learn:** what a DAG, a task and a run are; why a pipeline beats a notebook for repeatable work; XCom and task mapping later.
- **Show:** the green DAG graph and `catalog_audit.json` (how many sources reachable, which licences still to verify).
- **Risk:** if the container does not start by Sunday evening, skip it and show the DAG file with the same output made by
  a plain script. Airflow is for learning and for February, not a blocker.

### 3. Plan reading, first working version (Sun to Mon)
- Next notebook `01_plan_reading.ipynb` (I write it after the inventory): a plan image goes in, SAM cuts regions, Grounding
  DINO or a vision-language model names them, the result is the same room JSON our Rooms tab uses.
- The app gets an **Import plan** button that accepts that JSON, so "image to scored attic" runs end to end.
- **Learn:** how segmentation masks become polygons and rectangles; how to judge a model with a handful of hand-labelled plans
  (Real2Twin already has `hand-labelling-sample-protocol.md`: reuse its protocol).
- **Show:** upload a plan image, see rooms appear, see the attic score. This is the moment that feels relevant to Tareef:
  his plans, our second opinion.

### 4. Knowledge in the loop (Mon)
- The Knowledge view is the catalogue; make three entries actually do something: the AAT terms label rooms in German and
  English, WoFlV is the cited source of the 100 / 50 / 0 % rule, BauO NRW citations sit next to the escape-route and
  daylight rules.
- **Learn:** SKOS and SPARQL basics (Real2Twin notebook `02_vocabulary_aat_subset.ipynb` is the model).
- **Show:** hover a rule and see its legal source or "rule of thumb, to verify".

### 5. Presentation and rehearsal (Tue 4 Nov)
- Add two slides to the deck: **available tools** (the catalogue by track) and **the pipeline run live**.
- Rehearse the demo path once with the projector. Keep a recorded fallback.

### After 4 Nov (towards Feb)
6. **Data audit as CRISP-DM loop 1:** CubiCasa5K and MSD downloaded to the server (check licences first), counts and examples, a
   hand-labelled set of 50 attic or roof-level plans (nobody has one: this is your dataset).
7. **Site and roof:** NRW LoD2 roof shapes for Detmold through GeoPandas; BauNVO and ALKIS attributes; three regional
   archetypes (Freilichtmuseum Detmold as the case study).
8. **Learned layer:** collect pairwise ratings of layouts inside the app (architects, classmates), fit a small preference
   model, and compare it to the rule score. Baseline first, always.
9. **Comparison with generators:** run House-GAN++ / HouseDiffusion on the same briefs and score their plans with our engine.
   The expected finding, to be tested and not assumed: they ignore slopes.
10. **Real2Twin bridge:** as-built roof geometry from scan or splat as the engine's input; the same Airflow for both projects.

## What we borrow from your other projects

- **Real2Twin:** numbered smoke-test notebooks (`00` check, `01` smoke test, ...), a `findings.md` per step, "checked / to verify"
  labels on every source. We use the same habits so the two projects read alike.
- **Sportify:** one pure engine file with its rules written at the top (R1 to R7) and a seeded solver with tests. The Rooms
  builder follows that shape.
- **Swalloop:** the loop with Max iter., Tolerance and a replayable history. Already in the Repeat/Fold loop.

## Honest limits

- Licences, repository states and model names are from memory or from the Real2Twin notes: the Knowledge view says which.
- Nothing here is a code-compliance check. Thresholds are rules of thumb until a professor or the source confirms them.
- Do not scrape plan portals. Use open datasets and cite them. Ask the university about the text-and-data-mining exception
  before crawling anything.
- The server is shared (121 GiB between CPU and GPU, the team LLM already reserves 0.60 of GPU memory): cap every container.

## Status 31 Oct 2026 (evening)

- Step 1 (inventory): done, `pipeline/inventory-2026-10-31.md`.
- Step 3 (plan reading), first working version: `01_plan_reading.ipynb` ran on the server and read all 5 rooms of a synthetic test plan to
  within 4 cm (OpenCV wall segmentation; door gaps up to 0.9 m sealed). The app imports the JSON through **Import plan** / **Sample plan**
  in the Rooms tab (`shared/planImport.js`, tested). Not yet tried on a real plan image: expect L-shaped rooms to be dropped and room types
  to be guessed from the size until SAM 2.1 / Grounding DINO labelling is added.
- Step 2 (Airflow) not started. GeoPandas is missing in the container (`pip install geopandas pyproj` first).

## Status 1 Nov 2026

- **AI part:** `02_vision_clip.ipynb` ran on the GX10 on 3 real photos of the Real2Twin building (a stone church): Grounding DINO found doors, windows, dormers and roofs from words, SAM 2.1 cut the roof out, Depth Anything gave depth maps, CLIP named the style ("stone building", 91 to 96 %) and searched all 25 photos by text. Zero-shot, no accuracy measured. CLIP's roof-type guesses are not used: the roofs are barely visible. Results in `presentation/ai/`, slide "The AI part".
- **Roof patterns:** `pipeline/analysis/roof_patterns.py` mined 12,413 OpenStreetMap buildings with a roof shape in Kreis Lippe (`docs/ROOF_PATTERNS.md`, `shared/roofPatterns.json`). Dwellings: 82.8 % gabled, 6.7 % hipped, 3.9 % half-hipped, 3.9 % flat; flat roofs are mostly outbuildings. Attic and material tags mostly show how mappers tag. The app shows a "Roofs in the region" card; the deck has a "Patterns from real roofs" slide. Next: repeat on NRW LoD2 (surveyed) for pitch and roof-type distributions.
- **Local tools:** Python 3.12 and a `.venv` (not committed) with pandas, scikit-learn, xgboost, lightgbm, mlxtend, duckdb, shapely, geopandas, statsmodels, networkx, JupyterLab. First imports of statsmodels and geopandas are slow (over 25 s).
- **Airflow locally:** not possible natively on Windows. WSL2 core was enabled, but Windows reports that CPU virtualization is off in the firmware: it must be enabled in the BIOS/UEFI first (then reboot, `wsl --install -d Ubuntu`, Airflow inside). Docker Desktop has the same requirement. The server stack `pipeline/airflow/` is the alternative.

## Status 1 Nov 2026 (LoD2)

- `pipeline/analysis/lod2_roofs.py` read 4 NRW LoD2 tiles of 1 km around the centre of Detmold (98 MB, not committed): 5,324 buildings and parts, 1,551 dwellings, 602 gable dwellings with a usable pitch. Findings in `docs/LOD2_PATTERNS.md`, aggregates in `shared/lod2Patterns.json`.
- Surveyed gable pitch: median 43.3° (10 to 90 %: 27.8° to 53.1°); outer span median 8.9 m, length 11.7 m, eave 6.2 m. Our default attic (38°, 5 m wide) is shallower than the median and narrower than 95 % of real spans: new preset "Median gable house, Detmold centre".
- Our usable-area rule on the real cross sections (knee wall 0.9 m assumed, not in LoD2) counts a median 85 % of the floor (68 to 90 %).
- Only 39 % of the dwellings in the centre are plain gable roofs, 33 % are mixed forms, 10 % shed, 9 % flat, 5 % hipped: the OSM district-wide shares (83 % gabled) and the surveyed centre differ. More tiles are needed before generalising.

## Status 1 Nov 2026 (LoD2, 11 tiles)

- Added 7 residential tiles south of the centre (90 MB): now 11 tiles, 10,949 buildings and parts, 2,978 dwellings, 1,379 gable dwellings with a usable pitch (`docs/LOD2_PATTERNS.md`).
- Median gable pitch 40.6° overall; **43.3° in the old centre, 38.5° in the outskirts**: our default of 38° matches the suburbs. Outer span median 9.1 m in both zones. Gable roofs are 39 % of the dwellings in the centre and 55 % outside; about a third carry the "mixed form" code in both. Our usable-area rule counts a median 83.8 % of the floor on the real cross sections (knee wall 0.9 m assumed).
- Preset "Median gable house, Detmold (LoD2)" updated to the 11-tile medians (41°, 8.2 m x 10.2 m inside).
