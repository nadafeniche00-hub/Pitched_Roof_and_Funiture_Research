"""Our pitched-roof task, solved with the frameworks that could carry a holistic design framework, and checked against our own engine.

Task 1  usable floor area under a pitched roof (100 % where the roof is >= 2.0 m, 50 % from 1.0 to 2.0 m), per room of one layout,
        for three roof shapes. Reference: shared/engine.js (10 cm grid), written by compare_case.mjs.
Task 2  circulation: depth of every room from the stair hall (graph of rooms and doors).
Task 3  interoperability: write the model as IFC, read it back, get the same numbers.
Task 4  regional pattern: does the gabled share cluster across the German states? (spatial autocorrelation)

Run:  .venv\\Scripts\\python pipeline\\analysis\\compare_frameworks.py     (needs pipeline/data/compare_case.json: node pipeline/analysis/compare_case.mjs)
Writes pipeline/data/compare_results.json and prints a markdown table.
"""
import inspect
import json
import re
import statistics
import sys
import time
import traceback
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CASE = json.loads((ROOT / "pipeline/data/compare_case.json").read_text(encoding="utf-8"))
ROOMS = CASE["layout"]["rooms"]
RULES = CASE["rules"]
RESULTS = {"tasks": {}, "notes": {}}


def timed(fn, repeat=3):
    """median wall time in ms of fn() over `repeat` runs, and its last result"""
    ts, out = [], None
    for _ in range(repeat):
        t0 = time.perf_counter()
        out = fn()
        ts.append((time.perf_counter() - t0) * 1000)
    return statistics.median(ts), out


def loc(*fns):
    """non-blank, non-comment lines of the functions that do this tool's part of the task"""
    n = 0
    for f in fns:
        for line in inspect.getsource(f).splitlines():
            s = line.strip()
            if s and not s.startswith("#") and not s.startswith('"""'):
                n += 1
    return n


def counted(a_ge2, a_ge1):
    return a_ge2 + 0.5 * (a_ge1 - a_ge2)


# =============================================================== Task 1: usable area, one function per framework
# ---- Shapely: 2D predicates; every roof triangle is a plan polygon with a plane z = ax + by + c, the part with z >= t is a half-plane clip
def shapely_prepare(roof):
    from shapely.geometry import Polygon

    V, planes = roof["v"], []
    for a, b, c in roof["t"]:
        p1, p2, p3 = V[a], V[b], V[c]
        poly = Polygon([p1[:2], p2[:2], p3[:2]])
        if poly.area < 1e-9:
            continue  # a vertical triangle (gable wall) has no plan area
        abc = np.linalg.solve(np.array([[p[0], p[1], 1] for p in (p1, p2, p3)]), [p1[2], p2[2], p3[2]])
        planes.append((poly, *abc))
    return planes


def shapely_area_ge(planes, rect, thr):
    from shapely.geometry import Polygon, box
    from shapely.ops import unary_union

    room, parts = box(*rect), []
    for poly, a, b, c in planes:
        p = poly.intersection(room)
        if p.is_empty:
            continue
        if abs(a) < 1e-12 and abs(b) < 1e-12:
            if c >= thr - 1e-9:
                parts.append(p)
            continue
        n = np.array([a, b]); nn = np.linalg.norm(n); u = n / nn; d = np.array([-u[1], u[0]])
        p0 = u * ((thr - c) / nn)
        L = 100
        half = Polygon([p0 - d * L, p0 + d * L, p0 + d * L + u * L, p0 - d * L + u * L])
        parts.append(p.intersection(half))
    return unary_union(parts).area if parts else 0.0


def run_shapely(roof_id):
    planes = shapely_prepare(CASE["roofs"][roof_id])
    return {r["id"]: counted(shapely_area_ge(planes, r["rect"], RULES["fullH"]), shapely_area_ge(planes, r["rect"], RULES["halfH"])) for r in ROOMS}


# ---- COMPAS: the roof is a Mesh; clip each face polygon by planes with COMPAS primitives, area from compas Polygon
def compas_clip(points, plane):
    from compas.geometry import Point, intersection_segment_plane

    def side(p):
        return plane.normal.dot(Point(*p) - plane.point)

    out = []
    for i, p in enumerate(points):
        q = points[(i + 1) % len(points)]
        sp, sq = side(p), side(q)
        if sp >= -1e-12:
            out.append(list(p))
        if (sp > 1e-12 and sq < -1e-12) or (sp < -1e-12 and sq > 1e-12):
            out.append(list(intersection_segment_plane((p, q), plane)))
    return out


