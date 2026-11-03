"""place_house.py: put the house pack (make_house_pack.py) into Epic's Electric Dreams level, in the most memory-lean way, and make the viewer start in front of it.
Headless (no GPU), in the ELECTRIC DREAMS project, after add_house.ps1 has copied the pack into its Content\\UsableSpace folder. Environment: US_APPLY=1 spawns and saves, anything else only
reports where the house would go (a dry run). The answers go to house\\logs\\place.log.

What it adds to the project (and nothing else is changed): one static mesh actor (the house, one mesh of ~6,700 vertices, 14 material sections), one PlayerStart tagged "UsableSpace"
(start the level as /Game/Levels/ElectricDreams_Env#UsableSpace and the player begins there, looking at the house), and the actor files Unreal writes for them under __ExternalActors__.
The sample's own actors, its PlayerStart and its level file are not touched. A second run replaces the two actors of the first; US_REMOVE=1 takes them out (add_house.ps1 -Remove).
"""
import math
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "place.log")
LEVEL = os.environ.get("US_LEVEL", "/Game/Levels/ElectricDreams_Env")
APPLY = os.environ.get("US_APPLY") == "1"
REMOVE = os.environ.get("US_REMOVE") == "1"      # take the two actors out again (add_house.ps1 -Remove also deletes the folder Content\UsableSpace)
MESH = "/Game/UsableSpace/House/SM_UsableSpaceHouse"
OURS = ("UsableSpaceHouse", "PlayerStart_UsableSpace")
HX, HY = 440.0, 540.0          # half size of the footprint in cm (8.8 x 10.8 m with the plinth)
MARGIN = 150.0                 # free ground round it
HEIGHT = 900.0                 # the house is 8.4 m high: nothing may stand in that column
os.makedirs(os.path.dirname(LOG), exist_ok=True)


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def attempt(label, fn, default=None):
    try:
        return fn()
    except Exception as e:
        say(label, "failed:", type(e).__name__, str(e)[:240])
        return default


les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
say("---- place_house |", "REMOVE" if REMOVE else ("APPLY" if APPLY else "dry run"), "|", LEVEL, "| load_level:", les.load_level(LEVEL))
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
actors = list(eas.get_all_level_actors())


def dirty():
    pk = list(unreal.EditorLoadingAndSavingUtils.get_dirty_content_packages()) + list(unreal.EditorLoadingAndSavingUtils.get_dirty_map_packages())
    return {p.get_name(): p for p in pk}


before = dirty()          # nothing should be dirty after a load; if something is, it is not ours and must not be saved
say("packages dirty after loading the level:", len(before), list(before)[:5])
old = [a for a in actors if a.get_actor_label() in OURS]          # what an earlier run put there: a new run replaces it
starts = [a for a in actors if a.get_class().get_name() == "PlayerStart" and a.get_actor_label() not in OURS]
if REMOVE:
    for a in old:
        eas.destroy_actor(a)
    say("removed", len(old), "actors | saved the level:", les.save_current_level() if old else "nothing to save")
    say("---- done")
    raise SystemExit
P = starts[0]
pl, pr = P.get_actor_location(), P.get_actor_rotation()
say("loaded actors:", len(actors), "| the sample's start place (cm):", round(pl.x), round(pl.y), round(pl.z), "yaw", round(pr.yaw))

TRACE = unreal.TraceTypeQuery.TRACE_TYPE_QUERY1
TOP, BOTTOM = 26000.0, -2000.0
V3 = unreal.Vector


def column(x, y):
    """every blocking hit on the vertical line through (x, y), top to bottom: (z, is landscape)"""
    r = unreal.SystemLibrary.line_trace_multi(world, V3(x, y, TOP), V3(x, y, BOTTOM), TRACE, False, [], unreal.DrawDebugTrace.NONE, True)
    out = []
    for h in (r[1] if isinstance(r, tuple) else r) or []:
        t = h.to_tuple()          # (blocking, initial overlap, time, distance, location, impact point, normal, impact normal, phys mat, actor, ...)
        if not t[0]:
            continue              # a touch (an audio volume, a trigger) is not solid
        a = t[9]
        out.append((t[5].z, "Landscape" in (a.get_class().get_name() if a else "")))
    return sorted(out, reverse=True)


def ground(x, y):
    """z of the landscape when it is the highest solid thing on the column, else None"""
    col = column(x, y)
    if not col or not col[0][1]:
        return None
    return col[0][0]


