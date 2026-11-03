"""make_house_pack.py: the house of the walk view, alone (no ground, no trees, no grass), as a few merged static meshes in /Game/UsableSpace/House, ready to be copied into any other
Unreal project (place_house.py puts it into the jungle). Run it headless (no GPU) in the UsableSpace project, after run.ps1 -BuildOnly has built the level /Game/UsableSpace/Scene:

    "C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" pipeline\\render\\unreal\\UsableSpace\\UsableSpace.uproject ^
        -ExecutePythonScript=pipeline\\render\\unreal\\house\\make_house_pack.py -unattended -nopause -nosplash -nullrhi -stdout -AutoDeclinePackageRecovery

US_MODE=inspect only lists what the scene is made of (counts per kind of part). The answers go to house\\logs\\pack.log (the editor's own log does not carry what a script prints here).
"""
import collections
import os
import re

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "logs", "pack.log")
MODE = os.environ.get("US_MODE", "build")
LEVEL = "/Game/UsableSpace/Scene"
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def attempt(label, fn, default=None):
    try:
        return fn()
    except Exception as e:  # the API of this engine version is not known in advance: report and go on
        say(label, "failed:", type(e).__name__, str(e)[:240])
        return default


def stem(label):
    return re.sub(r"[_.\- ]*\d+$", "", label)


les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
say("---- mode", MODE, "| level", LEVEL, "| load_level:", les.load_level(LEVEL))
actors = list(eas.get_all_level_actors())
mesh_actors = [a for a in actors if isinstance(a, unreal.StaticMeshActor)]
say("actors:", len(actors), "| static mesh actors:", len(mesh_actors))

by = collections.defaultdict(list)
for a in mesh_actors:
    by[stem(a.get_actor_label())].append(a)


def verts(a):
    sm = a.static_mesh_component.static_mesh
    return attempt("verts", lambda: unreal.EditorStaticMeshLibrary.get_number_verts(sm, 0), 0) if sm else 0


rows = []
for k, v in by.items():
    rows.append((k, len(v), sum(verts(a) for a in v)))
rows.sort(key=lambda r: -r[2])
say("kind of part | actors | vertices of LOD 0")
for k, n, vv in rows:
    say("   %-26s %5d %9d" % (k, n, vv))
say("total vertices:", sum(r[2] for r in rows))

mats = collections.Counter()
for a in mesh_actors:
    comp = a.static_mesh_component
    for i in range(comp.get_num_materials()):
        m = comp.get_material(i)
        mats[m.get_name() if m else "None"] += 1
say("materials in use:", len(mats), "| most used:", mats.most_common(8))

if MODE != "build":
    say("---- done (inspect only)")
    raise SystemExit

# ---- the shell: everything that is not vegetation, ground or furniture (furniture: 52 parts with their own textures, left out on purpose: the jungle sees the house from outside)
SKIP = ("furniture", "foliage", "bark", "grass", "ground")
shell = [a for a in mesh_actors if not a.get_actor_label().startswith(SKIP)]
say("shell parts:", len(shell), "| vertices:", sum(verts(a) for a in shell))

# the house centre on the ground at the origin, so that the merged mesh has its pivot where the house stands: the scene has the house at x -40..840, y -40..1040, ground at z -300
CENTRE = unreal.Vector(400, 500, -300)
for a in shell:
    loc = a.get_actor_location()
    a.set_actor_location(unreal.Vector(loc.x - CENTRE.x, loc.y - CENTRE.y, loc.z - CENTRE.z), False, True)

PKG = "/Game/UsableSpace/House/UsableSpaceHouse"   # the merge adds its own prefix: the mesh is called SM_UsableSpaceHouse
opts = unreal.MergeStaticMeshActorsOptions()   # the Editor Scripting version is deprecated: StaticMeshEditorSubsystem does the merge
ms = opts.get_editor_property("mesh_merging_settings")
for k, v in (("pivot_type", unreal.MeshMergePivotType.WORLD_ORIGIN), ("merge_materials", False), ("generate_light_map_uv", False), ("merge_physics_data", True), ("use_landscape_culling", False)):
    attempt("setting " + k, lambda k=k, v=v: ms.set_editor_property(k, v))
