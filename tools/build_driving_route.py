"""Build racing/route.json from this model's authored main-road cross sections.

Requires numpy, scipy, trimesh and rtree. The atlas layout is model-specific;
continuity guards reject unrelated or remeshed input rather than guessing a route.
"""
import json
from pathlib import Path

import numpy as np
import trimesh
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
scene = trimesh.load(ROOT / 'sonoma-raceway.glb', force='scene')
road = scene.geometry['road_main']
vertices, uv = road.vertices, road.visual.uv
atlas_row = np.mod(uv[:, 1], 0.046875)

# Every road row has a center and two asphalt edges, plus sloping shoulders.
centers = vertices[np.abs(atlas_row - 0.0234375) < 1e-6]
points, seen = [], set()
for vertex in centers:
    key = tuple(np.round(vertex, 3))
    if key not in seen:
        points.append(vertex)
        seen.add(key)
points = np.array(points)
if np.linalg.norm(points[-1] - points[0]) < 0.1:
    points = points[:-1]
lengths = np.linalg.norm(np.roll(points, -1, axis=0) - points, axis=1)
if not (4000 < lengths.sum() < 4300 and lengths.max() < 2.1):
    raise ValueError('Unexpected road topology or atlas: route requires manual review')
start = np.argmin(np.linalg.norm(points[:, [0, 2]] - [300, -20], axis=1))
points = np.roll(points, -start, axis=0)
edge_a = vertices[np.abs(atlas_row - 0.00258094) < 1e-6]
edge_b = vertices[np.abs(atlas_row - 0.04429406) < 1e-6]
_, a = cKDTree(edge_a[:, [0, 2]]).query(points[:, [0, 2]])
_, b = cKDTree(edge_b[:, [0, 2]]).query(points[:, [0, 2]])
route = {
    'units': 'metres',
    'basis': 'Y up, X east, Z south; vehicle +Z forward, +X left',
    'source': 'road_main cross-section vertices from sonoma-raceway.glb',
    'halfWidth': 6.5,
    'points': np.round(points, 4).tolist(),
    'edgeA': np.round(edge_a[a], 4).tolist(),
    'edgeB': np.round(edge_b[b], 4).tolist(),
}
# Use the rounded runtime points for repeatable sampling of runoff and barriers.
points = np.array(route['points'])
tangent = np.roll(points, -1, axis=0) - points
horizontal = tangent.copy()
horizontal[:, 1] = 0
horizontal /= np.linalg.norm(horizontal, axis=1)[:, None]
left = np.column_stack([horizontal[:, 2], np.zeros(len(points)), -horizontal[:, 0]])
terrain = np.unique(scene.geometry['terrain'].vertices, axis=0)
height_at = LinearNDInterpolator(terrain[:, [0, 2]], terrain[:, 1])
for sign, name in [(1, 'runoffA'), (-1, 'runoffB')]:
    samples = points + left * 10 * sign
    height = height_at(samples[:, [0, 2]])
    height = np.where(np.isfinite(height), height, points[:, 1])
    route[name] = np.round(height, 4).tolist()

barriers = []
for node in scene.graph.nodes_geometry:
    matrix, name = scene.graph[node]
    if name.startswith(('bar_guardrail', 'bar_pitwall', 'bar_outerwall', 'bar_dragwall')):
        mesh = scene.geometry[name].copy()
        mesh.apply_transform(matrix)
        barriers.append(mesh)
if not barriers:
    raise ValueError('No expected barrier meshes were found')
barrier = trimesh.util.concatenate(barriers)
for sign, name in [(1, 'limitLeft'), (-1, 'limitRight')]:
    distance = np.full(len(points), 11.7)
    for height in [0.45, 0.8, 1.1]:
        origins = points + [0, height, 0]
        locations, indices, _ = barrier.ray.intersects_location(
            origins, left * sign, multiple_hits=False
        )
        distance[indices] = np.minimum(
            distance[indices], np.linalg.norm(locations - origins[indices], axis=1)
        )
    route[name] = np.round(np.clip(distance - 1.2, 4.5, 10.5), 3).tolist()

output = ROOT / 'racing' / 'route.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(route, separators=(',', ':')))
print(f'Wrote {len(points)} cross sections, {lengths.sum():.2f} m: {output}')