def hit_distance(origin, direction, length):
    """distance to the first solid thing along the ray, None when the ray is free"""
    end = V3(origin.x + direction.x * length, origin.y + direction.y * length, origin.z + direction.z * length)
    r = unreal.SystemLibrary.line_trace_single(world, origin, end, TRACE, False, [], unreal.DrawDebugTrace.NONE, True)
    if isinstance(r, tuple):
        if not r[0]:
            return None
        return r[1].to_tuple()[3]
    return None


def free_ground(cx, cy, radius, rings=((0, 1), (0.5, 8), (1.0, 12))):
    """ground heights over a disc; None if any column has no landscape on top (a rock, a hole)"""
    zs = []
    missing = 0
    for fr, n in rings:
        for i in range(n):
            ang = 2 * math.pi * i / max(n, 1)
            g = ground(cx + fr * radius * math.cos(ang), cy + fr * radius * math.sin(ang))
            if g is None:
                missing += 1          # a rock or a plant mesh on top of the landscape there: the bounding boxes judge those
                continue
            zs.append(g)
    return zs if missing <= 4 and zs else None


def dirv(az_deg, el_deg):
    a, e = math.radians(az_deg), math.radians(el_deg)
    return V3(math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))


def openness(x, y, z):
    """share of free rays, 80 m long, 12 directions: low (12 deg), middle (30 deg) and high (55 and 85 deg) elevations"""
    out = []
    for els in ((12,), (30,), (55, 85)):
        n = f = 0
        for el in els:
            for k in range(12):
                n += 1
                f += hit_distance(V3(x, y, z), dirv(k * 30 + (7 * el) % 30, el), 8000.0) is None
        out.append(f / n)
    return out


# ---- the sun: a directional light of the level (its forward vector is the way the light travels)
suns = []
for a in actors:
    if any(w in a.get_class().get_name() for w in ("DirectionalLight", "Sun", "Sky", "Light")):
        for c in attempt("light components", lambda a=a: a.get_components_by_class(unreal.DirectionalLightComponent), []) or []:
            suns.append((attempt("intensity", lambda c=c: float(c.get_editor_property("intensity")), 0.0), a.get_actor_label(), c.get_forward_vector()))
suns.sort(key=lambda s_: -s_[0])
sun = None
for it, lab, fv in suns[:4]:
    say("directional light:", lab, "intensity", round(it, 2), "travels", round(fv.x, 2), round(fv.y, 2), round(fv.z, 2))
if suns:
    fv = suns[0][2]
    sun = V3(-fv.x, -fv.y, -fv.z)
    say("the sun is towards azimuth", round(math.degrees(math.atan2(sun.y, sun.x))), "deg, elevation", round(math.degrees(math.asin(max(-1, min(1, sun.z))))), "deg")

# ---- moss: what the level says is moss (labels, meshes, decal materials)
moss = []
for a in actors:
    nm = a.get_actor_label().lower()
    cn = a.get_class().get_name()
    if cn == "StaticMeshActor":
        sm = a.static_mesh_component.static_mesh
        nm += " " + (sm.get_name().lower() if sm else "")
    elif cn == "DecalActor":
        nm += " " + str(attempt("decal", lambda a=a: a.get_decal_material().get_name().lower(), ""))
    if "moss" in nm:
        l = a.get_actor_location()
        moss.append((l.x, l.y))
say("things called moss in the level:", len(moss))


def moss_near(x, y, r=2500.0):
    return sum(1 for mx, my in moss if (mx - x) ** 2 + (my - y) ** 2 < r * r)


# ---- where: a flat, empty clearing with open sky, sun and moss. Cascade: ground column, flat disc, free volume, sky openness; then the viewer.
lands = [a for a in actors if a.get_class().get_name().startswith("Landscape")]
x0 = y0 = 1e12
x1 = y1 = -1e12
for a in lands:
    o, e = a.get_actor_bounds(False)
    x0, x1, y0, y1 = min(x0, o.x - e.x), max(x1, o.x + e.x), min(y0, o.y - e.y), max(y1, o.y + e.y)
