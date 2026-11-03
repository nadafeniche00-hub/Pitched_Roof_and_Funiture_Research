# The roof template of the German Revit templates, into the app

Goal: the roof build-up the app shows (hover the roof in the walk view, exploded layers) should be **exactly** the roof types of the German architecture
template that comes with Revit 2025, not a rule of thumb.

The roof types of a `.rte` are compound structures (layers, thicknesses, materials) that only the Revit API can read. The file is a compound document of
compressed streams in a proprietary schema; reading it from outside gives strings (material names) but not the layer structure. So a small Revit add-in does it.

```
1  pipeline\revit\TemplateExport\run.ps1      # builds the add-in, starts Revit, waits, removes the add-in again
2  node pipeline\revit\convert_templates.mjs  # pipeline\data\revit\roof_templates.json  ->  shared\revit\roofTemplates.json
3  rebuild the client (npm run build)         # the room panel shows a "Roof build-up" list as soon as that file exists
```

**Step 1 needs you at the keyboard.** The add-in is not signed, so Revit asks whether to load it; choose **Load Once** (Einmal laden). The script does not click that for you and
does not close Revit. It installs the add-in manifest into `%APPDATA%\Autodesk\Revit\Addins\2025` for the time of the run and removes it afterwards. Templates read:
`BIM_Architektur_und_Ingenieurbau.rte` and `...-Vereinfacht.rte` (in `C:\ProgramData\Autodesk\RVT 2025\Templates\German`), `Default_M_DEU.rte` and `Default_M_DEU_ADSK.rte` (in `...\Templates`).

What is exported (`App.cs`): every roof type with its layers (function, thickness in mm, material, core, structural), the materials used (class, colour, thermal conductivity, density),
the Roofs category graphics and roof-related families. The converter keeps the Revit order, thicknesses and material names; a layer without a material is named after its function;
nothing is invented. `server/test/roofTemplates.test.js` checks the conversion against a made-up export of the same shape (no Revit data is in the repository).

Until the file exists the app shows the typical build-up and says so ("typical build-up" in the hover text).

Licence note: the exported names and thicknesses come from Autodesk's template files. Decide whether `shared/revit/roofTemplates.json` goes into the repository or stays local.

## The DEMO project: Revit builds the plan of the app

Second goal: the plan of the app, built by Revit itself in the German architecture template (`BIM_Architektur_und_Ingenieurbau.rte`) and saved as `DEMO.rvt`, with pictures for the deck.
Revit needs an Autodesk licence, so it is the second choice next to Blender (`pipeline/render`, free and open source). The export button of the walk view offers both and does not choose for you.

```
1  walk view, export button, "Revit"            # writes pipeline\data\revit_demo\demo.json: the plan as numbers (client/src/lib/revitExport.js); without it the sample next to the script is used
2  pipeline\revit\DemoBuild\run_demo.ps1        # builds the add-in, starts Revit, waits for DEMO.rvt and the pictures, removes the add-in; writes presentation\img\revit_*.jpg
3  node presentation\build.mjs                  # the deck shows the pictures instead of the "NOT RUN YET" placeholder
```

**Step 2 needs you at the keyboard**, like the template export above: the add-in is not signed, so Revit asks; choose **Load Once**. Close Revit first (an add-in is loaded when Revit starts).

What `DemoBuild/App.cs` builds, one transaction per step, every step logged to `demo_log.txt` so a step that fails does not take the others with it: two levels, wall types of 36.5 and 11.5 cm (the walls of the technical plan),
the walls of the storey below, knee walls and gables of the attic, the partition walls of the layout as profile walls that follow the roof, floors (the stair opening cut out), a roof of the template's own roof type with eaves,
door and window openings, a floor plan with the cut walls filled black, and three 3D views (outside, roof off, section). Then it saves `DEMO.rvt` (also into `Documents\Usable Space`), reopens it and exports the views as PNG.
Warnings (overlapping walls, joins) are dropped and logged; errors fail only their step.

**Status (2 Nov 2026): compiled against the Revit 2025 API with 0 errors, never run.** What only a run can tell: whether the slope of the roof is read as a ratio or an angle by `set_SlopeAngle`, whether the roof's base offset convention matches the knee wall,
whether profile walls with those outlines are accepted, and whether `ExportImage` works inside the `Idling` event. The cap of the app (`maxHeight`) is not reproduced in the Revit roof (the log says so). Read `demo_log.txt` first.

