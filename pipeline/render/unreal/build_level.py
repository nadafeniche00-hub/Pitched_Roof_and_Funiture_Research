"""Build the Unreal level of the walk-view scene: import the glb as a scene (actors with the transforms of the glTF nodes), give the trees their vertex colours back, add the
sun, the sky and a little fog. Run it headless (no rendering needed):

    "C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" pipeline\\render\\unreal\\UsableSpace\\UsableSpace.uproject ^
        -ExecutePythonScript=pipeline\\render\\unreal\\build_level.py -unattended -nopause -nosplash -nullrhi -stdout

Then render_shots.py takes the pictures. Daylight only: one sun, the sky, default exposure, no other lights.
"""
import collections
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.environ.get("US_GLB") or os.path.normpath(os.path.join(HERE, "..", "in", "scene.glb"))
ROOT = "/Game/UsableSpace"
LEVEL = ROOT + "/Scene"
P = "[unreal-level]"


def say(*parts):
    """neither print() nor unreal.log reach the log of the editor in this mode: the messages are also appended to script.log next to this file"""
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(os.path.join(HERE, "script.log"), "a", encoding="utf-8") as f:
        f.write(msg + "\n")


eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

# ---- a new empty level, then the glb as a scene into it
# everything under ROOT is made by this script, and it needs a clean start: assets deleted and made again in one session cannot be saved ("illegal reference to
# private object"), and a level cannot be replaced while it is the open one (DefaultEngine.ini sets no startup map for that reason). run.ps1 deletes the folder first.
if unreal.EditorAssetLibrary.does_directory_exist(ROOT):
    raise RuntimeError(f"{P} {ROOT} exists from an earlier run: delete Content/UsableSpace on disk first (run.ps1 does that)")
if not les.new_level(LEVEL):
    raise RuntimeError(f"{P} could not create {LEVEL}")
say(P, "new level:", LEVEL)
im = unreal.InterchangeManager.get_interchange_manager_scripted()
src = im.create_source_data(GLB)
params = unreal.ImportAssetParameters()
params.is_automated = True
params.replace_existing = True
say(P, "import_scene:", im.import_scene(ROOT, src, params))

actors = eas.get_all_level_actors()
say(P, "actors in the level:", dict(collections.Counter(a.get_class().get_name() for a in actors)))


# ---- trees: the glTF materials of the foliage are white and rely on vertex colours, which the glTF importer's materials ignore. One material that shows them.
def vertex_color_material():
    path = ROOT + "/M_VertexColor"
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.load_asset(path)
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset("M_VertexColor", ROOT, unreal.Material, unreal.MaterialFactoryNew())
    mel = unreal.MaterialEditingLibrary
    vc = mel.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -700, 0)
    gain = mel.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -700, 220)
    gain.set_editor_property("parameter_name", "Gain")
    gain.set_editor_property("default_value", 1.8)  # the app's vertex colours are dark, made for its own lighting: lifted to a real albedo, as in the Blender script
    mul = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -420, 80)
    mel.connect_material_expressions(vc, "", mul, "A")
    mel.connect_material_expressions(gain, "", mul, "B")
    mel.connect_material_property(mul, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -420, 300)
    rough.set_editor_property("r", 0.9)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mat.set_editor_property("two_sided", True)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def import_textures(slot):
    """the diffuse, normal and roughness maps of a CC0 texture set (pipeline/render/textures/<slot>) as Unreal textures"""
    tdir = os.path.normpath(os.path.join(HERE, "..", "textures", slot))
    files = {k: os.path.join(tdir, f"{k}.jpg") for k in ("diff", "nor", "rough")}
    if not all(os.path.exists(f) for f in files.values()):
        return None
    tasks = []
    for k, f in files.items():
        t = unreal.AssetImportTask()
        for key, val in (("filename", f), ("destination_path", ROOT + "/Textures"), ("destination_name", f"T_{slot}_{k}"), ("automated", True), ("replace_existing", True), ("save", True)):
            t.set_editor_property(key, val)
        tasks.append(t)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    tex = {k: unreal.load_asset(f"{ROOT}/Textures/T_{slot}_{k}") for k in files}
    tex["nor"].set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
    tex["nor"].set_editor_property("srgb", False)
    tex["rough"].set_editor_property("srgb", False)
    for t in tex.values():
        unreal.EditorAssetLibrary.save_loaded_asset(t)
    return tex


