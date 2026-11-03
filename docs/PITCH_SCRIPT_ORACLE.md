# Pitch script: the Spatial Oracle (committee of architects, 4 Nov 2026)

Four parts, about 2 minutes each, then questions. Every claim is tied to what exists in this repository. **Built** = runs and is tested; **Design** = decided, partly prototyped, not in the app; **Roadmap** = not started. Say these three words out loud: architects trust a speaker who marks the edge of the work.

**The thesis in one sentence:** *A language model may propose, a deterministic oracle decides.* Geometry under a pitched roof is arithmetic, so the part that must be right is code that can be read, tested and argued with.

## What is real, and what is not (read this before you present)

| Claim in the brief | Status | Where / what to say instead |
|---|---|---|
| Rules are deterministic code, not learned | **Built** | `shared/knowledge.js` (WoFlV, LBO, NEUFERT, ADJACENCY), `shared/engine.js`, `shared/rules.js`, `shared/plans.js`; `server/test/knowledge.test.js`; 81 server tests pass |
| The oracle is a Python script | **True for the audit, not for the app** | `pipeline/oracle/usable_oracle` is a pure-Python rule system (standard library only, 27 tests) that audits plans and can gate the pipeline. The app itself checks in **JavaScript** (`shared/`) so that it runs in the browser. They agree: the Python rule found all 15 plans with a wall on a window that the JavaScript had flagged |
| Height envelope, three zones | **Built, as thresholds** | WoFlV §4: 2.0 m and above counts 100 %, 1.0 to 2.0 m 50 %, below 1.0 m 0 %. "Zone A, B, C" are the names for the slide, the code has the thresholds |
| Neufert ergonomics | **Built (rounded values)** | `NEUFERT` in `knowledge.js`: bed 1.50 m over the head end, 1.00 m over the rest, 0.60 m beside it, standing room 1.80 m (wardrobe, WC), 1.90 m basin, 2.00 m shower, circulation 0.90 m, door leaf 0.90 m. "After Neufert, rounded to 5 or 10 cm" |
| Privacy topologies | **Built, as adjacency and circulation rules** | `ADJACENCY` (bath next to bedrooms; kitchen next to living; no bath or WC door into kitchen or living) and `CIRCULATION` (no walk through a bedroom, depth from the stair hall at most 2 for sleeping rooms; after Hillier and Hanson). It is not a measured privacy gradient |
| Qwen-VL translates input | **Built, in part** | `server/ai.js`: `briefFromText` (words to a brief), `roofFromPhoto`, `planFromSketch`. The model behind the team's Open WebUI on the GX10 is a Qwen model; check the exact name there before you show it |
| OpenCV deterministic wall extraction | **Design, prototype only** | Notebook `01_plan_reading` on the GX10: walls are pixels below 128, doors sealed, rooms from closed regions; **5 of 5 rooms within about 4 cm on one synthetic plan**. Not in the app's runtime path, not tested on real plans |
| The runtime sketch path is safe | **No** | `planFromSketch` lets the vision model write room coordinates. That is the weak link (see the next section) |
| Office DNA from past projects | **Roadmap** | Nothing is built or ingested. See part 4 for the design |
| Grounded-SAM | **Used in notebooks, not in the app** | Notebooks 02 and 05: Grounding DINO + SAM 2.1 + Depth Anything V2 + CLIP, **zero-shot, nothing trained, no accuracy measured**; notebook 05 uses generated photos |

**The honest weak point, which is also the reason for the design:** the plan builder (`shared/plans.js`) cuts the footprint with random slicing trees and scores them (`scorePlan`). It is simple and explainable, and its plans are checked rather than clever. The weakest runtime link is the vision model writing coordinates. The oracle exists so that a bad proposal is *visible and rejectable*, instead of silently drawn.

---

## Part 1: The core paradigm (why a hybrid is mandatory)

**Slide:** two columns. Left "A model proposes": rooms, names, intent, words. Right "Arithmetic decides": heights, widths, areas, clearances.

**Script (about 2 minutes):**

"Language and vision models are good at meaning and weak at measurement. A floor plan under a pitched roof is mostly measurement: how high is the ceiling at this point, does a bed head fit, does half of this room count as living area. A recent paper on floor plans with language models says it plainly: existing generative methods mainly handle connectivity and not numerical constraints. Their answer is to train a language model against a checker that can prove a plan right or wrong, reinforcement learning with verifiable rewards. Look at what their checker checks: that rooms do not overlap, that the connections match the bubble diagram, and that the total area is right. By their own account, circulation, egress, daylight, structure and building codes are not modelled, and it is a single flat storey: there is no roof in it. That is exactly where our oracle starts. We take their idea, a verifier that decides, and give it the part they leave out: heights under the slope, ergonomics, circulation. And we do not train anything: every proposal, from a person, a model or a generator, goes through the same arithmetic."

