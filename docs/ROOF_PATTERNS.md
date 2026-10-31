# Roof patterns from OpenStreetMap (Kreis Lippe)

Source: OpenStreetMap, buildings with roof:shape in Kreis Lippe, Overpass API, 31 Oct 2026 (ODbL). 12,413 buildings carrying `roof:shape`; 8,332 of them dwellings.

Volunteered data: tagging is uneven, outbuildings are over-represented and nothing here is a survey of the real stock. It shows what a regional pattern looks like and how to mine one; February repeats it on LoD2 (surveyed) data.

## Shapes
gabled 68.4 %, flat 19.3 %, hipped 6.1 %, half-hipped 3.3 %, other 1.0 %, pyramidal 0.7 %, skillion 0.5 %, mansard 0.3 %, gambrel 0.3 %

Dwellings only: gabled 82.8 %, hipped 6.7 %, flat 3.9 %, half-hipped 3.9 %, other 0.9 %, pyramidal 0.7 %, gambrel 0.4 %, mansard 0.4 %, skillion 0.3 %

## How often the roof holds a level (roof:levels), dwellings
- gabled: 96.2 % have at least one roof level (5213 buildings with the tag), 19.2 % two or more
- hipped: 95.7 % have at least one roof level (349 buildings with the tag), 8.6 % two or more
- half-hipped: 100.0 % have at least one roof level (275 buildings with the tag), 17.1 % two or more
- mansard: 100.0 % have at least one roof level (28 buildings with the tag), 50.0 % two or more
- flat: 15.0 % have at least one roof level (120 buildings with the tag), 0.0 % two or more
- pyramidal: 81.8 % have at least one roof level (33 buildings with the tag), 3.0 % two or more

## Attic by building levels (pitched dwellings)
- 1 level(s): 98.9 % have a roof level (2280)
- 2 level(s): 94.9 % have a roof level (3105)
- 3 level(s): 96.6 % have a roof level (324)
- 4 level(s): 69.1 % have a roof level (55)

## Roof material (pitched dwellings)
roof_tiles 100.0 %, slate 0.0 % (n = 2832)

## Decision tree (depth 3): predicts the roof shape from the other tags with 79.7 % cross-validated accuracy; always guessing 'gabled' gives 68.4 %
```
|--- is_outbuilding <= 0.50
|   |--- roof_levels <= 0.50
|   |   |--- levels <= 0.00
|   |   |   |--- class: gabled
|   |   |--- levels >  0.00
|   |   |   |--- class: gabled
|   |--- roof_levels >  0.50
|   |   |--- is_house <= 0.50
|   |   |   |--- class: gabled
|   |   |--- is_house >  0.50
|   |   |   |--- class: gabled
|--- is_outbuilding >  0.50
|   |--- roof_levels <= -0.50
|   |   |--- levels <= -0.10
|   |   |   |--- class: flat
|   |   |--- levels >  -0.10
|   |   |   |--- class: flat
|   |--- roof_levels >  -0.50
|   |   |--- class: gabled
```

## Association rules (support, confidence, lift)
- if material_tagged, outbuilding then levels=1, shape=flat: support 6.8 %, confidence 85.4 %, lift 6.49
- if outbuilding then levels=1, shape=flat: support 11.2 %, confidence 74.0 %, lift 5.62
- if levels=1, material_tagged, outbuilding then shape=flat: support 6.8 %, confidence 95.6 %, lift 4.96
- if material_tagged, outbuilding then shape=flat: support 7.5 %, confidence 93.7 %, lift 4.86
- if levels=1, outbuilding then shape=flat: support 11.2 %, confidence 87.6 %, lift 4.54
- if outbuilding then shape=flat: support 12.8 %, confidence 84.4 %, lift 4.38
- if levels=1, shape=gabled then house, roof_level: support 15.8 %, confidence 77.9 %, lift 2.59
- if levels=1, roof_level then house, shape=gabled: support 15.8 %, confidence 80.1 %, lift 2.09
