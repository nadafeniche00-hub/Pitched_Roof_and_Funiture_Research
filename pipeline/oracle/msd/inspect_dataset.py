"""Look at the dataset files before anything is written against them: names, sizes, and for tables the columns and the first rows. Standard library only; reads, never writes.

The Modified Swiss Dwellings dataset (van Engelenburg et al., ECCV 2024, arXiv:2407.10121; Kaggle "modified-swiss-dwellings", about 5 GB) and ResPlan (arXiv:2508.14006) are training and
reference material here: nothing is trained on them. They calibrate the rules (how small is a real bedroom? how wide is a real door?) and test them (does a rule fire on plans that are real?).
The loader is written after this has shown the real columns: no guessing of a schema.

  python msd/inspect_dataset.py <folder or file> [--rows 3] [--width 90]       (from pipeline/oracle)
"""
from __future__ import annotations

import argparse
import csv
import sys
import zipfile
from pathlib import Path

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))  # geometry columns are long


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return str(n)


def show_csv(path: Path, rows: int, width: int) -> None:
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        rd = csv.reader(f)
        head = next(rd, None)
        if not head:
            print("    (empty)")
            return
        print(f"    {len(head)} columns: {', '.join(head)}")
        for i, row in enumerate(rd):
            if i >= rows:
                break
            print("    row", i + 1, "|", " | ".join((c[:width] + "…") if len(c) > width else c for c in row))


def inspect(target: Path, rows: int, width: int) -> None:
    if not target.exists():
        print(f"{target} does not exist (a download in progress is a .crdownload or .part file: wait for it to end).")
        return
    files = [target] if target.is_file() else sorted(p for p in target.rglob("*") if p.is_file())
    print(f"{len(files)} file(s), {human(sum(p.stat().st_size for p in files))} in {target}")
    for p in files[:60]:
        print(f"  {human(p.stat().st_size):>10}  {p.relative_to(target) if target.is_dir() else p.name}")
        suffix = p.suffix.lower()
        if suffix in (".csv", ".tsv"):
            show_csv(p, rows, width)
        elif suffix == ".zip":
            try:
                with zipfile.ZipFile(p) as z:
                    names = z.namelist()
                    print(f"    zip with {len(names)} entries, first: {', '.join(names[:6])}")
            except zipfile.BadZipFile:
                print("    not a complete zip (still downloading?)")
        elif p.name.endswith((".crdownload", ".part")):
            print("    a download that has not finished: wait for it to end")
    if len(files) > 60:
        print(f"  ... and {len(files) - 60} more")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--width", type=int, default=90)
    a = ap.parse_args()
    inspect(Path(a.path), a.rows, a.width)
