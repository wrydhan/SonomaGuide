"""Build a top-down Sonoma Raceway reference map from OpenStreetMap + elevation data.

Usage: python build_reference.py OSM_JSON OUT_DIR
Writes OUT_DIR/reference-map.png and OUT_DIR/track-data.json.
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

osm_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
elements = json.loads(osm_path.read_text())["elements"]

LAT0, LON0 = 38.1610, -122.4550
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))


def to_xy(geom):
    return np.array([((g["lon"] - LON0) * M_PER_DEG_LON, (g["lat"] - LAT0) * M_PER_DEG_LAT) for g in geom])


raceways = [e for e in elements if e.get("tags", {}).get("highway") == "raceway"]
buildings = [e for e in elements if "building" in e.get("tags", {})]

# Elevation for every raceway vertex (Open-Meteo, Copernicus 90 m DEM), in batches of 100.
points = [(g["lat"], g["lon"]) for e in raceways for g in e["geometry"]]
elev = []
for i in range(0, len(points), 100):
    chunk = points[i : i + 100]
    url = "https://api.open-meteo.com/v1/elevation?latitude={}&longitude={}".format(
        ",".join(f"{p[0]:.6f}" for p in chunk), ",".join(f"{p[1]:.6f}" for p in chunk)
    )
    with urllib.request.urlopen(url, timeout=30) as r:
        elev += json.load(r)["elevation"]
elev = np.array(elev)
lo, hi = elev.min(), elev.max()

fig, ax = plt.subplots(figsize=(16, 12), dpi=128)
fig.patch.set_facecolor("#d9c79a")  # dry summer grass
ax.set_facecolor("#d9c79a")
for b in buildings:
    xy = to_xy(b["geometry"])
    ax.fill(xy[:, 0], xy[:, 1], color="#8a8a8a", ec="#555", lw=0.6)

cmap = plt.get_cmap("viridis")
k = 0
ways = []
for e in raceways:
    xy = to_xy(e["geometry"])
    z = elev[k : k + len(xy)]
    k += len(xy)
    name = e["tags"].get("name", "")
    main = name.startswith("Sonoma Raceway")
    width = 5.0 if main else 2.2
    if name == "Dragstrip":
        ax.plot(xy[:, 0], xy[:, 1], color="#333", lw=4, solid_capstyle="butt")
    elif name == "Pit Road":
        ax.plot(xy[:, 0], xy[:, 1], color="#666", lw=2.5, ls="--")
    else:
        for a, b, za, zb in zip(xy[:-1], xy[1:], z[:-1], z[1:]):
            ax.plot([a[0], b[0]], [a[1], b[1]], color=cmap(((za + zb) / 2 - lo) / (hi - lo)), lw=width, solid_capstyle="round")
    ways.append({"osmId": e["id"], "name": name, "xyMetres": xy.round(1).tolist(), "elevationMetres": z.round(1).tolist()})

sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(lo, hi))
cb = fig.colorbar(sm, ax=ax, shrink=0.6, pad=0.01)
cb.set_label("Track elevation (m above sea level)")
ax.set_aspect("equal")
ax.set_title("Sonoma Raceway — top-down layout (north up), track coloured by elevation", fontsize=14)
ax.set_xlabel("metres east")
ax.set_ylabel("metres north")
ax.grid(color="#00000018")
fig.tight_layout()
fig.savefig(out_dir / "reference-map.png")

(out_dir / "track-data.json").write_text(
    json.dumps(
        {
            "source": "OpenStreetMap contributors (ODbL); elevation from Open-Meteo / Copernicus DEM GLO-90",
            "origin": {"lat": LAT0, "lon": LON0},
            "elevationRangeMetres": [round(float(lo), 1), round(float(hi), 1)],
            "ways": ways,
        },
        indent=1,
    )
)
print(f"{len(raceways)} raceway ways, {len(buildings)} buildings, elevation {lo:.0f}-{hi:.0f} m")
