"""라벨링한 이미지에 WD14(wd-vit-tagger-v3)를 돌려 태그 확률을 저장합니다. (REFFY 팀 분류기 학습용)

실행 (labeling-app 폴더에서, 한 줄):
    .venv\\Scripts\\python.exe wd_dump.py
결과: wd_probs.jsonl.gz  (이미지 번호별 태그 확률, 0.02 이상만)
"""
import csv, gzip, json, os, sys, time
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = Path(os.getenv("IMAGE_ROOT") or r"C:\safebooru_run\crawler\output")
MODEL = HERE / "models" / "wd-vit-tagger-v3"
names = [r["name"] for r in csv.DictReader(open(MODEL / "selected_tags.csv", encoding="utf-8"))]
opts = ort.SessionOptions(); opts.intra_op_num_threads = max(1, (os.cpu_count() or 2) - 1)
sess = ort.InferenceSession(str(MODEL / "model.onnx"), sess_options=opts, providers=["CPUExecutionProvider"])
inp = sess.get_inputs()[0]; size = int(inp.shape[1])


def prep(im):   # REFFY app/tagger.py 와 같은 전처리
    im = im.convert("RGBA"); bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert("RGB")
    w, h = im.size; s = max(w, h); sq = Image.new("RGB", (s, s), (255, 255, 255)); sq.paste(im, ((s - w) // 2, (s - h) // 2))
    if s != size: sq = sq.resize((size, size), Image.BICUBIC)
    return np.asarray(sq, dtype=np.float32)[:, :, ::-1]


files = [l.strip() for l in open(HERE / "wd_ids.txt", encoding="utf-8") if l.strip()]
out = gzip.open(HERE / "wd_probs.jsonl.gz", "wt", encoding="utf-8")
t0 = time.time(); bad = 0
for k, f in enumerate(files, 1):
    try:
        with Image.open(ROOT / f) as im:
            x = np.expand_dims(prep(im), 0)
        p = sess.run(None, {inp.name: x})[0][0]
        idx = np.where(p >= 0.02)[0]
        out.write(json.dumps({"id": int(Path(f).stem), "p": {names[i]: round(float(p[i]), 4) for i in idx}}) + "\n")
    except Exception as e:
        bad += 1; print("건너뜀", f, e)
    if k % 50 == 0 or k == len(files):
        print(f"{k}/{len(files)}  {time.time() - t0:.0f}초", flush=True)
out.close()
print(f"끝! 실패 {bad}장. 이제 Claude 에게 '다 됐어'라고 알려 주세요.")
