# Roof patterns from NRW LoD2 (Detmold centre)

Source: NRW LoD2 (CityGML), 11 tiles of 1 km: the centre of Detmold (4) and the residential area to the south (7), opengeodata.nrw.de, open data. 10,949 buildings and building parts with roof and ground surfaces; 2,978 dwellings; 1,379 dwellings with a gable roof and a usable pitch.

Surveyed geometry, not volunteered tags. It covers eleven 1 km tiles around Detmold (centre and a residential area): still one town, repeat on more tiles before generalising. Roof-type and function codes are from memory of the AdV/ALKIS code lists.

## Roof types of dwellings
gabled 46.5 %, mixed 32.1 %, flat 7.7 %, shed 6.9 %, hipped 3.7 %, other 2.1 %, half-hipped 0.6 %, tent 0.4 %

## Gable roofs: pitch (degrees), span, eave and ridge heights
- pitch: {'p10': 25.24, 'p25': 31.25, 'median': 40.6, 'p75': 47.97, 'p90': 52.12}
- span (short side of the footprint, m): {'p10': 6.38, 'p25': 7.82, 'median': 9.06, 'p75': 10.35, 'p90': 11.47}
- length (m): {'p10': 8.9, 'p25': 10.04, 'median': 11.35, 'p75': 12.99, 'p90': 15.13}
- eave height above ground (m): {'p10': 3.29, 'p25': 4.24, 'median': 5.56, 'p75': 6.93, 'p90': 8.38}
- ridge height above ground (m): {'p10': 7.73, 'p25': 8.92, 'median': 10.02, 'p75': 11.33, 'p90': 13.06}
- footprint (m2): {'p10': 61.32, 'p25': 78.04, 'median': 96.18, 'p75': 121.42, 'p90': 157.08}
- correlation of pitch and span: -0.09

## Centre against outskirts (dwellings)
- centre: 1551 dwellings, 602 gable with pitch; roofs {'gabled': 39.1, 'mixed': 33.3, 'shed': 9.9, 'flat': 9.3, 'hipped': 4.6, 'other': 2.6}; pitch {'p10': 27.78, 'p25': 33.15, 'median': 43.29, 'p75': 50.22, 'p90': 53.11}; span {'p10': 5.97, 'p25': 7.59, 'median': 8.94, 'p75': 10.2, 'p90': 11.49}; counted share at the median 85.0 %
- outskirts: 1427 dwellings, 777 gable with pitch; roofs {'gabled': 54.7, 'mixed': 30.8, 'flat': 6.0, 'shed': 3.6, 'hipped': 2.7, 'other': 1.5}; pitch {'p10': 24.82, 'p25': 30.1, 'median': 38.52, 'p75': 45.78, 'p90': 50.89}; span {'p10': 6.75, 'p25': 8.02, 'median': 9.17, 'p75': 10.44, 'p90': 11.43}; counted share at the median 83.3 %

## Median pitch by roof type (dwellings)
- gabled: 40.5° (1386)
- half-hipped: 44.9° (17)
- hipped: 40.7° (110)
- mixed: 37.5° (955)
- other: 46.1° (36)
- shed: 13.3° (138)

## What our usable-area rule counts on these real cross sections
Share of the floor counted (100 % above 2.0 m, 50 % between 1.0 and 2.0 m) for a gable roof of the real span and pitch, with the attic floor a knee wall above the eave line (not in LoD2: assumed):
- knee wall 0.5 m: median 73.8 % (p10 47.1 %, p90 82.5 %)
- knee wall 0.9 m: median 83.8 % (p10 67.9 %, p90 89.2 %)
- knee wall 1.3 m: median 90.8 % (p10 81.2 %, p90 93.8 %)

## Our default roof against the region
- pitch 38.0°: 44 % of the gable dwellings are shallower; span 5.0 m: 4 % are narrower (the footprint span is the outer width; the usable attic floor is narrower)
- our default room counts 68.8 % of its floor
