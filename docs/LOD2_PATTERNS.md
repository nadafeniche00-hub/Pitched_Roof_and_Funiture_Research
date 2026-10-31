# Roof patterns from NRW LoD2 (Detmold centre)

Source: NRW LoD2 (CityGML), 4 tiles of 1 km around the centre of Detmold, opengeodata.nrw.de, open data. 5,324 buildings and building parts with roof and ground surfaces; 1,551 dwellings; 602 dwellings with a gable roof and a usable pitch.

Surveyed geometry, not volunteered tags. It covers four 1 km tiles of the centre only, which is denser and older than the region: repeat on more tiles before generalising. Roof-type and function codes are from memory of the AdV/ALKIS code lists.

## Roof types of dwellings
gabled 39.1 %, mixed 33.3 %, shed 9.9 %, flat 9.3 %, hipped 4.6 %, other 2.6 %, half-hipped 0.7 %, tent 0.4 %

## Gable roofs: pitch (degrees), span, eave and ridge heights
- pitch: {'p10': 27.78, 'p25': 33.15, 'median': 43.29, 'p75': 50.22, 'p90': 53.11}
- span (short side of the footprint, m): {'p10': 5.97, 'p25': 7.59, 'median': 8.94, 'p75': 10.2, 'p90': 11.49}
- length (m): {'p10': 8.29, 'p25': 10.02, 'median': 11.65, 'p75': 13.51, 'p90': 16.42}
- eave height above ground (m): {'p10': 3.65, 'p25': 4.66, 'median': 6.2, 'p75': 7.95, 'p90': 9.41}
- ridge height above ground (m): {'p10': 8.04, 'p25': 9.43, 'median': 10.68, 'p75': 12.65, 'p90': 14.03}
- footprint (m2): {'p10': 52.7, 'p25': 76.66, 'median': 96.35, 'p75': 123.97, 'p90': 170.28}
- correlation of pitch and span: -0.14

## Median pitch by roof type (dwellings)
- gabled: 43.2° (606)
- hipped: 42.4° (72)
- mixed: 39.0° (516)
- other: 47.3° (30)
- shed: 12.0° (102)

## What our usable-area rule counts on these real cross sections
Share of the floor counted (100 % above 2.0 m, 50 % between 1.0 and 2.0 m) for a gable roof of the real span and pitch, with the attic floor a knee wall above the eave line (not in LoD2: assumed):
- knee wall 0.5 m: median 75.0 % (p10 47.6 %, p90 83.3 %)
- knee wall 0.9 m: median 85.0 % (p10 68.4 %, p90 90.0 %)
- knee wall 1.3 m: median 91.2 % (p10 81.7 %, p90 94.2 %)

## Our default roof against the region
- pitch 38.0°: 38 % of the gable dwellings are shallower; span 5.0 m: 5 % are narrower (the footprint span is the outer width; the usable attic floor is narrower)
- our default room counts 68.8 % of its floor
