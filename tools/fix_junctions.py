"""Repair the places where branch roads meet the main circuit, editing the GLB in place.

Usage: python fix_junctions.py IN.glb OUT.glb REPORT.json

Each branch road (alternate layouts, pit lane, drag strip, access road) is an open ribbon whose
two cut ends should sit on the road they join. For every such end this script:
  1. slides end corners that fall short of the partner road onto it (closing unpaved wedges),
     tapering that horizontal move back along the branch;
  2. brings the end to the partner's height, matching cross-fall across the width, and blends
     that change back along the branch at no more than GRADE;
  3. at the mouth, meets the main circuit's edge flush and tucks anything overlapping the main
     circuit just under its surface, so the main asphalt and its edge line stay continuous.
Around each moved branch:
  - kerbs, walls, guardrails and trackside pieces copy the branch's own movement;
  - terrain under the branch sits just below it and buries the branch's sloped sides, then eases
    back to the original ground; ground beside the main circuit keeps its height;
  - trees, tyre stacks and other placed copies are re-grounded on the new terrain.
The main circuit, buildings, materials, UVs and node names are unchanged.
Distances along a branch follow its surface (geodesic), so curved branches blend along their length.
Coordinates are the GLB's own: metres, x east, y up, z south.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

OFFSET = 0.005  # m a branch end sits above a non-main road it joins (none at present)
SINK = 0.03  # m branch geometry overlapping the main circuit sits below the main surface
GAP_MARGIN = 0.5  # m a short corner is pushed past the partner's edge
GRADE = 0.08  # steepest blend slope for a height change
MIN_BLEND, MAX_BLEND = 25.0, 90.0  # m, height blend length limits
MIN_SLIDE, MAX_SLIDE = 25.0, 60.0  # m, horizontal taper length limits
FREE_END = 3.0  # m; an end farther than this from every road is a deliberate dead end
FLUSH_INNER, FLUSH_OUTER = 0.3, 4.0  # m from the main edge: branch matches its height, then eases off
ROAD_CLEARANCE = 0.12  # m terrain stays below a road surface above it
SIDE_BURY = 0.04  # m below the road edge that terrain rises to under a branch's sloped sides
FIELD_INNER, FIELD_OUTER = 2.0, 24.0  # m beyond a moved branch: ground follows fully, then not at all
FOLLOW_OUTER = 15.0  # m from a moved branch within which kerbs, walls and trackside pieces are updated
MAIN_KEEP_INNER, MAIN_KEEP_OUTER = 1.5, 4.0  # m from the main circuit edge: nothing moves, then free
ROADSIDE = 10.0  # m beside a road within which raised terrain may not rise above that road
DROP = {"road_alt_t7_link"}  # a short duplicate piece stacked on road_alt_t7_cut
# The drag strip already overlapped the main circuit along a long stretch: tuck and flush it
# along its whole length, and do not slide its end (that bent it into a funnel).
WHOLE_LENGTH_MOUTH = {"road_drag_strip", "road_pit_lane"}
NO_SLIDE = {"road_drag_strip"}
# Roads that run alongside the main circuit rather than meeting it at an angle: their 3 m triangles
# cross its edge at a shallow angle, so they tuck deeper and sit just below its edge beside it.
LONG_OVERLAP = {"road_drag_strip", "road_pit_lane"}
DEEP_SINK, EDGE_DROP = 0.10, 0.02  # m
LONG_FLUSH_INNER, LONG_FLUSH_OUTER = 2.5, 6.0  # m from the main edge for those roads
# Painted dashes that would cross onto the main circuit are removed so the line stops at its edge.
DASHED_LINES = {"trackside_drag_centreline"}
EDGE_CLEAR = 2.0  # m beside any road edge within which changed terrain may not rise above that edge
MAIN = "road_main"
FIXED_PREFIXES = ("road_", "buildings_", "grandstands_", "bld_", "base_", "terrain")

COMPONENTS = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


class Glb:
    def __init__(self, path):
        data = Path(path).read_bytes()
        json_len = struct.unpack_from("<I", data, 12)[0]
        self.json = json.loads(data[20 : 20 + json_len])
        bin_start = 20 + json_len
        bin_len = struct.unpack_from("<I", data, bin_start)[0]
        self.bin = bytearray(data[bin_start + 8 : bin_start + 8 + bin_len])

    def _view(self, index):
        acc = self.json["accessors"][index]
        view = self.json["bufferViews"][acc["bufferView"]]
        assert "byteStride" not in view, "interleaved buffers are not supported"
        offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        return acc, offset

    def read(self, index):
        acc, offset = self._view(index)
        dtype, width = COMPONENTS[acc["componentType"]], WIDTH[acc["type"]]
        arr = np.frombuffer(self.bin, dtype, acc["count"] * width, offset)
        return arr.reshape(acc["count"], width).copy() if width > 1 else arr.copy()

    def write(self, index, values):
        acc, offset = self._view(index)
        raw = np.ascontiguousarray(values, dtype=COMPONENTS[acc["componentType"]]).tobytes()
        self.bin[offset : offset + len(raw)] = raw
        if acc["type"] == "VEC3" and "min" in acc:
            acc["min"] = [float(v) for v in values.min(axis=0)]
            acc["max"] = [float(v) for v in values.max(axis=0)]

    def save(self, path):
        js = json.dumps(self.json, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        bn = bytes(self.bin) + b"\0" * (-len(self.bin) % 4)
        total = 12 + 8 + len(js) + 8 + len(bn)
        out = struct.pack("<III", 0x46546C67, 2, total)
        out += struct.pack("<II", len(js), 0x4E4F534A) + js
        out += struct.pack("<II", len(bn), 0x004E4942) + bn
        Path(path).write_bytes(out)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Prim:
    """One mesh primitive: raw arrays plus a welded copy for topology work."""

    def __init__(self, glb, mesh_index, prim_index):
        prim = glb.json["meshes"][mesh_index]["primitives"][prim_index]
        self.glb, self.prim = glb, prim
        self.pos = glb.read(prim["attributes"]["POSITION"]).astype(np.float64)
        self.nrm = glb.read(prim["attributes"]["NORMAL"]).astype(np.float64) if "NORMAL" in prim["attributes"] else None
        self.faces = glb.read(prim["indices"]).reshape(-1, 3).astype(np.int64)
        keys = np.round(self.pos, 3)
        self.wpos, self.inverse = np.unique(keys, axis=0, return_inverse=True)
        self.inverse = self.inverse.reshape(-1)
        self.wfaces = self.inverse[self.faces]
        self.orig = self.pos.copy()

    def set_welded(self, new_w):
        self.pos = new_w[self.inverse]

    def commit(self):
        """Write positions back and rotate stored normals by the change in face orientation."""
        if self.nrm is not None:
            def face_normals(p):
                return np.cross(p[self.faces[:, 1]] - p[self.faces[:, 0]], p[self.faces[:, 2]] - p[self.faces[:, 0]])
            unit = lambda n: n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            old, new = face_normals(self.orig), face_normals(self.pos)
            # stored normals may follow the opposite winding; measure and match the sign
            sign = np.sign(np.sum(np.repeat(unit(old), 3, axis=0) * self.nrm[self.faces.reshape(-1)])) or 1.0
            delta = (unit(new) - unit(old)) * sign
            area = np.linalg.norm(old, axis=1)
            # accumulate on shared positions so copies split at UV seams turn together
            n_w = len(self.wpos)
            acc = np.zeros((n_w, 3))
            wsum = np.zeros(n_w)
            for k in range(3):
                np.add.at(acc, self.wfaces[:, k], delta * area[:, None])
                np.add.at(wsum, self.wfaces[:, k], area)
            turn = np.where(wsum[:, None] > 0, acc / np.maximum(wsum, 1e-12)[:, None], 0.0)
            self.nrm = unit(self.nrm + turn[self.inverse])
            self.glb.write(self.prim["attributes"]["NORMAL"], self.nrm)
        self.glb.write(self.prim["attributes"]["POSITION"], self.pos)


def top_faces(wpos, wfaces):
    n = np.cross(wpos[wfaces[:, 1]] - wpos[wfaces[:, 0]], wpos[wfaces[:, 2]] - wpos[wfaces[:, 0]])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return np.nonzero(np.abs(n[:, 1]) > 0.9)[0]


def height_below(surface, xz):
    origins = np.column_stack([xz[:, 0], np.full(len(xz), 1e4), xz[:, 1]])
    dirs = np.tile([0.0, -1.0, 0.0], (len(xz), 1))
    locs, idx, _ = surface.ray.intersects_location(origins, dirs, multiple_hits=False)
    h = np.full(len(xz), np.nan)
    if len(idx):
        h[idx] = np.asarray(locs).reshape(-1, 3)[:, 1]
    return h


def edge_distance(surface, xz, y):
    """Horizontal distance to the nearest point of a surface, and that point's height."""
    pts = np.column_stack([xz[:, 0], y, xz[:, 1]])
    closest, _, _ = trimesh.proximity.closest_point(surface, pts)
    return np.linalg.norm((closest - pts)[:, [0, 2]], axis=1), closest[:, 1]


