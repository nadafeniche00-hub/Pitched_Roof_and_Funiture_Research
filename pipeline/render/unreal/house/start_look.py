"""start_look.py: turn the viewer's head to the standard view at the start of a stream. A PlayerStart gives the pawn its place and its yaw, but the up-and-down tilt is dropped when the player spawns,
so this sets the control rotation (pitch, yaw) from house\\start_pose.txt a few seconds after the start, again and again until it stays. Runs INSIDE the streamed game (run_stream.ps1 adds it for the
jungle unless -SampleStart). The answer goes to house\\logs\\look.log.
With US_CAPTURE=1 (run_stream.ps1 -Capture) it also locks the viewer's keys and mouse, waits for the light and the plants to settle, saves two full-size pictures of the standard view to
house\\shots\\ (HighResShot, no buttons and no on-screen messages in them) and gives the keys and the mouse back: for the pictures of the deck, whoever else has the page open.
"""
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "look.log")
POSE = os.path.join(HERE, "start_pose.txt")        # x y z pitch yaw roll of the view, the one set_start.py puts the start place at
SHOTS = os.path.join(HERE, "shots")
MAP_OBJECT = os.environ.get("US_MAP_OBJECT", "/Game/Levels/ElectricDreams_Env.ElectricDreams_Env")
CAPTURE = os.environ.get("US_CAPTURE") == "1"
SIZE = os.environ.get("US_SHOT_SIZE", "1920x1080")
WAIT = 90                                          # ticks after which the player stands in the level
GIVE_UP = 3000                                     # ticks after which the tilt is left to the viewer
SHOT_AFTER = (900, 1500)                           # ticks after the view is right: the two pictures (the light and the plants need seconds to settle)
os.makedirs(os.path.dirname(LOG), exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)
state = {"n": 0, "err": 0, "ok_at": None, "shots": 0}


def say(msg):
    unreal.log("start_look: " + msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def done():
    unreal.unregister_slate_post_tick_callback(handle)


def tick(delta):
    state["n"] += 1
    if state["n"] < WAIT or state["n"] % 10:
        return
    try:
        world = unreal.find_object(None, MAP_OBJECT)      # not EditorLevelLibrary.get_game_world(): an editor function, it crashes the game
        pc = unreal.GameplayStatics.get_player_controller(world, 0) if world is not None else None
        if pc is None:
            return
        x, y, z, pitch, yaw = [float(v) for v in open(POSE).read().split()[:5]]
        loc, rot = pc.get_player_view_point()
        if state["ok_at"] is not None:
            # the view is right and the keys are locked: wait, then the pictures
            k = state["n"] - state["ok_at"]
            if state["shots"] < len(SHOT_AFTER) and k >= SHOT_AFTER[state["shots"]]:
                path = os.path.join(SHOTS, "standard_%d.png" % (state["shots"] + 1)).replace("\\", "/")
                unreal.SystemLibrary.execute_console_command(world, 'HighResShot %s filename="%s"' % (SIZE, path), pc)
                state["shots"] += 1
                say("picture %d asked for: %s (tick %d, view %.0f %.0f %.0f pitch %.1f yaw %.1f)" % (state["shots"], path, state["n"], loc.x, loc.y, loc.z, rot.pitch, rot.yaw))
            if state["shots"] >= len(SHOT_AFTER) and k >= SHOT_AFTER[-1] + 150:
                pc.set_ignore_look_input(False)
                pc.set_ignore_move_input(False)
                say("keys and mouse given back")
                done()
            return
        if state["n"] > GIVE_UP or abs(loc.x - x) > 150 or abs(loc.y - y) > 150 or abs(rot.yaw - yaw) > 5:
            say("stops: the viewer has moved or looked away, or the time is up (tick %d, now %.0f %.0f yaw %.1f pitch %.1f)" % (state["n"], loc.x, loc.y, rot.yaw, rot.pitch))
            done()
            return
        if abs(rot.pitch - pitch) < 1.0:
            say("looks along pitch %.1f yaw %.1f from %.0f %.0f %.0f (tick %d)" % (rot.pitch, rot.yaw, loc.x, loc.y, loc.z, state["n"]))
            if not CAPTURE:
                done()
                return
            pc.set_ignore_look_input(True)
            pc.set_ignore_move_input(True)
            state["ok_at"] = state["n"]
            say("capture: keys and mouse locked")
            return
        # something puts the pitch back to 0 after the spawn (the console command ghost changes the pawn): set it again until it stays
        if not state.get("described"):
            state["described"] = True
            pawn = pc.get_controlled_pawn() if hasattr(pc, "get_controlled_pawn") else None
            say("controller %s | pawn %s | control rotation %s | camera manager %s" % (pc.get_class().get_name(), pawn.get_class().get_name() if pawn else None, pc.get_control_rotation(), pc.player_camera_manager.get_class().get_name() if pc.player_camera_manager else None))
        state["tries"] = state.get("tries", 0) + 1
        if state["tries"] > 12:
            # the player flies a BP_OpalHoverDrone with its own camera manager: the tilt does not hold. The picture is taken from the right place and direction, level.
            say("the tilt does not hold (pitch stays %.1f): %s" % (rot.pitch, "taking the pictures level" if CAPTURE else "leaving it"))
            if not CAPTURE:
                done()
                return
            pc.set_ignore_look_input(True)
            pc.set_ignore_move_input(True)
            state["ok_at"] = state["n"]
            return
        want = unreal.Rotator(0.0, pitch, yaw)
        pc.set_control_rotation(want)
        pawn = pc.get_controlled_pawn() if hasattr(pc, "get_controlled_pawn") else None
        if pawn is not None:
            pawn.set_actor_rotation(want, False)      # the drone's own rotation, in case its camera follows that
        say("set pitch %.1f; the control rotation reads %s" % (pitch, pc.get_control_rotation()))
    except Exception as e:
        state["err"] += 1
        say("failed: %s %s" % (type(e).__name__, str(e)[:200]))
        if state["err"] > 5:
            done()


open(LOG, "w").close()
say("started" + (" (capture)" if CAPTURE else ""))
handle = unreal.register_slate_post_tick_callback(tick)
