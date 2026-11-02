"""Vegetation for the Blender render: leaves and needles on the app's tree crowns, a dense lawn, moss carpets, mossy rocks and trunks.

Everything is procedural, nothing is downloaded: the leaf, needle, grass tuft and moss cushion are small meshes built here, scattered with Blender's
particle systems as instances (a million leaves cost little), and shaded for the look of the thing:
  leaves  - translucent (light shines through them), a different green for every leaf, lighter towards the top of the crown
  needles - dark conifer greens, tufts that splay
  grass   - a gradient along the blade, from the dark root to a pale tip, translucent
  moss    - velvet: sheen and a little subsurface scattering, fine pores as bump, cushions that overlap into a soft carpet
The app's own crowns (low-poly cones and lumps) stay underneath as the dark core of each tree, so no light falls through the foliage.
"""
import colorsys
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

# linear RGB: (dark, light) of a leaf or needle
BROAD = [((0.035, 0.110, 0.015), (0.160, 0.340, 0.040)), ((0.045, 0.120, 0.012), (0.220, 0.360, 0.035)), ((0.025, 0.090, 0.015), (0.120, 0.270, 0.040))]
SPRUCE = [((0.015, 0.055, 0.022), (0.060, 0.160, 0.060)), ((0.020, 0.070, 0.025), (0.080, 0.180, 0.060))]
BUSH = [((0.030, 0.100, 0.012), (0.160, 0.320, 0.040))]
MOSS_DARK, MOSS_LIGHT = (0.045, 0.160, 0.020), (0.140, 0.300, 0.045)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Noise:
    """value noise on a lattice, a few octaves: patches of moss and grass"""

    def __init__(self, seed):
        self.t = np.random.RandomState(seed).rand(256, 256).astype(np.float32)

    def value(self, x, y):
        xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
        xf, yf = x - xi, y - yi
        u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
        a, b = self.t[yi & 255, xi & 255], self.t[yi & 255, (xi + 1) & 255]
        c, d = self.t[(yi + 1) & 255, xi & 255], self.t[(yi + 1) & 255, (xi + 1) & 255]
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v

    def fbm(self, x, y, scale, octaves=4):
        s, amp, tot, norm = scale, 1.0, 0.0, 0.0
        for o in range(octaves):
            tot += amp * self.value(x * s + o * 17.3, y * s + o * 31.7)
            norm += amp
            s *= 2.07
            amp *= 0.5
        return tot / norm


# ----------------------------------------------------------------------------------------------------------------- shading helpers
def ramp(nt, fac, stops):
    n = nt.nodes.new("ShaderNodeValToRGB")
    els = n.color_ramp.elements
    while len(els) < len(stops):
        els.new(0.5)
    for e, (p, c) in zip(els, stops):
        e.position, e.color = p, c
    nt.links.new(fac, n.inputs["Fac"])
    return n


def world_noise(nt, geo, scale, detail=5.0, rough=0.6):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    nt.links.new(geo.outputs["Position"], n.inputs["Vector"])
    return n.outputs["Fac"]


def mix_color(nt, a, b, fac):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type, m.blend_type = "RGBA", "MIX"
    nt.links.new(fac, m.inputs[0])
    for i, v in ((6, a), (7, b)):
        if isinstance(v, tuple):
            m.inputs[i].default_value = (*v, 1)
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[2]