def texture_material(name, slot, gain, uv_tiling=None, world_cm=None):
    """a material from one texture set. Texture coordinates: the mesh's own, repeated uv_tiling times, or the world position (x, y) divided by world_cm.
    The materials the glTF importer makes carry stray text in the shadows, so the big surfaces get their own."""
    tex = import_textures(slot)
    if tex is None:
        say(P, f"no textures for {slot} (run pipeline/render/fetch_textures.py): {name} stays a plain colour")
        return None
    if unreal.EditorAssetLibrary.does_asset_exist(f"{ROOT}/{name}"):
        unreal.EditorAssetLibrary.delete_asset(f"{ROOT}/{name}")
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, ROOT, unreal.Material, unreal.MaterialFactoryNew())
    mel = unreal.MaterialEditingLibrary
    if world_cm:
        wp = mel.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
        mask = mel.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1150, 0)
        for k, v in (("r", True), ("g", True), ("b", False), ("a", False)):
            mask.set_editor_property(k, v)
        uv = mel.create_material_expression(mat, unreal.MaterialExpressionDivide, -900, 0)
        uv.set_editor_property("const_b", float(world_cm))
        mel.connect_material_expressions(wp, "", mask, "")
        mel.connect_material_expressions(mask, "", uv, "A")
    else:
        uv = mel.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -900, 0)
        uv.set_editor_property("u_tiling", float(uv_tiling))
        uv.set_editor_property("v_tiling", float(uv_tiling))

    def sample(key, y, sampler):
        n = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -620, y)
        n.set_editor_property("texture", tex[key])
        n.set_editor_property("sampler_type", sampler)
        mel.connect_material_expressions(uv, "", n, "UVs")
        return n

    diff = sample("diff", -200, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
    nor = sample("nor", 100, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    rough = sample("rough", 400, unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
    mul = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, -200)
    mul.set_editor_property("const_b", float(gain))  # brings the texture's own mean colour to a believable albedo
    mel.connect_material_expressions(diff, "RGB", mul, "A")
    mel.connect_material_property(mul, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(nor, "RGB", unreal.MaterialProperty.MP_NORMAL)
    mel.connect_material_property(rough, "R", unreal.MaterialProperty.MP_ROUGHNESS)
    mat.set_editor_property("two_sided", True)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


def flat_parent():
    """a plain colour (Color) and a roughness: for the parts that have no texture"""
    if unreal.EditorAssetLibrary.does_asset_exist(ROOT + "/M_Flat"):
        unreal.EditorAssetLibrary.delete_asset(ROOT + "/M_Flat")
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset("M_Flat", ROOT, unreal.Material, unreal.MaterialFactoryNew())
    mel = unreal.MaterialEditingLibrary
    col = mel.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, -500, 0)
    col.set_editor_property("parameter_name", "Color")
    col.set_editor_property("default_value", unreal.LinearColor(0.8, 0.8, 0.8, 1))
    mel.connect_material_property(col, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -500, 250)
    rough.set_editor_property("r", 0.85)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mat.set_editor_property("two_sided", True)  # the app's walls and roof are thin surfaces
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


FLAT = flat_parent()
FLAT_CACHE = {}


def furniture_parent():
    """the furniture models come with a base colour, a normal and a metallic-roughness map. The glTF master material of the importer draws the word "Preview" into the
    shadows of such surfaces (embossed, in the colour of the surface), so the same maps go into a material of our own."""
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset("M_Furniture", ROOT, unreal.Material, unreal.MaterialFactoryNew())
    mel = unreal.MaterialEditingLibrary
    white = unreal.load_asset("/Engine/EngineResources/WhiteSquareTexture")
    flat_normal = unreal.load_asset("/Engine/EngineMaterials/DefaultNormal")

    def sampler(name, y, kind, default):
        n = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSampleParameter2D, -900, y)
        n.set_editor_property("parameter_name", name)
        n.set_editor_property("sampler_type", kind)
        n.set_editor_property("texture", default)
        return n

    base = sampler("BaseColorTexture", -250, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, white)
    nor = sampler("NormalTexture", 60, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, flat_normal)
    mr = sampler("MetallicRoughnessTexture", 380, unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR, white)
    mel.connect_material_property(base, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    flip = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -900, 600)
    flip.set_editor_property("constant", unreal.LinearColor(1, -1, 1, 1))  # glTF normal maps point green up (OpenGL), Unreal's point green down
    nm = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -560, 100)
    mel.connect_material_expressions(nor, "RGB", nm, "A")
    mel.connect_material_expressions(flip, "", nm, "B")
    mel.connect_material_property(nm, "", unreal.MaterialProperty.MP_NORMAL)
    mel.connect_material_property(mr, "G", unreal.MaterialProperty.MP_ROUGHNESS)  # glTF: roughness in green, metallic in blue
    mf = mel.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -900, 760)
    mf.set_editor_property("parameter_name", "MetallicFactor")
    mf.set_editor_property("default_value", 1.0)
    mm = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -560, 400)
    mel.connect_material_expressions(mr, "B", mm, "A")
    mel.connect_material_expressions(mf, "", mm, "B")
    mel.connect_material_property(mm, "", unreal.MaterialProperty.MP_METALLIC)
    mat.set_editor_property("two_sided", True)
    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


