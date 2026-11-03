"""Each rule on a small hand-made case: one that must fire and one that must stay quiet. python -m unittest discover -s pipeline/oracle/tests -t pipeline/oracle (from the repository root)."""
import copy
import unittest

from usable_oracle import geometry as g
from usable_oracle.rules import check_case, net_rect

TO, TI = 0.365, 0.115


def base() -> dict:
    """A 6 x 8 m footprint with two rooms side by side, the partition trimmed to the inner faces of the outer walls: a clean plan."""
    return {
        "room": {"width": 6.0, "depth": 8.0, "windows": [], "doors": []},
        "thickness": {"outer": TO, "inner": TI},
        "types": {"bedroom": {"min": 2.4, "minArea": 7}, "bath": {"min": 1.5, "minArea": 2.5}},
        "rooms": [
            {"id": "a", "type": "bedroom", "rect": [0, 0, 3, 8]},
            {"id": "b", "type": "bedroom", "rect": [3, 0, 6, 8]},
        ],
        "doors": [],
        "walls": [{"p0": [3.0, TO], "p1": [3.0, 8.0 - TO], "op": []}],
        "furniture": [],
    }


def codes(case, rule=None):
    return [v.rule for v in check_case(case, rules=[rule] if rule else None)]


class Geometry(unittest.TestCase):
    def test_overlap_and_gap(self):
        self.assertAlmostEqual(g.inter_area((0, 0, 2, 2), (1, 1, 3, 3)), 1.0)
        self.assertEqual(g.inter_area((0, 0, 1, 1), (1, 0, 2, 1)), 0.0)  # touching is not overlapping
        self.assertAlmostEqual(g.gap((0, 0, 1, 1), (4, 0, 5, 1)), 3.0)
        self.assertEqual(g.gap((0, 0, 2, 2), (1, 1, 3, 3)), 0.0)

    def test_wall_solids_are_cut_by_their_openings(self):
        c = base()
        c["walls"][0]["op"] = [[1.0, 2.0]]  # a door from 1 to 2 m along the wall
        parts = [s for s in g.wall_solids(c) if s["kind"] == "partition"]
        self.assertEqual(len(parts), 2)
        self.assertAlmostEqual(sum(g.h(s["rect"]) for s in parts), (8.0 - 2 * TO) - 1.0)


class CleanPlan(unittest.TestCase):
    def test_a_clean_plan_has_no_violation(self):
        self.assertEqual(check_case(base()), [])


class NetSize(unittest.TestCase):
    def test_net_rect_takes_the_walls_off(self):
        n = net_rect(base(), [0, 0, 3, 8])
        self.assertAlmostEqual(n[0], TO)
        self.assertAlmostEqual(n[2], 3 - TI / 2)
        self.assertAlmostEqual(n[1], TO)
        self.assertAlmostEqual(n[3], 8 - TO)

    def test_a_room_too_narrow_between_the_walls_fires(self):
        c = base()
        c["rooms"] = [{"id": "a", "type": "bedroom", "rect": [0, 0, 2.5, 8]}, {"id": "b", "type": "bedroom", "rect": [2.5, 0, 6, 8]}]  # 2.5 m gross is 2.08 m net: under 2.4
        self.assertIn("net-width", codes(c, "net-size"))

    def test_a_small_room_fires_on_area(self):
        c = base()
        c["rooms"] = [{"id": "a", "type": "bedroom", "rect": [0, 0, 3, 3]}, {"id": "b", "type": "bedroom", "rect": [3, 0, 6, 8]}]  # 3 x 3 gross: about 6 m2 net
        self.assertIn("net-area", codes(c, "net-size"))


class WallHitsWindow(unittest.TestCase):
    def test_partition_ending_inside_a_window_fires_whether_trimmed_or_not(self):
        for p0 in ([3.0, TO], [3.0, 0.0]):  # at the inner face of the outer wall, and through the wall
            c = base()
            c["walls"][0]["p0"] = p0
            c["room"]["windows"] = [{"wall": "N", "pos": 3.0, "width": 1.2}]
            self.assertIn("wall-hits-window", codes(c, "wall-hits-window"), p0)

    def test_partition_beside_the_window_is_quiet(self):
        c = base()
        c["room"]["windows"] = [{"wall": "N", "pos": 1.5, "width": 1.2}]  # 0.9 to 2.1 m: the wall is at 3.0 m
        self.assertEqual(codes(c, "wall-hits-window"), [])

    def test_the_far_end_and_the_other_sides(self):
        c = base()
        c["room"]["windows"] = [{"wall": "S", "pos": 3.05, "width": 1.0}]
        self.assertIn("wall-hits-window", codes(c, "wall-hits-window"))
        c["room"]["windows"] = [{"wall": "E", "pos": 3.0, "width": 1.0}]  # a window on another side does not matter
        self.assertEqual(codes(c, "wall-hits-window"), [])


