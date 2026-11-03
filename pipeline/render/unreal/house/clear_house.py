"""clear_house.py: keep the jungle round the house but not through it. Headless (-nullrhi), in the ELECTRIC DREAMS project, after add_house.ps1 -Apply.
Finds the level's own actors (trees, ground cover, rocks, vines: the BPP_* prefabs and static meshes) whose box overlaps the house's footprint (plus CLEAR_MARGIN cm) and its height, and
lists them; US_APPLY=1 deletes those and saves the deletions (World Partition keeps every actor in a file of its own, so a deleted actor is a deleted file). Plants the PCG graphs grow at
run time are not actors and are not seen here. US_LIFT_MORE=<cm> also raises the house and our start place by that much (the plinth stays visible instead of buried in ground cover).
Answers go to house\\logs\\clear.log. The files that are deleted are listed there, so the launcher's "verify" can bring them back.
"""
import math
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "clear.log")
LEVEL = os.environ.get("US_LEVEL", "/Game/Levels/ElectricDreams_Env")
APPLY = os.environ.get("US_APPLY") == "1"
MARGIN = float(os.environ.get("CLEAR_MARGIN", "60"))
LIFT_MORE = float(os.environ.get("US_LIFT_MORE", "0"))
HX, HY, HEIGHT = 440.0, 540.0, 900.0          # as in place_house.py
KEEP = ("Landscape", "Light", "Sky", "Fog", "Volume", "Camera", "PlayerStart", "Decal", "Atmosphere", "Cloud", "Audio", "WorldSettings", "Brush", "Info", "PCG", "NavMesh", "Recast", "Manager", "Sound")
os.makedirs(os.path.dirname(LOG), exist_ok=True)
open(LOG, "w").close()


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
say("load_level", LEVEL, les.load_level(LEVEL), "|", "APPLY" if APPLY else "dry run", "| margin", MARGIN, "| lift more", LIFT_MORE)
actors = list(eas.get_all_level_actors())
house = next((a for a in actors if a.get_actor_label() == "UsableSpaceHouse"), None)
start = next((a for a in actors if a.get_actor_label() == "PlayerStart_UsableSpace"), None)
if not house:
    say("no house in the level: run add_house.ps1 -Apply first")
    raise SystemExit
hl, hr = house.get_actor_location(), house.get_actor_rotation()
say("the house:", round(hl.x), round(hl.y), round(hl.z), "yaw", round(hr.yaw))
ca, sa = math.cos(math.radians(-hr.yaw)), math.sin(math.radians(-hr.yaw))


def inside(a):
    """does the box of this actor reach into the house's footprint (turned by its yaw, plus the margin) and height"""
    o, e = a.get_actor_bounds(False)
    dx, dy = o.x - hl.x, o.y - hl.y
    lx, ly = dx * ca - dy * sa, dx * sa + dy * ca               # the actor's centre in the house's own axes
    r = 0.6 * max(e.x, e.y)                                     # a round guess for a tree or a rock: the boxes of turned things are too generous
    near = abs(lx) < HX + MARGIN + r and abs(ly) < HY + MARGIN + r
    tall = o.z + e.z > hl.z - 40 and o.z - e.z < hl.z + HEIGHT
    return near and tall


hits = []
for a in actors:
    if a in (house, start):
        continue
    cn = a.get_class().get_name()
    if cn != "StaticMeshActor" or any(w in cn for w in KEEP) or "Sky" in a.get_actor_label():
        continue                                  # the BPP_* prefab actors have origins and boxes that say nothing about where their plants stand
    if max(a.get_actor_bounds(False)[1].x, a.get_actor_bounds(False)[1].y) > 900:
        continue                                  # a mountain, not a tree or a rock
    if inside(a):
        hits.append(a)
counts = {}
for a in hits:
    counts[a.get_class().get_name()] = counts.get(a.get_class().get_name(), 0) + 1
say("actors overlapping the house:", len(hits))
for cn, n in sorted(counts.items(), key=lambda kv: -kv[1]):
    say("   ", cn, n)
for a in hits[:60]:
    o, e = a.get_actor_bounds(False)
    say("   -", a.get_actor_label(), a.get_class().get_name(), "at", round(o.x), round(o.y), round(o.z), "extent", round(e.x), round(e.y), round(e.z))
if not APPLY:
    say("---- done (dry run: nothing changed)")
    raise SystemExit

files = []
for a in hits:
    pk = a.get_package()
    if pk:
        files.append(pk.get_name())
    eas.destroy_actor(a)
say("destroyed", len(hits), "actors; their files:", len(files))
for f in files:
    say("   deleted", f)
if LIFT_MORE:
    for a in (house, start):
        if a:
            l = a.get_actor_location()
            a.set_actor_location(unreal.Vector(l.x, l.y, l.z + LIFT_MORE), False, True)
    say("raised the house and the start place by", LIFT_MORE, "cm")
    for a in (house, start):
        pk = a.get_package() if a else None
        if pk:
            say("saved", pk.get_name(), unreal.EditorLoadingAndSavingUtils.save_packages([pk], False))
say("saving what is left dirty:", unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, False))
say("---- done")