FURN = furniture_parent()
FURN_CACHE = {}


def furniture_instance(src):
    """a material of ours with the maps of an imported textured glTF material instance"""
    key = src.get_path_name()
    if key not in FURN_CACHE:
        mi = unreal.AssetToolsHelpers.get_asset_tools().create_asset(f"MI_Furn_{len(FURN_CACHE):02d}_{src.get_name()}", ROOT + "/Furn", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mi.set_editor_property("parent", FURN)
        mel = unreal.MaterialEditingLibrary
        for tv in src.get_editor_property("texture_parameter_values"):
            name = str(tv.parameter_info.name)
            if name in ("BaseColorTexture", "NormalTexture", "MetallicRoughnessTexture") and tv.parameter_value is not None:
                mel.set_material_instance_texture_parameter_value(mi, name, tv.parameter_value)
        for sv in src.get_editor_property("scalar_parameter_values"):
            if str(sv.parameter_info.name) == "MetallicFactor":
                mel.set_material_instance_scalar_parameter_value(mi, "MetallicFactor", sv.parameter_value)
        FURN_CACHE[key] = mi
    return FURN_CACHE[key]


def flat_instance(rgb):
    key = tuple(round(float(v), 3) for v in rgb)
    if key not in FLAT_CACHE:
        mi = unreal.AssetToolsHelpers.get_asset_tools().create_asset(f"MI_Flat_{len(FLAT_CACHE):02d}", ROOT + "/Flat", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mi.set_editor_property("parent", FLAT)
        unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(key[0], key[1], key[2], 1))
        FLAT_CACHE[key] = mi
    return FLAT_CACHE[key]


def base_color_of(mat):
    """BaseColorFactor of an imported glTF material instance, or None when it is textured (the furniture) and must stay as it is"""
    if mat is None or not isinstance(mat, unreal.MaterialInstanceConstant):
        return None
    if len(mat.get_editor_property("texture_parameter_values")) > 0:
        return None
    for v in mat.get_editor_property("vector_parameter_values"):
        if str(v.parameter_info.name) == "BaseColorFactor":
            c = v.parameter_value
            return (c.r, c.g, c.b)
    return None


vmat = vertex_color_material()
gmat = texture_material("M_Ground", "ground_forest", 0.55, uv_tiling=26)  # the ground disc is 104 m across: about 4 m a tile
fmat = texture_material("M_Floor", "floor_wood", 1.4, uv_tiling=0.714)  # the floor's coordinates are metres: 1.4 m a tile
rmat = texture_material("M_Roof", "roof_clay", 1.0, world_cm=160)  # seen from above: 1.6 m a tile
fixed = 0
flat = 0
textured = 0
house = []  # (origin, extent) of the pieces that make the house, to place cameras later
shown = 0
for a in list(actors):
    if not isinstance(a, unreal.StaticMeshActor):
        continue
    name = a.get_actor_label()  # the actors carry the glTF node names (wall_outer, foliage, ...); the mesh assets are only called in_mesh_N
    comp = a.static_mesh_component
    sm = comp.static_mesh
    if shown < 6:
        say(P, "sample actor", name, "->", sm.get_name() if sm else None, "slots", comp.get_num_materials())
        shown += 1
    if sm is None:
        continue
    if name.startswith(("foliage", "bark", "grass")):
        for i in range(comp.get_num_materials()):
            comp.set_material(i, vmat)
        fixed += 1
    elif name == "ground" and gmat is not None:
        comp.set_material(0, gmat)
    elif name.startswith("floor") and fmat is not None:
        comp.set_material(0, fmat)
    elif name.startswith("roof_outer") and rmat is not None:  # the inner skin of the roof is plaster: a plain colour like the walls
        comp.set_material(0, rmat)
    else:  # house parts and furniture: a plain colour where the glTF material has only a colour, our own material with the same maps where it has textures
        for i in range(comp.get_num_materials()):
            m = comp.get_material(i)
            c = base_color_of(m)
            if c is not None:
                comp.set_material(i, flat_instance(c))
                flat += 1
            elif name.startswith("furniture") and isinstance(m, unreal.MaterialInstanceConstant) and len(m.get_editor_property("texture_parameter_values")) > 0:
                comp.set_material(i, furniture_instance(m))
                textured += 1
    if name.startswith(("wall_outer", "roof", "floor")):
        house.append(a.get_actor_bounds(False))
say(P, "components with the vertex-colour material:", fixed, "| with a plain colour of their own:", flat, "| flat colours:", len(FLAT_CACHE), "| furniture with our textured material:", textured, "|", len(FURN_CACHE), "instances")
if house:
    lo = [min(getattr(o, k) - getattr(e, k) for o, e in house) for k in "xyz"]
    hi = [max(getattr(o, k) + getattr(e, k) for o, e in house) for k in "xyz"]
    say(P, "house bounds (cm):", [round(v) for v in lo], [round(v) for v in hi])

# ---- daylight: one sun, the sky, fog. Nothing else.
sun = eas.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 0), unreal.Rotator(0, -45, 220))
sun.set_actor_label("Sun")
sc = sun.get_component_by_class(unreal.DirectionalLightComponent)
sc.set_editor_property("atmosphere_sun_light", True)
sc.set_editor_property("intensity", 10.0)
# a Stationary or Static light with no baked lighting makes the engine write the word "Preview" into its shadows (the preview-shadows indicator); a Movable one is lit live
sc.set_mobility(unreal.ComponentMobility.MOVABLE)
# the atmosphere's planet surface is at the actor's height: it must be the ground of the scene (3 m below the attic floor), or a camera standing on the ground is
# below the planet and sees a black sky
ground_top = next((o.z + e.z for o, e in (a.get_actor_bounds(False) for a in actors if a.get_actor_label() == "ground")), 0.0)
sky = eas.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, ground_top))
sky.set_actor_label("SkyAtmosphere")
sky.get_component_by_class(unreal.SkyAtmosphereComponent).set_editor_property("transform_mode", unreal.SkyAtmosphereTransformMode.PLANET_TOP_AT_COMPONENT_TRANSFORM)
say(P, "sky atmosphere: planet top at z =", round(ground_top), "cm")
skylight = eas.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 200))
skylight.set_actor_label("SkyLight")
skylight.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
skylight.get_component_by_class(unreal.SkyLightComponent).set_mobility(unreal.ComponentMobility.MOVABLE)
fog = eas.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0))
fog.set_actor_label("Fog")
fog.get_component_by_class(unreal.ExponentialHeightFogComponent).set_editor_property("fog_density", 0.004)

say(P, "saved the level:", les.save_current_level())
# import_scene creates the meshes and materials in memory: without this the saved level points at assets that do not exist on disk
say(P, "saved the imported assets:", unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True))
say(P, "static meshes on disk under", ROOT, ":", len([a for a in unreal.AssetRegistryHelpers.get_asset_registry().get_assets_by_path(ROOT, recursive=True) if str(a.asset_class_path.asset_name) == "StaticMesh"]))
say(P, "done")