def moss_bsdf(nt, scale=70.0, bump=0.6):
    """velvety moss: random shade per instance, sheen, a little scattering, fine pores"""
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    col = mix_color(nt, MOSS_DARK, MOSS_LIGHT, oi.outputs["Random"])
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    b.inputs["Specular IOR Level"].default_value = 0.1  # moss does not shine, it is soft
    b.inputs["Sheen Weight"].default_value = 1.0
    b.inputs["Sheen Roughness"].default_value = 0.35
    b.inputs["Sheen Tint"].default_value = (0.75, 1.0, 0.6, 1)
    b.inputs["Subsurface Weight"].default_value = 0.12
    b.inputs["Subsurface Radius"].default_value = (0.15, 0.35, 0.08)
    b.inputs["Subsurface Scale"].default_value = 0.05
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = 8.0
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.01
    nt.links.new(n.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return b


def leaf_material(ctx, name, dark, light, translucent=0.3, rough=0.45, top_k=0.06):
    m, nt, out = ctx["new_material"](name)
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    h = nt.nodes.new("ShaderNodeMath")  # a little lighter towards the top of the crown
    h.operation = "SUBTRACT"
    h.inputs[1].default_value = ctx["ground_z"]
    nt.links.new(sep.outputs["Z"], h.inputs[0])
    hk = nt.nodes.new("ShaderNodeMath")
    hk.operation = "MULTIPLY"
    hk.inputs[1].default_value = top_k
    nt.links.new(h.outputs[0], hk.inputs[0])
    r = nt.nodes.new("ShaderNodeMath")
    r.operation = "MULTIPLY_ADD"
    r.use_clamp = True
    r.inputs[1].default_value = 0.8
    nt.links.new(oi.outputs["Random"], r.inputs[0])
    nt.links.new(hk.outputs[0], r.inputs[2])
    col = mix_color(nt, dark, light, r.outputs[0])
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.25
    tl = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(col, tl.inputs["Color"])
    mx = nt.nodes.new("ShaderNodeMixShader")
    mx.inputs[0].default_value = translucent
    nt.links.new(b.outputs[0], mx.inputs[1])
    nt.links.new(tl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def core_material(ctx, name, color):
    m, nt, out = ctx["new_material"](name)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 0.9
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return m


def grass_material(ctx):
    m, nt, out = ctx["new_material"]("grass_blade")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")  # blade height 0..0.2 m -> 0..1
    mr.inputs["From Max"].default_value = 0.2
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    cr = ramp(nt, mr.outputs["Result"], [(0.0, (0.008, 0.035, 0.004, 1)), (0.55, (0.045, 0.17, 0.018, 1)), (1.0, (0.20, 0.38, 0.06, 1))])
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    dry = nt.nodes.new("ShaderNodeMath")
    dry.operation = "GREATER_THAN"  # a few blades are drier, yellower
    dry.inputs[1].default_value = 0.86
    nt.links.new(oi.outputs["Random"], dry.inputs[0])
    dryf = nt.nodes.new("ShaderNodeMath")
    dryf.operation = "MULTIPLY"
    dryf.inputs[1].default_value = 0.55
    nt.links.new(dry.outputs[0], dryf.inputs[0])
    col = mix_color(nt, cr.outputs["Color"], (0.24, 0.26, 0.05), dryf.outputs[0])
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.55
    tl = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(col, tl.inputs["Color"])
    mx = nt.nodes.new("ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.35
    nt.links.new(b.outputs[0], mx.inputs[1])
    nt.links.new(tl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def moss_material(ctx):
    """the stalks: dark at the root, light at the tip, soft light through them (translucent), no shine"""
    m, nt, out = ctx["new_material"]("moss")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")  # stalk height 0..0.04 m -> 0..1
    mr.inputs["From Max"].default_value = 0.04
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    cr = ramp(nt, mr.outputs["Result"], [(0.0, (0.02, 0.075, 0.01, 1)), (1.0, (0.15, 0.31, 0.05, 1))])
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    tint = nt.nodes.new("ShaderNodeMath")  # every tuft a little different: brighter or darker
    tint.operation = "MULTIPLY_ADD"
    tint.inputs[1].default_value, tint.inputs[2].default_value = 0.5, 0.75
    nt.links.new(oi.outputs["Random"], tint.inputs[0])
    vm = nt.nodes.new("ShaderNodeVectorMath")
    vm.operation = "SCALE"
    nt.links.new(cr.outputs["Color"], vm.inputs[0])
    nt.links.new(tint.outputs[0], vm.inputs["Scale"])
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(vm.outputs["Vector"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    b.inputs["Specular IOR Level"].default_value = 0.1
    b.inputs["Sheen Weight"].default_value = 0.8
    b.inputs["Sheen Roughness"].default_value = 0.4
    tl = nt.nodes.new("ShaderNodeBsdfTranslucent")
    nt.links.new(vm.outputs["Vector"], tl.inputs["Color"])
    mx = nt.nodes.new("ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.3
    nt.links.new(b.outputs[0], mx.inputs[1])
    nt.links.new(tl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mossy_ground(ctx):
    """the forest floor of the texture set, with moss growing over it in patches"""
    m, nt, out = ctx["new_material"]("ground")
    b = ctx["pbr_nodes"](nt, "ground_forest", ao=0.5, albedo=(0.11, 0.09, 0.05))
    link = b.inputs["Base Color"].links[0]
    src = link.from_socket
    nt.links.remove(link)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mask = ramp(nt, world_noise(nt, geo, 0.42, 6.0, 0.6), [(0.45, (0, 0, 0, 1)), (0.60, (1, 1, 1, 1))])
    nt.links.new(mix_color(nt, src, (0.028, 0.10, 0.012), mask.outputs["Color"]), b.inputs["Base Color"])
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return m


def mossy_bark(ctx):
    """bark with moss on the lower trunk, up to about 1.8 m, ragged at the top edge"""
    m, nt, out = ctx["new_material"]("bark")
    b = ctx["pbr_nodes"](nt, "bark", scale=(3, 5, 1), ao=0.8, normal=1.0)
    link = b.inputs["Base Color"].links[0]
    src = link.from_socket
    nt.links.remove(link)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    up = nt.nodes.new("ShaderNodeMath")
    up.operation = "SUBTRACT"
    up.inputs[1].default_value = ctx["ground_z"]
    nt.links.new(sep.outputs["Z"], up.inputs[0])
    fall = nt.nodes.new("ShaderNodeMapRange")  # 1 at the ground, 0 at 1.8 m
    fall.inputs["From Min"].default_value, fall.inputs["From Max"].default_value = 0.0, 1.8
    fall.inputs["To Min"].default_value, fall.inputs["To Max"].default_value = 1.0, 0.0
    fall.clamp = True
    nt.links.new(up.outputs[0], fall.inputs["Value"])
    nz = world_noise(nt, geo, 9.0, 6.0, 0.6)
    both = nt.nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY_ADD"  # height falloff times 1.6, plus noise: the upper edge of the moss is ragged
    both.inputs[1].default_value = 1.6
    nt.links.new(fall.outputs["Result"], both.inputs[0])
    nt.links.new(nz, both.inputs[2])
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = 0.85
    nt.links.new(both.outputs[0], sub.inputs[0])
    mask = ramp(nt, sub.outputs[0], [(0.0, (0, 0, 0, 1)), (0.35, (1, 1, 1, 1))])
    nt.links.new(mix_color(nt, src, (0.04, 0.13, 0.014), mask.outputs["Color"]), b.inputs["Base Color"])
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return m


def rock_material(ctx):
    """grey stone, moss on every surface that faces up, ragged at the edge; moss shader (velvet) where the mask is 1"""
    m, nt, out = ctx["new_material"]("rock")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    stone = nt.nodes.new("ShaderNodeBsdfPrincipled")
    n1 = world_noise(nt, geo, 7.0, 6.0, 0.55)
    sc = ramp(nt, n1, [(0.3, (0.07, 0.07, 0.065, 1)), (0.7, (0.2, 0.19, 0.17, 1))])
    nt.links.new(sc.outputs["Color"], stone.inputs["Base Color"])
    stone.inputs["Roughness"].default_value = 0.85
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.7
    bump.inputs["Distance"].default_value = 0.03
    nt.links.new(world_noise(nt, geo, 35.0, 8.0, 0.6), bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], stone.inputs["Normal"])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    ad = nt.nodes.new("ShaderNodeMath")
    ad.operation = "MULTIPLY_ADD"
    ad.inputs[1].default_value = 1.0
    nt.links.new(sep.outputs["Z"], ad.inputs[0])
    nt.links.new(world_noise(nt, geo, 11.0, 5.0, 0.6), ad.inputs[2])
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = 0.75
    nt.links.new(ad.outputs[0], sub.inputs[0])
    mask = ramp(nt, sub.outputs[0], [(0.0, (0, 0, 0, 1)), (0.3, (1, 1, 1, 1))])
    mx = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask.outputs["Color"], mx.inputs[0])
    nt.links.new(stone.outputs[0], mx.inputs[1])
    nt.links.new(moss_bsdf(nt).outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


# ----------------------------------------------------------------------------------------------------------------- source meshes
def source_object(ctx, name, verts, faces, material):
    """the thing that gets scattered. It sits far below the ground, the particles place copies where they are needed"""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = (0, 0, -500)
    ctx["scene"].collection.objects.link(ob)
    return ob


def leaf_mesh():
    v = [(0, 0, 0), (-0.05, 0.07, 0.012), (0.05, 0.07, 0.012), (0, 0.07, -0.008), (0, 0.17, 0.025)]
    return v, [(0, 3, 1), (0, 2, 3), (1, 3, 4), (3, 2, 4)]


def needle_mesh():
    v, f = [], []
    for k in range(9):
        a = k / 9 * math.tau
        r = 0.05 + 0.02 * (k % 2)
        tip = (math.cos(a) * r, 0.17 + 0.05 * ((k * 7) % 3) / 2, math.sin(a) * r * 0.8)
        i = len(v)
        v += [(-0.004, 0, 0), (0.004, 0, 0), tip]
        f.append((i, i + 1, i + 2))
    return v, f


def tuft_mesh():
    v, f = [], []
    for ang, bend, hgt, ox, oy in [(0, 0.05, 0.17, 0.0, 0.0), (90, 0.06, 0.13, 0.02, 0.01), (200, 0.04, 0.20, -0.015, 0.02), (300, 0.07, 0.11, 0.01, -0.02), (140, 0.05, 0.15, -0.02, -0.01)]:
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))

        def rot(x, y, z):
            return (x * c - y * s + ox, x * s + y * c + oy, z)
        i = len(v)
        v += [rot(-0.006, 0, 0), rot(0.006, 0, 0), rot(-0.005, bend * 0.4, hgt * 0.5), rot(0.005, bend * 0.4, hgt * 0.5), rot(0, bend, hgt)]
        f += [(i, i + 1, i + 3), (i, i + 3, i + 2), (i + 2, i + 3, i + 4)]
    return v, f


def moss_mesh():
    """a pom-pom of 26 thin stalks, 1.5 to 4 cm tall, leaning every way: scattered closely they make the fine fur of moss"""
    r = np.random.RandomState(4)
    v, f = [], []
    for _ in range(26):
        a, rad = r.uniform(0, math.tau), 0.03 * math.sqrt(r.uniform())
        ox, oy = math.cos(a) * rad, math.sin(a) * rad
        h = r.uniform(0.015, 0.04)
        lean, la = r.uniform(0.0, 0.7) * h, r.uniform(0, math.tau)
        c, s = math.cos(r.uniform(0, math.pi)), math.sin(r.uniform(0, math.pi))
        i = len(v)
        v += [(ox - c * 0.0022, oy - s * 0.0022, 0), (ox + c * 0.0022, oy + s * 0.0022, 0), (ox + math.cos(la) * lean, oy + math.sin(la) * lean, h)]
        f.append((i, i + 1, i + 2))
    return v, f


# ----------------------------------------------------------------------------------------------------------------- scattering
def scatter(ob, name, source, count, size, size_random, seed, vgroup=None, rot_random=0.0, phase=2.0):
    ps = bpy.data.particles.new(name)
    ps.type = "EMITTER"
    ps.count = max(1, int(count))
    ps.frame_start, ps.frame_end, ps.lifetime = 1, 1, 1000
    ps.emit_from = "FACE"
    ps.use_even_distribution = True
    ps.distribution = "RAND"
    ps.normal_factor = 0.0
    ps.physics_type = "NO"
    ps.render_type = "OBJECT"
    ps.instance_object = source
    ps.particle_size, ps.size_random = size, size_random
    ps.use_rotations = True
    ps.rotation_mode = "NOR"
    ps.rotation_factor_random = rot_random
    ps.phase_factor_random = phase
    ob.show_instancer_for_render = True  # the emitter mesh itself stays in the picture (the crown core, the lawn, the rock)
    mod = ob.modifiers.new(name, "PARTICLE_SYSTEM")
    psys = mod.particle_system
    psys.settings = ps
    psys.seed = int(seed) % 100000
    if vgroup:
        psys.vertex_group_density = vgroup
    return psys


def set_weights(ob, name, w):
    vg = ob.vertex_groups.new(name=name)
    q = np.round(w * 20) / 20
    for lvl in np.unique(q):
        if lvl <= 0.02:
            continue
        vg.add([int(i) for i in np.nonzero(q == lvl)[0]], float(lvl), "REPLACE")


def crown_class(ob, ground_z, bbox):
    me = ob.data
    mean = np.array([0.1, 0.3, 0.05])
    if len(me.color_attributes):
        ca = me.color_attributes.active_color or me.color_attributes[0]
        arr = np.empty(len(ca.data) * 4, dtype=np.float32)
        ca.data.foreach_get("color", arr)
        mean = arr.reshape(-1, 4)[:, :3].mean(axis=0)
    h, s, v = colorsys.rgb_to_hsv(*[float(c) for c in mean])
    lo, hi = bbox([ob])
    if hi.z - ground_z < 1.7 and (hi - lo).length < 2.4:
        return "bush"
    return "spruce" if h > 0.37 else "broad"


def build(ctx):
    scene, by_name, gz, centre, log, bbox = ctx["scene"], ctx["by_name"], ctx["ground_z"], ctx["centre"], ctx["log"], ctx["bbox"]
    H_lo, H_hi = ctx["H_lo"], ctx["H_hi"]
    rng = np.random.RandomState(11)
    noise = Noise(5)

    # the app's own sparse grass goes, the lawn below replaces it; the ground gets moss patches
    for o in by_name.pop("grass", []):
        bpy.data.objects.remove(o, do_unlink=True)
    ctx["MATS"]["ground"] = mossy_ground(ctx)
    for o in by_name.get("ground", []):
        o.data.materials.clear()
        o.data.materials.append(ctx["MATS"]["ground"])

    # --- what gets scattered
    grass_m, moss_m = grass_material(ctx), moss_material(ctx)
    leaf_v, leaf_f = leaf_mesh()
    needle_v, needle_f = needle_mesh()
    src = {
        "broad": [source_object(ctx, f"leaf_{i}", leaf_v, leaf_f, leaf_material(ctx, f"leaf_{i}", d, l)) for i, (d, l) in enumerate(BROAD)],
        "bush": [source_object(ctx, "leaf_bush", leaf_v, leaf_f, leaf_material(ctx, "leaf_bush", *BUSH[0], top_k=0.0))],
        "spruce": [source_object(ctx, f"needles_{i}", needle_v, needle_f, leaf_material(ctx, f"needles_{i}", d, l, translucent=0.15, rough=0.5, top_k=0.02)) for i, (d, l) in enumerate(SPRUCE)],
    }
    tuft = source_object(ctx, "tuft", *tuft_mesh(), grass_m)
    puff = source_object(ctx, "moss", *moss_mesh(), moss_m)
    core = {"broad": core_material(ctx, "core_broad", (0.02, 0.06, 0.012)), "bush": core_material(ctx, "core_bush", (0.02, 0.06, 0.012)), "spruce": core_material(ctx, "core_spruce", (0.010, 0.032, 0.012))}
    params = {"spruce": (170, 1.0, 0.45), "broad": (150, 1.0, 0.5), "bush": (240, 0.7, 0.5)}

    # --- the crowns: world space, then needles and leaves on every one of them
    counts = {"spruce": 0, "broad": 0, "bush": 0}
    leaves_total = 0
    tree_xy = []
    for ob in by_name.get("foliage", []):
        lo, hi = bbox([ob])
        ob["xy"] = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2)
        tree_xy.append(ob["xy"])
        klass = crown_class(ob, gz, bbox)
        me = ob.data.copy()
        me.transform(ob.matrix_world)
        ob.data = me
        ob.parent = None
        ob.matrix_world = Matrix.Identity(4)
        area = sum(p.area for p in me.polygons)
        density, size, size_random = params[klass]
        variant = src[klass][int(rng.randint(len(src[klass])))]
        me.materials.clear()
        me.materials.append(core[klass])
        n = area * density
        scatter(ob, "crown", variant, n, size, size_random, rng.randint(1 << 30), rot_random=0.8)
        counts[klass] += 1
        leaves_total += int(n)
    for ob in by_name.get("bark", []):
        lo, hi = bbox([ob])
        ob["xy"] = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2)
    log(f"crowns: {counts}, {leaves_total:,} leaves and needle tufts")

    # --- lawn and moss: a disc of fine grid just above the ground, vertex weights say where grass and where moss grows
    R, res = 24.0, 160
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=res, y_segments=res, size=R)
    ext = max(max(abs(v.co.x), abs(v.co.y)) for v in bm.verts)
    for v in bm.verts:
        v.co.x, v.co.y = v.co.x * R / ext, v.co.y * R / ext
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x ** 2 + v.co.y ** 2 > R * R], context="VERTS")
    me = bpy.data.meshes.new("lawn")
    bm.to_mesh(me)
    bm.free()
    lawn = bpy.data.objects.new("lawn", me)
    lawn.location = (centre.x, centre.y, gz + 0.02)
    scene.collection.objects.link(lawn)
    me.materials.append(ctx["MATS"]["ground"])
    bpy.context.view_layer.update()  # the object matrix is only valid after this, and the UV projection reads it
    ctx["project_uvs"](lawn, 4.0)
    co = np.array([(v.co.x + centre.x, v.co.y + centre.y) for v in me.vertices])
    dist_house = np.hypot(np.maximum(np.maximum(H_lo.x - co[:, 0], co[:, 0] - H_hi.x), 0), np.maximum(np.maximum(H_lo.y - co[:, 1], co[:, 1] - H_hi.y), 0))
    base_n = noise.fbm(co[:, 0], co[:, 1], 0.21, 5)
    moss_w = smoothstep(0.56, 0.70, base_n)
    for tx, ty in tree_xy:  # moss gathers at the foot of every tree
        moss_w = np.maximum(moss_w, 0.9 * np.exp(-((co[:, 0] - tx) ** 2 + (co[:, 1] - ty) ** 2) / (2 * 1.1 ** 2)))
    grass_n = noise.fbm(co[:, 0] + 100, co[:, 1] - 50, 0.33, 4)
    grass_w = smoothstep(0.22, 0.40, grass_n) * (1 - 0.8 * moss_w) * (1 - smoothstep(14, 24, dist_house) * 0.6)
    keep = smoothstep(0.15, 0.9, dist_house)  # none against the walls
    moss_w, grass_w = moss_w * keep, grass_w * keep
    set_weights(lawn, "moss", moss_w)
    set_weights(lawn, "grass", grass_w)
    area = math.pi * R * R
    scatter(lawn, "grass", tuft, area * 190, 1.25, 0.45, 101, vgroup="grass", rot_random=0.12, phase=2.0)
    scatter(lawn, "moss", puff, area * 320, 1.0, 0.35, 202, vgroup="moss", rot_random=0.0, phase=2.0)
    log(f"lawn: {area:.0f} m2, up to 190 grass tufts and 320 moss tufts per m2 (weighted: grass {grass_w.mean():.2f}, moss {moss_w.mean():.2f} of that)")

    # --- mossy rocks
    rock_m = rock_material(ctx)
    n_rock = 0
    rocks = []
    for k in range(18):
        for _ in range(30):
            a, r = rng.uniform(0, math.tau), rng.uniform(4.5, 17)
            x, y = centre.x + math.cos(a) * r, centre.y + math.sin(a) * r
            if H_lo.x - 2.0 < x < H_hi.x + 2.0 and H_lo.y - 2.0 < y < H_hi.y + 2.0:
                continue
            break
        size = rng.uniform(0.22, 0.75)
        sx, sy, sz = size * rng.uniform(0.9, 1.5), size * rng.uniform(0.9, 1.4), size * rng.uniform(0.55, 0.9)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        bm.normal_update()
        for v in bm.verts:
            nz = noise.value(np.array(v.co.x * 2.4 + v.co.z * 3.1 + k * 9.0), np.array(v.co.y * 2.4 - v.co.z * 2.7)) - 0.5
            v.co += v.normal * (0.55 * float(nz))
        for v in bm.verts:
            v.co.x, v.co.y, v.co.z = v.co.x * sx, v.co.y * sy, v.co.z * sz
        me = bpy.data.meshes.new(f"rock{k}")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(rock_m)
        rock = bpy.data.objects.new(f"rock{k}", me)
        rock.location = (x, y, gz + sz * 0.35)
        rock.rotation_euler = (0, 0, rng.uniform(0, math.tau))
        scene.collection.objects.link(rock)
        for p in me.polygons:
            p.use_smooth = True
        set_weights(rock, "top", np.array([smoothstep(0.35, 0.8, v.normal.z) for v in me.vertices]))
        scatter(rock, "rock moss", puff, sum(p.area for p in me.polygons) * 520, 1.0, 0.35, 300 + k, vgroup="top")
        rocks.append(rock)
        n_rock += 1
    log(f"{n_rock} mossy rocks")

    ctx["MATS"]["bark"] = mossy_bark(ctx)
    for o in by_name.get("bark", []):
        o.data.materials.clear()
        o.data.materials.append(ctx["MATS"]["bark"])
    return {"trees": by_name.get("foliage", []) + by_name.get("bark", []), "rocks": rocks}