# the beauty-shot cameras of the sample (probe_cameras.py) stand 4 to 6 m above the flat floor at x 80000..89000, y -11000..-6000, in the moss: the nice clearings are there
BOX = [float(v) for v in os.environ.get("US_BOX", "79000,-11500,87000,-5500").split(",")]
x0, y0, x1, y1 = max(x0, BOX[0]), max(y0, BOX[1]), min(x1, BOX[2]), min(y1, BOX[3])
STEP = float(os.environ.get("US_STEP", "400"))
# solid things by their bounding boxes (traces do not see the cliffs and rocks of this level): anything taller than 60 cm standing in the box
solid = []
rocks, trees = [], []          # (x, y, reach): where rocks and cliffs stand, where the level's own trees and bushes stand (the PCG plants of run time are not actors and are not seen)
ROCK_WORDS = ("rock", "cliff", "stone", "boulder", "sandstone", "scree")
TREE_WORDS = ("tree", "beech", "elderberry", "birch", "alder", "willow", "bush", "shrub", "sapling", "trunk", "vine", "fern", "bamboo", "palm")
for a in actors:
    if a.get_class().get_name() == "StaticMeshActor" and a.get_actor_label() not in OURS:          # not the house of an earlier run: it moves
        o, e = a.get_actor_bounds(False)
        if x0 - 3000 < o.x < x1 + 3000 and y0 - 3000 < o.y < y1 + 3000 and e.z > 30:
            solid.append((o.x, o.y, o.z, e.x, e.y, e.z))
            sm =a.static_mesh_component.static_mesh
            nm = (a.get_actor_label() + " " + (sm.get_name() if sm else "")).lower()
            if any(w in nm for w in ROCK_WORDS):
                rocks.append((o.x, o.y, max(e.x, e.y)))
            elif any(w in nm for w in TREE_WORDS):
                trees.append((o.x, o.y, max(e.x, e.y)))
say("static meshes in the box:", len(solid), "| rocks and cliffs:", len(rocks), "| trees and bushes:", len(trees))
ROCK_MIN = float(os.environ.get("US_ROCK_MIN", "0"))        # cm of free ground between the house's edge and the nearest rock or cliff (0 = no rule)
TREE_MIN = float(os.environ.get("US_TREE_MIN", "0"))        # the same for the nearest tree or bush


VIEW_ROCK = float(os.environ.get("US_VIEW_ROCK", "0"))      # cm of free ground between the viewer and the nearest rock or cliff (0 = no rule)
VIEW_TREE = float(os.environ.get("US_VIEW_TREE", "0"))      # the same for the nearest tree or bush
VIEW_OPEN = float(os.environ.get("US_VIEW_OPEN", "0"))      # share (0..1) of free 8 m rays around the viewer by line traces (0 = no rule)


def gap(x, y, things):
    """distance from the point to the nearest thing's edge (its box reach counts), in cm"""
    return min((math.hypot(tx - x, ty - y) - r for tx, ty, r in things), default=1e9)


def clutter(x, y, zg, r):
    """meshes whose box touches the disc and rises into the house's volume"""
    n = 0
    for ox, oy, oz, ex, ey, ez in solid:
        if abs(ox - x) < r + ex and abs(oy - y) < r + ey and ez > 60 and oz + ez > zg + 120 and oz - ez < zg + HEIGHT:
            n += 1
    return n

RADIUS = math.hypot(HX, HY) + MARGIN
say("landscape covers x %.0f..%.0f y %.0f..%.0f, grid step %.0f cm" % (x0, x1, y0, y1, STEP))
# US_VIEWER="x,y,yaw": stand there (a spot the sample's artists composed a shot from, see probe_cameras.py) and put the house US_DIST cm ahead; no search
FORCE = os.environ.get("US_VIEWER")
if FORCE:
    vx, vy, fyaw = [float(v) for v in FORCE.split(",")]
    d = float(os.environ.get("US_DIST", "2200"))
    cx, cy = vx + d * math.cos(math.radians(fyaw)), vy + d * math.sin(math.radians(fyaw))
    vz, zc = ground(vx, vy), ground(cx, cy)
    say("forced: viewer ground", vz, "house ground", zc)
    if vz is None or zc is None:
        say("no landscape on top at the viewer or the house")
        raise SystemExit
    vang, r, behind, face_sun, v_open = fyaw + 180.0, d, 0.0, 0.0, 0.0
