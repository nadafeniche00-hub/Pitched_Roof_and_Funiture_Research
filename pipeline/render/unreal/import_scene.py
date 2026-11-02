"""Import the app's exported scene (pipeline/render/in/scene.glb) into Unreal Engine with the engine's own glTF importer (Interchange).

Run it inside the editor of the project next to this file:

    "C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" pipeline\\render\\unreal\\UsableSpace\\UsableSpace.uproject ^
        -ExecutePythonScript=pipeline\\render\\unreal\\import_scene.py -unattended -nopause -nosplash -nullrhi -stdout

It prints what arrived: static meshes, materials, textures, and whether the names that carry the meaning (wall_outer, roof, ground, ...) survived.
"""
import collections
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.environ.get("US_GLB") or os.path.normpath(os.path.join(HERE, "..", "in", "scene.glb"))
DEST = "/Game/UsableSpace"

print(f"[unreal-import] {GLB} ({os.path.getsize(GLB) / 1e6:.1f} MB) -> {DEST}")
task = unreal.AssetImportTask()
task.set_editor_property("filename", GLB)
task.set_editor_property("destination_path", DEST)
task.set_editor_property("automated", True)
task.set_editor_property("replace_existing", True)
task.set_editor_property("save", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

paths = list(task.get_editor_property("imported_object_paths"))
print(f"[unreal-import] importer returned {len(paths)} objects")
reg = unreal.AssetRegistryHelpers.get_asset_registry()
assets = reg.get_assets_by_path(DEST, recursive=True)
by_class = collections.Counter(str(a.asset_class_path.asset_name) for a in assets)
print("[unreal-import] assets under", DEST, dict(by_class))
names = [str(a.asset_name) for a in assets]
for key in ("wall_outer", "wall_inner", "roof", "floor", "ground", "bark", "foliage", "glass", "window_frame", "stair_shaft", "partition"):
    hits = [n for n in names if key in n]
    print(f"[unreal-import]   {key:14} {len(hits):4d} assets" + (f"  e.g. {hits[0]}" if hits else ""))
print("[unreal-import] done")
