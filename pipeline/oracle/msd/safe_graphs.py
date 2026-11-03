"""Read the graph files of the MSD archive (.pickle) WITHOUT running their code. A pickle is a program: loading a file somebody else made can do anything. These files import only a few things
(checked on all 10,744 of them by reading their opcodes, nothing executed): networkx Graph, dict, OrderedDict, and in the 5,372 output graphs torch tensor rebuilders, one of which
(torch.storage._load_from_bytes) unpickles more data inside it. So the loader below never imports networkx or torch: every allowed class is replaced by a harmless stand-in, the tensors by None
(we need the room types and the edges, not the features), and any other class is refused.

  from msd.safe_graphs import load_graph;  g = load_graph(raw_bytes);  g.nodes -> {id: {attrs}},  g.edges -> [(a, b, {attrs})]
"""
from __future__ import annotations

import collections
import io
import pickle


class _Graph:
    """Stand-in for networkx.Graph: the pickle's state (a dict with _node, _adj, graph) is copied in, nothing is executed."""

    def __setstate__(self, state):
        self.__dict__.update(state)

    @property
    def nodes(self) -> dict:
        return dict(self.__dict__.get("_node", {}))

    @property
    def edges(self) -> list:
        seen, out = set(), []
        for a, nbrs in self.__dict__.get("_adj", {}).items():
            for b, attrs in nbrs.items():
                key = frozenset((a, b))
                if key not in seen:
                    seen.add(key)
                    out.append((a, b, dict(attrs)))
        return out


def _none(*_a, **_k):
    return None


_ALLOWED = {
    ("networkx.classes.graph", "Graph"): _Graph,
    ("builtins", "dict"): dict,
    ("collections", "OrderedDict"): collections.OrderedDict,
    ("torch._utils", "_rebuild_tensor_v2"): _none,  # tensors are dropped: they would need torch, and unpickling more data
    ("torch.storage", "_load_from_bytes"): _none,
}


class _SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        try:
            return _ALLOWED[(module, name)]
        except KeyError:
            raise pickle.UnpicklingError(f"refused to load {module}.{name}: not on the list of classes these files are known to use") from None


def load_graph(raw: bytes) -> _Graph:
    g = _SafeUnpickler(io.BytesIO(raw)).load()
    if not isinstance(g, _Graph):
        raise pickle.UnpicklingError("not a graph")
    return g
