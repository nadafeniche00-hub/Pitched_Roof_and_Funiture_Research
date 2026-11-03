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


def column(x, y, z_ref):
    """every blocking hit on the vertical line through (x, y): (z, is landscape), top to bottom"""
    r = unreal.SystemLibrary.line_trace_multi(world, unreal.Vector(x, y, z_ref + 6000), unreal.Vector(x, y, z_ref - 6000), TRACE, False, [], unreal.DrawDebugTrace.NONE, True)
    out = []
    for h in (r[1] if isinstance(r, tuple) else r) or []:
        t = h.to_tuple()          # (blocking, initial overlap, time, distance, location, impact point, normal, impact normal, phys mat, actor, ...)
        a = t[9]
        cls = a.get_class().get_name() if a else ""
        out.append((t[5].z, "Landscape" in cls))
    return sorted(out, reverse=True)


# ---- where: a flat, empty piece of ground near the sample's start place. What the probes (probe_landscape.py) found: under the start place itself a rock mesh stops every trace, so its ground cannot be
# read; east, north and south of it the landscape is one wide flat floor at 11 m (z 1100, the dry river bed of the sample), with no solid mesh above it; west the terrain climbs to 27 to 37 m.
# The house goes on that floor, and the viewer starts on the same floor. A landscape hit is the ground; any other blocking hit within the height of the house above it is in the way.
def ground_of(col):
    return next((z for z, land in col if land), None)


def free_flat(cx, cy, hx, hy, yaw_deg, z_ref, nx=5, ny=5):
    """(heights, share of blocked columns) on a grid over a rectangle, or None where there is no ground"""
    c, s = math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg))
    zs, blocked = [], 0
    for i in range(nx):
        for j in range(ny):
            lx = ((i / (nx - 1)) - 0.5) * 2 * hx if nx > 1 else 0
            ly = ((j / (ny - 1)) - 0.5) * 2 * hy if ny > 1 else 0
            col = column(cx + lx * c - ly * s, cy + lx * s + ly * c, z_ref)
            g = ground_of(col)
            if g is None:
                return None
            zs.append(g)
            if any((not land) and g + 30 < z < g + HEIGHT for z, land in col):
                blocked += 1
    return zs, blocked / (nx * ny)


def seen(px, py, pz, cx, cy, cz):
    r = unreal.SystemLibrary.line_trace_single(world, unreal.Vector(px, py, pz + 120), unreal.Vector(cx, cy, cz + 300), TRACE, False, [], unreal.DrawDebugTrace.NONE, True)
    return (not r[0]) if isinstance(r, tuple) else not (r and r.to_tuple()[0])


Z0 = 1100.0
cands = []
for dist in (1600, 2000, 2600, 3200, 4000):
    for k in range(24):
        ang = k * 15.0
        cx, cy = pl.x + dist * math.cos(math.radians(ang)), pl.y + dist * math.sin(math.radians(ang))
        res = free_flat(cx, cy, HX + MARGIN, HY + MARGIN, 0, Z0 + 200)
        if res is None:
            continue
        zs, blocked = res
        slope = max(zs) - min(zs)
        if blocked > 0.1 or slope > 40 or abs(zs[12] - Z0) > 60:
            continue
        cands.append((blocked * 1000 + slope + 0.02 * dist, dist, ang, cx, cy, zs[12], slope, blocked))
cands.sort()
say("flat and free spots for the house:", len(cands), "of 120")
for c in cands[:8]:
    say("   %4d cm at %3d deg | ground z %5.0f | slope %3.0f cm | blocked %.0f %%" % (c[1], c[2], c[5], c[6], 100 * c[7]))
if not cands:
    say("no spot found")
    raise SystemExit
_, dist, ang, cx, cy, zc, slope, blocked = cands[0]

# ---- where the viewer stands: on the same floor, about 20 m from the house, with a free column of ground under it and a clear line to the house
views = []
for r in (1800, 2000, 2300):
    for k in range(24):
        vang = k * 15.0
        vx, vy = cx + r * math.cos(math.radians(vang)), cy + r * math.sin(math.radians(vang))
        res = free_flat(vx, vy, 150, 150, 0, Z0 + 200, 3, 3)
        if res is None:
            continue
        zs, vblocked = res
        vslope = max(zs) - min(zs)
        if vblocked > 0 or vslope > 30 or abs(zs[4] - Z0) > 60:
            continue
        if not seen(vx, vy, zs[4], cx, cy, zc):
            continue
        views.append((vslope + 0.01 * abs(r - 2000), r, vang, vx, vy, zs[4]))
views.sort()
say("places for the viewer on the same floor:", len(views))
for v in views[:5]:
    say("   %4d cm from the house at %3d deg | ground z %5.0f" % (v[1], v[2], v[5]))
if not views:
    say("no place for the viewer")
    raise SystemExit
_, r, vang, vx, vy, vz = views[0]
face = math.degrees(math.atan2(cy - vy, cx - vx))          # the viewer looks at the house
yaw = vang + 121                                           # the house turned so that the viewer sees a gable and a long side, from the south-west as in the pictures of the app
say("house centre", round(cx), round(cy), round(zc), "| house yaw", round(yaw), "| viewer at", round(vx), round(vy), round(vz), "looking along yaw", round(face), "| the sample's start place is", round(dist), "cm from the house")
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
ps = put("PlayerStart_UsableSpace", lambda l, r: eas.spawn_actor_from_class(unreal.PlayerStart, l, r), unreal.Vector(vx, vy, vz + 110), unreal.Rotator(0, 0, face))
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
