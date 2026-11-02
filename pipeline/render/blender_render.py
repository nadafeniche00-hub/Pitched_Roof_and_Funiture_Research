"""Render the app's walk-view scene in Blender (Cycles): textures from Poly Haven (CC0), the sky as lighting.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup --python pipeline/render/blender_render.py -- [--shots exterior,section,cutaway,detail] [--preview]

The connector is a plain glTF 2.0 binary, Blender's built-in importer reads it as it is. The walk view writes it (download button, or
POST /api/dev/glb on the local server) with names that carry the meaning: the meshes and materials are called wall_outer, wall_inner, roof,
floor, ground, bark, foliage, grass, glass, window_frame and so on. This script maps every name to a texture set in pipeline/render/textures
(fetch_textures.py downloads them), cuts the window openings that the app only draws as flat panes, and lights the scene with the Poly Haven
sky plus a sun lamp. Shots go to pipeline/render/out/<shot>.png.

Staging that is done here and is not in the app: trees on the line of sight of a shot are hidden, the window openings are cut into the wall
shell, the roof is hidden for the cutaway view, the outside and inside skins of walls and roof become one two-sided surface.
"""
import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
TEX = HERE / "textures"
MEANS = json.loads((TEX / "means.json").read_text(encoding="utf-8"))  # mean linear colour of each texture (fetch_textures.py --means)
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--glb", default=str(HERE / "in" / "scene.glb"))
ap.add_argument("--out", default=str(HERE / "out"))
ap.add_argument("--shots", default="exterior,section,cutaway,detail")
ap.add_argument("--samples", type=int, default=192)
ap.add_argument("--res", default="1920x1200")
ap.add_argument("--preview", action="store_true", help="quick look: 960x600, at most 64 samples, files get a _preview suffix")
args = ap.parse_args(argv)
SUN, SKY = 4.0, 1.0  # clear-day daylight at standard strengths. Every shot is rendered at exposure 0: nothing is brightened and no lamps are added
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
RES = tuple(int(v) for v in args.res.split("x"))
SAMPLES = args.samples
if args.preview:
    RES, SAMPLES = (960, 600), min(SAMPLES, 64)


def log(*a):
    print("[render]", *a, flush=True)


def base(name):
    return re.sub(r"\.\d+$", "", name or "")


def rnd(v, n=1):
    return tuple(round(float(c), n) for c in v)


# ----------------------------------------------------------------------------------------------------------------- scene in
bpy.ops.wm.read_factory_settings(use_empty=True)
t0 = time.time()
bpy.ops.import_scene.gltf(filepath=args.glb)
scene = bpy.context.scene
log(f"imported {Path(args.glb).name} in {time.time() - t0:.1f} s: {len(bpy.data.objects)} objects")

# the app builds roof and walls as two skins with the thickness of the building between them (wall_outer / wall_inner, roof_outer / roof_inner), each facing its own side

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
by_name = {}
for o in meshes:
    by_name.setdefault(base(o.name), []).append(o)
log("object names:", {k: len(v) for k, v in sorted(by_name.items()) if not k.startswith("furniture_")}, "| furniture meshes:", sum(len(v) for k, v in by_name.items() if k.startswith("furniture_")))


def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


shell = [o for n in ("wall_outer", "roof_outer", "floor_inner") for o in by_name.get(n, [])]
H_lo, H_hi = bbox(shell)
centre = (H_lo + H_hi) / 2
ground_z = by_name["ground"][0].matrix_world.translation.z if "ground" in by_name else H_lo.z
log(f"house bbox {rnd(H_lo, 2)} .. {rnd(H_hi, 2)}, ground z {ground_z:.2f}")

# ----------------------------------------------------------------------------------------------------------------- windows
# the app draws a window as a flat pane in front of a closed wall. Here both skins of the wall get a real opening (bisect, delete the faces inside) and a reveal
# closes the opening between them, so that the sun comes in and the exterior shows glass in a frame.


def cut_opening(ob, x0, x1, z0, z1, y):
    me = ob.data.copy()
    ob.data = me
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)  # to world space, the object matrix becomes identity below
    for co, no in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)), ((0, 0, z0), (0, 0, 1)), ((0, 0, z1), (0, 0, 1))):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no)
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.y - y) < 0.06 and x0 < c.x < x1 and z0 < c.z < z1:
            dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(me)
    bm.free()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
    return len(dead)