**What the paper does, so you can answer questions about it (arXiv:2605.14117, read on 3 Nov 2026):** Llama-3.3-70B-Instruct, LoRA fine-tuning then GRPO, on RPLAN (80,788 plans, 5 to 8 rooms). Reward = a hard gate (invalid JSON or overlapping polygons score 0) plus the average of a connectivity score against the bubble diagram and a total-area score. Per-room area is evaluated, not rewarded. Results on the 8-room task: compatibility 0.15 against 2.5 for HouseDiffusion (a 94 % reduction), realism from 40 volunteers; best-of-10 sampling is used and the baseline numbers are taken from the HouseDiffusion paper. Stated limits: one dataset, no multi-seed runs, occasional overlaps at higher room counts, and the results are no evidence of code compliance.

**Evidence you can show (your own, not borrowed):** `docs/KNOWLEDGE_BASE.md`, "the example that started this": a generated 6.00 x 7.50 m attic, knee wall 1.20 m. Under the old rules the double bed head sat against the knee wall with 1.25 m over it; under the rules in the oracle the head end has 1.75 m (the rule asks 1.50 m). It is a rule-based generator, not a language model, so present it as "even a rule-based generator without a height envelope puts a bed where you cannot sit up".

**Do not say:** "LLMs hallucinate lines in our tests". You have not measured that. Say "the literature reports", and cite the paper.

## Part 2: The pipeline

```
words / sketch / photo
   │
   ▼  1  SEMANTIC TRANSLATOR (Qwen via Open WebUI on the GX10)
   │     in:  a description, a sketch, a roof photo
   │     out: a JSON brief: room types, wanted areas, links  (sanitizeBrief clamps and repairs it)
   │     never out: coordinates it has to be trusted on
   ▼  2  DETERMINISTIC GEOMETRY (OpenCV, NumPy)       [design: notebook 01 only]
   │     in:  a plan raster
   │     out: walls and room rectangles in metres
   ▼  3  SPATIAL ORACLE (JavaScript, shared/)
         in:  rectangles, the roof, a brief
         out: counted area per room, findings with reasons, a score, accept or reject
```

Speak it as three promises: stage 1 *understands*, stage 2 *measures*, stage 3 *judges*. The boundary rule is the point: **no number that stage 3 relies on comes from a model.**

Say what is true today: stage 1 and 3 run in the app; stage 2 is a prototype on the GX10 and the app's sketch path still asks the vision model for coordinates. Moving geometry out of the model is the next step, and the presentation can say so.

## Part 3: The Spatial Oracle

**Slide:** a section through a pitched roof with three bands, and a table beside it.

| Zone (slide name) | Clear height | Counts as living area | What may stand there (code) |
|---|---|---|---|
| A, standing | 2.0 m and above | 100 % (WoFlV §4) | circulation (0.90 m), wardrobe and WC fronts (1.80 m), basin (1.90 m), shower inside (2.00 m) |
| B, furniture | 1.0 to 2.0 m | 50 % | low furniture, the foot of a bed (1.00 m); the head end of a bed needs 1.50 m over its first 0.90 m |
| C, eaves | below 1.0 m | 0 % | storage only, nothing counted |

Also checked (`plans.js`, `rules.js`): habitable attic room needs 2.20 m over at least half the floor (`lbo-height`, Musterbauordnung values, **verify per Land**), door swings stay free (`door-swing`), wanted and unwelcome neighbours (`adjacency`), no walk through a bedroom, bed head against a wall, wet pieces together, free landing at the stair, desk daylight, escape light.

**Show it live, not as a slide:** open the app, make a plan, point at the findings list. Each finding says *which* rule, *where*, *why*. That list is the oracle, and it is what an architect can disagree with line by line. Every rule is switchable in the UI and carries its reason.

**What to concede:** the thresholds are planning rules of thumb for design exploration, not code compliance; the Landesbauordnungen differ by state; window area (1/8 of the floor) and escape windows are documented but not yet checked (`docs/KNOWLEDGE_BASE.md`).

## Part 4: The Office DNA advantage (a design, not a feature)

**Slide:** the same graph, drawn from three past projects of one office, with the common edges highlighted.

Say first: "This part is a design. Nothing from a real office is ingested yet."

**The idea:** each past project becomes a small structured graph, so that the oracle's hand-written defaults can be replaced by an office's own habits.

- **Nodes:** room (type, rectangle, counted area, share of usable height), stair, the roof (pattern, pitch, knee wall).
- **Edges:** door, shared wall, stair access, with the width.
- **Used for:** (1) adjacency frequencies instead of the six hand-written rules in `ADJACENCY` (the knowledge base already names this as the next step); (2) weights of the score; (3) retrieval of similar past plans to seed candidates.
- **Ingest:** a Revit add-in that reads rooms and walls from past models into this graph. You already have the opposite direction (`revitExport.js` writes numbers for the demo builder) and a Revit add-in that reads data out of Revit (`pipeline/revit/TemplateExport`), so the pattern is proven; the project reader is new work.
- **Privacy of the office's work:** past projects are confidential: keep the graphs and the oracle on the office's own machine or the on-premises GX10, never in a public service.
- **Honest open question:** how many projects make a stable pattern? With under a few dozen, treat the result as a suggestion, not a rule.

