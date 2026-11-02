# Planning knowledge in the app: WoFlV, Landesbauordnungen, Neufert, adjacency graphs

The layout generator and the furniture engine now work from written planning knowledge instead of one or two rules of thumb. It is **code, not training**: nobody can
change the weights of the language model here. The knowledge sits in `shared/knowledge.js` (numbers, each with its source), is read by the catalogue
(`shared/catalog.js`), the placement engine (`shared/engine.js`), the plan builder (`shared/plans.js`, `shared/doors.js`) and the rules (`shared/rules.js`), and its
text form `rulebook()` is part of the prompt that reads a flat description (`server/ai.js`). `server/test/knowledge.test.js` holds it to account.

## What is used, from where

| Source | Kind | What the app takes | Where | Status |
|---|---|---|---|---|
| Wohnflächenverordnung (WoFlV) § 4 | statute, federal | clear height 2.0 m or more counts 100 %, 1.0 to 2.0 m 50 %, below 1.0 m 0 % | `engine.js` DEFAULT_RULES, `plans.js` countedArea | in use since the start, a test ties the file to the engine |
| Landesbauordnungen (LBO), after the Musterbauordnung | statute, **differs by state** | habitable attic room: 2.20 m clear height over at least half of the floor; windows 1/8 of the floor; doors 2.0 m high | `plans.js` finding `lbo-height`; the rest documented | typical values, **marked verify**: look them up in the LBO of the building |
| Neufert, Bauentwurfslehre | standard | bed: 1.50 m over the head end (sitting up), 1.00 m over the rest, 0.60 m beside it, 0.50 m at the foot; standing room 1.80 m before wardrobe and WC, 1.90 m at the basin, 2.00 m in the shower; circulation 0.90 m; door leaf 0.90 m | `catalog.js` (bodyH, useH, headH, headLen), `engine.js` evalOne | rounded to the 5 cm of the plans; edition and page not cited |
| Space syntax, functional adjacency graphs | graph | wanted neighbours (bath next to bedrooms, kitchen next to living), unwelcome ones (bath door into kitchen or living), no walk through a bedroom, depth from the stair hall | `plans.js` findings `adjacency` and the access score | rules from the literature, not fitted to data |
| RPLAN, LIFULL HOME'S, FloorNet, ArchGraph and similar graph collections | datasets | described in `shared/knowledge.js` (DATASETS) | not used | **nothing downloaded**: they are large, have their own licences and would need your permission |

The only things that are statute are the first two rows. Everything marked verify must be checked before a plan is used for a building permit.

## The example that started this: bad placements in a generated attic floor

6.00 x 7.50 m, knee wall 1.20 m, 45 degrees (`server/test/knowledge.test.js`, `ATTIC`). Lowest roof height over each piece, old rules against new:

| Piece | Old rules | New rules |
|---|---|---|
| double bed | head against the 1.20 m knee wall, 1.25 m over the whole bed | head against a partition, 1.75 m over the head end (the rule asks 1.50 m) |
| single bed (child) | along the right knee wall, 1.25 m | head against a partition, 1.85 m over the head end |
| basin | on the low wall, 1.35 m | 1.95 m, in the high part |
| WC | against the knee wall, 1.25 m | still against the knee wall: its body is 0.8 m high and the standing zone in front has 1.8 m, which Neufert allows |

What changed for each of the three criticisms of that plan:

1. **Beds under low headroom.** A bed now needs `headH` = 1.50 m over the first 0.90 m of its head end, over the full width (hard rule `head`: the engine refuses the position and says why),
   and 1.80 m of standing room on the side or at the foot. The wall behind the bed head may be a partition of its own room, not only the outline of the attic, so beds can leave the knee wall.
2. **Sanitary pieces.** The standing zone in front of the basin is 1.90 m (was 1.70 m), the shower needs 2.00 m inside, the WC 1.80 m in front. Wet pieces still have to stand together (existing rule).
   A WC under a slope stays possible; if you want it stricter, raise `NEUFERT.standing` for the toilet.
3. **Doors.** A door opens into the room behind it, hinged at the end of the opening that is nearer to the end of the wall, so the open leaf lies against the wall (`shared/doors.js`).
   The plan builder puts the door close to the end of its wall, away from the stair. The swing square of every door stays free of furniture (it is a blocked zone in the engine), the
   technical plan draws the leaf the way it opens, and two doors that swing into the same corner are a finding.

## What this does not do

* It does not train or fine-tune a model, and it does not read the datasets. A next step with data would be to count how often room types touch in RPLAN or LIFULL plans and use those
  frequencies instead of the hand-written adjacency list.
* It does not replace the Landesbauordnung of your state, a fire-safety concept or an architect's signature.
* Window area (1/8 of the floor) and escape windows are documented, not yet checked: the plan builder asks for a gable wall or a dormer as daylight.

## Adding to it

Add an entry to `KNOWLEDGE` in `shared/knowledge.js` with its source and where it is used, put the number in a constant, read it where the rule lives, and add a test to
`server/test/knowledge.test.js`. `rulebook()` is the text the language model sees: keep it short.
