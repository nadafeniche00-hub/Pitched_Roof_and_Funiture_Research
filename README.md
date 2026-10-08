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

## Site, sun and wind
- **Map** (Leaflet + OpenStreetMap): click or search to place the building, turn it with the *Building turned* slider; layer previews switch between OSM, light, topography and satellite; overlays for the footprint, the sun ray, the wind-zone cell and all cells detected so far.
- **Sun** (`suncalc`): date / solar-time sliders move the sun in the map and in 3D (light direction, sun path of the day). Per opening (windows + dormer fronts): direct-sun hours on the summer solstice, equinox and winter solstice, plus glazing ratio vs. the 1/8 rule of thumb. Clear sky, no shading from surroundings.
- **Wind**: the plot is auto-classified into a wind zone: 10 years of ERA5 daily gust maxima (Open-Meteo, no API key) -> Gumbel 50-year gust -> estimated basic wind velocity (gust / 1.45) -> zone 1-4 (v_b,0 22.5 / 25 / 27.5 / 30 m/s). Also the prevailing storm direction and which openings face it. **Indicative only**: ERA5 is a ~25 km reanalysis; the official zone comes from the code/map. A manual override is available. Animated wind streaks in 3D.
- **SQLite** (`server/data/usable-space.db`, `node:sqlite`, needs Node >= 22.5): tables `projects`, `sites`, `wind_zone_classes`, `wind_cache` (one row per 0.1 degree cell, 180-day TTL). Earlier `projects.json` files are imported automatically.

## Stack
React + Redux Toolkit + three.js 3D preview (events; a listener middleware re-evaluates on every geometry/furniture action) · Express API · shared pure-JS engine in `shared/` (same code runs in browser and Node).

```
shared/   engine, catalogue, presets, site model
server/   Express API (evaluate, solve, wind detection, projects CRUD) on SQLite + tests
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