Plan format (`demo.json`): `room` (width, depth, kneeWall, pitch, maxHeight, stair rectangle, windows), `walls` (outer, inner thickness in metres), `partitions` (a line each, with the door openings along it). No geometry: Revit builds its own.

## The architecture samples of Revit as templates, and the rules held against them

The samples that come with Revit 2025 (`C:\Program Files\Autodesk\Revit 2025\Samples`) are real projects: `BIM_Projekt_Golden_Nugget-Architektur_und_Ingenieurbau.rvt` (German),
`Snowdon Towers Sample Architectural.rvt` and `サンプル意匠.rvt` (Japanese) are the architecture ones; the others are structure, MEP and facade variants of the same buildings (and six `.rfa` families).
A `.rvt` holds its model in compressed streams that only Revit reads (from outside there is a 128 px preview of one sheet and the version, nothing else), so the same route as for the roof types:

```
1  pipeline\revit\SampleExport\run.ps1     # builds the add-in, starts Revit, reads the three architecture samples read only (never saved), removes the add-in; writes pipeline\data\revit\samples.json
2  node pipeline\revit\convert_sample.mjs  # up to three attic storeys with a pitched roof -> shared\revit\sampleTemplates.json (they join the "Examples" list), and pipeline\data\revit\sample_check.json
```

**Step 1 needs you at the keyboard** (the add-in is unsigned: choose **Load Once**; it takes a few minutes per sample, 131 MB for the German one).
What is read (`SampleExport/App.cs`, compiled against the Revit 2025 API with 0 errors, never run): every level with the number and area of its rooms, every roof (type, level, extent, the edges that define the slope),
and on the attic level (a level called Dachgeschoss/DG/attic, else the top level with rooms) the rooms with their boundaries and areas, the walls, floors, doors, windows and stairs.

What the converter does (`shared/sampleCheck.js`, tested on a made-up export in `server/test/sampleCheck.test.js`; no Revit data is in the repository): the footprint, knee wall (the lowest top of the exterior walls) and pitch
(the ridge above the knee wall over half the span) of the attic become a room of the app, the window and the stair are placed, the real rooms are typed from their names (German, English, Japanese) and kept with
their polygons. A sample whose roof is flat (under 8°) is reported and not kept. Then the rules of the app are held against every real room: the narrowest clear width and the minimum area of its type, the proportion
(`maxAspect`), the share of the room that stands 2.0 m / 1 to 2 m / lower under that roof (the counting of the app), and whether its area lies inside the 5th to 95th percentile of the real plans of the training data (MSD).
Everything the rules flag in a real, built storey is a candidate for a wrong rule or a wrong default, not only for a wrong room: read it that way.

**What the first real run found (3 Nov 2026, Revit 2025.5, three architecture samples, 256 rooms on 36 storeys).** Only Golden Nugget has a pitched roof: the Ziegeldach of the rear building (slope 1.1 rise over run, 47.6°, ridge 4.5 m above the floor
of `HG_OG 1`, which holds Büro 1-d 34.2 m² and Galerie 25.9 m²). Its top floor `GN_OG 5` lies under a sheet-metal roof of 12.6°. Snowdon Towers and the Japanese sample have flat roofs (2 to 3 %), so they are not templates for an attic; their rooms
are still counted. Two templates were kept (they join the Examples list; the room of the app is limited to 12 x 14 m and cuts them). Held against the real rooms, the app's rules flag 5 narrow, 4 small and 1 thin room of 56 typed rooms: tea kitchens
(1.9 m²), baths of 1.0 and 1.3 m width, a WC of 0.86 m, a kitchen of 4.5 m² and 1.56 m width. Read these as built, working examples that sit below the app's minimum, not as errors of the samples. 23 rooms lie outside the 5th to 95th percentile
of the real plans of the training data, most of them office rooms and halls, which the data (residential) does not describe. The generated templates (`shared/revit/sampleTemplates.json`) and the export (`pipeline/data/revit/samples.json`) are
Autodesk's sample data: they stay out of the repository until it is decided that they may go in. Limits of this reading: types come from room names (Galerie and Dachterrasse have no type), a gable roof with eaves on both sides is the only roof the app
can model, and `GN_OG 5` is a penthouse with a terrace.
