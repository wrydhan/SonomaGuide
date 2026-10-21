"""Measure every road end in a Sonoma GLB: how well each one joins the road it meets.

Usage: python check_junctions.py MODEL.glb OUT_DIR
Writes OUT_DIR/junctions.json and OUT_DIR/junctions.png (top-down crop per road end).

Each road mesh is an open ribbon: a flat top band with sloped shoulders. The top band touches
the mesh boundary only at the ribbon's two cut ends, so boundary edges of top faces are the
end caps. For each end cap we find the nearest other road surface and measure:
  gap  - horizontal distance from end-cap vertices that are not over the partner's top surface
  step - height of the end cap above (+) or below (-) the partner's surface where it overlaps
Coordinates are reported in Blender's Z-up frame (x east, y north, z up), metres.
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import trimesh
from matplotlib.collections import PolyCollection

GAP_TOL = 0.10  # m; horizontal gap that is visible from a normal viewing distance
STEP_TOL = 0.05  # m; vertical step that shows as a ledge
TUCK_TOL = 0.15  # m; an end may sit this far under the main circuit, hidden by its surface
FREE_END = 3.0  # m; an end whose nearest vertex is farther than this from any road is a dead end

model_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
scene = trimesh.load(model_path, force="scene")


def welded(name):
    m = scene.geometry[name]
    m = trimesh.Trimesh(m.vertices, m.faces, process=False)
    m.merge_vertices(digits_vertex=3)
    return m


def top_surface(m):
    faces = np.nonzero(np.abs(m.face_normals[:, 1]) > 0.9)[0]
    return faces, m.submesh([faces], append=True)


roads = {}
placed = {scene.graph[n][1] for n in scene.graph.nodes_geometry}  # meshes the scene actually shows
for name in sorted(n for n in placed if n.startswith("road_")):
    m = welded(name)
    faces, top = top_surface(m)
    roads[name] = {"mesh": m, "topFaces": faces, "top": top}


def end_caps(m, top_faces):
    """Chains of boundary edges that belong to top faces, one chain per ribbon end."""
    edges = m.edges_sorted
    uniq, inverse, counts = np.unique(edges, axis=0, return_inverse=True, return_counts=True)
    face_of_edge = np.repeat(np.arange(len(m.faces)), 3)
    is_top = np.zeros(len(m.faces), bool)
    is_top[top_faces] = True
    boundary = counts[inverse] == 1
    cap_edges = edges[boundary & is_top[face_of_edge]]
    if len(cap_edges) == 0:
        return []
    groups = trimesh.graph.connected_components(cap_edges, min_len=1)
    return [np.array(sorted(g)) for g in groups]


def height_below(top, xz):
    """Height of a top surface directly under each (x, z), NaN where there is none."""
    origins = np.column_stack([xz[:, 0], np.full(len(xz), 1e4), xz[:, 1]])
    dirs = np.tile([0.0, -1.0, 0.0], (len(xz), 1))
    locs, idx, _ = top.ray.intersects_location(origins, dirs, multiple_hits=False)
    h = np.full(len(xz), np.nan)
    if len(idx):
        h[idx] = np.asarray(locs).reshape(-1, 3)[:, 1]
    return h


def horizontal_gap(top, pts):
    closest, _, _ = trimesh.proximity.closest_point(top, pts)
    return np.linalg.norm((closest - pts)[:, [0, 2]], axis=1), closest


def to_blender(p):
    return [round(float(p[0]), 1), round(float(-p[2]), 1), round(float(p[1]), 2)]


results = []
for name, r in roads.items():
    m = r["mesh"]
    for cap_index, cap in enumerate(end_caps(m, r["topFaces"])):
        pts = m.vertices[cap]
        centre = pts.mean(axis=0)
        width = float(np.ptp(pts[:, [0, 2]], axis=0).max())
        # Partner: the other road whose top surface comes closest to the cap.
        best = None
        for other, o in roads.items():
            if other == name:
                continue
            gaps, _ = horizontal_gap(o["top"], pts)
            score = float(np.median(gaps))
            if best is None or score < best[1]:
                best = (other, score, float(gaps.min()))
        partner, _, nearest = best
        entry = {
            "road": name,
            "end": cap_index,
            "centre": to_blender(centre),
            "capWidthM": round(width, 1),
            "partner": partner,
        }
        if nearest > FREE_END:
            entry.update({"kind": "free end", "nearestRoadM": round(nearest, 1), "defect": False})
            results.append(entry)
            continue
        top = roads[partner]["top"]
        under = height_below(top, pts[:, [0, 2]])
        over = ~np.isnan(under)
        gaps, _ = horizontal_gap(top, pts)
        gap_off = gaps[~over]
        steps = pts[over, 1] - under[over]
        entry.update(
            {
                "kind": "junction",
                "capVertsOverPartner": int(over.sum()),
                "capVerts": int(len(pts)),
                "maxGapM": round(float(gap_off.max()), 2) if len(gap_off) else 0.0,
                "stepMinM": round(float(steps.min()), 3) if len(steps) else None,
                "stepMaxM": round(float(steps.max()), 3) if len(steps) else None,
            }
        )
        gap_bad = entry["maxGapM"] > GAP_TOL
        below = TUCK_TOL if partner == "road_main" else STEP_TOL
        step_bad = len(steps) and (steps.max() > STEP_TOL or steps.min() < -below)
        entry["defect"] = bool(gap_bad or step_bad)
        entry["problems"] = [p for p, bad in (("gap", gap_bad), ("step", step_bad)) if bad]
        results.append(entry)

junctions = [e for e in results if e["kind"] == "junction"]
summary = {
    "model": model_path.name,
    "tolerances": {"gapM": GAP_TOL, "stepM": STEP_TOL, "freeEndM": FREE_END},
    "roadEnds": len(results),
    "junctions": len(junctions),
    "defects": sum(e["defect"] for e in junctions),
    "ends": results,
}
(out_dir / "junctions.json").write_text(json.dumps(summary, indent=1))

# Contact sheet: top-down crop around every junction, roads coloured by mesh, cap highlighted.
palette = plt.get_cmap("tab20")
colour = {n: palette(i % 20) for i, n in enumerate(roads)}
cols = 4
rows = max(1, -(-len(junctions) // cols))
fig, axes = plt.subplots(rows, cols, figsize=(cols * 4.2, rows * 4.4), dpi=110, squeeze=False)
for ax in axes.flat:
    ax.axis("off")
for ax, e in zip(axes.flat, junctions):
    cx, cy = e["centre"][0], e["centre"][1]
    half = 22.0
    ax.set_facecolor("#c8b78a")
    for n, r in roads.items():
        t = r["top"]
        tri = t.vertices[t.faces][:, :, [0, 2]] * [1, -1]
        keep = np.any((np.abs(tri[:, :, 0] - cx) < half) & (np.abs(tri[:, :, 1] - cy) < half), axis=1)
        if keep.any():
            ax.add_collection(PolyCollection(tri[keep], facecolor=colour[n], edgecolor="none", alpha=0.85))
    ax.set_xlim(cx - half, cx + half)
    ax.set_ylim(cy - half, cy + half)
    ax.set_aspect("equal")
    ax.axis("on")
    ax.set_xticks([])
    ax.set_yticks([])
    status = "OK" if not e["defect"] else "DEFECT: " + ", ".join(e["problems"])
    ax.set_title(
        f"{e['road']} end {e['end']} → {e['partner']}\n"
        f"gap {e['maxGapM']} m, step {e['stepMinM']}…{e['stepMaxM']} m\n{status}",
        fontsize=8,
        color="#a00" if e["defect"] else "#060",
    )
fig.tight_layout()
fig.savefig(out_dir / "junctions.png")
print(json.dumps({k: summary[k] for k in ("roadEnds", "junctions", "defects")}))
for e in results:
    if e["kind"] == "junction":
        flag = "DEFECT" if e["defect"] else "ok    "
        print(f"{flag} {e['road']:22s} end {e['end']} -> {e['partner']:22s} at {e['centre']} gap {e['maxGapM']:5.2f} step {e['stepMinM']}..{e['stepMaxM']}  over {e['capVertsOverPartner']}/{e['capVerts']}")
    else:
        print(f"free   {e['road']:22s} end {e['end']} nearest road {e['nearestRoadM']} m at {e['centre']}")
