"""The converter from detected boxes to a case, and the rules on what it gives. python -m unittest discover -s pipeline/oracle/tests -t pipeline/oracle"""
import unittest

from semantic.to_case import case_from_extraction, partition_walls, room_type
from usable_oracle.rules import check_case


def extraction(window_x=(300, 340)):
    """A 6 x 8 m plan drawn at 100 px per metre, two bedrooms side by side with the partition at x = 300 px from the outline, and a window on the north wall."""
    return {
        "outline": [50, 50, 650, 850],
        "outline_m": [6.0, 8.0],
        "rooms": [
            {"label": "Schlafen", "box": [50, 50, 350, 850], "score": 0.9},
            {"label": "Bedroom", "box": [350, 50, 650, 850], "score": 0.9},
        ],
        "openings": [{"label": "window", "box": [50 + window_x[0], 50, 50 + window_x[1], 62], "score": 0.8}],
    }


class Words(unittest.TestCase):
    def test_labels_in_two_languages(self):
        for label, t in (("Schlafen", "bedroom"), ("Wohnen", "living"), ("Küche", "kitchen"), ("Bad", "bath"), ("Flur", "hall"), ("???", "unknown")):
            self.assertEqual(room_type(label), t)


class Conversion(unittest.TestCase):
    def test_pixels_become_metres_and_walls_stop_at_the_outer_wall(self):
        c = case_from_extraction(extraction())
        self.assertEqual([r["type"] for r in c["rooms"]], ["bedroom", "bedroom"])
        self.assertEqual(c["rooms"][0]["rect"], [0.0, 0.0, 3.0, 8.0])
        self.assertEqual(len(c["walls"]), 1)
        self.assertEqual(c["walls"][0]["p0"], [3.0, 0.365])
        self.assertEqual(c["walls"][0]["p1"], [3.0, 8.0 - 0.365])

    def test_a_window_is_placed_on_its_wall(self):
        c = case_from_extraction(extraction(window_x=(100, 220)))
        self.assertEqual(c["room"]["windows"], [{"wall": "N", "pos": 1.6, "width": 1.2}])

    def test_a_clean_extraction_passes_and_a_wall_on_the_window_is_found(self):
        ok = case_from_extraction(extraction(window_x=(100, 220)))
        self.assertEqual([v.rule for v in check_case(ok)], [])
        bad = case_from_extraction(extraction(window_x=(240, 360)))  # the partition at 3.0 m meets the window
        self.assertIn("wall-hits-window", [v.rule for v in check_case(bad)])

    def test_the_converter_does_not_tidy_rooms_that_overlap(self):
        ex = extraction()
        ex["rooms"][1]["box"] = [250, 50, 650, 850]  # starts 1 m early: overlaps the first room
        c = case_from_extraction(ex)
        self.assertEqual(c["rooms"][1]["rect"][0], 2.0)  # kept as seen

    def test_doors_are_cut_into_the_walls(self):
        w = partition_walls([[0, 0, 3, 8], [3, 0, 6, 8]], 6.0, 8.0, 0.365, [{"mid": [3.0, 4.0], "width": 0.9}])
        self.assertEqual(len(w), 1)
        self.assertAlmostEqual(w[0]["op"][0][1] - w[0]["op"][0][0], 0.9)


if __name__ == "__main__":
    unittest.main()