def add_portal(lo, hi, gable_y):
    """a light portal in the opening: tells Cycles where the sky light comes into the room (far less noise indoors)"""
    inward = Vector((0, -1, 0)) if gable_y > centre.y else Vector((0, 1, 0))
    ld = bpy.data.lights.new("portal", "AREA")
    ld.shape, ld.size, ld.size_y = "RECTANGLE", hi.x - lo.x, hi.z - lo.z
    try:
        ld.cycles.is_portal = True
    except AttributeError:
        try:
            ld.is_portal = True
        except AttributeError:
            log("this Blender has no portal flag on lights")
    ob = bpy.data.objects.new("portal", ld)
    scene.collection.objects.link(ob)
    ob.location = Vector(((lo.x + hi.x) / 2, gable_y - inward.y * 0.03, (lo.z + hi.z) / 2))
    ob.rotation_euler = inward.to_track_quat("-Z", "Y").to_euler()


def add_reveal(lo, hi, y0, y1):
    """the four faces that close an opening between the inner and the outer skin of the wall (sill, jambs, head)"""
    x0, x1, z0, z1 = lo.x, hi.x, lo.z, hi.z
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
    me = bpy.data.meshes.new("reveal")
    me.from_pydata(v, [], [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    me.update()
    ob = bpy.data.objects.new("window_reveal", me)
    scene.collection.objects.link(ob)
    by_name.setdefault("window_reveal", []).append(ob)


panes = by_name.get("window_outer", [])
skins = {k: [o for o in by_name.get(k, []) if bbox([o])[1].z > 0.5] for k in ("wall_outer", "wall_inner")}  # the shell walls, not the storey below
for p in panes:
    lo, hi = bbox([p])
    y = (lo.y + hi.y) / 2
    sign = 1 if y > centre.y else -1  # which gable: +1 the one at y = 0 (top of the plan), -1 the other
    y_in = y + sign * 0.02  # the pane stands 2 cm inside the inner skin
    y_out = H_hi.y if sign > 0 else H_lo.y  # the outer skin is the outside of the shell box
    cut = sum(cut_opening(w, lo.x, hi.x, lo.z, hi.z, y_out) for w in skins["wall_outer"]) + sum(cut_opening(w, lo.x, hi.x, lo.z, hi.z, y_in) for w in skins["wall_inner"])
    add_reveal(lo, hi, y_in, y_out)
    add_portal(lo, hi, y_out)
    log(f"window {hi.x - lo.x:.2f} x {hi.z - lo.z:.2f} m at x {lo.x:.2f}, z {lo.z:.2f}, wall from y {y_in:.2f} to {y_out:.2f}: {cut} faces cut, reveal and light portal added")


def scale_height(ob, factor, z0):
    """the app's grass is tall for a viewer standing in it; for a photograph it is cut to `factor` of its height"""
    me = ob.data.copy()
    ob.data = me
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
    for v in bm.verts:
        v.co.z = z0 + (v.co.z - z0) * factor
    bm.to_mesh(me)
    bm.free()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)


for o in by_name.get("grass", []):
    scale_height(o, 0.55, ground_z + 0.02)


# ----------------------------------------------------------------------------------------------------------------- UVs
# flat projection per face: u along the horizontal edge of the face, v up the slope. One UV unit is `size` metres, so every texture keeps its real scale.
def project_uvs(ob, size):
    me = ob.data.copy()
    ob.data = me
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    mw, nm = ob.matrix_world, ob.matrix_world.to_3x3()
    up = Vector((0, 0, 1))
    for f in bm.faces:
        n = (nm @ f.normal).normalized()
        t1 = Vector((1, 0, 0)) if abs(n.z) > 0.999 else up.cross(n).normalized()
        t2 = n.cross(t1).normalized()
        for lp in f.loops:
            p = mw @ lp.vert.co
            lp[layer].uv = (p.dot(t1) / size, p.dot(t2) / size)
    bm.to_mesh(me)
    bm.free()


# ----------------------------------------------------------------------------------------------------------------- materials
def new_material(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:  # noqa: BLE001
        pass
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return m, nt, out


def image(path, data=False):
    im = bpy.data.images.load(str(path), check_existing=True)
    im.colorspace_settings.name = "Non-Color" if data else "sRGB"
    return im


def pbr_nodes(nt, slot, scale=(1, 1, 1), ao=0.6, normal=0.9, rough_gain=1.0, albedo=None, uv_map="UVMap"):
    """Principled BSDF with the diffuse, roughness, normal and AO maps of a texture folder; returns the BSDF node.
    albedo = the mean linear colour the surface should have: the diffuse map is scaled to it (its detail stays), AO darkening included."""
    d = TEX / slot
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_map
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = scale
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])

    def tex(fn, data):
        p = d / fn
        if not p.exists():
            return None
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = image(p, data)
        n.extension = "REPEAT"
        nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
        return n

    diff, rough, nor, aot = tex("diff.jpg", False), tex("rough.jpg", True), tex("nor.jpg", True), tex("ao.jpg", True)
    col = diff.outputs["Color"]
    if aot is not None and ao > 0:
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
        mx.inputs[0].default_value = ao
        nt.links.new(col, mx.inputs[6])
        nt.links.new(aot.outputs["Color"], mx.inputs[7])
        col = mx.outputs[2]
    if albedo is not None:
        m = MEANS[slot]
        ao_mean = (1 - ao + ao * m["ao"][0]) if (aot is not None and ao > 0 and "ao" in m) else 1.0
        gain = [albedo[i] / (m["diff"][i] * ao_mean) for i in range(3)]
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        nt.links.new(col, mx.inputs[6])
        mx.inputs[7].default_value = (*gain, 1)
        col = mx.outputs[2]
    nt.links.new(col, b.inputs["Base Color"])
    if rough is not None:
        if rough_gain != 1.0:
            mu = nt.nodes.new("ShaderNodeMath")
            mu.operation = "MULTIPLY"
            mu.use_clamp = True
            mu.inputs[1].default_value = rough_gain
            nt.links.new(rough.outputs["Color"], mu.inputs[0])
            nt.links.new(mu.outputs[0], b.inputs["Roughness"])
        else:
            nt.links.new(rough.outputs["Color"], b.inputs["Roughness"])
    if nor is not None:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.space, nm.uv_map = "TANGENT", uv_map
        nm.inputs["Strength"].default_value = normal
        nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return b