def end_caps(wpos, wfaces, top):
    edges = np.sort(wfaces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1)
    face_of_edge = np.repeat(np.arange(len(wfaces)), 3)
    _, inverse, counts = np.unique(edges, axis=0, return_inverse=True, return_counts=True)
    is_top = np.zeros(len(wfaces), bool)
    is_top[top] = True
    cap_edges = edges[(counts[inverse.reshape(-1)] == 1) & is_top[face_of_edge]]
    if not len(cap_edges):
        return []
    return [np.array(sorted(g)) for g in trimesh.graph.connected_components(cap_edges, min_len=1)]


def geodesic_from(wpos, wfaces, sources):
    edges = np.unique(np.sort(wfaces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1), axis=0)
    length = np.linalg.norm(wpos[edges[:, 0]] - wpos[edges[:, 1]], axis=1)
    n = len(wpos)
    graph = coo_matrix((np.r_[length, length], (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(n, n)).tocsr()
    return dijkstra(graph, indices=sources, min_only=True)


def idw(tree, values, xz, k=6):
    """Inverse-distance interpolation of per-sample values; also returns the nearest-sample distance."""
    dist, idx = tree.query(xz, k=k)
    w = 1.0 / np.maximum(dist, 0.25) ** 2
    out = np.einsum("nk,nk...->n...", w, values[idx]) / w.sum(axis=1).reshape(-1, *([1] * (values.ndim - 1)))
    return out, dist[:, 0]


def boundary_samples(surface, spacing=0.5):
    """Points every `spacing` metres along the open boundary of a surface, as a 2D (x, z) tree."""
    edges = np.sort(surface.faces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1)
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    a, b = surface.vertices[uniq[counts == 1, 0]], surface.vertices[uniq[counts == 1, 1]]
    n = np.maximum(np.ceil(np.linalg.norm(a - b, axis=1) / spacing).astype(int), 1)
    t = np.concatenate([np.arange(k + 1) / k for k in n])
    pts = np.repeat(a, n + 1, axis=0) + (np.repeat(b - a, n + 1, axis=0)) * t[:, None]
    return cKDTree(pts[:, [0, 2]])


def fix_branch_ends(name, r, roads, main_surface, main_edge, report):
    """Per-end slides and height changes for one branch. Returns new welded positions and mouth weights."""
    p = r["prim"]
    fields = []
    for ci, cap in enumerate(end_caps(p.wpos, p.wfaces, r["top"])):
        pts = p.wpos[cap]
        best = None
        for other, o in roads.items():
            if other == name or other in DROP:
                continue
            gaps, _ = edge_distance(o["surface"], pts[:, [0, 2]], pts[:, 1])
            if best is None or np.median(gaps) < best[1]:
                best = (other, float(np.median(gaps)), float(gaps.min()))
        partner, _, nearest = best
        entry = {"road": name, "end": ci, "partner": partner}
        if nearest > FREE_END:
            entry["action"] = "dead end left as is"
            report["ends"].append(entry)
            continue
        surface = roads[partner]["surface"]
        dist = geodesic_from(p.wpos, p.wfaces, cap)
        centre = pts.mean(axis=0)
        ring = (dist > 6) & (dist < 16)
        back = p.wpos[ring].mean(axis=0) if ring.any() else p.wpos[np.argsort(dist)[len(dist) // 2]]
        tangent = (centre - back)[[0, 2]]
        tangent /= np.linalg.norm(tangent)
        lateral = np.array([-tangent[1], tangent[0]])

        # slide corners that fall short onto the partner
        under = height_below(surface, pts[:, [0, 2]])
        slide = np.zeros((len(pts), 2))
        for k in ([] if name in NO_SLIDE else np.nonzero(np.isnan(under))[0]):
            target = pts[k, [0, 2]]
            for _ in range(4):
                closest, _, _ = trimesh.proximity.closest_point(surface, [[target[0], pts[k, 1], target[1]]])
                step = closest[0, [0, 2]] - target
                norm = np.linalg.norm(step)
                target = target + step + (step / norm * GAP_MARGIN if norm > 1e-6 else 0)
                if not np.isnan(height_below(surface, target[None])[0]):
                    break
            slide[k] = target - pts[k, [0, 2]]
        landed = pts[:, [0, 2]] + slide
        target_h = height_below(surface, landed)
        if name in NO_SLIDE:  # corners off the partner take the height of its nearest edge
            missing = np.isnan(target_h)
            if missing.any():
                _, target_h[missing] = edge_distance(surface, landed[missing], pts[missing, 1])
        assert not np.isnan(target_h).any(), f"{name} end {ci}: could not land on {partner}"
        dh = target_h + (-SINK if partner == MAIN else OFFSET) - pts[:, 1]

        u_cap = (pts[:, [0, 2]] - centre[[0, 2]]) @ lateral
        order = np.argsort(u_cap)
        u_all = (p.wpos[:, [0, 2]] - centre[[0, 2]]) @ lateral
        blend = float(np.clip(np.abs(dh).max() / GRADE, MIN_BLEND, MAX_BLEND))
        taper = float(np.clip(4 * np.linalg.norm(slide, axis=1).max(), MIN_SLIDE, MAX_SLIDE))
        fields.append({
            "dh": np.interp(u_all, u_cap[order], dh[order]),
            "sx": np.interp(u_all, u_cap[order], slide[order, 0]),
            "sz": np.interp(u_all, u_cap[order], slide[order, 1]),
            "wh": 1 - smoothstep(0, blend, dist), "ws": 1 - smoothstep(0, taper, dist),
        })
        entry.update({
            "action": "joined",
            "maxSlideM": round(float(np.linalg.norm(slide, axis=1).max()), 2),
            "heightChangeM": [round(float(dh.min()), 3), round(float(dh.max()), 3)],
            "blendM": round(blend, 1), "taperM": round(taper, 1),
        })
        report["ends"].append(entry)

    if not fields:
        return None, None

    def combine(key, wkey):
        # Exact at each end; blends between ends on short branches; fades to zero elsewhere.
        if len(fields) == 1:
            return fields[0][wkey] * fields[0][key]
        a, b = fields[0][wkey], fields[1][wkey]
        alpha = a * (1 - b) / np.maximum(a * (1 - b) + b * (1 - a), 1e-12)
        alpha = np.where((a >= 1) & (b >= 1), 0.5, alpha)
        return np.maximum(a, b) * (alpha * fields[0][key] + (1 - alpha) * fields[1][key])

    new_w = p.wpos + np.column_stack([combine("sx", "ws"), combine("dh", "wh"), combine("sz", "ws")])
    mouth = np.max([np.maximum(f["wh"], f["ws"]) for f in fields], axis=0)
    if name in WHOLE_LENGTH_MOUTH:
        mouth = np.ones_like(mouth)

    # At the mouth, on the drivable top: overlap with the main circuit tucks just under it (exactly
    # 3 cm within 1.5 m of its edge, otherwise only ever downward and out of sight), and top surface
    # beside the main circuit meets its edge flush. The sloped sides keep their shape by moving with
    # their nearest top vertex.
    xz = new_w[:, [0, 2]]
    is_top = np.zeros(len(new_w), bool)
    is_top[np.unique(p.wfaces[r["top"]])] = True
    h_main = height_below(main_surface, xz)
    long_overlap = name in LONG_OVERLAP
    sink, edge_drop = (DEEP_SINK, EDGE_DROP) if long_overlap else (SINK, 0.0)
    flush_inner, flush_outer = (LONG_FLUSH_INNER, LONG_FLUSH_OUTER) if long_overlap else (FLUSH_INNER, FLUSH_OUTER)
    adjust = np.zeros(len(new_w))
    over = ~np.isnan(h_main) & (mouth > 0.05) & is_top
    if over.any():
        inside, _ = main_edge.query(xz[over], k=1)
        tucked = h_main[over] - sink
        adjust[over] = np.where(inside < 1.5, tucked, np.minimum(new_w[over, 1], tucked)) - new_w[over, 1]
    near = np.isnan(h_main) & (mouth > 0.05) & is_top
    if near.any():
        gap, h_edge = edge_distance(main_surface, xz[near], new_w[near, 1])
        adjust[near] = (h_edge - edge_drop - new_w[near, 1]) * (1 - smoothstep(flush_inner, flush_outer, gap))
    top_idx = np.nonzero(is_top)[0]
    d, nearest = cKDTree(xz[top_idx]).query(xz[~is_top], k=1)
    adjust[~is_top] = np.where(d < 3.0, adjust[top_idx[nearest]], 0.0)
    new_w[:, 1] += adjust
    return new_w, mouth


def main(in_path, out_path, report_path):
    glb = Glb(in_path)
    js = glb.json
    mesh_index = {m["name"]: i for i, m in enumerate(js["meshes"])}
    nodes_of = {}
    for ni, node in enumerate(js["nodes"]):
        if "mesh" in node:
            nodes_of.setdefault(node["mesh"], []).append(ni)
    is_placed_once = lambda mi: len(nodes_of.get(mi, [])) == 1 and not any(
        k in js["nodes"][nodes_of[mi][0]] for k in ("translation", "rotation", "scale", "matrix"))

    roads = {}
    for name in (n for n in mesh_index if n.startswith("road_")):
        mi = mesh_index[name]
        assert len(js["meshes"][mi]["primitives"]) == 1 and is_placed_once(mi), name
        p = Prim(glb, mi, 0)
        top = top_faces(p.wpos, p.wfaces)
        roads[name] = {"prim": p, "top": top, "surface": trimesh.Trimesh(p.wpos, p.wfaces[top], process=False)}
    main_surface = roads[MAIN]["surface"]
    main_edge = boundary_samples(main_surface)
    report = {"ends": [], "dropped": sorted(DROP), "meshes": {}}

    # ---- 1. branches ----
    moved = {}
    for name, r in roads.items():
        if name == MAIN or name in DROP:
            continue
        new_w, mouth = fix_branch_ends(name, r, roads, main_surface, main_edge, report)
        if new_w is None:
            continue
        p = r["prim"]
        disp = new_w - p.wpos
        moved[name] = {"old": p.wpos.copy(), "new": new_w, "disp": disp}
        r["new_surface"] = trimesh.Trimesh(new_w, p.wfaces[r["top"]], process=False)
        r["new_full"] = trimesh.Trimesh(new_w, p.wfaces, process=False)
        p.set_welded(new_w)
        report["meshes"][name] = {"maxRaiseM": round(float(disp[:, 1].max()), 2), "maxLowerM": round(float(disp[:, 1].min()), 2),
                                  "maxSlideM": round(float(np.hypot(disp[:, 0], disp[:, 2]).max()), 2)}

    # every branch vertex (moved or not) carries its displacement; zero where a branch did not move
    all_old = np.vstack([m["old"] for m in moved.values()])
    all_disp = np.vstack([m["disp"] for m in moved.values()])
    branch_tree = cKDTree(all_old[:, [0, 2]])
    active = np.linalg.norm(all_disp, axis=1) > 0.01
    active_tree = cKDTree(all_old[active][:, [0, 2]])
    lo = all_old[active][:, [0, 2]].min(axis=0) - FIELD_OUTER
    hi = all_old[active][:, [0, 2]].max(axis=0) + FIELD_OUTER

    def affected(xz, reach):
        mask = np.all((xz >= lo) & (xz <= hi), axis=1)
        if mask.any():
            d, _ = active_tree.query(xz[mask], k=1, distance_upper_bound=reach)
            mask[np.nonzero(mask)[0][~np.isfinite(d)]] = False
        return mask

    def main_keep(xz, y):
        on_main = ~np.isnan(height_below(main_surface, xz))
        gap, _ = edge_distance(main_surface, xz, y)
        return np.where(on_main, 0.0, smoothstep(MAIN_KEEP_INNER, MAIN_KEEP_OUTER, gap))

    new_roads = [r.get("new_surface", r["surface"]) for n, r in roads.items() if n not in DROP]

    # ---- 2. terrain ----
    terrain_mi = mesh_index["terrain"]
    terrain = Prim(glb, terrain_mi, 0)
    t_old = terrain.wpos.copy()
    t_new = t_old.copy()
    txz = t_old[:, [0, 2]]
    cand = np.nonzero(affected(txz, FIELD_OUTER))[0]
    disp_c, dist_c = idw(branch_tree, all_disp, txz[cand])
    reach = 1 - smoothstep(FIELD_INNER, FIELD_OUTER, dist_c)
    t_new[cand, 1] += disp_c[:, 1] * reach * main_keep(txz[cand], t_old[cand, 1])
    # under a moved branch: just below its surface, and up to its edge under its sloped sides
    on_main = ~np.isnan(height_below(main_surface, txz[cand]))
    for name, m in moved.items():
        r = roads[name]
        h_full = height_below(r["new_full"], txz[cand])
        h_top = height_below(r["new_surface"], txz[cand])
        under_top = ~np.isnan(h_top) & ~on_main
        t_new[cand[under_top], 1] = h_top[under_top] - ROAD_CLEARANCE
        under_side = ~np.isnan(h_full) & np.isnan(h_top) & ~on_main
        if under_side.any():
            _, h_edge = edge_distance(r["new_surface"], txz[cand[under_side]], h_full[under_side])
            t_new[cand[under_side], 1] = h_edge - SIDE_BURY
    # raised ground never heaps above a road beside it (unless it already stood higher)
    raised = cand[t_new[cand, 1] > t_old[cand, 1] + 1e-4]
    for s in new_roads:
        if not len(raised):
            break
        gap, h = edge_distance(s, txz[raised], t_old[raised, 1])
        under = ~np.isnan(height_below(s, txz[raised]))
        side = (gap < ROADSIDE) & ~under
        cap = np.maximum(h - ROAD_CLEARANCE, t_old[raised, 1])
        t_new[raised[side], 1] = np.minimum(t_new[raised[side], 1], cap[side])
    # ground right beside a road edge stays below that edge: around the moved branches this includes
    # ground that was never changed but used to sit under a raised branch end
    for s in new_roads:
        gap, h = edge_distance(s, txz[cand], t_new[cand, 1])
        under = ~np.isnan(height_below(s, txz[cand]))
        allowed = h - 0.05
        high = (gap < EDGE_CLEAR) & ~under & (t_new[cand, 1] > allowed)
        t_new[cand[high], 1] = allowed[high]
    # and never pokes through any road surface
    for s in new_roads:
        h = height_below(s, txz[cand])
        poke = ~np.isnan(h) & (t_new[cand, 1] > h - ROAD_CLEARANCE)
        t_new[cand[poke], 1] = h[poke] - ROAD_CLEARANCE
    terrain.set_welded(t_new)
    terrain.commit()
    dy_t = t_new[:, 1] - t_old[:, 1]
    report["meshes"]["terrain"] = {"maxRaiseM": round(float(dy_t.max()), 2), "maxLowerM": round(float(dy_t.min()), 2),
                                   "verticesMoved": int((np.abs(dy_t) > 1e-4).sum())}
    terrain_old_surface = trimesh.Trimesh(t_old, terrain.wfaces, process=False)
    terrain_new_surface = trimesh.Trimesh(t_new, terrain.wfaces, process=False)

    # ---- 3. kerbs, walls, guardrails and other trackside pieces ----
    # Pieces that belong to one branch (its kerbs, the drag strip's markings) copy the movement of the
    # nearest point of that branch's drivable top, so they stay on it without twisting. Everything else
    # only re-grounds on the new terrain, vertically.
    top_trees = {}
    for n in moved:
        top = np.unique(roads[n]["prim"].wfaces[roads[n]["top"]])
        top_trees[n] = (cKDTree(moved[n]["old"][top][:, [0, 2]]), moved[n]["disp"][top])

    def owner(mesh_name):
        if "kerb_alt" in mesh_name:
            return "road_alt_" + mesh_name.split("kerb_alt", 1)[1].rsplit("_C_", 1)[0]
        if mesh_name in ("trackside_drag_centreline", "trackside_drag_finish_markers"):
            return "road_drag_strip"
        return None

    for mi, mesh in enumerate(js["meshes"]):
        name = mesh["name"]
        if name.startswith(FIXED_PREFIXES) or "_main" in name or not is_placed_once(mi):
            continue
        branch = owner(name)
        branch_kerb = branch in top_trees
        for pi in range(len(mesh["primitives"])):
            prim = Prim(glb, mi, pi)
            xz = prim.wpos[:, [0, 2]]
            mask = affected(xz, FOLLOW_OUTER)
            if not mask.any():
                continue
            new_w = prim.wpos.copy()
            if branch_kerb:
                tree, disp = top_trees[branch]
                _, nearest = tree.query(xz[mask], k=1)
                new_w[mask] += disp[nearest]
            else:
                before = height_below(terrain_old_surface, xz[mask])
                after = height_below(terrain_new_surface, xz[mask])
                new_w[mask, 1] += np.nan_to_num(after - before)
            if branch_kerb:  # a kerb end that reaches over the main circuit tucks under it too
                h_main = height_below(main_surface, new_w[:, [0, 2]])
                over = ~np.isnan(h_main)
                new_w[over, 1] = np.minimum(new_w[over, 1], h_main[over] - SINK)
            if name in DASHED_LINES:
                # line vertices on or within 0.5 m of the main circuit slide back along the line
                # until they clear it, so the painted line stops at the main edge
                def touching(pts):
                    gap, _ = main_edge.query(pts[:, [0, 2]], k=1)
                    return ~np.isnan(height_below(main_surface, pts[:, [0, 2]])) | (gap < 0.5)
                hit = touching(new_w)
                if hit.any() and (~hit).any():
                    anchor = new_w[~hit].mean(axis=0)
                    for k in np.nonzero(hit)[0]:
                        back = anchor[[0, 2]] - new_w[k, [0, 2]]
                        back /= np.linalg.norm(back)
                        for _ in range(200):  # up to 50 m, in 25 cm steps
                            if not touching(new_w[k][None])[0]:
                                break
                            new_w[k, [0, 2]] += back * 0.25
            change = np.linalg.norm(new_w - prim.wpos, axis=1)
            if not (change > 1e-4).any():
                continue
            prim.set_welded(new_w)
            prim.commit()
            entry = report["meshes"].setdefault(name, {"maxMoveM": 0.0, "verticesMoved": 0})
            entry["maxMoveM"] = max(entry["maxMoveM"], round(float(change.max()), 2))
            entry["verticesMoved"] += int((change > 1e-4).sum())

    # ---- 4. trees, tyre stacks and other placed copies follow the new ground ----
    for mi, mesh in enumerate(js["meshes"]):
        if is_placed_once(mi) or mesh["name"].startswith(FIXED_PREFIXES):
            continue
        count = 0
        for ni in nodes_of.get(mi, []):
            t = js["nodes"][ni].get("translation")
            if t is None:
                continue
            xz = np.array([[t[0], t[2]]])
            if not affected(xz, FIELD_OUTER).any():
                continue
            before = height_below(terrain_old_surface, xz)[0]
            after = height_below(terrain_new_surface, xz)[0]
            if np.isfinite(before) and np.isfinite(after) and abs(after - before) > 1e-4:
                t[1] += float(after - before)
                count += 1
        if count:
            report["meshes"][mesh["name"]] = {"copiesMoved": count}

    for name in moved:
        roads[name]["prim"].commit()

    # drop the duplicate piece from the scene (prune removes its unused data afterwards)
    drop_meshes = {mesh_index[n] for n in DROP}
    drop_nodes = {ni for ni, node in enumerate(js["nodes"]) if node.get("mesh") in drop_meshes}
    for scene in js["scenes"]:
        scene["nodes"] = [n for n in scene["nodes"] if n not in drop_nodes]

    glb.save(out_path)
    Path(report_path).write_text(json.dumps(report, indent=1))
    for e in report["ends"]:
        print(e)
    for k, v in report["meshes"].items():
        print(k, v)


if __name__ == "__main__":
    main(*sys.argv[1:4])
