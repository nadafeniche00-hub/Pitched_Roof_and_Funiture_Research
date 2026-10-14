#!/usr/bin/env python3
"""Read-only string extractor for Revit (.rvt / .rfa) files - no Revit needed.

A Revit file is an OLE compound file. Element data lives in `Partitions/*` streams as gzip members
(8-byte prefix, 10-byte gzip header, raw deflate). Names of families, types, materials, rooms and views
are stored as UTF-16LE strings inside them. We cannot recover geometry or parameters this way - only names
and how often they occur - which is enough to inventory furniture families, materials, spaces and views.

usage: extract_rvt.py <file.rvt> <out.json> [--max-partition-mb 400]
"""
import argparse, collections, json, re, sys, time, zlib

try:
    import olefile
except ImportError:  # pragma: no cover
    sys.exit('pip install olefile')

MAGIC = b'\x1f\x8b\x08\x00'
UTF16 = re.compile(rb'(?:[\x20-\x7e\xa0-\xff]\x00){5,90}')


def basic_info(o):
    if not o.exists('BasicFileInfo'):
        return {}
    b = o.openstream('BasicFileInfo').read()
    txt = [m.decode('utf-16le', 'ignore') for m in re.findall(rb'(?:[\x20-\x7e\xa0-\xff]\x00){4,}', b)]
    info = {}
    for t in txt:
        if ':' in t and len(t) < 300:
            k, _, v = t.partition(':')
            info.setdefault(k.strip(), v.strip())
    info['_raw'] = txt[:12]
    return info


def transmission(o):
    """Linked files (Revit links, CAD links, keynote tables...). The stream is UTF-16 behind a 4-byte length."""
    if not o.exists('TransmissionData'):
        return []
    raw = o.openstream('TransmissionData').read()
    utf16 = raw[4:6] == b'<' + bytes(1)
    txt = raw[4:].decode('utf-16le', 'ignore') if utf16 else raw.decode('utf-8', 'ignore')
    out, seen = [], set()
    for blk in re.findall(r'<ExternalFileReference>(.*?)</ExternalFileReference>', txt, re.S):
        g = lambda tag: (re.search(rf'<{tag}>(.*?)</{tag}>', blk, re.S) or [None, ''])[1]
        path = g('LastSavedAbsolutePath') or g('LastSavedPath')
        if path in seen:
            continue
        seen.add(path)
        out.append({'type': g('ExternalFileReferenceType'), 'path': path, 'state': g('LastSavedLoadState'),
                    'name': re.split(r'[\\/]', path)[-1]})
    return out


def scan(o, max_mb):
    counts = collections.Counter()
    stats = {}
    t0 = time.time()
    for n in o.listdir(streams=True, storages=False):
        p = '/'.join(n)
        if not p.startswith('Partitions/') or o.get_size(p) > max_mb * 1e6:
            continue
        raw = o.openstream(p).read()
        i, members = raw.find(MAGIC), 0
        while i >= 0:
            try:
                d = zlib.decompressobj(-15)
                data = d.decompress(raw[i + 10:i + 10 + 64_000_000])
                members += 1
                for m in UTF16.findall(data):
                    counts[m.decode('utf-16le', 'ignore').strip()] += 1
                used = min(len(raw) - (i + 10), 64_000_000) - len(d.unused_data)
                i = raw.find(MAGIC, i + 10 + max(used, 1))
            except Exception:
                i = raw.find(MAGIC, i + 4)
        stats[p] = {'bytes': len(raw), 'members': members}
        print(f'{p}: {members} members ({time.time() - t0:.0f}s)', file=sys.stderr, flush=True)
    return counts, stats


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('rvt')
    ap.add_argument('out')
    ap.add_argument('--max-partition-mb', type=float, default=400)
    a = ap.parse_args()
    o = olefile.OleFileIO(a.rvt)
    if a.max_partition_mb == 0:  # links / file info only
        json.dump({'file': a.rvt.replace('\\', '/').split('/')[-1], 'info': basic_info(o), 'external_refs': transmission(o)},
                  open(a.out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        sys.exit(0)
    counts, stats = scan(o, a.max_partition_mb)
    json.dump({
        'file': a.rvt.replace('\\', '/').split('/')[-1],
        'info': basic_info(o),
        'external_refs': transmission(o),
        'partitions': stats,
        'strings': counts.most_common(60000),
    }, open(a.out, 'w', encoding='utf8'), ensure_ascii=False)
    print('strings:', len(counts), file=sys.stderr)
