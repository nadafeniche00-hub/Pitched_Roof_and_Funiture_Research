"""probe_level.py: what is in a level, headless (no rendering, no GPU): the game mode and pawn it starts with, its player starts, what kinds of actors are loaded, the size of the world.
Used to decide where a viewer should start in a project that is not ours (Epic's Electric Dreams sample). Environment: US_LEVEL=/Game/Levels/ElectricDreams_Env

    "C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" <project>.uproject -ExecutePythonScript=probe_level.py -unattended -nopause -nosplash -nullrhi -stdout

The answers go to logs\\probe.log next to this file (the editor's own log does not carry what a script prints in this mode).
"""
import collections
import os
import traceback

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "logs", "probe.log")
LEVEL = os.environ.get("US_LEVEL", "")
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def attempt(label, fn):
    try:
        return fn()
    except Exception as e:  # a probe: report what is not there and go on
        say(label, "failed:", type(e).__name__, str(e)[:200])
        return None


say("---- probe of", LEVEL or "(the start level)", "in", unreal.SystemLibrary.get_project_directory())
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
if LEVEL:
    say("load_level:", attempt("load_level", lambda: les.load_level(LEVEL)))
world = attempt("editor world", lambda: unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world())
if world:
    say("world:", world.get_name())
    ws = attempt("world settings", lambda: world.get_world_settings())
    if ws:
        say("game mode override:", attempt("game mode", lambda: ws.get_editor_property("default_game_mode")))
        say("kill z:", attempt("kill z", lambda: ws.get_editor_property("kill_z")))
    say("world partition:", attempt("world partition", lambda: unreal.WorldPartitionBlueprintLibrary is not None))

eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
actors = attempt("actors", lambda: list(eas.get_all_level_actors())) or []
say("loaded actors:", len(actors))
kinds = collections.Counter(a.get_class().get_name() for a in actors)
for name, n in kinds.most_common(14):
    say("   ", n, name)
for a in actors:
    cls = a.get_class().get_name()
    if cls in ("PlayerStart", "PlayerStartPIE", "CameraActor", "CineCameraActor", "DirectionalLight", "SkyAtmosphere", "Landscape", "LandscapeProxy", "WorldDataLayers", "WorldPartitionMiniMap"):
        loc = attempt("loc", lambda: a.get_actor_location())
        say("   ", cls, a.get_actor_label(), tuple(round(v) for v in (loc.x, loc.y, loc.z)) if loc else "")
bounds = [attempt("bounds", lambda a=a: a.get_actor_bounds(False)) for a in actors[:4000]]
bounds = [b for b in bounds if b]
if bounds:
    lo = [min(getattr(o, k) - getattr(e, k) for o, e in bounds) for k in "xyz"]
    hi = [max(getattr(o, k) + getattr(e, k) for o, e in bounds) for k in "xyz"]
    say("bounds of the first", len(bounds), "loaded actors (cm):", [round(v) for v in lo], [round(v) for v in hi])
say("---- done")
