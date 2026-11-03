"""hover_info.py: simple facts about the house, shown on the stream while you look at it. Runs INSIDE the streamed game (run_stream.ps1 -Hover adds it with -ExecutePythonScript).
Every frame it traces a line from the middle of the view, 80 m ahead; when the first thing it hits is the actor "UsableSpaceHouse" it prints the facts at the top left (Unreal's on-screen
messages are part of the picture, so the browser shows them), and when you look away it lets them fade. The answers (did it start, did it hit) go to house\\logs\\hover.log.
The facts are the ones the house pack knows (house\\README.md: 8.8 x 10.8 m with the plinth, 8.4 m high, one merged mesh, the clay roof and the floor boards).
"""
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "hover.log")
POSE = os.path.join(HERE, "logs", "pov.log")
LABEL = "UsableSpaceHouse"
REACH = 8000.0                       # cm
TRACE = unreal.TraceTypeQuery.TRACE_TYPE_QUERY1
FACTS = [
    "Timber-frame house with a pitched roof",
    "Footprint 8.8 x 10.8 m, height 8.4 m",
    "Clay-tile gable roof, white plaster between a dark timber frame",
    "Wooden floor boards, windows with green shutters",
    "One merged mesh: 6,775 vertices, 39 parts",
]
os.makedirs(os.path.dirname(LOG), exist_ok=True)
state = {"n": 0, "hit_logged": False, "err": 0, "world": None}


def say(msg):
    unreal.log("hover_info: " + msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


MAP_OBJECT = os.environ.get("US_MAP_OBJECT", "/Game/Levels/ElectricDreams_Env.ElectricDreams_Env")


def game_world():
    """the world of the streamed game. NOT EditorLevelLibrary.get_game_world(): it is an editor function and an access violation crashes the game (14:49 on 3 Nov 2026)."""
    if state["world"] is None:
        try:
            state["world"] = unreal.find_object(None, MAP_OBJECT)
            say("world: %s" % state["world"])
        except Exception as e:
            say("world lookup failed: %s %s" % (type(e).__name__, str(e)[:200]))
            state["err"] += 1
            if state["err"] > 5:
                unreal.unregister_slate_post_tick_callback(handle)
    return state["world"]


def show(world, lines):
    for i, text in enumerate(lines):
        unreal.SystemLibrary.print_string(world, text, True, False, unreal.LinearColor(1.0, 0.93, 0.78, 1.0), 0.25, "UsableSpaceHover%d" % i)


def tick(delta):
    state["n"] += 1
    if state["n"] % 3:                         # every third frame is plenty
        return
    try:
        world = game_world()
        if world is None:
            return
        pc = unreal.GameplayStatics.get_player_controller(world, 0)
        if pc is None:
            return
        loc, rot = pc.get_player_view_point()
        if state["n"] % 30 == 0:               # the camera of the viewer, twice a second: pov.log keeps the last pose (x y z pitch yaw roll) so the start place can be set to it
            with open(POSE, "w", encoding="utf-8") as f:
                f.write("%.1f %.1f %.1f %.2f %.2f %.2f\n" % (loc.x, loc.y, loc.z, rot.pitch, rot.yaw, rot.roll))
        fwd = rot.get_forward_vector()
        end = unreal.Vector(loc.x + fwd.x * REACH, loc.y + fwd.y * REACH, loc.z + fwd.z * REACH)
        r = unreal.SystemLibrary.line_trace_single(world, loc, end, TRACE, True, [], unreal.DrawDebugTrace.NONE, True)
        hit = r[1] if isinstance(r, tuple) else None
        actor = hit.to_tuple()[9] if (isinstance(r, tuple) and r[0] and hit is not None) else None
        if actor is not None and actor.get_actor_label() == LABEL:
            show(world, FACTS)
            if not state["hit_logged"]:
                state["hit_logged"] = True
                say("looking at the house: facts shown")
    except Exception as e:
        state["err"] += 1
        if state["err"] <= 5:
            say("tick failed: %s %s" % (type(e).__name__, str(e)[:200]))


open(LOG, "w").close()
say("started")
handle = unreal.register_slate_post_tick_callback(tick)