def pbr(name, slot, **kw):
    m, nt, out = new_material(name)
    nt.links.new(pbr_nodes(nt, slot, **kw).outputs[0], out.inputs["Surface"])
    return m


def thin_glass(name, tint=(0.9, 0.96, 1.0)):
    """a pane that lets the light through and reflects like glass (Fresnel); no refraction because the pane has no thickness"""
    m, nt, out = new_material(name)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = (*tint, 1)
    gl = nt.nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.02
    fr = nt.nodes.new("ShaderNodeFresnel")
    fr.inputs["IOR"].default_value = 1.5
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fr.outputs["Fac"], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def plain(name, color, rough=0.5, metal=0.0):
    m, nt, out = new_material(name)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return m


WALL_IN = (0.72, 0.70, 0.66)  # warm white paint inside
MATS = {
    "wall_outer": plain("wall_outer", (0.80, 0.74, 0.62), 0.92),  # smooth warm render (Putz); the timber frame, plinth and shutters give the facade its texture
    "timber": pbr("timber", "timber", ao=0.6, normal=0.8, albedo=(0.10, 0.06, 0.035)),
    "plinth": pbr("plinth", "wall_plaster", ao=0.5, albedo=(0.30, 0.28, 0.25)),
    "sill": plain("sill", (0.55, 0.53, 0.48), 0.8),
    "shutter": plain("shutter", (0.05, 0.11, 0.065), 0.55),
    "partition_cut": plain("partition_cut", (0.008, 0.008, 0.01), 0.9),  # the cut face of a wall, black like a wall section in a plan
    "wall_inner": pbr("wall_inner", "wall_white", ao=0.3, albedo=WALL_IN),
    "roof_outer": pbr("roof_outer", "roof_clay", ao=0.8, normal=1.2, albedo=(0.30, 0.10, 0.045)),
    "roof_inner": pbr("roof_inner", "wall_white", ao=0.3, albedo=WALL_IN),
    "window_reveal": plain("window_reveal", WALL_IN, 0.8),
    "partition": pbr("partition", "wall_white", ao=0.3, albedo=WALL_IN),
    "floor_inner": pbr("floor", "floor_wood", ao=0.4, rough_gain=0.8, albedo=(0.30, 0.18, 0.09)),
    "ground": pbr("ground", "ground_forest", ao=0.5, albedo=(0.17, 0.15, 0.08)),
    "bark": pbr("bark", "bark", scale=(3, 5, 1), ao=0.8, normal=1.0),  # the cylinders keep their own UVs
    "glass": thin_glass("glass"),
    "window_frame": plain("window_frame", (0.82, 0.82, 0.80), 0.45),
    "window_lower": plain("window_lower", (0.012, 0.02, 0.03), 0.04, 0.2),
    "stair_shaft": plain("stair_shaft", (0.012, 0.012, 0.014), 0.9),
}
TILE = {"timber": 1.0, "plinth": 1.2, "wall_outer": 2.0, "wall_inner": 2.0, "partition": 2.0, "roof_outer": 1.6, "roof_inner": 1.6, "floor_inner": 1.4, "ground": 4.0}
ROLE_OF = {"window_outer": "glass"}
n_assigned = 0
for name, objs in by_name.items():
    if name.startswith("furniture_") or name == "partition_cut" or (name not in MATS and name not in ROLE_OF):
        continue
    key = ROLE_OF.get(name, name)
    for ob in objs:
        if name in TILE:
            project_uvs(ob, TILE[name])
        if key == "partition" and len(ob.material_slots) >= 2:  # slot 0 the two faces of the wall, slot 1 its cut face (a second glTF primitive): clearing the slots would send every face to slot 0
            ob.material_slots[0].material = MATS["partition"]
            ob.material_slots[1].material = MATS["partition_cut"]
        else:
            ob.data.materials.clear()
            ob.data.materials.append(MATS[key])
        n_assigned += 1
