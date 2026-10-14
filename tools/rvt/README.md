# Reading names out of Revit files without Revit

`extract_rvt.py` opens a `.rvt` / `.rfa` as an OLE compound file and reads the UTF-16 strings stored in its
gzip-compressed `Partitions/*` streams (8-byte prefix, 10-byte gzip header, raw deflate).

```bash
pip install olefile
python tools/rvt/extract_rvt.py "model.rvt" out.json                 # strings + file info + linked files
python tools/rvt/extract_rvt.py "model.rvt" links.json --max-partition-mb 0   # file info + linked models only (seconds)
```

What you get: Revit version/build/locale, worksharing info, **linked models and CAD links** (the sub-projects),
and every string with its frequency - family names, type names, material names, room names, level names, view names.

What you do not get: geometry, parameters, dimensions, placement, instance counts. `occurrences` is how often a
string appears in the file, not how many instances exist. Dimensions only come through when they are part of a
name ("Iron Table H730, D412", "47cm").

Large models (600 MB+) take several minutes and a few GB of RAM. The output of `extract_rvt.py` is raw; the
curated, translated result is in `data/revit/*.json` (fr -> de / en) and is loaded into SQLite on server start.
