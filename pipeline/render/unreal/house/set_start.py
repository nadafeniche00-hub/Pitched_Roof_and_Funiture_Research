"""set_start.py: put the start place of the viewer where a camera stood: the pose that hover_info.py keeps in logs\\pov.log while a stream runs (x y z pitch yaw roll of the view point).
The house stays where it is. Headless (-nullrhi), in the ELECTRIC DREAMS project; saves only the start place's own actor file. Environment: US_POSE = the file with the pose (default house\\start_pose.txt),
US_EYE = cm from the start place up to the eye (default 0: the view point of the pawn is its start place). Answers: house\\logs\\start.log.
"""
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "start.log")
POSE = os.environ.get("US_POSE", os.path.join(HERE, "start_pose.txt"))
LEVEL = os.environ.get("US_LEVEL", "/Game/Levels/ElectricDreams_Env")
EYE = float(os.environ.get("US_EYE", "0"))
LABEL = "PlayerStart_UsableSpace"
os.makedirs(os.path.dirname(LOG), exist_ok=True)
open(LOG, "w").close()


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


x, y, z, pitch, yaw, roll = [float(v) for v in open(POSE).read().split()]
say("pose of the view:", x, y, z, "pitch", pitch, "yaw", yaw)
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
say("load_level", LEVEL, les.load_level(LEVEL))
starts = [a for a in eas.get_all_level_actors() if a.get_actor_label() == LABEL]
say("start places found:", len(starts))
for a in starts:
    l0, r0 = a.get_actor_location(), a.get_actor_rotation()
    say("before:", round(l0.x), round(l0.y), round(l0.z), "yaw", round(r0.yaw))
    a.set_actor_location_and_rotation(unreal.Vector(x, y, z - EYE), unreal.Rotator(0.0, pitch, yaw), False, True)
    l1, r1 = a.get_actor_location(), a.get_actor_rotation()
    say("after:", round(l1.x), round(l1.y), round(l1.z), "pitch", round(r1.pitch, 1), "yaw", round(r1.yaw, 1))
    say("saved:", unreal.EditorLoadingAndSavingUtils.save_packages([a.get_package()], False), "|", a.get_package().get_name())
say("done")
