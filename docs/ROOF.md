# Roof branch - what the roof leaves

Scope of this branch: the roof side of the research question - *how much of the storey under a roof can actually be lived in?*

## Implemented (main)
- Height field h(x, y) from knee wall, pitch, max. height and dormers on a 5 cm grid (`shared/engine.js`, `buildGrid`, `roofHeight`).
- Area counted by height class: >= 2.0 m 100 %, 1.0-2.0 m 50 %, < 1.0 m 0 % (WoFlV-style, configurable in `DEFAULT_RULES`).
- Walkable (>= 1.9 m) share, stair arrival and circulation connectivity, placeholder full-storey test.
- Daylight and wind exposure per opening (`client/src/lib/solar.js`, `server/wind.js`).

## Open questions for this branch
1. **Real roofs**: only a symmetric gable with rectangular dormers. Needed: hip roofs, asymmetric pitch, shed dormers, roof windows, collar ties.
2. **Rules**: area-counting and full-storey thresholds are placeholders - replace with the regulation of the case-study municipality and cite it.
3. **Validation**: run the evaluation on real attic plans (open planning data / roof models) and check whether it separates storeys that work from those that do not.
4. **Daylight**: direct-sun hours only; add a daylight-factor estimate for roof windows and dormer cheeks.
5. **Stair**: head clearance over the stair run, not only the opening rectangle.

Tests: `server/test/roof.test.js`.