log(f"materials assigned to {n_assigned} objects; furniture keeps the materials of its glTF models")
for ob in by_name.get("partition", [])[:1]:  # the partition walls come in with two primitives: the two faces and the cut face on top
    from collections import Counter
    log(f"partition {ob.name}: slots {[sl.material.name for sl in ob.material_slots]}, polygons per slot {dict(Counter(p.material_index for p in ob.data.polygons))}")
# parts that have no object name of their own but a material name (window frames come in as unnamed objects)
for ob in meshes:
    if base(ob.name) in MATS or base(ob.name) in ROLE_OF or base(ob.name).startswith("furniture_"):
        continue
    for s in ob.material_slots:
        if s.material and base(s.material.name) in ("window_frame", "glass", "glass_dark", "stair_shaft"):
            nm = base(s.material.name)
            s.material = MATS["window_lower" if nm == "glass_dark" else nm]


# ----------------------------------------------------------------------------------------------------------------- vegetation
sys.path.insert(0, str(HERE))
import vegetation  # noqa: E402

house_r = max(H_hi.x - H_lo.x, H_hi.y - H_lo.y) / 2
bpy.context.view_layer.update()
veg = vegetation.build(dict(scene=scene, by_name=by_name, ground_z=ground_z, centre=centre, H_lo=H_lo, H_hi=H_hi, MATS=MATS, new_material=new_material,
                      pbr_nodes=pbr_nodes, project_uvs=project_uvs, bbox=bbox, log=log))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]  # the app's grass is gone, the lawn, rocks and crowns are new

