"""RTMW3D 추출 결과(raw.json) → pose-search 형식 landmarks.dat (photos.json 과 같은 순서, 33점 × 7)
사람을 못 찾은 사진은 기존 MediaPipe 값을 그대로 둡니다.
사용: python build_dat.py out/raw.json ../../reffy-web/static/pose/landmarks.dat
"""
import json, sys, numpy as np
from convert import MP, main_person
ZK = 0.5   # 모델 z(미터) → 몸통 0.5 단위 (뼈 길이 일관성이 가장 좋은 값, calib/bones.py 로 확인)
ph = json.load(open('../../reffy-web/static/pose/photos.json'))
dst = sys.argv[2]
old = np.fromfile(dst, dtype=np.float32).reshape(-1, 33, 7)
raw = {r['pid']: r for r in json.load(open(sys.argv[1]))}
out = old.copy(); used = 0
for i, p in enumerate(ph):
    r = raw.get(p[0])
    if not r or not r.get('people'): continue
    m = main_person(r['people'], r['w'], r['h'])
    if not m: continue
    W, H = r['w'], r['h']
    k3 = np.array(m['k3']); k2 = np.array(m['k2']); s = np.array(m['s'])
    hip2 = (k2[11] + k2[12]) / 2; t2 = np.linalg.norm((k2[5] + k2[6]) / 2 - hip2) + 1e-6
    hip3 = (k3[11] + k3[12]) / 2
    for a, j in enumerate(MP):
        wx = (k2[j][0] - hip2[0]) / t2 * 0.5
        wy = -(k2[j][1] - hip2[1]) / t2 * 0.5
        wz = -(k3[j][2] - hip3[2]) * ZK
        nz = wz * (t2 / 0.5) / W
        out[i, a] = [k2[j][0] / W, k2[j][1] / H, nz, wx, wy, wz, min(1.0, max(0.0, float(s[j])))]
    used += 1
out.astype(np.float32).tofile(dst)
print('rtmw3d', used, '/', len(ph))
