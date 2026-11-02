# One attic, six tools: can we compare and integrate them?

The pitched-roof project is our lab for the Real2Twin idea: a small, fully understood problem on which different geometry, topology, graph, BIM and
statistics tools can be tried against each other. This note says what was run, what came out, and what I think it means for a "React for architectural
design" proposal. Everything below is reproducible:

```
node pipeline/analysis/compare_case.mjs                    # the shared test case and the numbers of our own engine
.venv\Scripts\python pipeline\analysis\compare_frameworks.py   # all tools, writes pipeline/data/compare_results.json
```

## The test

One attic (8 x 10 m, knee wall 1 m, 38 degrees), three roofs (gabled, hipped, half-hipped, each a triangle mesh from `shared/roofLibrary.js`) and one
five-room layout from our plan generator. Questions every tool has to answer:

1. **Usable area per room.** Rule of the project: a point counts fully where the roof is 2 m or higher, half between 1 and 2 m, not below 1 m.
2. **Circulation depth** of every room from the hall (how many doors away).
3. **Spatial pattern**: is the gabled share of roofs clustered across the 16 German states (Moran's I)?
4. **The building as elements**: rooms as elements of a model, doors as interactions, serialisable.

## Results

Usable area (counted m2). Total per roof, worst deviation of any room from our own engine, median time of one full evaluation:

| Tool | Role in the test | gabled / hipped / half-hipped total | worst room difference to engine | time (ms) | lines of code |
|---|---|---|---|---|---|
| Our engine (JS, 10 cm grid) | reference, runs in the browser | 70.0 / 64.0 / 70.0 | | 0.5 to 1.0 | |
| Shapely | exact polygon clipping per roof band | 70.0 / 64.0 / 70.0 | 0.000 | 2 to 4 | 32 |
| COMPAS (`compas.geometry`) | same clipping with COMPAS polygons | 70.0 / 64.0 / 70.0 | 0.000 | 6 to 12 | 32 |
| IfcOpenShell | rooms and roof written as IFC, read back, then computed | 70.0 / 64.0 / 70.0 | 0.000 | 12 to 14 (172 the first, cold run) | 82 |
| TopologicPy | rooms and roof bands as a cell complex, `Intersect` | 70.0 / 64.0 / 70.0 | 0.000 | 230 to 257 | 46 |

The four exact tools agree with each other to 2e-6 m2. Our engine agrees with them to the rounding of the printout.

Other tasks:

* **Circulation depth**: NetworkX (6 lines), COMPAS `Graph` (8 lines) and TopologicPy graph (9 lines) give the same depths: hall 0, kids' room, bath and study 1, bedroom 2.
* **Moran's I** (PySAL `libpysal` + `esda`, 22 lines): gabled share across the 16 states I = 0.366, pseudo p = 0.009; flat share I = 0.137, p = 0.139. The gabled share is
  spatially clustered, the flat share is not distinguishable from random.
* **Element model**: `compas_model` carries the six rooms as plate elements in a group, four door interactions, 7 tree nodes, 4,070 characters of JSON, 0.8 ms.

## What the comparison found in our own code

The first run did not agree: our engine snapped each room rectangle to the 10 cm grid, so a room edge that fell inside a cell counted the whole cell. Per room that
was off by up to 0.33 m2 (the totals were right by luck of cancellation). `countedArea` in `shared/plans.js` now weights each cell by its fractional overlap with the
rectangle. This is the best argument for the exercise: an independent tool finds an error the engine's own tests could not.

## What each tool is for

* **Shapely**: the right default for 2D questions. Fastest exact tool, 32 lines, no surprises.
* **COMPAS**: the closest to a framework. Geometry, data structures (mesh, graph) and, with `compas_model`, an element tree with interactions that serialises to JSON. Its
  plugin architecture (compas_rhino, compas_blender, ...) is what keeps the core independent of the host program.
* **IfcOpenShell**: the bridge to BIM. Writing and re-reading IFC reproduced the numbers, so IFC can be the exchange format. Needs the most code (82 lines): placements,
  units (millimetre default in `assign_unit`, metres in the API) and the geometry iterator instead of per-element shapes.
* **TopologicPy**: right when the question is topological (what touches what, cell complexes). Two orders of magnitude slower here, and it needs `topologic_core`.
* **NetworkX**: circulation and adjacency in a handful of lines.
* **PySAL**: the only tool for the regional question. Not an alternative to the others, a different kind of tool.

## Caveats, said plainly

* One case, three roofs, one layout. This is an integration test, not a benchmark. Timings are from a laptop and include each tool's own overhead (the IFC time includes writing and reading).
* Sixteen states are few: Moran's I with p = 0.009 is a hint worth following, not a result. Neighbours were built from touching outlines after a 2.5 unit buffer because the state outlines do not share vertices.
* `compas_ifc` was not exercised, only `compas`, `compas_model` and IfcOpenShell directly.
* The Revit side is prepared but not run: see `pipeline/revit/TemplateExport` (the add-in needs a manual start).

## My opinion on "a React for architectural design"

What React did was not "draw buttons". It made the interface **a pure function of state**, put a **reconciler** between the function and the screen so only what changed is
redone, and kept the core **independent of the renderer** (DOM, native, ...). Translated:

1. **Design state** that is typed, versioned and updated immutably (like Redux): the element tree and the interaction graph, the way `compas_model` already has them.
2. **Derivations** as pure functions of that state, memoised: usable area, circulation depth, daylight. Each returns the result **and how it was made and how sure it is**
   (in this project that is the honesty rule; in a framework it would be a type).
3. **Hosts** as renderers that subscribe: web, Blender, Unreal (we did both through one glTF file), Revit/Rhino through connectors, IFC as the archive format.
4. **Adapters** so a derivation can run on Shapely or TopologicPy or IfcOpenShell behind one interface. The comparison above is exactly a conformance test of such adapters:
   five tools, 32 to 82 lines each, agreement to 2e-6.

Where I would be careful:

* **COMPAS already is most of this** (core, data structures, model, plugin hosts, ETH BRG). A proposal that competes with it loses; one that adds the missing layer on top
  (state, derivations with uncertainty, reconciliation, conformance tests) is a contribution, and COMPAS is the natural collaborator and testbed.
* **React works because re-rendering is cheap.** Geometry and analysis are not: incremental recomputation (dependency graph, caching, partial re-evaluation) is the hard
  part and the actual research question. Our engine's 0.5 ms makes a good first data point, TopologicPy's 240 ms a good second.
* **Declarative fights how architects sketch.** The framework must accept messy, partial, physical input (a photo, a sketch, a sentence: what the three AI helpers of this
  project do) and turn it into state, not demand the state first.
* **Scope.** Start with one vertical slice that can be defended: "pitched-roof attic analysis kit" (state, three derivations, two hosts, a conformance suite), with Real2Twin as the
  place where state meets live data. A holistic framework as the first deliverable would be too big to evaluate.
* **Evaluate it**: reproducibility (same answer across tools), speed under edits, integration cost (lines per adapter), and a small study with architects.

If I had to put the proposal in one sentence: *a reconciler for design state on top of COMPAS Model, IFC and glTF, with every derived number carrying its method and its uncertainty.*
