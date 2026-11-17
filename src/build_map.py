"""
AidGap - Step 8: build the world map for the dashboard.

Reads  data/raw/geo/countries.geo.json   (world country outlines, by ISO3 code)
Writes dashboard/map.js                  (compact SVG paths, one per country)

The Equal Earth projection is used because it keeps country AREAS true to size,
so Sudan doesn't look smaller than it is and the map doesn't exaggerate Europe.

Run once (the map never changes):
    python src/build_map.py
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "raw" / "geo" / "countries.geo.json"
OUT = ROOT / "dashboard" / "map.js"

WIDTH = 1000
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796


def equal_earth(lon: float, lat: float) -> tuple[float, float]:
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(math.sqrt(3) / 2 * math.sin(phi))
    t2, t6 = th * th, th ** 6
    x = 2 * math.sqrt(3) * lam * math.cos(th) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


def rings_of(geom: dict):
    """Yield every ring (list of [lon, lat]) of a Polygon / MultiPolygon."""
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    else:
        polys = geom["coordinates"]
    for poly in polys:
        for ring in poly:
            yield ring


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    feats = [f for f in data["features"] if f.get("id") not in (None, "-99", "ATA")]

    # 1) project everything, find the overall bounds
    projected = {}
    xs, ys = [], []
    for f in feats:
        rings = [[equal_earth(lon, lat) for lon, lat in ring] for ring in rings_of(f["geometry"])]
        projected[f["id"]] = (f["properties"].get("name", f["id"]), rings)
        for ring in rings:
            for x, y in ring:
                xs.append(x); ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    scale = WIDTH / (x1 - x0)
    height = round((y1 - y0) * scale)

    def to_px(p):
        return round((p[0] - x0) * scale, 1), round((y1 - p[1]) * scale, 1)

    # 2) turn each country into one SVG path string
    paths, names, marks = {}, {}, {}
    for iso, (name, rings) in projected.items():
        d, best = [], None
        for ring in rings:
            pts = []
            for p in map(to_px, ring):
                if not pts or p != pts[-1]:        # drop repeated points
                    pts.append(p)
            if len(pts) < 4:
                continue
            bx = [p[0] for p in pts]; by = [p[1] for p in pts]
            w, h = max(bx) - min(bx), max(by) - min(by)
            if w * h < 1.0 and len(rings) > 1:      # skip specks of island
                continue
            d.append("M" + "L".join(f"{x:g},{y:g}" for x, y in pts) + "Z")
            if best is None or w * h > best[0]:
                best = (w * h, (min(bx) + max(bx)) / 2, (min(by) + max(by)) / 2)
        if d and best:
            paths[iso] = "".join(d)
            names[iso] = name
            marks[iso] = [round(best[1], 1), round(best[2], 1), round(best[0])]

    payload = {"width": WIDTH, "height": height, "paths": paths, "names": names, "marks": marks}
    OUT.write_text("window.AIDGAP_MAP = " + json.dumps(payload, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(paths)} countries, {WIDTH}x{height}, {kb:.0f} KB")


if __name__ == "__main__":
    main()