# ----------------------------------------------------------------------------------------------------------------- sky and sun
def sky_without_sun(path):
    src = bpy.data.images.load(str(path))
    w, h = src.size
    a = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)
    lum = a[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    cap = float(np.percentile(lum, 99.9))
    log(f"sky HDRI {w}x{h}: peak {lum.max():.0f}, median {np.median(lum):.2f}; the sun disc is cut at {cap:.1f} and replaced by a sun lamp")
    a[..., :3] = np.minimum(a[..., :3], cap)
    dst = bpy.data.images.new("sky_no_sun", w, h, alpha=False, float_buffer=True)
    dst.colorspace_settings.name = "Linear Rec.709"
    dst.pixels.foreach_set(a.ravel())
    dst.update()
    return dst


world = bpy.data.worlds.new("sky")
scene.world = world
try:
    world.use_nodes = True
except Exception:  # noqa: BLE001
    pass
wn = world.node_tree
wn.nodes.clear()
env = wn.nodes.new("ShaderNodeTexEnvironment")
env.image = sky_without_sun(TEX / "sky.hdr")
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = SKY
wo = wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(env.outputs["Color"], bg.inputs["Color"])
wn.links.new(bg.outputs["Background"], wo.inputs["Surface"])

sun = bpy.data.lights.new("sun", "SUN")
sun.energy = SUN
sun.angle = math.radians(1.1)
sun.color = (1.0, 0.94, 0.85)
sun_ob = bpy.data.objects.new("sun", sun)
scene.collection.objects.link(sun_ob)


def aim_sun(az, el):
    """az in degrees from +y towards +x (seen from above), el above the horizon: where the sun stands"""
    a, e = math.radians(az), math.radians(el)
    to_sun = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    sun_ob.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()


# ----------------------------------------------------------------------------------------------------------------- render setup
cy = scene.cycles
scene.render.engine = "CYCLES"
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.01
cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces, cy.transmission_bounces, cy.transparent_max_bounces = 10, 5, 4, 8, 16
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
cy.filter_width = 1.4
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "AgX"  # Blender's default display transform: no look, exposure 0
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0

gpu = "CPU"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type == kind]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == kind
                cy.device = "GPU"
                gpu = f"{kind}: {', '.join(d.name for d in devs)}"
                break
        except Exception as e:  # noqa: BLE001
            log("device", kind, "failed:", e)
except Exception as e:  # noqa: BLE001
    log("no GPU setup:", e)
log("render device:", gpu, f"| {RES[0]}x{RES[1]}, {SAMPLES} samples")

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.clip_start, cam_data.clip_end = 0.05, 400


def look_at(pos, target, lens):
    cam.location = Vector(pos)
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens
    cam_data.shift_y = 0.0


def look_level(pos, target, lens):
    """architect's photograph: the camera stays level (vertical edges stay vertical) and the lens shift frames the target"""
    p, t = Vector(pos), Vector(target)
    flat = Vector((t.x - p.x, t.y - p.y, 0.0))
    cam.location = p
    cam.rotation_euler = flat.to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens
    cam_data.sensor_width = 36.0
    cam_data.shift_y = (t.z - p.z) * lens / (36.0 * flat.length)


def hide_trees_on(a, b, width):
    """take the trees that stand on the line of sight between a and b out of the picture (they are only hidden in this render)"""
    a2, b2 = Vector((a[0], a[1])), Vector((b[0], b[1]))
    ab = b2 - a2
    n = 0
    for o in by_name.get("bark", []) + by_name.get("foliage", []):
        q = Vector((o["xy"][0], o["xy"][1])) - a2
        t = max(0.0, min(1.0, q.dot(ab) / max(ab.length_squared, 1e-6)))
        if (q - ab * t).length < width:
            set_visible(o, False)
            n += 1
    return n


def set_visible(o, visible):
    """hide_render alone leaves the particles (leaves, needles) of a tree behind: the particle modifiers are switched too"""
    o.hide_render = not visible
    for m in o.modifiers:
        m.show_render = visible


def unhide_all():
    for o in meshes:
        set_visible(o, True)


def render(shot, label):
    scene.render.filepath = str(OUT / f"{shot}{'_preview' if args.preview else ''}.png")
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"{label}: {time.time() - t:.0f} s -> {scene.render.filepath}")


def pos_at(az, dist, height):
    a = math.radians(az)
    return (centre.x + math.sin(a) * dist, centre.y + math.cos(a) * dist, ground_z + height)


