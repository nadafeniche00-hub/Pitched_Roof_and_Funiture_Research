# The AI workflow: a model proposes, a checker decides

The rule of the whole workflow: **no number that a plan relies on is taken from a model without being measured.** A language or vision model reads meaning (what a room is, what a sketch shows);
code measures (does it overlap, does it tile the outline, how high is the roof over it). When the measurement fails, the model gets the measured reason and tries again.

```
words / sketch / photo ──► model (Qwen on the GX10, one OpenAI-compatible endpoint)
                               │  answer: JSON brief or rooms as rectangles
                               ▼
                    shared/planCheck.js  (pure code, no model)
                    errors:  format · outside the outline · overlap · holes (< 85 % covered) · a sliver (< 0.8 m)
                    warnings: narrow for its type · gaps (< 95 %) · more than 8 rooms · headroom (with the roof)
                               │  ok ─────────────► the plan goes on (planImport.js, plan builder, furniture engine)
                               │  not ok, rounds left
                               ▼
                    the findings as text go back to the model ("ERROR: Rooms a and b overlap by 4.0 m²"),
                    at most AI_REPAIR_ROUNDS times; the answer with the fewest errors is returned, marked ok or not
```

## Configuration (server/.env, git-ignored; server/.env.example has the names)

| Variable | What it does | Value now |
|---|---|---|
| `LLM_URL` | the OpenAI-compatible endpoint: the team's Open WebUI on the GX10, reached over the VPN | `http://193.16.125.8:3000/api` |
| `LLM_API_KEY` | key made in Open WebUI, Settings, Account. Only in `.env`; never in a tracked file, a commit or a chat | (set) |
| `LLM_MODEL` | the model for text | `qwen3.8-27b`: the only model the server lists |
| `LLM_VISION_MODEL` | the model for images; empty = `LLM_MODEL` (Qwen reads images, so one model does both) | empty |
| `AI_REPAIR_ROUNDS` | how often a plan that fails the checker is sent back (0 = ask once, at most 4) | 2 (default) |

`GET /api/ai/status` says whether the server answers, which models it lists and whether the configured one is among them. `POST /api/ai/sketch` takes `{ image, rounds?, room? }`; with `room`
(the roof storey) the headroom of every room is checked as well. The answer has `check: { ok, rounds, history, findings }` next to the plan: a plan that never passed is shown as not ok.

**The server is shared.** One 27B model serves the whole team and the GPU memory is one pool (`resource_log.py` on the server says so). Each repair round is another call: keep rounds at 2, run
evaluations one case at a time, and not while a colleague is training or running a heavy job.

## Measuring it

`server/eval/` draws 12 attic plans with a known truth (plans of the plan builder, fixed seeds), asks the model to read each picture, and compares with the truth. Paired: the first answer of the
loop is the "one shot" result, the answer the loop returns is the "with the checker" result.

```
node server/eval/make_cases.mjs                                        # the truth, as JSON
python server/eval/render_plans.py                                     # the pictures (needs Pillow)
node --env-file=server/.env server/eval/sketch_eval.mjs --rounds 2     # asks the model; writes server/eval/results.json
```

### Result of the first run (3 Nov 2026, Qwen `qwen3.8-27b` on the GX10, 12 cases, one run, temperature 0.1)

| | one shot (the first answer) | with the checker and repair loop |
|---|---|---|
| plans answered | 11 of 12 (case 04 timed out at 120 s) | 11 of 12 |
| mean IoU with the truth | 0.94 | 0.94 |
| number of rooms right | 11 of 11 | 11 of 11 |
| room type right | 100 % | 100 % |
| passes the checker | 11 of 11 | 11 of 11 |
| repair rounds used | | **0**: nothing failed |
| time per plan | mean 73 s, 28 to 119 s | the same |

How to read it, plainly:

* **The loop was not tested by this run.** On clean, synthetic drawings Qwen never made the mistakes the checker is built for (overlap, holes in the outline, rooms outside it), so no plan was sent back. The loop is proved by its unit tests (a scripted fake model), not yet by a real failure. A fair test needs messy input: hand sketches, photos of drawings, scans.
* **What Qwen does get wrong is precision.** IoU is 0.97 for plans of 4 to 5 rooms (8 plans) and 0.86 for plans of 6 rooms (3 plans): small shifts of the room edges. Those still tile the outline, so the checker passes them. Only the pixels can say where a wall really is, which is why the geometry should come from pixel processing (OpenCV, Grounded-SAM masks) and the model should keep to meaning.
* **Speed is a real limit.** About 73 s a plan on a shared 27B model is too slow for a live demo, and one call ran into the 120 s limit.
* **Small numbers.** 12 cases, one run, no repeat: do not quote the third decimal. All plans are clean and drawn by one script, so the results are the best case.


## What this is not

* Not a model that learned anything: nothing is trained or fine-tuned. The checker is code, the model is used as it comes.
* Not a check against a building code: the thresholds are drawing rules (a plan that tiles its outline) and planning rules of thumb (`shared/knowledge.js`, each with its source).
* Not yet connected to a deterministic wall extraction: the geometry still comes from the model. OpenCV on the GX10 (notebook 01_plan_reading) is the next step; this loop is what protects the app until then.
* The paper behind the idea (Lara et al., Findings of ACL 2026, arXiv:2605.14117) trains a model against a verifier. Here the verifier is used at the time of the answer instead, without training,
  and it covers different things: the sketch gate checks overlap, outline and holes plus the headroom under the roof, and the plan builder's score (`scorePlan`) adds adjacency, circulation and door swings.
  Their reward checks overlap, connectivity to a bubble diagram and total area: this gate does not compare a sketch with a brief, so it has no connectivity or total-area term.