def compas_area_ge(mesh, rect, thr):
    from compas.geometry import Plane, Polygon

    x0, y0, x1, y1 = rect
    cuts = [Plane([0, 0, thr], [0, 0, 1]), Plane([x0, 0, 0], [1, 0, 0]), Plane([x1, 0, 0], [-1, 0, 0]), Plane([0, y0, 0], [0, 1, 0]), Plane([0, y1, 0], [0, -1, 0])]
    total = 0.0
    for f in mesh.faces():
        pts = [list(p) for p in mesh.face_polygon(f).points]
        for pl in cuts:
            if len(pts) < 3:
                break
            pts = compas_clip(pts, pl)
        if len(pts) >= 3:
            total += Polygon([[x, y, 0] for x, y, _ in pts]).area
    return total


def run_compas(roof_id):
    from compas.datastructures import Mesh

    roof = CASE["roofs"][roof_id]
    mesh = Mesh.from_vertices_and_faces(roof["v"], roof["t"])
    return {r["id"]: counted(compas_area_ge(mesh, r["rect"], RULES["fullH"]), compas_area_ge(mesh, r["rect"], RULES["halfH"])) for r in ROOMS}


# ---- TopologicPy: the attic is a Cell (a box cut below every roof plane); a room is a Cell too; the area at a height is the section of their intersection
def topologic_attic(roof):
    from topologicpy.Cell import Cell
    from topologicpy.Face import Face
    from topologicpy.Topology import Topology
    from topologicpy.Vertex import Vertex

    W, D = CASE["room"]["width"], CASE["room"]["depth"]
    V = roof["v"]
    cell = Cell.Prism(origin=Vertex.ByCoordinates(0, 0, 0), width=W, length=D, height=8, placement="lowerleft")
    seen = set()
    for a, b, c in roof["t"]:
        p1, p2, p3 = V[a], V[b], V[c]
        M = np.array([[p[0], p[1], 1] for p in (p1, p2, p3)])
        if abs(np.linalg.det(M)) < 1e-9:
            continue
        A, B, C = np.linalg.solve(M, [p1[2], p2[2], p3[2]])
        key = (round(A, 6), round(B, 6), round(C, 6))
        if key in seen:
            continue
        seen.add(key)
        if abs(A) < 1e-9 and abs(B) < 1e-9 and C >= 7.99:
            continue
        pts = [(-2, -2), (W + 2, -2), (W + 2, D + 2), (-2, D + 2)]
        plane = Face.ByVertices([Vertex.ByCoordinates(x, y, A * x + B * y + C) for x, y in pts])
        parts = Topology.Cells(Topology.Slice(cell, plane))
        below = [q for q in parts if Topology.Centroid(q).Z() <= A * Topology.Centroid(q).X() + B * Topology.Centroid(q).Y() + C + 1e-9]
        if below:
            cell = below[0] if len(below) == 1 else Topology.Merge(*below) if False else below[0]
    return cell


def topologic_area_ge(attic, rect, thr):
    from topologicpy.Cell import Cell
    from topologicpy.Face import Face
    from topologicpy.Topology import Topology
    from topologicpy.Vertex import Vertex

    x0, y0, x1, y1 = rect
    room = Cell.Prism(origin=Vertex.ByCoordinates(x0, y0, 0), width=x1 - x0, length=y1 - y0, height=8, placement="lowerleft")
    inside = Topology.Intersect(attic, room)
    if inside is None:
        return 0.0
    plane = Face.ByVertices([Vertex.ByCoordinates(x0 - 1, y0 - 1, thr), Vertex.ByCoordinates(x1 + 1, y0 - 1, thr), Vertex.ByCoordinates(x1 + 1, y1 + 1, thr), Vertex.ByCoordinates(x0 - 1, y1 + 1, thr)])
    section = Topology.Intersect(inside, plane)
    if section is None:
        return 0.0
    return sum(Face.Area(f) for f in Topology.Faces(section))


def run_topologic(roof_id):
    attic = topologic_attic(CASE["roofs"][roof_id])
    return {r["id"]: counted(topologic_area_ge(attic, r["rect"], RULES["fullH"]), topologic_area_ge(attic, r["rect"], RULES["halfH"])) for r in ROOMS}