class FurnitureInWall(unittest.TestCase):
    def test_furniture_in_the_outer_wall_fires_with_its_depth(self):
        c = base()
        c["furniture"] = [{"id": "bed", "type": "bed_single", "room": "a", "body": [0.0, 1.0, 1.0, 3.0]}]
        v = check_case(c, rules=["furniture-in-wall"])
        self.assertEqual(len(v), 1)
        self.assertAlmostEqual(v[0].measure["depth"], TO, places=3)

    def test_furniture_in_a_partition_fires_but_not_in_its_door(self):
        c = base()
        c["furniture"] = [{"id": "w", "type": "wardrobe", "room": "a", "body": [2.5, 3.0, 3.1, 4.0]}]
        self.assertIn("furniture-in-wall", codes(c, "furniture-in-wall"))
        c["walls"][0]["op"] = [[2.0, 4.0]]  # a door from 2 to 4 m along the wall (from its start at 0.365): the piece stands in the opening
        c["furniture"] = [{"id": "w", "type": "wardrobe", "room": "a", "body": [2.5, 3.0, 2.95, 4.0]}]
        self.assertEqual(codes(c, "furniture-in-wall"), [])

    def test_furniture_against_the_inner_face_is_quiet(self):
        c = base()
        c["furniture"] = [{"id": "bed", "type": "bed_single", "room": "a", "body": [TO, 1.0, TO + 0.9, 3.0]}]
        self.assertEqual(codes(c, "furniture-in-wall"), [])


class WallInWall(unittest.TestCase):
    def test_partition_through_the_outer_wall_fires(self):
        c = base()
        c["walls"][0]["p0"], c["walls"][0]["p1"] = [3.0, 0.0], [3.0, 8.0]
        self.assertEqual(codes(c, "wall-in-wall").count("pokes-into-outer-wall"), 2)

    def test_two_partitions_on_top_of_each_other_fire_but_a_crossing_does_not(self):
        c = base()
        c["walls"].append({"p0": [3.0, 2.0], "p1": [3.0, 5.0], "op": []})  # a second wall on the same line
        self.assertIn("overlapping-walls", codes(c, "wall-in-wall"))
        c = base()
        c["walls"].append({"p0": [TO, 4.0], "p1": [6.0 - TO, 4.0], "op": []})  # a crossing wall: a junction, not an overlap
        self.assertNotIn("overlapping-walls", codes(c, "wall-in-wall"))


class Openings(unittest.TestCase):
    def test_window_in_a_corner_and_two_windows_on_each_other(self):
        c = base()
        c["room"]["windows"] = [{"wall": "N", "pos": 0.5, "width": 1.0}]  # 0.0 to 1.0 m: starts inside the corner
        self.assertIn("window-in-corner", codes(c, "openings"))
        c["room"]["windows"] = [{"wall": "N", "pos": 2.0, "width": 1.4}, {"wall": "N", "pos": 2.6, "width": 1.0}]
        self.assertIn("window-overlap", codes(c, "openings"))

    def test_a_door_must_sit_between_the_rooms_it_names(self):
        c = base()
        c["doors"] = [{"a": "a", "b": "b", "mid": [3.0, 4.0], "vertical": True, "width": 0.9}]
        self.assertEqual(codes(c, "openings"), [])
        c["doors"] = [{"a": "a", "b": "b", "mid": [1.0, 4.0], "vertical": True, "width": 0.9}]  # in the middle of room a
        self.assertIn("door-not-between-rooms", codes(c, "openings"))


class PlanTotals(unittest.TestCase):
    def test_thickness_range_and_area_sum(self):
        c = base()
        c["thickness"]["inner"] = 0.05
        self.assertIn("wall-thickness", codes(c, "plan-totals"))
        c = base()
        c["rooms"] = [{"id": "a", "type": "bedroom", "rect": [0, 0, 3, 8]}]  # half the footprint
        self.assertIn("area-sum", codes(c, "plan-totals"))


class Immutability(unittest.TestCase):
    def test_the_rules_do_not_change_the_case(self):
        c = base()
        c["furniture"] = [{"id": "bed", "type": "bed_single", "room": "a", "body": [0.0, 1.0, 1.0, 3.0]}]
        before = copy.deepcopy(c)
        check_case(c)
        self.assertEqual(c, before)


if __name__ == "__main__":
    unittest.main()
