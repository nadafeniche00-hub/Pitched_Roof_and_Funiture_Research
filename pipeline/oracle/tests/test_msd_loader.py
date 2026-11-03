"""The MSD adapter on made-up polygons and a tiny table with the real header. python -m unittest discover -s pipeline/oracle/tests -t pipeline/oracle"""
import csv
import math
import os
import tempfile
import unittest

from msd.loader import TYPE_OF, min_rect_sides, parse_polygon, polygon_area, read_entities, room_records, ring_area

HEADER = ["", "Unnamed: 0", "apartment_id", "site_id", "building_id", "plan_id", "floor_id", "unit_id", "area_id", "unit_usage", "entity_type", "entity_subtype", "geom", "elevation", "height", "zoning", "roomtype"]


def wkt(pts, holes=()):
    ring = lambda p: "(" + ", ".join(f"{x} {y}" for x, y in p + [p[0]]) + ")"
    return "POLYGON (" + ", ".join([ring(pts)] + [ring(h) for h in holes]) + ")"


class Geometry(unittest.TestCase):
    def test_parse_and_area(self):
        rings = parse_polygon(wkt([(0, 0), (3, 0), (3, 2), (0, 2)]))
        self.assertEqual(len(rings), 1)
        self.assertAlmostEqual(polygon_area(rings), 6.0)

    def test_a_hole_is_taken_off(self):
        rings = parse_polygon(wkt([(0, 0), (4, 0), (4, 4), (0, 4)], holes=[[(1, 1), (2, 1), (2, 2), (1, 2)]]))
        self.assertAlmostEqual(polygon_area(rings), 15.0)

    def test_best_fitting_rectangle_of_a_rotated_room(self):
        a = math.radians(30)
        pts = [(x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)) for x, y in [(0, 0), (4, 0), (4, 2.5), (0, 2.5)]]
        long_side, short_side = min_rect_sides(pts)
        self.assertAlmostEqual(long_side, 4.0, places=6)
        self.assertAlmostEqual(short_side, 2.5, places=6)
        self.assertAlmostEqual(ring_area(pts), 10.0)

    def test_an_l_shape_is_held_by_its_bounding_rectangle(self):
        long_side, short_side = min_rect_sides([(0, 0), (4, 0), (4, 1), (1, 1), (1, 3), (0, 3)])
        self.assertAlmostEqual(long_side, 4.0)
        self.assertAlmostEqual(short_side, 3.0)

    def test_not_a_polygon_is_refused(self):
        with self.assertRaises(ValueError):
            parse_polygon("LINESTRING (0 0, 1 1)")


class Table(unittest.TestCase):
    def table(self, rows):
        f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8")
        w = csv.writer(f)
        w.writerow(HEADER)
        for i, (usage, etype, sub, geom, rtype) in enumerate(rows):
            w.writerow([i, i, "a", 1, 1, "p1", 1, "u1", 1.0, usage, etype, sub, geom, 0.0, 2.6, "Zone1", rtype])
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def test_rooms_walls_and_openings(self):
        path = self.table([
            ("RESIDENTIAL", "area", "ROOM", wkt([(0, 0), (4, 0), (4, 3), (0, 3)]), "Bedroom"),
            ("RESIDENTIAL", "area", "SHAFT", wkt([(0, 0), (1, 0), (1, 1), (0, 1)]), "Structure"),
            ("RESIDENTIAL", "separator", "WALL", wkt([(0, 0), (5, 0), (5, 0.2), (0, 0.2)]), ""),
            ("RESIDENTIAL", "opening", "DOOR", wkt([(0, 0), (0.9, 0), (0.9, 0.2), (0, 0.2)]), ""),
            ("PUBLIC", "area", "BATHROOM", wkt([(0, 0), (2, 0), (2, 2), (0, 2)]), "Bathroom"),
        ])
        ents = list(read_entities(path))
        self.assertEqual([e["kind"] for e in ents], ["area", "area", "wall", "door"])  # the public unit is left out
        wall = ents[2]
        self.assertAlmostEqual(wall["short"], 0.2)
        self.assertAlmostEqual(ents[3]["long"], 0.9)
        rooms = list(room_records(iter(ents)))
        self.assertEqual(rooms, [{"type": "bedroom", "net_area": 12.0, "net_width": 3.0, "plan": "p1"}])  # the shaft is no room of ours

    def test_the_type_table_names_only_types_of_the_app(self):
        self.assertEqual(set(TYPE_OF.values()), {"bedroom", "bath", "kitchen", "living", "storage", "hall"})

    def test_an_unreadable_polygon_is_counted_not_fatal(self):
        path = self.table([("RESIDENTIAL", "area", "ROOM", "POINT (1 1)", "Bedroom")])
        self.assertEqual(list(read_entities(path)), [{"bad": True}])


if __name__ == "__main__":
    unittest.main()
