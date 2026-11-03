"""Percentiles and false alarms on made-up rooms. python -m unittest discover -s pipeline/oracle/tests -t pipeline/oracle"""
import unittest

from msd.calibrate import false_alarms, percentile, percentiles_by_type


class Percentiles(unittest.TestCase):
    def test_percentile_interpolates(self):
        v = [1.0, 2.0, 3.0, 4.0, 5.0]
        self.assertEqual(percentile(v, 0), 1.0)
        self.assertEqual(percentile(v, 50), 3.0)
        self.assertEqual(percentile(v, 100), 5.0)
        self.assertAlmostEqual(percentile(v, 25), 2.0)
        self.assertAlmostEqual(percentile([10.0, 20.0], 50), 15.0)

    def test_by_type(self):
        recs = [{"type": "bedroom", "net_area": a, "net_width": 2.0 + a / 20} for a in range(6, 16)] + [{"type": "bath", "net_area": 4.0, "net_width": 1.6}]
        out = percentiles_by_type(recs)
        self.assertEqual(out["bedroom"]["n"], 10)
        self.assertAlmostEqual(out["bedroom"]["net_area"]["p50"], 10.5)
        self.assertEqual(out["bath"]["net_area"]["p1"], 4.0)


class FalseAlarms(unittest.TestCase):
    def test_share_below_the_minimum(self):
        recs = [{"type": "bedroom", "net_area": a, "net_width": 2.5} for a in (5, 6, 8, 9, 10, 12, 14, 16, 18, 20)]
        out = false_alarms(recs, {"bedroom": 7.0}, {"bedroom": 2.4})
        self.assertEqual(out["bedroom"]["n"], 10)
        self.assertEqual(out["bedroom"]["below_min_area"], 0.2)  # 5 and 6
        self.assertEqual(out["bedroom"]["below_min_width"], 0.0)


if __name__ == "__main__":
    unittest.main()
