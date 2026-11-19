"""RTMW3D(COCO-WholeBody 133) → MediaPipe Pose 33점 배치로 바꿔 pose-search 와 같은 landmarks.dat 를 만듭니다.
- normalized: 원본 이미지 기준 0~1 (x, y) + 상대 깊이 z
- world: 엉덩이 가운데가 원점, 위가 +y, 카메라 쪽이 +z (pose-search 가 MediaPipe 값을 바꿔 쓰는 것과 같은 방향)
"""
import json, struct, sys
import numpy as np

# MediaPipe 33 ← COCO-WholeBody 133 번호
MP = [0, 23 + 42, 1, 23 + 45, 23 + 39, 2, 23 + 36, 3, 4, 23 + 54, 23 + 48,
      5, 6, 7, 8, 9, 10, 91 + 17, 112 + 17, 91 + 5, 112 + 5, 91 + 2, 112 + 2,
      11, 12, 13, 14, 15, 16, 19, 22, 17, 20]
assert len(MP) == 33


def main_person(people, W, H):
    """가장 크게(가까이) 찍힌 사람 하나 — 몸통 관절 신뢰도가 너무 낮으면 제외"""
    best, area = None, 0
    for p in people:
        s = np.array(p["s"])
        if np.mean(s[[5, 6, 11, 12]]) < 0.3:
            continue
        x0, y0, x1, y1 = p["bbox"]
        a = (x1 - x0) * (y1 - y0)
        if a > area:
            best, area = p, a
    return best


def to_mp(p, W, H, zk=1.0, zsign=1.0):
    """반환: normalized[33][3], world[33][3], vis[33]"""
    k3 = np.array(p["k3"], dtype=np.float64)   # (133,3): x,y = 모델 입력(288x384) 픽셀, z = 미터 스케일
    k2 = np.array(p["k2"], dtype=np.float64)   # (133,2): 원본 픽셀
    s = np.array(p["s"], dtype=np.float64)
    sel = MP
    n = np.zeros((33, 3)); w = np.zeros((33, 3)); v = np.zeros(33)
    # 원본 이미지 기준 픽셀 크기를 써서 x, y 를 등방(같은 단위)으로: 모델 입력 픽셀 → 원본 픽셀 비율
    hip = (k2[11] + k2[12]) / 2
    sh = (k2[5] + k2[6]) / 2
    torso = np.linalg.norm(sh - hip) + 1e-6          # 원본 픽셀 몸통 길이
    # 3D: x, y 는 원본 픽셀(k2) 을 몸통 길이로 나눠 '몸통 = 0.5' 단위, z 는 모델 z(미터) 를 같은 단위로
    hip3 = (k3[11] + k3[12]) / 2
    for i, j in enumerate(sel):
        x = (k2[j][0] - hip[0]) / torso * 0.5
        y = -(k2[j][1] - hip[1]) / torso * 0.5
        z = zsign * (k3[j][2] - hip3[2]) * zk
        w[i] = [x, y, z]
        n[i] = [k2[j][0] / W, k2[j][1] / H, zsign * (k3[j][2] - hip3[2]) * zk * torso / 0.5 / W * -1]
        v[i] = min(1.0, max(0.0, s[j] / 10.0)) if s.max() > 1.5 else s[j]
    return n, w, v


if __name__ == "__main__":
    print("module")
