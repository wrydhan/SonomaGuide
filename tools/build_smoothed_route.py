"""Rebuild the playable smooth profile; requires numpy and scipy. Source GLB stays intact."""
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter1d
root = Path(__file__).resolve().parents[1]
path = root / 'racing' / 'route.json'
data = json.loads(path.read_text())
p = np.array(data['points'], dtype=float)
a, b = np.array(data['edgeA'], dtype=float), np.array(data['edgeB'], dtype=float)
d = np.roll(p, -1, axis=0) - p
length = np.linalg.norm(d[:, [0, 2]], axis=1)
side = ((a[:, 0]-p[:, 0])*d[:, 2]-(a[:, 2]-p[:, 2])*d[:, 0])/length
bank = (a[:, 1]-b[:, 1])/np.where(side > 0, 13, -13)
y = gaussian_filter1d(p[:, 1], 8, mode='wrap')
new_bank = gaussian_filter1d(bank, 5, mode='wrap')
delta = y-p[:, 1]
for edge in [a, b]:
    lateral = ((edge[:, 0]-p[:, 0])*d[:, 2]-(edge[:, 2]-p[:, 2])*d[:, 0])/length
    edge[:, 1] = y+new_bank*lateral
for name, sign in [('runoffA', 1), ('runoffB', -1)]:
    data[name] = np.round(np.array(data[name])+delta+sign*10*(new_bank-bank), 5).tolist()
p[:, 1] = y
for name, values in [('points', p), ('edgeA', a), ('edgeB', b)]:
    data[name] = np.round(values, 5).tolist()
data['smoothing'] = {'method': 'periodic Gaussian elevation sigma 8 cross-sections (~16 m), crossfall sigma 5; continuous Hermite surface', 'maxElevationChangeM': float(np.max(np.abs(delta))), 'originalFile': 'route.json'}
(root/'racing'/'route-smooth.json').write_text(json.dumps(data, separators=(',', ':')))
