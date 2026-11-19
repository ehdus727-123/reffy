"""COCO 2017 사람 관절 데이터 → REFFY 3D 포즈 검색용 실사 데이터 (photos.json + landmarks.dat, pose-search 형식)

정확도 우선:
- 2D 관절 17개: COCO 정답(사람이 직접 찍은 값)을 그대로 씀
- 앞뒤 깊이(z) · 손 · 발 · 얼굴 세부점: RTMW3D-x 로 보완 (COCO 정답 상자 위치로 실행 → 사람 검출 오류 없음)
- 한 사진에 '주인공' 한 명이 뚜렷한 사진만: 관절 13개 이상 표시, 화면의 일정 비율 이상, 두 번째 사람은 훨씬 작게

라이선스: 관절 정답(annotations)은 CC BY 4.0 (COCO Consortium). 사진은 Flickr 이용 규칙 + 사진별 CC 라이선스.
사용: python run_coco.py --ann annotations/person_keypoints_train2017.json --ann annotations/person_keypoints_val2017.json --max 3000 --out out
"""
import argparse, json, time, os
import numpy as np, requests, cv2
from rtmlib import RTMPose3d
from convert import MP

POSE = 'https://huggingface.co/Soykaf/RTMW3D-x/resolve/main/onnx/rtmw3d-x_8xb64_cocktail14-384x288-b0a0eab7_20240626.onnx'
ZK = 0.5
LIC_SHORT = {1: "CC BY-NC-SA 2.0", 2: "CC BY-NC 2.0", 3: "CC BY-NC-ND 2.0", 4: "CC BY 2.0", 5: "CC BY-SA 2.0", 6: "CC BY-ND 2.0", 7: "No known copyright restrictions", 8: "United States Government Work"}


def pick(anns, imgs, maxn):
    by = {}
    for a in anns:
        if a.get("iscrowd"): continue
        by.setdefault(a["image_id"], []).append(a)
    cand = []
    for iid, L in by.items():
        im = imgs[iid]
        L = sorted(L, key=lambda a: -a["area"])
        m = L[0]
        if m["num_keypoints"] < 13: continue
        k = np.array(m["keypoints"]).reshape(17, 3)
        if min(k[5, 2], k[6, 2], k[11, 2], k[12, 2]) == 0: continue          # 어깨 · 골반은 꼭 있어야
        x, y, w, h = m["bbox"]
        if h < im["height"] * 0.45: continue                                    # 충분히 크게 찍힌 사람
        if len(L) > 1 and L[1]["area"] > m["area"] * 0.35: continue             # 주인공이 뚜렷해야
        cand.append((m["num_keypoints"] * 1e6 + m["area"], iid, m))
    cand.sort(reverse=True)
    return cand[:maxn]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ann", action="append", required=True)
    ap.add_argument("--max", type=int, default=3000)
    ap.add_argument("--out", default="out")
    a = ap.parse_args()
    anns, imgs = [], {}
    for f in a.ann:
        d = json.load(open(f))
        anns += d["annotations"]
        for im in d["images"]: imgs[im["id"]] = im
    sel = pick(anns, imgs, a.max)
    print("selected", len(sel), flush=True)
    model = RTMPose3d(POSE, model_input_size=(288, 384), backend="onnxruntime", device="cpu")
    photos, lms, prev = [], [], []
    t0 = time.time()
    for n, (_, iid, m) in enumerate(sel):
        im = imgs[iid]
        try:
            r = requests.get(im["coco_url"], timeout=30); r.raise_for_status()
            img = cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR)
        except Exception as e:
            print("skip", iid, e, flush=True); continue
        H, W = img.shape[:2]
        x, y, w, h = m["bbox"]
        k3, sc, _, k2 = model(img, bboxes=[[x, y, x + w, y + h]])
        k3, sc, k2 = k3[0].astype(float), sc[0].astype(float), k2[0].astype(float)
        gt = np.array(m["keypoints"], dtype=float).reshape(17, 3)
        p2 = k2.copy(); vis = np.clip(sc, 0, 1)
        for j in range(17):                      # COCO 정답 2D 로 바꿔 끼움
            if gt[j, 2] > 0:
                p2[j] = gt[j, :2]; vis[j] = 1.0 if gt[j, 2] == 2 else 0.75
            else:
                vis[j] = min(vis[j], 0.3)      # 정답에 없는(안 보이는) 관절은 비교에서 빠지도록
        hip2 = (p2[11] + p2[12]) / 2; t2 = np.linalg.norm((p2[5] + p2[6]) / 2 - hip2) + 1e-6
        hip3 = (k3[11] + k3[12]) / 2
        row = np.zeros((33, 7), np.float32)
        for i, j in enumerate(MP):
            wx = (p2[j][0] - hip2[0]) / t2 * 0.5
            wy = -(p2[j][1] - hip2[1]) / t2 * 0.5
            wz = -(k3[j][2] - hip3[2]) * ZK
            row[i] = [p2[j][0] / W, p2[j][1] / H, wz * (t2 / 0.5) / W, wx, wy, wz, vis[j]]
        lms.append(row)
        lic = im.get("license", 0)
        photos.append(["coco" + str(iid), W, H, im["coco_url"], im["coco_url"], LIC_SHORT.get(lic, "Flickr"), im.get("flickr_url", ""), 0, lic])
        if len(prev) < 24: prev.append((img, p2, vis))
        if n % 50 == 0: print(n, iid, f"{time.time() - t0:.0f}s", flush=True)
    os.makedirs(a.out, exist_ok=True)
    json.dump(photos, open(os.path.join(a.out, "photos.json"), "w"), separators=(",", ":"))
    np.stack(lms).astype(np.float32).tofile(os.path.join(a.out, "landmarks.dat"))
    # 확인용 그림: COCO 정답 + RTMW3D 보완 관절
    E = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28)]
    tiles = []
    for img, p2, vis in prev:
        t = img.copy(); pts = p2[MP]; v = vis[MP]
        for u, q in E:
            if v[u] > 0.4 and v[q] > 0.4: cv2.line(t, tuple(map(int, pts[u])), tuple(map(int, pts[q])), (0, 200, 0), 3)
        sc_ = 260 / t.shape[0]; tiles.append(cv2.resize(t, (int(t.shape[1] * sc_), 260)))
    rows = []
    for k in range(0, len(tiles), 4):
        g = tiles[k:k + 4]; wmax = max(x.shape[1] for x in g)
        rows.append(np.hstack([cv2.copyMakeBorder(x, 0, 0, 0, 0, cv2.BORDER_CONSTANT) for x in g]))
    wmax = max(r.shape[1] for r in rows)
    cv2.imwrite(os.path.join(a.out, "coco_preview.jpg"), np.vstack([cv2.copyMakeBorder(r, 0, 4, 0, wmax - r.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 70])
    print("done", len(photos), f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