# azimuth: degrees from +y towards +x. The windows are on the +y and -y gables, the ridge runs along y, the eave sides face -x and +x.
shots = [s.strip() for s in args.shots.split(",") if s.strip()]
house_r = max(H_hi.x - H_lo.x, H_hi.y - H_lo.y) / 2
tgt = Vector((centre.x, centre.y, ground_z + (H_hi.z - ground_z) * 0.42))

if "exterior" in shots:
    unhide_all()
    aim_sun(25, 38)
    p = pos_at(325, house_r * 4.0, 1.7)
    n = hide_trees_on(p, (centre.x, centre.y), 5.5)
    look_level(p, tgt, 30)
    log(f"exterior: camera {rnd(p)}, {n} trees taken out of the line of sight")
    render("exterior", "exterior")

if "cutaway" in shots:
    unhide_all()
    for o in by_name.get("roof_outer", []) + by_name.get("roof_inner", []):
        set_visible(o, False)
    aim_sun(300, 46)
    p = pos_at(262, house_r * 2.7, house_r * 3.0)
    n = hide_trees_on(p, (centre.x, centre.y), 5.5)
    look_at(p, (centre.x, centre.y, ground_z + 1.2), 32)
    log(f"cutaway: camera {rnd(p)}, {n} trees hidden")
    render("cutaway", "cutaway (roof hidden)")

def cut_away(ob, keep):
    """delete the faces of ob whose centre (world space) fails keep(): the cut of a section view"""
    me = ob.data.copy()
    ob.data = me
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
    dead = [f for f in bm.faces if not keep(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(me)
    bm.free()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
    return len(dead)


def clip_at_x(ob, x):
    """cut ob at the plane x and keep the side x >= x: windows reach across the section plane, whole faces would stick out into the half that is taken away"""
    me = ob.data.copy()
    ob.data = me
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=1e-5, plane_co=(x, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
    bm.to_mesh(me)
    bm.free()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)


if "detail" in shots:
    # the vegetation close up: moss on a rock and in the grass, the house in the background
    unhide_all()
    rock = max(veg["rocks"], key=lambda r: (r.location.xy - Vector((centre.x, centre.y))).length if (r.location.xy - Vector((centre.x, centre.y))).length < 12 else 0)
    rp = rock.location
    away = Vector((rp.x - centre.x, rp.y - centre.y)).normalized()  # from the house towards the rock: the camera stands on the house side, so the forest is behind the rock
    side = Vector((-away.y, away.x))
    p = (rp.x - away.x * 2.2 + side.x * 0.7, rp.y - away.y * 2.2 + side.y * 0.7, ground_z + 0.5)
    aim_sun(25, 40)
    hidden = hide_trees_on(p, (rp.x, rp.y), 1.5)
    look_at(p, (rp.x, rp.y, ground_z + 0.25), 40)
    log(f"detail: rock at {rnd(rp)}, camera {rnd(p)}, {hidden} trees hidden")
    render("detail", "detail (moss and grass)")

if "section" in shots:
    # the way the inside of a building is shown in daylight: cut through the ridge, take the near half of roof, walls and partitions away,
    # look into the furnished room. (A closed attic lit by two small windows is dark at a neutral exposure, and nothing is brightened here.)
    unhide_all()
    x_cut = centre.x
    n = sum(cut_away(o, lambda c: c.x >= x_cut) for name in ("roof_outer", "roof_inner", "wall_outer", "wall_inner", "partition") for o in by_name.get(name, []) if bbox([o])[1].z > 0.5)
    for name in ("window_reveal", "window_frame", "window_outer"):  # the gable windows of the shell; the ones of the storey below stay whole
        for o in by_name.get(name, []):
            if bbox([o])[1].z > 0.5:
                clip_at_x(o, x_cut)
    floor_z = bbox(by_name["floor_inner"])[1].z if by_name.get("floor_inner") else H_lo.z
    aim_sun(300, 45)
    p = (x_cut - house_r * 1.9, centre.y + 0.8, floor_z + 3.8)
    hidden = hide_trees_on(p, (centre.x, centre.y), 5.5)
    look_level(p, (x_cut + 1.5, centre.y, floor_z + 0.7), 30)
    log(f"section: {n} faces cut away at x = {x_cut:.1f}, camera {rnd(p)}, {hidden} trees hidden")
    render("section", "section perspective")

log("done")