# ---- IfcOpenShell: roof and rooms are IFC entities; the numbers come out of the tessellated IFC geometry and go back in as Qto_SpaceBaseQuantities
def np_area_ge(V, T, rect, thr):
    """same clipping as the other tools, on plain arrays (used on geometry read back from IFC)"""
    x0, y0, x1, y1 = rect
    total = 0.0
    for tri in T:
        poly = [tuple(V[i]) for i in tri]
        for axis, val, keep_ge in ((2, thr, True), (0, x0, True), (0, x1, False), (1, y0, True), (1, y1, False)):
            out = []
            for i, p in enumerate(poly):
                q = poly[(i + 1) % len(poly)]
                dp = (p[axis] - val) * (1 if keep_ge else -1)
                dq = (q[axis] - val) * (1 if keep_ge else -1)
                if dp >= -1e-12:
                    out.append(p)
                if (dp > 1e-12 and dq < -1e-12) or (dp < -1e-12 and dq > 1e-12):
                    t = dp / (dp - dq)
                    out.append(tuple(p[k] + (q[k] - p[k]) * t for k in range(3)))
            poly = out
            if len(poly) < 3:
                break
        if len(poly) >= 3:
            xs, ys = [p[0] for p in poly], [p[1] for p in poly]
            total += 0.5 * abs(sum(xs[i] * ys[(i + 1) % len(poly)] - xs[(i + 1) % len(poly)] * ys[i] for i in range(len(poly))))
    return total


def ifc_build(roof_id, path):
    import ifcopenshell
    import ifcopenshell.api.aggregate
    import ifcopenshell.api.context
    import ifcopenshell.api.geometry
    import ifcopenshell.api.project
    import ifcopenshell.api.pset
    import ifcopenshell.api.root
    import ifcopenshell.api.spatial
    import ifcopenshell.api.unit

    m = ifcopenshell.api.project.create_file(version="IFC4")
    project = ifcopenshell.api.root.create_entity(m, ifc_class="IfcProject", name="Usable Space comparison")
    ifcopenshell.api.unit.assign_unit(m)
    ctx = ifcopenshell.api.context.add_context(m, context_type="Model")
    body = ifcopenshell.api.context.add_context(m, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=ctx)
    site = ifcopenshell.api.root.create_entity(m, ifc_class="IfcSite", name="Site")
    bld = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuilding", name="House")
    st = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuildingStorey", name="Attic")
    ifcopenshell.api.aggregate.assign_object(m, products=[site], relating_object=project)
    ifcopenshell.api.aggregate.assign_object(m, products=[bld], relating_object=site)
    ifcopenshell.api.aggregate.assign_object(m, products=[st], relating_object=bld)
    roof = CASE["roofs"][roof_id]
    r = ifcopenshell.api.root.create_entity(m, ifc_class="IfcRoof", name=f"Roof {roof_id}", predefined_type="GABLE_ROOF")
    rep = ifcopenshell.api.geometry.add_mesh_representation(m, context=body, vertices=[[tuple(v) for v in roof["v"]]], faces=[[tuple(t) for t in roof["t"]]])
    ifcopenshell.api.geometry.assign_representation(m, product=r, representation=rep)
    ifcopenshell.api.spatial.assign_container(m, products=[r], relating_structure=st)
    ifcopenshell.api.geometry.edit_object_placement(m, product=r)  # without a placement the geometry iterator returns nothing
    for room in ROOMS:
        x0, y0, x1, y1 = room["rect"]
        sp = ifcopenshell.api.root.create_entity(m, ifc_class="IfcSpace", name=room["id"], predefined_type="INTERNAL")
        srep = ifcopenshell.api.geometry.add_slab_representation(m, context=body, depth=3.0, polyline=[(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)])
        ifcopenshell.api.geometry.assign_representation(m, product=sp, representation=srep)
        ifcopenshell.api.aggregate.assign_object(m, products=[sp], relating_object=st)
        ifcopenshell.api.geometry.edit_object_placement(m, product=sp)
    m.write(str(path))
    return path


def ifc_read_compute(path):
    import ifcopenshell
    import ifcopenshell.geom

    m = ifcopenshell.open(str(path))
    it = ifcopenshell.geom.iterator(ifcopenshell.geom.settings(), m, 1)  # the geometry iterator (the per-element create_shape returned empty meshes here)
    roof_V = roof_T = None
    rects = {}
    if it.initialize():
        while True:
            shape = it.get()
            el = m.by_id(shape.id)
            V = np.array(shape.geometry.verts).reshape(-1, 3)
            if el.is_a("IfcRoof"):
                roof_V, roof_T = V, np.array(shape.geometry.faces).reshape(-1, 3)
            elif el.is_a("IfcSpace"):
                rects[el.Name] = [V[:, 0].min(), V[:, 1].min(), V[:, 0].max(), V[:, 1].max()]
            if not it.next():
                break
    return {name: counted(np_area_ge(roof_V, roof_T, rect, RULES["fullH"]), np_area_ge(roof_V, roof_T, rect, RULES["halfH"])) for name, rect in rects.items()}