## Questions to expect, and straight answers

1. *"Is this validated?"* The rules are tested (81 tests, the example above). Plan quality against a benchmark has not been measured; the datasets below are the way to do it.
2. *"Why not train a model?"* Training needs a checker anyway (the ACL paper). We built the checker first and it is useful alone.
3. *"Whose numbers are these?"* Neufert and DIN dimensions rounded, WoFlV (federal), MBO values marked "verify". Each rule in `knowledge.js` names its source.
4. *"Does it replace an architect?"* No. It finds what a plan gets wrong under a slope, fast. It is not a permit check.
5. *"What did the AI actually do?"* Zero-shot detection and segmentation on photos, and language to brief. Nothing trained, no accuracy figures.

## References for the last slides (checked against the pages on 3 Nov 2026)

1. **Lara, Milios, Luo, Sharma, Luo, Beckham, Golemo, Pal.** *Generative Floor Plan Design with LLMs via Reinforcement Learning with Verifiable Rewards.* Findings of ACL 2026, arXiv:2605.14117 (13 May 2026). They fine-tune Llama-3.3-70B on RPLAN, then apply reinforcement learning with verifiable rewards (overlap gate, connectivity, total area). **Our relation: the same verifier idea, used as a runtime check and filter without training, and covering what their reward does not: heights under a roof, ergonomics, circulation.** Do not say the paper models roofs or codes: it states that it does not.
2. **van Engelenburg et al.** *MSD: A Benchmark Dataset for Floor Plan Generation of Building Complexes.* ECCV 2024, arXiv:2407.10121. Modified Swiss Dwellings: over 5.3K plans and 18.9K apartments, multi-apartment buildings.
3. **Abouagour, Garyfallidis.** *ResPlan: A Large-Scale Vector-Graph Dataset of 17,000 Residential Floor Plans.* arXiv:2508.14006 (Aug 2025; v2 Aug 2026). **Your list left out "of 17,000 Residential Floor Plans" in the title; use the full one.** Vector geometry plus room-connection graphs, which is the shape the Office DNA graph borrows.
4. **Grounded-Segment-Anything** (IDEA-Research, Apache-2.0), github.com/IDEA-Research/Grounded-Segment-Anything; cite the technical report it asks for, *Grounded SAM: Assembling Open-World Models for Diverse Visual Tasks*, arXiv:2401.14159. **Our notebooks use Grounding DINO + SAM 2.1, the same idea with a newer segmenter**: say so, do not imply the repository itself ran.
5. **OpenCV** (opencv.org): contour and distance-transform wall extraction in notebook 01. (SciPy is not used in that notebook: leave it off the slide unless you add it.)
6. **Neufert, *Bauentwurfslehre* (Architects' Data).** Cite it as the source of planning dimensions. **Copyright:** the book is in copyright, and scans found online are usually unlicensed copies. Quoting a few rounded numbers with a citation is normal practice; do not put scanned pages or tables on a slide unless you hold the right to.
7. **Own sources, already in the code:** WoFlV §4; Musterbauordnung (marked verify); Hillier and Hanson, *The Social Logic of Space* (1984).

## A measured result you can show (3 Nov 2026)

The Python audit measured the app's plans before and after the fixes, on the same 60 seeded attic plans: **furniture inside walls 100 % -> 0 %, walls inside walls 100 % -> 0 %, partition walls ending on a window 75 % -> 2 %, plans with a room too small between the walls 87 % -> 35 %** (every remaining one is a brief that does not fit the roof, and the app warns about it). Plans with any error: 60 of 60 before, 22 of 60 after. Source and caveats: `pipeline/oracle/README.md`. Say it as "found by an independent checker, fixed at the cause, measured again"; do not say "solved": too small rooms remain when the brief asks for more than the roof gives.

**Caution on numbers:** areas are now counted between the walls, so the same attic shows a smaller floor than before (the test attic: 43 to 34 m²). Check any slide that quotes an area against the app before presenting.

**What the AI measurement showed (docs/AI_WORKFLOW.md):** Qwen read 11 clean synthetic plans with IoU 0.94 and passed the checker every time, so the repair loop was never needed; its errors are small shifts of room edges that only pixels can catch. That is the argument for letting Grounded-SAM and OpenCV measure and keeping the model for meaning.

## Timing

Part 1: 2 min. Part 2: 2 min. Part 3: 3 min including the live findings list. Part 4: 2 min. Questions: the rest. If time is cut, drop part 4 to one sentence and keep part 3 live: it is the strongest thing you have.
