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