def run_ifc(roof_id):
    p = ROOT / f"pipeline/data/compare_{roof_id}.ifc"
    ifc_build(roof_id, p)
    return ifc_read_compute(p)


# =============================================================== Task 2: circulation depth from the stair hall
def adjacency():
    """room graph from the layout's doors"""
    return [(d["a"], d["b"]) for d in CASE["layout"]["doors"]]


def depth_networkx():
    import networkx as nx

    g = nx.Graph()
    g.add_nodes_from(r["id"] for r in ROOMS)
    g.add_edges_from(adjacency())
    return dict(nx.shortest_path_length(g, "hall"))


def depth_compas():
    from compas.datastructures import Graph

    g = Graph()
    for r in ROOMS:
        g.add_node(key=r["id"])
    for a, b in adjacency():
        g.add_edge(a, b)
    return {r["id"]: (0 if r["id"] == "hall" else len(g.shortest_path("hall", r["id"])) - 1) for r in ROOMS}


def depth_topologic():
    from topologicpy.Edge import Edge
    from topologicpy.TGraph import TGraph
    from topologicpy.Vertex import Vertex

    ids = [r["id"] for r in ROOMS]
    verts = {r["id"]: Vertex.ByCoordinates((r["rect"][0] + r["rect"][2]) / 2, (r["rect"][1] + r["rect"][3]) / 2, 0) for r in ROOMS}
    g = TGraph.ByVerticesEdges(list(verts.values()), [Edge.ByVertices(verts[a], verts[b]) for a, b in adjacency()])
    idx = {k: v["index"] for k, v in zip(ids, TGraph.Vertices(g))}  # TGraph works on vertex indices
    return {k: int(TGraph.TopologicalDistance(g, idx["hall"], i) or 0) for k, i in idx.items()}


# =============================================================== Task 4: spatial autocorrelation of the gabled share (PySAL)
def pysal_moran():
    import geopandas as gpd
    import libpysal
    from esda import Moran
    from shapely.geometry import Polygon

    svg = json.loads((ROOT / "presentation/data/states_svg.json").read_text(encoding="utf-8"))["states"]
    stats = json.loads((ROOT / "shared/statePatterns.json").read_text(encoding="utf-8"))["states"]
    rows = []
    for iso, s in svg.items():
        rings = [[tuple(map(float, xy.split(","))) for xy in re.findall(r"-?\d+\.?\d*,-?\d+\.?\d*", part)] for part in s["d"].split("M")[1:]]
        poly = max((Polygon(r).buffer(0) for r in rings if len(r) > 2), key=lambda p: p.area)
        if iso in stats:
            rows.append({"iso": iso, "geometry": poly.buffer(2.5), "gabled": stats[iso]["share"]["gabled"], "flat": stats[iso]["share"]["flat"]})
    gdf = gpd.GeoDataFrame(rows)
    # the outlines were simplified one by one, so neighbours are found by touching after a small buffer, then handed to PySAL as a weights object
    nb = {i: [j for j in range(len(gdf)) if j != i and gdf.geometry[i].intersects(gdf.geometry[j])] for i in range(len(gdf))}
    w = libpysal.weights.W(nb)
    w.transform = "r"
    out = {}
    for col in ("gabled", "flat"):
        mi = Moran(gdf[col].values, w, permutations=999)
        out[col] = {"I": round(float(mi.I), 3), "p_sim": round(float(mi.p_sim), 3), "n": len(gdf), "islands": len(w.islands)}
    return out


# =============================================================== Task 5: the building as an element model (compas_model)
def compas_model_demo():
    """rooms as elements in a tree (building group > rooms), doors as interactions between them, the whole thing serialisable"""
    from compas.geometry import Polygon
    from compas_model.elements import PlateElement
    from compas_model.models import Model

    m = Model(name="attic")
    grp = m.add_group("attic")
    els = {}
    for r in ROOMS:
        x0, y0, x1, y1 = r["rect"]
        els[r["id"]] = m.add_element(PlateElement(polygon=Polygon([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]), thickness=0.02, name=r["id"]), parent=grp)
    for a, b in adjacency():
        m.add_interaction(els[a], els[b])
    js = m.to_jsonstring()
    return {"elements": len(list(m.elements())), "interactions": len(list(m.graph.edges())), "tree_nodes": len(list(m.tree.nodes)), "json_chars": len(js)}


