"""The safe loader for the MSD graph pickles, and the statistics on made-up graphs. python -m unittest discover -s pipeline/oracle/tests -t pipeline/oracle"""
import pickle
import sys
import types
import unittest

from msd.graph_stats import analyse
from msd.safe_graphs import _Graph, load_graph


def make_raw(nodes, edges):
    """A pickle of a networkx-style Graph, made with a stand-in module so that the test needs no networkx."""
    saved = {k: sys.modules.get(k) for k in ("networkx", "networkx.classes", "networkx.classes.graph")}
    mod = types.ModuleType("networkx.classes.graph")

    class Graph:
        pass

    Graph.__module__, Graph.__qualname__ = "networkx.classes.graph", "Graph"
    mod.Graph = Graph
    sys.modules.setdefault("networkx", types.ModuleType("networkx"))
    sys.modules.setdefault("networkx.classes", types.ModuleType("networkx.classes"))
    sys.modules["networkx.classes.graph"] = mod
    try:
        g = Graph.__new__(Graph)
        adj = {k: {} for k in nodes}
        for a, b, attrs in edges:
            adj[a][b] = attrs
            adj[b][a] = attrs
        g.__dict__.update({"_node": {k: {"room_type": t} for k, t in nodes.items()}, "_adj": adj, "graph": {}})
        return pickle.dumps(g, protocol=4)
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


def graph(nodes, edges):
    return load_graph(make_raw(nodes, edges))


class SafeLoader(unittest.TestCase):
    def test_a_graph_loads_without_networkx(self):
        g = graph({0: 4, 1: 0}, [(0, 1, {"connectivity": "door"})])
        self.assertIsInstance(g, _Graph)
        self.assertEqual(g.nodes[1]["room_type"], 0)
        self.assertEqual(g.edges, [(0, 1, {"connectivity": "door"})])

    def test_a_pickle_that_would_run_code_is_refused_and_does_not_run(self):
        evil = b"cos\nsystem\n(S'echo pwned > should_not_exist.txt'\ntR."
        with self.assertRaises(pickle.UnpicklingError):
            load_graph(evil)
        import os

        self.assertFalse(os.path.exists("should_not_exist.txt"))

    def test_other_classes_are_refused_too(self):
        import io

        buf = io.BytesIO()
        pickle.Pickler(buf, protocol=4).dump(types.SimpleNamespace(a=1))
        with self.assertRaises(pickle.UnpicklingError):
            load_graph(buf.getvalue())


class Statistics(unittest.TestCase):
    def test_the_shares_and_the_way_through(self):
        # stairs 0 --entrance-- corridor 1; the corridor has doors to a bedroom 2, a bath 3 and a kitchen 4; the kitchen is open (passage) to the living room 5
        a = graph({0: 5, 1: 4, 2: 0, 3: 7, 4: 2, 5: 1}, [(0, 1, {"connectivity": "entrance"}), (1, 2, {"connectivity": "door"}), (1, 3, {"connectivity": "door"}), (1, 4, {"connectivity": "door"}), (4, 5, {"connectivity": "passage"})])
        # the bath is reached only through the bedroom: a way through
        b = graph({0: 5, 1: 4, 2: 0, 3: 7}, [(0, 1, {"connectivity": "entrance"}), (1, 2, {"connectivity": "door"}), (2, 3, {"connectivity": "door"})])
        r = analyse([a, b])
        self.assertEqual(r["graphs"], 2)
        self.assertEqual(r["share_of_rooms_CONNECTED_to"]["kitchen -> living"], 1.0)
        self.assertEqual(r["share_of_rooms_with_a_DOOR_to"]["bath -> kitchen"], 0.0)
        self.assertEqual(r["share_of_rooms_with_a_DOOR_to"]["bath -> corridor"], 0.5)  # one of the two baths
        self.assertEqual(r["bedrooms_checked_for_a_way_through"], 2)
        self.assertEqual(r["bedrooms_that_are_a_way_through"], 0.5)
        self.assertEqual(r["bedroom_depth_from_the_entrance"], {"1": 2})  # both ends of an entrance edge are starts: the bedroom is one connection off the corridor


if __name__ == "__main__":
    unittest.main()
