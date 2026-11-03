"""probe_pcg.py: what makes the plants of the Electric Dreams level, and how can a house keep them off? Read-only, headless (-nullrhi), in the ELECTRIC DREAMS project.
Lists the PCG actors of the loaded level, the graphs they run, and the nodes of those graphs that read actors by tag or by class (the usual way a graph is told to leave a place free).
The answers go to house\\logs\\pcg.log.
"""
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "logs", "pcg.log")
LEVEL = os.environ.get("US_LEVEL", "/Game/Levels/ElectricDreams_Env")
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
actors = list(eas.get_all_level_actors())
say("actors:", len(actors))
counts = {}
for a in actors:
    cn = a.get_class().get_name()
    counts[cn] = counts.get(cn, 0) + 1
for cn, n in sorted(counts.items(), key=lambda kv: -kv[1])[:40]:
    say("   class", cn, n)

graphs = {}
for a in actors:
    for c in a.get_components_by_class(unreal.PCGComponent) or []:
        try:
            g = c.get_graph()
        except Exception as e:
            say("graph of", a.get_actor_label(), "failed", e)
            continue
        if g:
            graphs.setdefault(g.get_path_name(), []).append(a.get_actor_label())
say("PCG components with a graph:", sum(len(v) for v in graphs.values()), "| graphs:", len(graphs))
for path, labels in sorted(graphs.items(), key=lambda kv: -len(kv[1]))[:40]:
    say("   graph", path, "|", len(labels), "actors, e.g.", labels[:3])

# the nodes that look for actors: their settings name the tag or the class they take
seen = set()


def walk(g, depth=0):
    if g is None or g.get_path_name() in seen or depth > 4:
        return
    seen.add(g.get_path_name())
    try:
        nodes = list(g.get_editor_property("nodes"))
    except Exception:
        nodes = []
    for n in nodes:
        try:
            s = n.get_settings()
        except Exception:
            continue
        cn = s.get_class().get_name() if s else "?"
        if any(w in cn for w in ("DataFromActor", "GetActor", "Subgraph", "Landscape", "Exclu", "Difference", "SelfPruning", "Spline", "Volume")):
            props = {}
            for p in ("actor_selector", "actor_selection", "actor_tags", "tags", "actor_selector_settings"):
                try:
                    props[p] = str(s.get_editor_property(p))[:200]
                except Exception:
                    pass
            say("  " * depth + "   node", n.get_name(), cn, props)
        sub = None
        try:
            sub = s.get_editor_property("subgraph_override") or (s.get_subgraph() if hasattr(s, "get_subgraph") else None)
        except Exception:
            pass
        if sub:
            walk(sub, depth + 1)


for path in list(graphs)[:12]:
    say("---- walking", path)
    walk(unreal.load_asset(path.split(".")[0]))
say("---- done")