# =============================================================== run everything
def attempt(name, fn, *args):
    try:
        ms, out = timed(lambda: fn(*args), repeat=3 if name != "ifcopenshell" else 2)
        return {"ms": round(ms, 1), "result": out, "error": None}
    except Exception as e:  # noqa: BLE001
        return {"ms": None, "result": None, "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-600:]}


def main():
    ref = CASE["reference"]
    table = {}
    for roof_id in CASE["roofs"]:
        table[roof_id] = {"engine (JS, 10 cm grid)": {"ms": ref[roof_id]["ms_median"], "result": ref[roof_id]["rooms"], "error": None}}
        for name, fn in (("shapely", run_shapely), ("compas", run_compas), ("topologicpy", run_topologic), ("ifcopenshell", run_ifc)):
            print(f"[{roof_id}] {name} ...", flush=True)
            table[roof_id][name] = attempt(name, fn, roof_id)
    RESULTS["tasks"]["usable_area"] = table
    print("[circulation] ...", flush=True)
    RESULTS["tasks"]["circulation"] = {n: attempt(n, f) for n, f in (("networkx", depth_networkx), ("compas", depth_compas), ("topologicpy", depth_topologic))}
    print("[compas_model] ...", flush=True)
    RESULTS["tasks"]["element_model"] = {"compas_model": attempt("compas_model", compas_model_demo)}
    print("[pysal] ...", flush=True)
    RESULTS["tasks"]["regional"] = {"pysal": attempt("pysal", pysal_moran)}
    RESULTS["loc"] = {"shapely": loc(shapely_prepare, shapely_area_ge, run_shapely), "compas": loc(compas_clip, compas_area_ge, run_compas), "topologicpy": loc(topologic_attic, topologic_area_ge, run_topologic),
                      "ifcopenshell": loc(ifc_build, ifc_read_compute, np_area_ge, run_ifc), "networkx": loc(depth_networkx), "compas_graph": loc(depth_compas), "topologic_graph": loc(depth_topologic), "pysal": loc(pysal_moran), "compas_model": loc(compas_model_demo)}
    out = ROOT / "pipeline/data/compare_results.json"
    out.write_text(json.dumps(RESULTS, indent=1, default=float), encoding="utf-8")
    # summary
    print("\n== usable area (counted m2), error against our engine, median ms")
    for roof_id, tools in table.items():
        base = tools["engine (JS, 10 cm grid)"]["result"]
        bt = sum(base.values())
        print(f"\n{roof_id}: engine total {bt:.3f}")
        for name, r in tools.items():
            if r["error"]:
                print(f"  {name:24} ERROR {r['error'][:90]}")
                continue
            tot = sum(r["result"].values())
            worst = max(abs(r["result"].get(k, 0) - v) for k, v in base.items())
            print(f"  {name:24} total {tot:8.3f}  worst room diff {worst:6.3f} m2  {r['ms']:>9} ms")
    print("\n== exact tools against each other (worst room difference, m2) and our engine's per-room deviation")
    for roof_id, tools in table.items():
        ex = [tools[n]["result"] for n in ("shapely", "compas", "topologicpy", "ifcopenshell") if not tools[n]["error"]]
        worst = max(abs(a[k] - b[k]) for a in ex for b in ex for k in a)
        eng = tools["engine (JS, 10 cm grid)"]["result"]
        dev = {k: round(eng[k] - ex[0][k], 3) for k in eng}
        print(f"  {roof_id:12} exact tools differ by {worst:.2e} m2; engine minus exact per room: {dev}")
        RESULTS["tasks"].setdefault("agreement", {})[roof_id] = {"exact_tools_max_diff": worst, "engine_minus_exact": dev}
    print("\n== circulation depth from the hall:", json.dumps({k: (v['result'] if not v['error'] else v['error'][:80]) for k, v in RESULTS['tasks']['circulation'].items()}))
    print("== compas_model:", RESULTS["tasks"]["element_model"]["compas_model"]["result"])
    print("== PySAL:", RESULTS["tasks"]["regional"]["pysal"]["result"] or RESULTS["tasks"]["regional"]["pysal"]["error"])
    print("== lines of code:", RESULTS["loc"])


if __name__ == "__main__":
    sys.exit(main())
