"""probe_landscape.py: what the ground round the sample's start place is made of, in the headless editor (no GPU), in the ELECTRIC DREAMS project. Diagnostics for place_house.py.
Answers go to house\\logs\\landscape.log:
  1. the landscape pieces near the start place and the height range each of them says it covers (their bounds come from saved data, not from collision)
  2. a polar map round the start place: the landscape's own first hit, and the highest surface that faces up, for rings of 6 to 42 m in 24 directions
"""
import collections
import math
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "landscape.log")
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
say("---- probe_landscape | load_level:", les.load_level("/Game/Levels/ElectricDreams_Env"))
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
actors = list(eas.get_all_level_actors())
P = [a for a in actors if a.get_class().get_name() == "PlayerStart"][0]
pl = P.get_actor_location()
say("loaded actors:", len(actors), "| start place:", round(pl.x), round(pl.y), round(pl.z))
say("most common classes:", collections.Counter(a.get_class().get_name() for a in actors).most_common(12))

# ---- 1 the landscape pieces
lands = [a for a in actors if "Landscape" in a.get_class().get_name()]
say("landscape actors:", len(lands), dict(collections.Counter(a.get_class().get_name() for a in lands)))
rows = []
for a in lands:
    o, e = a.get_actor_bounds(False)
    dx, dy = max(abs(pl.x - o.x) - e.x, 0.0), max(abs(pl.y - o.y) - e.y, 0.0)
    rows.append((math.hypot(dx, dy), a, o, e))
rows.sort(key=lambda r: r[0])
for d, a, o, e in rows[:10]:
    loc, sc = a.get_actor_location(), a.get_actor_scale3d()
    say("   %-30s %5.0f cm away | at %.0f %.0f %.0f | scale %.2f %.2f %.2f | x %.0f..%.0f  y %.0f..%.0f  z %.0f..%.0f" % (
        a.get_actor_label()[:30], d, loc.x, loc.y, loc.z, sc.x, sc.y, sc.z, o.x - e.x, o.x + e.x, o.y - e.y, o.y + e.y, o.z - e.z, o.z + e.z))
seen_classes = set()
for d, a, o, e in rows[:4]:
    for cls in (unreal.LandscapeComponent, unreal.LandscapeHeightfieldCollisionComponent):
        comps = attempt("components " + cls.__name__, lambda a=a, cls=cls: a.get_components_by_class(cls), []) or []
        near = []
        for c in comps:
            co, ce, _ = unreal.SystemLibrary.get_component_bounds(c)
            dx, dy = max(abs(pl.x - co.x) - ce.x, 0.0), max(abs(pl.y - co.y) - ce.y, 0.0)
            if math.hypot(dx, dy) < 4000:
                near.append((math.hypot(dx, dy), co, ce))
        near.sort(key=lambda r: r[0])
        say("   %s: %d of %s, %d within 40 m" % (cls.__name__, len(comps), a.get_actor_label()[:24], len(near)))
        for dd, co, ce in near[:6]:
            say("       %5.0f cm away | centre %.0f %.0f | size %.0f x %.0f | z %.0f..%.0f" % (dd, co.x, co.y, 2 * ce.x, 2 * ce.y, co.z - ce.z, co.z + ce.z))

# ---- 2 the polar map
TRACE = unreal.TraceTypeQuery.TRACE_TYPE_QUERY1


def hits(x, y):
    r = unreal.SystemLibrary.line_trace_multi(world, unreal.Vector(x, y, pl.z + 6000), unreal.Vector(x, y, pl.z - 6000), TRACE, False, [], unreal.DrawDebugTrace.NONE, True)
    out = []
    for h in (r[1] if isinstance(r, tuple) else r) or []:
        t = h.to_tuple()
        a = t[9]
        cls = a.get_class().get_name() if a else ""
        out.append((t[5].z, t[7].z, "L" if "Landscape" in cls else ("M" if cls == "StaticMeshActor" else "o"), a.get_actor_label()[:18] if a else ""))
    return sorted(out, reverse=True)


say("polar map round the start place (z of the landscape's first hit | highest up-facing surface with its kind: L landscape, M static mesh, o other)")
say("  yaw of the start place:", round(P.get_actor_rotation().yaw), "| directions go counter-clockwise from +X in steps of 15 deg")
others = collections.Counter()
for ring in (600, 1200, 1800, 2400, 3000, 3600, 4200):
    lrow, trow = [], []
    for k in range(24):
        ang = math.radians(k * 15)
        hs = hits(pl.x + ring * math.cos(ang), pl.y + ring * math.sin(ang))
        land = next((h for h in hs if h[2] == "L"), None)
        up = next((h for h in hs if h[1] > 0.5), None)
        lrow.append("%5.0f" % land[0] if land else "    -")
        trow.append(("%5.0f%s" % (up[0], up[2])) if up else "    -")
        for h in hs:
            if h[2] == "o":
                others[h[3]] += 1
    say("  %4d cm  landscape:" % ring, " ".join(lrow))
    say("  %4d cm  surface:  " % ring, " ".join(trow))
say("other actors hit by the traces:", others.most_common(10))
say("---- done")
