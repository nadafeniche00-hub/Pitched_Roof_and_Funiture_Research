"""probe_pcg_tags.py: the actor selectors of the forest graphs of Electric Dreams: which tag or class do they read? Read-only, headless (-nullrhi), in the ELECTRIC DREAMS project. Answers: house\logs\pcg_tags.log."""
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "pcg_tags.log")
os.makedirs(os.path.dirname(LOG), exist_ok=True)
open(LOG, "w").close()


def say(*parts):
    msg = " ".join(str(p) for p in parts)
    unreal.log(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


GRAPHS = ["/Game/PCG/Graphs/Forest/PCGDemo_ForestCliffs", "/Game/PCG/Graphs/Forest/PCGDemo_Forest", "/Game/PCG/Graphs/Ground/PCGDemo_Ground"]
seen = set()


def walk(g, depth=0):
    if g is None or g.get_path_name() in seen or depth > 4:
        return
    seen.add(g.get_path_name())
    say("---- graph", g.get_path_name())
    for n in g.get_editor_property("nodes"):
        s = n.get_settings()
        if s is None:
            continue
        cn = s.get_class().get_name()
        if cn in ("PCGDataFromActorSettings", "PCGGetActorPropertySettings", "PCGGetLandscapeSettings"):
            try:
                sel = s.get_editor_property("actor_selector")
                say("  ", n.get_name(), cn, "filter", sel.get_editor_property("actor_filter"), "| tag", sel.get_editor_property("actor_selection_tag"),
                    "| class", sel.get_editor_property("actor_selection_class"), "| mode", s.get_editor_property("mode") if cn == "PCGDataFromActorSettings" else "")
            except Exception as e:
                say("  ", n.get_name(), cn, "selector unreadable:", e)
        if cn == "PCGSubgraphSettings":
            try:
                walk(s.get_editor_property("subgraph_instance").get_editor_property("graph") if False else s.get_subgraph(), depth + 1)
            except Exception as e:
                say("  ", n.get_name(), "subgraph unreadable:", e)


for p in GRAPHS:
    walk(unreal.load_asset(p))
say("done")
