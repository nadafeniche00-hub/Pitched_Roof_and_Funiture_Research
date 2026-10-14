# Furniture branch - does the furniture fit?

Scope of this branch: the furniture side of the research question - *can a room be judged by whether the things it has to contain fit, with the space people need around them?*

## Implemented (main)
- Catalogue with footprint, real height, headroom over the body (`bodyH`) and over its clearance zones (`useH`), clearance depths and side rule (`shared/catalog.js`).
- Per-piece check: inside the room, headroom, overlap, stair / door swing / window blocking, clearance zones (>= 90 % usable = ok, >= 60 % = warning).
- Circulation: walkable floor eroded by half the passage width, flood-filled from the stair; each piece's access zone must touch it.
- Auto-layout: randomised greedy search over a 10 cm lattice and four rotations, scored by the Usable-Space Index (`solve`).

## Open questions for this branch
1. **Catalogue**: sizes, clearances and headroom values are assumptions. Source them from a standard (e.g. DIN 18040 / Neufert) and cite per item.
2. **Door swing** is a square; model the true quarter-circle and the door leaf direction.
3. **Orientation rules**: bed head to a wall, desk to the window, shower beside the plumbing wall - currently none.
4. **Solver**: greedy; compare with simulated annealing or a CP-SAT model, and measure how often it misses a feasible layout.
5. **Accessibility**: wheelchair turning circle (1.5 m) as an optional rule.
6. **Validation**: furnish real room plans by hand and check the evaluation agrees with an architect's judgement.

Tests: `server/test/furniture.test.js`.
