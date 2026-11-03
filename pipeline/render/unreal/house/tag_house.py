"""tag_house.py: give the house the actor tag PCG_Assembly (US_UNTAG=1 takes it off), the tag the forest graph of Electric Dreams reads from the actors that stand for its hand-placed assemblies,
in the hope that the graph keeps its trees off the house. Headless (-nullrhi), in the ELECTRIC DREAMS project; saves only the house's own actor file. Answers: house\logs\tag.log."""
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "tag.log")
LEVEL = os.environ.get("US_LEVEL", "/Game/Levels/ElectricDreams_Env")
TAG = "PCG_Assembly"
UNTAG = os.environ.get("US_UNTAG") == "1"
os.makedirs(os.path.dirname(LOG), exist_ok=True)
open(LOG, "w").close()


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
say("load_level", LEVEL, les.load_level(LEVEL))
houses = [a for a in eas.get_all_level_actors() if a.get_actor_label() == "UsableSpaceHouse"]
say("houses found:", len(houses))
for h in houses:
    tags = [str(t) for t in h.tags]
    say("tags before:", tags)
    tags = [t for t in tags if t != TAG] + ([] if UNTAG else [TAG])
    h.tags = [unreal.Name(t) for t in tags]
    say("tags after:", [str(t) for t in h.tags])
    say("saved:", unreal.EditorLoadingAndSavingUtils.save_packages([h.get_package()], False), "|", h.get_package().get_name())
say("done")
