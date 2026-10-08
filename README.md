# Usable Space — furniture fit × pitched-roof storey

Research prototype combining two MID.Research briefs:

1. **Automated roof storey planning** – how much of the storey under a roof can actually be lived in?
2. **Furniture fit using computational tools** – does the furniture fit?

**Core idea:** both ask for a *usability measure* instead of a rule check. A roof storey is a floor whose
ceiling height varies, so "does the furniture fit" becomes "does it fit *at the height the roof leaves*".
Each furniture piece has a height requirement over its footprint (`bodyH`) and over its clearance zones (`useH`);
the roof's height field decides where that is satisfiable.

## What it computes
- Height field `h(x,y)` from knee wall, pitch, max height and dormers (5 cm grid).
- Area counted by height (≥2.0 m 100 %, 1–2 m 50 %, <1 m 0 %, WoFlV-style; configurable), walkable area, full-storey test (placeholder rule).
- Per piece: headroom, overlaps, stair/door/window blocking, clearance zones, reachability via ≥0.6 m passages from the stair.
- **Usable-Space Index** = 0.4 furnishability + 0.3 usable-area ratio + 0.3 circulation.
- Automatic layout: randomised greedy search (server side), best index wins.

## Stack
React + Redux Toolkit (events; a listener middleware re-evaluates on every geometry/furniture action) · Express API · shared pure-JS engine in `shared/` (same code runs in browser and Node).

```
shared/   engine, catalogue, presets
server/   Express API (evaluate, solve, projects CRUD in a JSON file) + tests
client/   Vite + React + Redux UI (plan with height map, section view, results)
```

## Run
```bash
npm run install:all
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173  (proxies /api)
npm test             # engine tests, incl. "works vs. does not work" ranking of the 3 presets
```

## Limitations
Single gable roof, rectangular room, axis-aligned furniture, door swing simplified to a square, clearance values and weights are
assumptions to be calibrated against real plans, building-code thresholds are placeholders. Not validated against real
architectural examples yet — that is the next research step.
