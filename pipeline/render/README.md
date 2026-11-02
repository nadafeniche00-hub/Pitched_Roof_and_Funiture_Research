# Realistic 3D view: the walk-view scene in Blender and Unreal Engine

The connector is one **glTF 2.0 binary** (`.glb`). It is the free way: Blender is open source. The export button of the walk view offers a second way, Revit (needs a licence, see `pipeline/revit/README.md`), and the user chooses. The partition walls are solids as thick as in the technical plan (11.5 cm) with their cut faces as a second, black material (`partition_cut`); the facade is a half-timbered one made of real geometry (`timber`, `plinth`, `window_frame`, `sill`, `shutter`). The walk view writes it with names that carry the meaning (`wall_outer`, `roof`, `floor`, `ground`,
`bark`, `foliage`, `glass`, `window_frame`, `furniture_<id>`, ...). Blender reads it with its built-in glTF importer, Unreal Engine 5.8 with its own importer
(Interchange). No add-on, no converter in between.

```
1  .venv\Scripts\python pipeline\render\fetch_textures.py          # 10 CC0 texture sets and a sky from Poly Haven (40 MB), once
2  the walk view: download button (top right of the 3D picture)    # usable-space-scene.glb  -> put it at pipeline\render\in\scene.glb
   or, with the app running on this machine and ?debug in the address:  window.__walkExport() then POST the blob to /api/dev/glb
3  "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python pipeline\render\blender_render.py -- --samples 160
                                                                    # pipeline\render\out\exterior|section|cutaway|detail .png
4  powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\run.ps1                                  # the same file in Unreal Engine 5.8: unreal_*.png
```

Options after `--`: `--shots exterior,section,cutaway,detail`, `--preview` (960 x 600, at most 64 samples, about 15 s a shot), `--samples N`, `--res 1920x1200`.

## What blender_render.py does

* Maps every name to a texture set (`pipeline/render/textures`), scales each texture to a chosen albedo from its measured mean colour (`means.json`), projects UVs per face so a
  texture keeps its real size in metres.
* **Standard daylight only**: a Poly Haven sky (its sun disc cut out and replaced by one sun lamp, strength 4.0), AgX view transform, exposure 0 for every shot.
  No lamps, no brightening.
* Cuts the **window openings** through both skins of the wall (the app draws a window as a flat pane in front of a closed wall), closes each opening with a reveal
  (sill, jambs, head) and adds a light portal.
* The shell is **thick**: the app exports an outer and an inner skin of roof and walls (`roof_outer`/`roof_inner`, `wall_outer`/`wall_inner`; roof 30 cm across the slope,
  walls 40 cm: 36.5 cm masonry and plaster), so a section shows the build-up and rays cannot slip between two coincident surfaces. (Earlier the two skins lay on the same
  surface, a zero-thickness shell: the interior then showed sky in Blender and failed in Unreal.)
* **Vegetation** (`vegetation.py`, procedural, nothing downloaded): about 2 million leaf and needle instances on the crowns, a lawn of grass tufts, moss as fine stalks
  in patches (and moss on rocks and at the foot of trees), 18 mossy rocks, moss up the trunks.
* Staging that is not in the app: trees on the line of sight of a shot are hidden, the roof is hidden for the cutaway, the shell is cut at the ridge for the section.

The interior is shown as a **section perspective** because a closed attic lit by two small windows is physically dark at a neutral exposure, and the rule here is not to brighten it.

## Unreal Engine 5.8

```
powershell -ExecutionPolicy Bypass -File pipeline\render\unreal\run.ps1          # about three minutes once the shaders are cached; -Diag, -SkipBuild, -Warmup N: see the script
                                                                                  # pipeline\render\out\unreal_exterior|exterior_back|cutaway.png (1920 x 1200)
```

The same `.glb`, no add-on: Epic's *Send to Unreal* and Datasmith were not used. Two steps, each in its own editor start:

1. `build_level.py` in a headless editor (`-nullrhi`): imports the glb as a scene (Interchange: 728 static meshes, 697 material instances, 15 textures; the actors carry the glTF node
   names), gives the big parts materials of their own, adds the daylight and saves the level. Materials: the CC0 ground, floor and roof textures of `textures/`, plain colours for the
   plaster and the frames, the vertex colours of the trees, and for the furniture the maps of its glTF material in a material of ours. Daylight: one movable sun (the engine's default
   10 lux), sky atmosphere, sky light, a little fog; no other light.
2. `render_shots.py` in a rendering editor without a window (`-RenderOffscreen`): scene-capture cameras write the pictures, then the editor quits (`Content/Python/init_unreal.py` starts
   the script when `US_SHOTS` is set; `-ExecutePythonScript` would quit the editor as soon as the script returns). One fixed exposure (EV100 0.5) for all pictures.

What was learned on the way (each of these cost a run):

* **The thick shell was the fix for the import.** With the outer and the inner skin of walls and roof on the same surface, the level did not build. With the walls 40 cm and the roof 30 cm thick
  (see above) it imports and renders.
* The word **"Preview"** in the shadows is the engine's preview-shadows indicator, shown for a Static or Stationary light with no baked lighting
  ([forum](https://forums.unrealengine.com/t/why-do-i-see-preview-in-my-shadows-real-time-only/1147337)). The sun and the sky light are Movable.
* The sky atmosphere has its **planet surface at its own height**: the actor sits at the top of the ground disc (3 m below the attic floor), otherwise the camera is below the planet and the sky is black.
* The **automatic exposure** follows the picture before it: the same house came out bright, dark and black. Min and max EV100 are set to one value (and the extended luminance range is on in `DefaultEngine.ini`).
* Assets deleted and made again in one editor session cannot be saved ("illegal reference to private object"), and a level cannot be replaced while it is the open one: `run.ps1` empties
  `Content/UsableSpace` first and `DefaultEngine.ini` sets no startup map. `.uproject` and script paths must be absolute.
* Neither `print()` nor `unreal.log` reach the editor's log in this mode: both scripts also write to `script.log`, which `run.ps1` prints.
* Every start of the editor appends an `AndroidFileServer` section with a random security token to `Config/DefaultEngine.ini`. It is not source: delete it from the file before a commit
  (the committed file holds only the renderer and RHI settings).

**Not the same as the Blender pictures:** the vegetation of `vegetation.py` is not rebuilt (trees are the app's low-poly crowns with their vertex colours, the lawn is the ground texture), the window
openings are not cut (the panes are dark flat panels in the wall), no light portals, no moss. The Blender pictures are the ones to judge realism by; the Unreal ones show that the same file
goes into a game engine with real thick walls and furniture.

## Credits

Textures and sky: Poly Haven, CC0 (`textures/CREDITS.md`). The furniture models come with the app.