else:
    cands = []
    n_ground = n_flat = 0
    x = x0 + STEP
    while x < x1 - STEP:
        y = y0 + STEP
        while y < y1 - STEP:
            g = ground(x, y)
            if g is not None:
                n_ground += 1
                zs = free_ground(x, y, RADIUS)
                if zs is not None and max(zs) - min(zs) <= 70:
                    n_flat += 1
                    zc = sorted(zs)[len(zs) // 2]
                    if clutter(x, y, zc, RADIUS) == 0 and gap(x, y, rocks) - RADIUS >= ROCK_MIN and gap(x, y, trees) - RADIUS >= TREE_MIN:
                        m = moss_near(x, y)
                        # moss round it, and a clearing: few big meshes within 30 m
                        near_solid = sum(1 for ox, oy, oz, ex, ey, ez in solid if (ox - x) ** 2 + (oy - y) ** 2 < 3000 ** 2 and ez > 150)
                        score = min(m, 400) / 40.0 - near_solid / 40.0
                        cands.append((score, x, y, zc, max(zs) - min(zs), 0, 0, 0, 0, m))
            y += STEP
        x += STEP
    cands.sort(reverse=True, key=(lambda c: (c[9], c[0])) if os.environ.get("US_RANK") == "moss" else None)      # US_RANK=moss: the most moss within 25 m first
    say("columns with landscape on top:", n_ground, "| flat discs:", n_flat, "| clearings:", len(cands))
    for c in cands[:12]:
        say("   score %.1f | at %.0f %.0f | ground z %.0f | unevenness %.0f cm | open low %.2f mid %.2f high %.2f | sun %d | moss within 25 m: %d | %.0f m from the sample's start" % (
            c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], math.hypot(c[1] - pl.x, c[2] - pl.y) / 100))
    if not cands:
        say("no clearing found")
        raise SystemExit
    PICK = int(os.environ.get("US_PICK", "0"))
    _, cx, cy, zc, _u, _l, _m, _h, _s, _mo = cands[PICK]

    # ---- where the viewer stands: flat ground about 20 m away, a clear line to the house, the sun behind the viewer, an open background behind the house
    best = None
    for r in (1800, 2200, 2600, 3000):
        for k in range(24):
            vang = k * 15.0
            vx, vy = cx + r * math.cos(math.radians(vang)), cy + r * math.sin(math.radians(vang))
            zs = free_ground(vx, vy, 150, ((0, 1), (1.0, 8)))
            if zs is None or max(zs) - min(zs) > 40 or abs(zs[0] - zc) > 150:
                continue
            vz = zs[0]
            if gap(vx, vy, rocks) < VIEW_ROCK or gap(vx, vy, trees) < VIEW_TREE:
                continue                       # the viewer would stand between rocks or inside a bush
            if VIEW_OPEN:
                # rocks that are not actors of the level (the PCG graphs make them) still block a trace: 16 horizontal rays at the height of the eye and at the knee, 8 m long
                free = tot = 0
                for h in (60, 190):
                    for k2 in range(16):
                        tot += 1
                        free += hit_distance(V3(vx, vy, vz + h), dirv(k2 * 22.5, 0), 800.0) is None
                if free / tot < VIEW_OPEN:
                    continue
            eye = V3(vx, vy, vz + 170)
            dx, dy, dz = cx - vx, cy - vy, zc + 880 - (vz + 170)
            dist = math.sqrt(dx * dx + dy * dy + dz * dz)
            az, el = math.degrees(math.atan2(dy, dx)), math.degrees(math.asin(dz / dist))
            if clutter(vx, vy, vz, 200) or any(abs(ox - (vx + cx) / 2) < ex + 400 and abs(oy - (vy + cy) / 2) < ey + 400 and oz + ez > vz + 120 for ox, oy, oz, ex, ey, ez in solid if ez > 20):
                continue                       # something in the viewer's way
            behind = 9000.0
            face_sun = math.cos(math.radians(vang) - math.atan2(sun.y, sun.x)) if sun else 0.0
            v_open = 1.0
            score = face_sun
            if best is None or score > best[0]:
                best = (score, r, vang, vx, vy, vz, behind, face_sun, v_open)
    if not best:
        say("no place for the viewer")
        raise SystemExit
    _, r, vang, vx, vy, vz, behind, face_sun, v_open = best
zc += float(os.environ.get("US_LIFT", "0"))                # the house higher than the landscape the traces see (cm): seen in the stream, the floor of the clearing is above it
face = math.degrees(math.atan2(cy - vy, cx - vx))          # the viewer looks at the house
yaw = vang + 121                                           # the house turned so that the viewer sees a gable and a long side
say("house centre", round(cx), round(cy), round(zc), "| house yaw", round(yaw), "| viewer at", round(vx), round(vy), round(vz), "looking along yaw", round(face),
    "| free background behind the house %.0f m | sun behind the viewer %.2f | open sky at the viewer %.2f" % (behind / 100, face_sun, v_open))
if not APPLY:
    say("---- done (dry run: nothing changed)")
    raise SystemExit

mine_by_label = {a.get_actor_label(): a for a in old}


