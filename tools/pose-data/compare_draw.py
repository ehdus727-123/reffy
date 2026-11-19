"""같은 사진에 MediaPipe(기존) 와 RTMW3D(새) 관절을 나란히 그려 비교 이미지로 저장"""
import json, sys, numpy as np, requests, cv2
from convert import MP, main_person
ph = json.load(open('../../reffy-web/static/pose/photos.json'))
f = np.fromfile('../../reffy-web/static/pose/landmarks.dat', dtype=np.float32).reshape(-1, 33, 7)
idx = {p[0]: i for i, p in enumerate(ph)}
raw = json.load(open('out/raw.json'))
E = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28), (0, 11), (0, 12)]
def draw(img, pts, vis, col):
    for a, b in E:
        if vis[a] > 0.4 and vis[b] > 0.4:
            cv2.line(img, tuple(map(int, pts[a])), tuple(map(int, pts[b])), col, 3)
    for i in range(33):
        if vis[i] > 0.4: cv2.circle(img, tuple(map(int, pts[i])), 4, col, -1)
tiles = []
for r in raw[:40]:
    if not r.get('people'): continue
    i = idx[r['pid']]
    img = cv2.imdecode(np.frombuffer(requests.get(ph[i][4], timeout=30).content, np.uint8), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    a = img.copy(); b = img.copy()
    n = f[i, :, 0:2] * [W, H]; draw(a, n, f[i, :, 6], (255, 80, 0))
    p = main_person(r['people'], W, H)
    if p:
        k2 = np.array(p['k2']); s = np.array(p['s'])
        draw(b, k2[MP], s[MP], (0, 200, 0))
    t = np.hstack([a, b]); sc = 300 / H; t = cv2.resize(t, (int(t.shape[1] * sc), 300))
    cv2.putText(t, 'MediaPipe', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 80, 0), 2)
    cv2.putText(t, 'RTMW3D', (t.shape[1] // 2 + 8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 0), 2)
    tiles.append(t)
for k in range(0, len(tiles), 8):
    group = tiles[k:k + 8]; w = max(t.shape[1] for t in group)
    group = [cv2.copyMakeBorder(t, 0, 4, 0, w - t.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in group]
    cv2.imwrite(f'out/compare_{k // 8}.jpg', np.vstack(group), [cv2.IMWRITE_JPEG_QUALITY, 70])
print('tiles', len(tiles))
