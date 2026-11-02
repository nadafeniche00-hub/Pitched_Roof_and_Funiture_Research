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
