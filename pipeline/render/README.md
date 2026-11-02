# Realistic 3D view: the walk-view scene in Blender and Unreal Engine

The connector is one **glTF 2.0 binary** (`.glb`). The walk view writes it with names that carry the meaning (`wall_outer`, `roof`, `floor`, `ground`,
`bark`, `foliage`, `glass`, `window_frame`, `furniture_<id>`, ...). Blender reads it with its built-in glTF importer, Unreal Engine 5.8 with its own importer
(Interchange). No add-on, no converter in between.

```
1  .venv\Scripts\python pipeline\render\fetch_textures.py          # 10 CC0 texture sets and a sky from Poly Haven (40 MB), once
2  the walk view: download button (top right of the 3D picture)    # usable-space-scene.glb  -> put it at pipeline\render\in\scene.glb
   or, with the app running on this machine and ?debug in the address:  window.__walkExport() then POST the blob to /api/dev/glb
3  "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python pipeline\render\blender_render.py -- --samples 160
                                                                    # pipeline\render\out\exterior|section|cutaway|detail .png
```

Options after `--`: `--shots exterior,section,cutaway,detail`, `--preview` (960 x 600, at most 64 samples, about 15 s a shot), `--samples N`, `--res 1920x1200`.

## What blender_render.py does

* Maps every name to a texture set (`pipeline/render/textures`), scales each texture to a chosen albedo from its measured mean colour (`means.json`), projects UVs per face so a
  texture keeps its real size in metres.
* **Standard daylight only**: a Poly Haven sky (its sun disc cut out and replaced by one sun lamp, strength 4.0), AgX view transform, exposure 0 for every shot.
  No lamps, no brightening.
* Cuts the **window openings** (the app draws a window as a flat pane in front of a closed wall), adds light portals, merges the app's double skin of walls and roof
  (outer and inner copy of the same mesh) into one two-sided surface.
* **Vegetation** (`vegetation.py`, procedural, nothing downloaded): about 2 million leaf and needle instances on the crowns, a lawn of grass tufts, moss as fine stalks
  in patches (and moss on rocks and at the foot of trees), 18 mossy rocks, moss up the trunks.
* Staging that is not in the app: trees on the line of sight of a shot are hidden, the roof is hidden for the cutaway, the shell is cut at the ridge for the section.

The interior is shown as a **section perspective** because a closed attic lit by two small windows is physically dark at a neutral exposure, and the rule here is not to brighten it.

## Unreal Engine

```
"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" pipeline\render\unreal\UsableSpace\UsableSpace.uproject ^
    -ExecutePythonScript=pipeline\render\unreal\import_scene.py -unattended -nopause -nosplash -nullrhi -stdout
```

Checked: the same `.glb` imports in about a minute (728 static meshes, 697 material instances, 15 textures; the names survive). **Not done:** a picture rendered in Unreal, the
glb's materials are plain glTF materials there, the Poly Haven textures and the vegetation of the Blender script are not rebuilt in Unreal. Epic's *Send to Unreal* add-on and Datasmith were not used.

## Credits

Textures and sky: Poly Haven, CC0 (`textures/CREDITS.md`). The furniture models come with the app.