opts.set_editor_property("mesh_merging_settings", ms)
opts.set_editor_property("base_package_name", PKG)
opts.set_editor_property("destroy_source_actors", False)
opts.set_editor_property("spawn_merged_actor", False)
merged = attempt("merge", lambda: unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem).merge_static_mesh_actors(shell, opts))
say("merged actor:", merged)
made = unreal.EditorAssetLibrary.list_assets("/Game/UsableSpace/House", recursive=True, include_folder=False)
say("assets made under /Game/UsableSpace/House:", list(made))
mesh = None
for p in made:
    obj = attempt("load " + str(p), lambda p=p: unreal.EditorAssetLibrary.load_asset(str(p)))
    if isinstance(obj, unreal.StaticMesh):
        mesh = obj
        PKG = obj.get_package().get_name()
        break
say("merged mesh:", mesh)
if mesh:
    say("materials of the merged mesh:", [(str(m.material_slot_name), m.material_interface.get_path_name() if m.material_interface else None) for m in mesh.get_editor_property("static_materials")])
    say("materials of the parts:", sorted({m.get_path_name() for p in shell for i in range(p.static_mesh_component.get_num_materials()) for m in [p.static_mesh_component.get_material(i)] if m}))
    say("merge settings used:", {k: str(ms.get_editor_property(k)) for k in ("merge_materials", "pivot_type", "bake_vertex_data_to_mesh", "use_vertex_data_for_baking_material", "use_texture_binning")})
    say("vertices:", attempt("verts", lambda: unreal.EditorStaticMeshLibrary.get_number_verts(mesh, 0)), "| sections:", attempt("sections", lambda: len(mesh.get_editor_property("static_materials"))))
    # the player walks on the floor and stops at the walls: the mesh itself is the collision (about 7000 vertices)
    def collide():
        bs = mesh.get_editor_property("body_setup")
        bs.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    attempt("collision", collide)
    say("saved:", PKG, unreal.EditorAssetLibrary.save_asset(PKG, only_if_is_dirty=False))
    # which assets does the pack need? the hard references of the merged mesh, and theirs, below /Game/UsableSpace
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    dopt = unreal.AssetRegistryDependencyOptions(include_soft_package_references=True, include_hard_package_references=True, include_searchable_names=False, include_soft_management_references=False, include_hard_management_references=False)
    # the mesh was created a moment ago and is not in the registry's dependency table yet: its materials are (they were imported by build_level.py), so start from them
    need = {PKG}
    todo = [m.material_interface.get_package().get_name() for m in mesh.get_editor_property("static_materials") if m.material_interface and m.material_interface.get_package().get_name().startswith("/Game/")]
    while todo:
        p = todo.pop()
        if p in need:
            continue
        need.add(p)
        for d in attempt("deps of " + p, lambda p=p: reg.get_dependencies(unreal.Name(p), dopt), []) or []:
            d = str(d)
            if d.startswith("/Game/UsableSpace/") and d not in need:
                todo.append(d)
    say("packages in the pack:", len(need))
    content = unreal.SystemLibrary.get_project_content_directory()
    stage = os.path.join(HERE, "pack", "Content")
    import json
    import shutil
    total = 0
    files = []
    for p in sorted(need):
        rel = p[len("/Game/"):]
        base = os.path.join(content, rel)
        for ext in (".uasset", ".uexp", ".ubulk", ".uptnl"):
            if os.path.exists(base + ext):
                dst = os.path.join(stage, rel + ext)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copyfile(base + ext, dst)
                total += os.path.getsize(base + ext)
                files.append(rel + ext)
        say("   ", p)
    say("staged", len(files), "files,", round(total / 1048576, 2), "MB in", stage)
    with open(os.path.join(HERE, "pack", "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"mesh": PKG, "packages": sorted(need), "files": files, "centre_cm": [CENTRE.x, CENTRE.y, CENTRE.z]}, f, indent=1)
# the level is NOT saved: the parts were moved only to be merged
say("---- done")
