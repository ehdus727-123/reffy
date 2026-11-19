"""실사 사진 관절 추출 (정확도 우선): YOLOX(사람 검출) → RTMW3D-x(전신 133개 관절 3D)
pose-search 실사 데이터(photos.json)의 사진을 내려받아 사람별 관절을 뽑아 JSON 으로 저장합니다.

사용: python run_rtmw3d.py --photos ../../reffy-web/static/pose/photos.json --out out/raw.json [--start 0 --limit 60]
"""
import argparse, json, time, io, sys
import numpy as np
import requests, cv2
from rtmlib import Wholebody3d


def load(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    a = np.frombuffer(r.content, np.uint8)
    return cv2.imdecode(a, cv2.IMREAD_COLOR)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--photos", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    photos = json.load(open(a.photos, encoding="utf-8"))
    sel = photos[a.start:(a.start + a.limit) if a.limit else None]
    model = Wholebody3d(mode="balanced", backend="onnxruntime", device="cpu")
    det = model.det_model
    out = []
    t0 = time.time()
    for i, p in enumerate(sel):
        pid, url = p[0], p[4]
        try:
            img = load(url)
        except Exception as e:
            out.append({"pid": pid, "err": str(e)[:100]}); continue
        H, W = img.shape[:2]
        bboxes = det(img)
        if bboxes is None or len(bboxes) == 0:
            out.append({"pid": pid, "w": W, "h": H, "people": []}); continue
        k3, sc, ksim, k2 = model.pose_model(img, bboxes=bboxes)
        people = []
        for j in range(len(k3)):
            people.append({
                "bbox": [round(float(x), 1) for x in bboxes[j][:4]],
                "k3": np.round(k3[j], 4).tolist(),        # x,y (모델 입력 288x384 기준 픽셀), z (미터 단위로 스케일됨)
                "k2": np.round(k2[j], 1).tolist(),        # 원본 이미지 픽셀 좌표
                "s": np.round(sc[j], 3).tolist(),
            })
        out.append({"pid": pid, "w": W, "h": H, "people": people})
        if i % 10 == 0:
            print(i, pid, len(people), f"{time.time() - t0:.1f}s", flush=True)
    json.dump(out, open(a.out, "w"), separators=(",", ":"))
    print("done", len(out), f"{time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
