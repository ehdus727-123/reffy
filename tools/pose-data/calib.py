import json, numpy as np, sys
sys.path.insert(0, '.')
from convert import MP, main_person
ph = json.load(open('../../reffy-web/static/pose/photos.json'))
f = np.fromfile('../../reffy-web/static/pose/landmarks.dat', dtype=np.float32).reshape(-1, 33, 7)
idx = {p[0]: i for i, p in enumerate(ph)}
raw = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'out/raw.json'))
X, Y = [], []   # (rt features, mp target)
for r in raw:
    if not r.get('people'): continue
    p = main_person(r['people'], r['w'], r['h'])
    if not p: continue
    mpw = f[idx[r['pid']], :, 3:6]; vis = f[idx[r['pid']], :, 6]
    k3 = np.array(p['k3']); k2 = np.array(p['k2'])
    hip2 = (k2[11] + k2[12]) / 2; sh2 = (k2[5] + k2[6]) / 2; t2 = np.linalg.norm(sh2 - hip2)
    hip3 = (k3[11] + k3[12]) / 2; sh3 = (k3[5] + k3[6]) / 2; t3 = np.linalg.norm(sh3[:2] - hip3[:2])
    mh = (mpw[23] + mpw[24]) / 2; ms = (mpw[11] + mpw[12]) / 2; mt = np.linalg.norm(ms - mh)
    for i, j in enumerate(MP):
        if i in (0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28) and vis[i] > 0.6:
            rx = (k2[j][0] - hip2[0]) / t2; ry = -(k2[j][1] - hip2[1]) / t2
            rz3 = (k3[j][2] - hip3[2])                       # 모델 z
            rx3 = (k3[j][0] - hip3[0]) / t3; ry3 = -(k3[j][1] - hip3[1]) / t3
            m = (mpw[i] - mh) / mt
            X.append([rx, ry, rz3, rx3, ry3]); Y.append(m)
X = np.array(X); Y = np.array(Y)
print('n', len(X))
for a, name in ((0, 'x2d'), (3, 'x3d')):
    print(name, 'corr with mp x', np.corrcoef(X[:, a], Y[:, 0])[0, 1].round(3))
print('y2d corr', np.corrcoef(X[:, 1], Y[:, 1])[0, 1].round(3))
c = np.corrcoef(X[:, 2], Y[:, 2])[0, 1]; k = np.linalg.lstsq(X[:, 2:3], Y[:, 2], rcond=None)[0][0]
print('z corr', round(c, 3), 'k', round(k, 3))
# x/y scale: mp/rt
print('x scale', np.linalg.lstsq(X[:, 0:1], Y[:, 0], rcond=None)[0][0].round(3), 'y scale', np.linalg.lstsq(X[:, 1:2], Y[:, 1], rcond=None)[0][0].round(3))