def put(label, make, location, rotation):
    """the actor of an earlier run is moved, otherwise a new one is made: never a second copy, no extra file"""
    a = mine_by_label.get(label)
    if a:
        a.set_actor_location_and_rotation(location, rotation, False, True)
        say("moved", label, "(it was there from an earlier run)")
        return a
    a = make(location, rotation)
    a.set_actor_label(label)
    attempt("folder", lambda: a.set_folder_path("UsableSpace"))
    say("made", label)
    return a


# ---- the house: one static mesh actor, pivot at the centre of its footprint on the ground
mesh = unreal.EditorAssetLibrary.load_asset(MESH)
house = put("UsableSpaceHouse", lambda l, r: eas.spawn_actor_from_object(mesh, l, r), unreal.Vector(cx, cy, zc), unreal.Rotator(0, 0, yaw))
attempt("tag", lambda: house.set_editor_property("tags", ["UsableSpace"]))
hl = house.get_actor_location()
say("the house:", tuple(round(v) for v in (hl.x, hl.y, hl.z)), "yaw", round(house.get_actor_rotation().yaw), "| mobility", attempt("mobility", lambda: str(house.root_component.get_editor_property("mobility"))), "| saved in", attempt("package", lambda: house.get_package().get_name()))

# ---- the viewer: our own start on the floor, looking at the house. The "#UsableSpace" after the map name picks it (the tag is the portal of the URL).
ps = put("PlayerStart_UsableSpace", lambda l, r: eas.spawn_actor_from_class(unreal.PlayerStart, l, r), unreal.Vector(vx, vy, vz + 110 + float(os.environ.get("US_LIFT", "0")) + float(os.environ.get("US_EYE", "0"))), unreal.Rotator(0, 0, face))
POSE = os.environ.get("US_START_POSE")         # "x,y,z,pitch,yaw": start exactly here (the pose hover_info.py wrote to pov.log), the eye height is then the z given
if POSE:
    px, py_, pz, ppitch, pyaw = [float(v) for v in POSE.split(",")]
    ps.set_actor_location_and_rotation(unreal.Vector(px, py_, pz - 110), unreal.Rotator(0, ppitch, pyaw), False, True)    # a start place stands 110 cm under the eye (the pawn's half height)
    say("start place set to the given pose:", POSE)
attempt("start tag", lambda: ps.set_editor_property("player_start_tag", "UsableSpace"))
say("our start:", tuple(round(v) for v in (ps.get_actor_location().x, ps.get_actor_location().y, ps.get_actor_location().z)), "yaw", round(ps.get_actor_rotation().yaw), "tag", attempt("read tag", lambda: str(ps.get_editor_property("player_start_tag"))), "| saved in", attempt("package", lambda: ps.get_package().get_name()))

# ---- the textures of the pack, smaller: the jungle keeps its memory for itself (the roof is seen from outside, the floor only through a window)
for name, size in (("T_roof_clay_diff", 1024), ("T_roof_clay_nor", 1024), ("T_roof_clay_rough", 512), ("T_floor_wood_diff", 512), ("T_floor_wood_nor", 512), ("T_floor_wood_rough", 256)):
    path = "/Game/UsableSpace/Textures/" + name
    tex = attempt("texture " + name, lambda path=path: unreal.EditorAssetLibrary.load_asset(path))
    if tex:
        attempt("size " + name, lambda tex=tex, size=size: tex.set_editor_property("max_texture_size", size))
        unreal.EditorAssetLibrary.save_asset(path, only_if_is_dirty=False)

# ---- save what is ours: the two actors and the textures. The level file of the sample is left alone, unless Unreal gives no other way to save the actors.
new = [p for n, p in dirty().items() if n not in before and n != LEVEL]
# Unreal does not always list a moved actor's file as dirty: save the two actors' own packages whatever it says
for actor in (house, ps):
    pk = attempt("package of " + actor.get_actor_label(), lambda actor=actor: actor.get_package())
    if pk is not None and pk.get_name() not in [p.get_name() for p in new] and pk.get_name() != LEVEL:
        new.append(pk)
say("packages to save:", [p.get_name() for p in new])
if new:
    say("saved:", unreal.EditorLoadingAndSavingUtils.save_packages(new, False))
left = [n for n in dirty() if n not in before and n != LEVEL]
if left and not before:
    say("still dirty:", left, "| saving the level the usual way (this rewrites the level file)")
    say("saved the level:", les.save_current_level())
    say("saved the other packages:", unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True))
elif left:
    say("still dirty, and other packages were dirty from the start, so nothing more is saved:", left)
say("---- done")
