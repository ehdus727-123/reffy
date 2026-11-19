import json, numpy as np, sys
from convert import MP, main_person
ph = json.load(open('../../reffy-web/static/pose/photos.json'))
f = np.fromfile('../../reffy-web/static/pose/landmarks.dat', dtype=np.float32).reshape(-1, 33, 7)
idx = {p[0]: i for i, p in enumerate(ph)}
raw = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'out/raw.json'))
B = [(11, 13), (13, 15), (12, 14), (14, 16), (23, 25), (25, 27), (24, 26), (26, 28)]
def cv(vals): v = np.array(vals); return np.std(v) / np.mean(v)
rows = []
for r in raw:
    if not r.get('people'): continue
    p = main_person(r['people'], r['w'], r['h'])
    if not p: continue
    k3 = np.array(p['k3']); k2 = np.array(p['k2']); s = np.array(p['s'])
    i = idx[r['pid']]; mpw = f[i, :, 3:6]; vis = f[i, :, 6]
    rows.append((k3, k2, s, mpw, vis))
def rt_world(k3, k2, zk):
    hip2 = (k2[11] + k2[12]) / 2; sh2 = (k2[5] + k2[6]) / 2; t2 = np.linalg.norm(sh2 - hip2)
    hip3 = (k3[11] + k3[12]) / 2
    W = np.zeros((33, 3))
    for i, j in enumerate(MP):
        W[i] = [(k2[j][0] - hip2[0]) / t2 * 0.5, -(k2[j][1] - hip2[1]) / t2 * 0.5, -(k3[j][2] - hip3[2]) * zk]
    return W
def score(zk):
    lens = {b: [] for b in B}
    for k3, k2, s, mpw, vis in rows:
        W = rt_world(k3, k2, zk)
        torso = np.linalg.norm((W[11] + W[12]) / 2 - (W[23] + W[24]) / 2)
        for a, b in B:
            ja, jb = MP[a], MP[b]
            if min(s[ja], s[jb]) > 0.5: lens[(a, b)].append(np.linalg.norm(W[a] - W[b]) / torso)
    return np.mean([cv(v) for v in lens.values() if len(v) > 5])
for zk in (0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0):
    print('zk', zk, round(score(zk), 3))
lens = {b: [] for b in B}
for k3, k2, s, mpw, vis in rows:
    torso = np.linalg.norm((mpw[11] + mpw[12]) / 2 - (mpw[23] + mpw[24]) / 2)
    for a, b in B:
        if min(vis[a], vis[b]) > 0.5: lens[(a, b)].append(np.linalg.norm(mpw[a] - mpw[b]) / torso)
print('mediapipe world', round(np.mean([cv(v) for v in lens.values() if len(v) > 5]), 3))
