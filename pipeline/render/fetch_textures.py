"""Download the CC0 textures and the sky for the realistic renders (Poly Haven, https://polyhaven.com, public domain / CC0).

    .venv\\Scripts\\python pipeline\\render\\fetch_textures.py

Each texture gets a folder pipeline/render/textures/<id>/ with diff.jpg, nor.jpg (OpenGL normals), rough.jpg and ao.jpg; the sky goes to
pipeline/render/textures/sky.hdr. Existing files are kept. CREDITS.md lists what was downloaded (CC0 needs no credit, we give it anyway).
"""
import json
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "textures"
API = "https://api.polyhaven.com/files/"
# slot -> (Poly Haven id, resolution)
TEXTURES = {
    "roof_clay": ("clay_roof_tiles_02", "2k"),
    "roof_grey": ("grey_roof_tiles_02", "1k"),
    "wall_plaster": ("beige_wall_001", "2k"),
    "wall_white": ("white_plaster_02", "1k"),
    "timber": ("weathered_brown_planks", "1k"),
    "floor_wood": ("wood_floor", "1k"),
    "furniture_wood": ("oak_veneer_01", "1k"),
    "ground_forest": ("forrest_ground_01", "2k"),
    "ground_grass": ("aerial_grass_rock", "1k"),
    "bark": ("bark_brown_02", "1k"),
}
MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough", "AO": "ao"}
SKY = ("kloofendal_48d_partly_cloudy_puresky", "1k")


def get(url, dest):
    if dest.exists() and dest.stat().st_size > 1000:
        return dest.stat().st_size
    req = urllib.request.Request(url, headers={"User-Agent": "usable-space-render/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        data = r.read()
        f.write(data)
    return len(data)


def means():
    """mean linear colour of every diffuse and AO map -> textures/means.json; the Blender script uses it to bring each texture to a chosen albedo"""
    import numpy as np
    from PIL import Image

    def lin(c):
        c = c / 255.0
        return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

    res = {}
    for d in sorted(p for p in OUT.iterdir() if p.is_dir()):
        row = {}
        for key, fn in (("diff", "diff.jpg"), ("ao", "ao.jpg")):
            if (d / fn).exists():
                a = np.asarray(Image.open(d / fn).convert("RGB").resize((256, 256)), dtype=np.float32)
                row[key] = [round(float(v), 4) for v in lin(a).mean(axis=(0, 1))]
        res[d.name] = row
    (OUT / "means.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"means.json: {len(res)} texture sets")


def main():
    if "--means" in sys.argv:
        return means()
    OUT.mkdir(parents=True, exist_ok=True)
    credits = ["# Textures and sky", "", "All from Poly Haven (https://polyhaven.com), licence CC0 (public domain).", ""]
    total = 0
    for slot, (pid, res) in TEXTURES.items():
        files = json.loads(urllib.request.urlopen(urllib.request.Request(API + pid, headers={"User-Agent": "usable-space-render/1.0"}), timeout=60).read())
        d = OUT / slot
        d.mkdir(exist_ok=True)
        for api_name, short in MAPS.items():
            try:
                url = files[api_name][res]["jpg"]["url"]
            except KeyError:
                print(f"  {slot}: no {api_name} at {res}")
                continue
            total += get(url, d / f"{short}.jpg")
        (d / "source.json").write_text(json.dumps({"id": pid, "resolution": res, "page": f"https://polyhaven.com/a/{pid}"}), encoding="utf-8")
        credits.append(f"- {slot}: [{pid}](https://polyhaven.com/a/{pid}) ({res})")
        print(f"{slot:16} {pid} {res}  ok", flush=True)
    files = json.loads(urllib.request.urlopen(urllib.request.Request(API + SKY[0], headers={"User-Agent": "usable-space-render/1.0"}), timeout=60).read())
    total += get(files["hdri"][SKY[1]]["hdr"]["url"], OUT / "sky.hdr")
    credits.append(f"- sky: [{SKY[0]}](https://polyhaven.com/a/{SKY[0]}) HDRI ({SKY[1]})")
    (OUT / "CREDITS.md").write_text("\n".join(credits) + "\n", encoding="utf-8")
    print(f"done, {total / 1e6:.1f} MB downloaded this run")
    means()  # the render script needs textures/means.json


if __name__ == "__main__":
    sys.exit(main())
