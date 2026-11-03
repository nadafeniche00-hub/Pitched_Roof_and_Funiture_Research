"""Stage the training files of the MSD archive (the Kaggle archive.zip) in a folder, for a server: the image tensors (struct_in, full_out: float16, 512 x 512 x 3) and the graphs (graph_in, graph_out).
STAGING ONLY: nothing is trained and no model is started. Standard library only, so it runs on the server as it is (Python 3.8 or later).

  python stage_tensors.py archive.zip /workspace/usable-space/data/msd --dry-run        what would be written, how much disk it takes, how much would be left
  python stage_tensors.py archive.zip /workspace/usable-space/data/msd                 do it (resumable: files that are already complete are skipped)
  options: --what tensors|graphs|all (default all) · --reserve-gb 50 (free space that must stay free for the others on a shared server) · --sha256 <hash of the zip> · --force

The server is shared: the team's language model and the GPU memory are one pool, and the disk is theirs too. So the script looks at the free space first and refuses to go below the reserve.
Paths inside the zip that would leave the target folder ("zip slip") are refused. The graphs are pickles: do not unpickle them with pickle.load; use msd/safe_graphs.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import sys
import time
import zipfile

KINDS = {"tensors": ("struct_in", "full_out"), "graphs": ("graph_in", "graph_out")}


def wanted(name: str, what: str) -> bool:
    parts = name.split("/")
    if len(parts) < 4 or name.endswith("/"):
        return False
    kinds = KINDS["tensors"] + KINDS["graphs"] if what == "all" else KINDS[what]
    return parts[-2] in kinds


def plan(zf: zipfile.ZipFile, what: str):
    members = [i for i in zf.infolist() if wanted(i.filename, what)]
    return members, sum(i.file_size for i in members)


def safe_target(dest: str, name: str) -> str:
    target = os.path.realpath(os.path.join(dest, name))
    if os.path.commonpath([os.path.realpath(dest), target]) != os.path.realpath(dest):
        raise ValueError(f"refused: {name!r} would be written outside {dest}")
    return target


def npy_header(zf: zipfile.ZipFile, name: str) -> dict:
    with zf.open(name) as f:
        head = f.read(512)
    if head[:6] != b"\x93NUMPY":
        return {}
    major = head[6]
    hl = struct.unpack("<H", head[8:10])[0] if major == 1 else struct.unpack("<I", head[8:12])[0]
    off = 10 if major == 1 else 12
    import ast

    return ast.literal_eval(head[off : off + hl].decode("latin1"))


def stage(zip_path: str, dest: str, what: str = "all", reserve_gb: float = 50.0, dry_run: bool = False, force: bool = False, expected_sha256: str | None = None, log=print) -> dict:
    with zipfile.ZipFile(zip_path) as zf:
        members, need = plan(zf, what)
        os.makedirs(dest, exist_ok=True)
        free = shutil.disk_usage(dest).free
        left = free - need
        log(f"{len(members):,} files, {need / 2**30:.2f} GB to write; {free / 2**30:.1f} GB free; {left / 2**30:.1f} GB would be left (reserve {reserve_gb:g} GB)")
        if left < reserve_gb * 2**30 and not force:
            raise SystemExit(f"refused: this would leave less than {reserve_gb:g} GB free on a shared disk (use a bigger disk, stage only the graphs with --what graphs, or lower --reserve-gb if the team agrees)")
        if dry_run:
            return {"dry_run": True, "files": len(members), "bytes": need, "free": free}
        if expected_sha256:
            h = hashlib.sha256()
            with open(zip_path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 24), b""):
                    h.update(chunk)
            if h.hexdigest() != expected_sha256.lower():
                raise SystemExit(f"refused: the zip has sha256 {h.hexdigest()}, not the expected {expected_sha256}: the transfer is damaged")
            log("sha256 of the zip matches")
        t0, written, skipped = time.time(), 0, 0
        counts: dict[str, int] = {}
        for n, info in enumerate(members, 1):
            target = safe_target(dest, info.filename)
            kind = "/".join(info.filename.split("/")[-3:-1])  # split/kind
            counts[kind] = counts.get(kind, 0) + 1
            if os.path.isfile(target) and os.path.getsize(target) == info.file_size:
                skipped += 1
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            tmp = target + ".part"
            with zf.open(info) as src, open(tmp, "wb") as out:  # reading checks the CRC of every member
                shutil.copyfileobj(src, out, 1 << 20)
            os.replace(tmp, target)
            written += 1
            if n % 1000 == 0:
                log(f"  {n:,} of {len(members):,} ({(time.time() - t0):.0f} s)")
        shapes = {}
        for kind in KINDS["tensors"]:
            first = next((i.filename for i in members if i.filename.split("/")[-2] == kind), None)
            if first:
                shapes[kind] = {k: str(v) for k, v in npy_header(zf, first).items()}
    manifest = {
        "source": os.path.basename(zip_path),
        "what": what,
        "files": len(members),
        "bytes": need,
        "written": written,
        "skipped_already_complete": skipped,
        "by_split_and_kind": counts,
        "tensor_format": shapes,
        "staged_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "note": "staged only: nothing is trained on these files. Graphs are pickles: load them with msd/safe_graphs.py, never with pickle.load. The licence of the dataset has not been checked.",
    }
    with open(os.path.join(dest, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    log(f"done: {written:,} written, {skipped:,} already there; MANIFEST.json in {dest}")
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("zip")
    ap.add_argument("dest")
    ap.add_argument("--what", choices=["tensors", "graphs", "all"], default="all")
    ap.add_argument("--reserve-gb", type=float, default=50.0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--sha256")
    a = ap.parse_args()
    stage(a.zip, a.dest, a.what, a.reserve_gb, a.dry_run, a.force, a.sha256)
