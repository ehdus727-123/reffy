"""앵글·방향·동작 키워드의 WD 태그 기준값 고르기 (app/tagmap.py 의 TUNED).

WD 는 from_above · dutch_angle 같은 태그를 0.35 보다 낮게 내는 경우가 많아, 키워드마다 기준값을 따로 고릅니다.
5겹 교차검증으로 '맞힌 것 중 진짜 비율(정밀도) 0.6 이상'에서 F1 이 가장 좋은 (태그, 기준값)을 찾습니다.
사용: python tools/tune_pose.py wd_probs.jsonl.gz labels_multihot.csv
"""
import sys, gzip, json
import numpy as np, pandas as pd

CANDS = {"정면": ["facing_viewer", "looking_at_viewer"], "측면": ["profile", "from_side"], "뒤 반측면": ["looking_back", "from_behind"],
         "뒷모습": ["facing_away", "from_behind"], "로우앵글": ["from_below"], "하이앵글": ["from_above"], "더치 앵글": ["dutch_angle"],
         "달리기": ["running"], "걷기": ["walking"], "고개 숙임": ["head_down", "looking_down"], "고개 듦": ["looking_up", "head_back"], "갸웃": ["head_tilt"]}
THS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.5]

wd = {r["id"]: r["p"] for r in map(json.loads, gzip.open(sys.argv[1], "rt"))}
lb = pd.read_csv(sys.argv[2]); lb = lb[lb.id.isin(wd)].reset_index(drop=True)
folds = np.random.default_rng(0).integers(0, 5, len(lb))


def pick(y, X, ts, mask):
    best = None
    for t in ts:
        for th in THS:
            p = X[t][mask] >= th; yy = y[mask]
            tp, fp, fn = (yy & p).sum(), (~yy & p).sum(), (yy & ~p).sum()
            if tp and tp / (tp + fp) >= 0.6:
                f = 2 * tp / (2 * tp + fp + fn)
                if best is None or f > best[0]:
                    best = (f, t, th)
    return best


for k, ts in CANDS.items():
    y = lb[k].values.astype(bool)
    X = {t: np.array([wd[i].get(t, 0) for i in lb.id]) for t in ts}
    TP = FP = FN = 0
    for f in range(5):
        b = pick(y, X, ts, folds != f); te = folds == f
        p = X[b[1]][te] >= b[2] if b else np.zeros(te.sum(), bool)
        TP += (y[te] & p).sum(); FP += (~y[te] & p).sum(); FN += (y[te] & ~p).sum()
    print(f"{k}: 라벨 {y.sum()}장 · 고른 규칙 {pick(y, X, ts, np.ones(len(lb), bool))} · 교차검증 정밀도 {TP / max(1, TP + FP):.2f} 재현율 {TP / max(1, y.sum()):.2f}")
