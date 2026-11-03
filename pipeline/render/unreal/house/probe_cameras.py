"""probe_cameras.py: the beauty-shot cameras of the sample (87 CineCameraActors) as seeds for a nice place: where each stands, how high above the landscape, how much moss is round it, how many big
meshes (cliffs, trees) stand within 40 m, and what the landscape does 22 m in front of it. Headless, in the ELECTRIC DREAMS project. Answers: house\\logs\\cameras.log"""
import math
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "cameras.log")
os.makedirs(os.path.dirname(LOG), exist_ok=True)


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
say("---- probe_cameras | load_level:", les.load_level("/Game/Levels/ElectricDreams_Env"))
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
actors = list(eas.get_all_level_actors())
TRACE = unreal.TraceTypeQuery.TRACE_TYPE_QUERY1
V3 = unreal.Vector


def land_z(x, y):
    r = unreal.SystemLibrary.line_trace_multi(world, V3(x, y, 26000), V3(x, y, -2000), TRACE, False, [], unreal.DrawDebugTrace.NONE, True)
    for h in (r[1] if isinstance(r, tuple) else r) or []:
        t = h.to_tuple()
        if t[0]:
            a = t[9]
            return t[5].z, ("Landscape" in (a.get_class().get_name() if a else ""))
    return None, False


moss, big = [], []
for a in actors:
    cn = a.get_class().get_name()
    nm = a.get_actor_label().lower()
    if cn == "StaticMeshActor":
        sm = a.static_mesh_component.static_mesh
        nm += " " + (sm.get_name().lower() if sm else "")
        o, e = a.get_actor_bounds(False)
        if max(e.x, e.y) > 1000 or e.z > 1200:
            big.append((o.x, o.y))
    elif cn == "DecalActor":
        try:
            nm += " " + a.get_decal_material().get_name().lower()
        except Exception:
            pass
    if "moss" in nm:
        l = a.get_actor_location()
        moss.append((l.x, l.y))
say("moss things:", len(moss), "| big meshes (over 20 m wide or 24 m high):", len(big))


def near(pts, x, y, r):
    return sum(1 for px, py in pts if (px - x) ** 2 + (py - y) ** 2 < r * r)


rows = []
for a in actors:
    if a.get_class().get_name() != "CineCameraActor":
        continue
    l, r = a.get_actor_location(), a.get_actor_rotation()
    gz, land = land_z(l.x, l.y)
    ax, ay = l.x + 2200 * math.cos(math.radians(r.yaw)), l.y + 2200 * math.sin(math.radians(r.yaw))
    az_, aland = land_z(ax, ay)
    rows.append((near(moss, l.x, l.y, 2500), near(big, l.x, l.y, 4000), a.get_actor_label(), l.x, l.y, l.z, r.yaw, r.pitch, gz, land, az_, aland))
say("cameras:", len(rows))
say("moss | big meshes within 40 m | label | x y z | yaw pitch | landscape under the camera (z, is landscape) | landscape 22 m ahead")
for row in sorted(rows, key=lambda q: (q[1], -q[0]))[:40]:
    say("  %4d | %3d | %-28s | %.0f %.0f %.0f | yaw %.0f pitch %.0f | %s %s | %s %s" % (
        row[0], row[1], row[2][:28], row[3], row[4], row[5], row[6], row[7],
        "-" if row[8] is None else round(row[8]), row[9], "-" if row[10] is None else round(row[10]), row[11]))
say("---- done")
