"""The staging script on a tiny zip: what it takes, what it refuses. python -m unittest discover -s pipeline/oracle/tests -t pipeline/oracle"""
import json
import os
import tempfile
import unittest
import zipfile

from msd.stage_tensors import safe_target, stage, wanted

ROOT = "modified-swiss-dwellings-v2"


def npy(shape=(2, 2, 3)):
    import struct

    header = ("{'descr': '<f2', 'fortran_order': False, 'shape': %s, }" % (shape,)).encode("latin1")
    header += b" " * (64 - (10 + len(header) + 1) % 64) + b"\n"
    return b"\x93NUMPY\x01\x00" + struct.pack("<H", len(header)) + header + b"\x00" * 24


class Staging(unittest.TestCase):
    def make_zip(self, extra=()):
        d = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(d, ignore_errors=True))
        p = os.path.join(d, "archive.zip")
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("mds_V2_5.372k.csv", "a,b\n1,2\n")
            for split in ("train", "test"):
                for kind, data in (("struct_in", npy()), ("full_out", npy()), ("graph_in", b"g1"), ("graph_out", b"g2")):
                    ext = "npy" if kind.endswith(("in", "out")) and "graph" not in kind else "pickle"
                    z.writestr(f"{ROOT}/{split}/{kind}/1.{ext}", data)
            for name, data in extra:
                z.writestr(name, data)
        return p, os.path.join(d, "out")

    def test_what_is_wanted(self):
        self.assertTrue(wanted(f"{ROOT}/train/full_out/5.npy", "tensors"))
        self.assertFalse(wanted(f"{ROOT}/train/full_out/5.npy", "graphs"))
        self.assertTrue(wanted(f"{ROOT}/train/graph_out/5.pickle", "graphs"))
        self.assertFalse(wanted("mds_V2_5.372k.csv", "all"))

    def test_a_dry_run_writes_nothing_and_says_how_much(self):
        p, out = self.make_zip()
        r = stage(p, out, "all", reserve_gb=0, dry_run=True, log=lambda *_: None)
        self.assertEqual(r["files"], 8)
        self.assertEqual([f for _, _, fs in os.walk(out) for f in fs], [])

    def test_it_refuses_to_go_below_the_reserve_on_a_shared_disk(self):
        p, out = self.make_zip()
        with self.assertRaises(SystemExit) as c:
            stage(p, out, "all", reserve_gb=10**9, log=lambda *_: None)
        self.assertIn("refused", str(c.exception))

    def test_staging_writes_the_files_resumes_and_writes_a_manifest(self):
        p, out = self.make_zip()
        m = stage(p, out, "all", reserve_gb=0, log=lambda *_: None)
        self.assertEqual((m["written"], m["skipped_already_complete"]), (8, 0))
        self.assertTrue(os.path.isfile(os.path.join(out, ROOT, "train", "struct_in", "1.npy")))
        self.assertEqual(m["tensor_format"]["struct_in"]["descr"], "<f2")
        again = stage(p, out, "all", reserve_gb=0, log=lambda *_: None)
        self.assertEqual((again["written"], again["skipped_already_complete"]), (0, 8))
        self.assertIn("nothing is trained", json.load(open(os.path.join(out, "MANIFEST.json")))["note"])

    def test_graphs_only(self):
        p, out = self.make_zip()
        m = stage(p, out, "graphs", reserve_gb=0, log=lambda *_: None)
        self.assertEqual(m["files"], 4)
        self.assertFalse(os.path.exists(os.path.join(out, ROOT, "train", "struct_in")))

    def test_a_path_that_leaves_the_folder_is_refused(self):
        with self.assertRaises(ValueError):
            safe_target("/data/out", "../../etc/passwd")
        with self.assertRaises(ValueError):
            safe_target("/data/out", "x/../../evil")
        self.assertTrue(safe_target("/data/out", f"{ROOT}/train/full_out/1.npy").replace("\\", "/").endswith("full_out/1.npy"))

    def test_a_wrong_checksum_stops_the_transfer(self):
        p, out = self.make_zip()
        with self.assertRaises(SystemExit):
            stage(p, out, "all", reserve_gb=0, expected_sha256="0" * 64, log=lambda *_: None)


if __name__ == "__main__":
    unittest.main()
