"""WD14 태그 확률 + 팀 라벨 -> 키워드별 팀 분류기 (data/team_classifier.joblib).

기준표 매핑(WD 태그 -> 키워드)과 비교해, 합쳤을 때 나아지는 키워드만 남깁니다.
사용:
  1) 라벨링 앱 폴더에서 wd_dump.py 로 라벨 이미지의 WD 확률(wd_probs.jsonl.gz)을 만든다
  2) python tools/train_team.py wd_probs.jsonl.gz labels_multihot.csv data/team_classifier.joblib 0.6
     (마지막 숫자: 맞힌 것 중 진짜 비율이 이 값 이상인 기준값만 씀)
"""
import sys, gzip, json, time, numpy as np, pandas as pd
from pathlib import Path
HOME = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HOME))
from app.suggest import suggest
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import precision_recall_fscore_support as prf, roc_auc_score
WD_PATH, LABELS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
THR = 0.35  # config.WD_THRESHOLD
PMIN = float(sys.argv[4]) if len(sys.argv) > 4 else 0.6
ia = json.load(open(HOME / 'data' / 'ia.json', encoding='utf-8'))['items']
vocab = [{"keyword": i["keyword"], "category": i["group"], "path": "|".join(i["path"]), "mode": i["mode"], "aliases": i["tags"] or "", "ikey": i["key"], "ord": i["ord"]} for i in ia]
lb = pd.read_csv(LABELS)
wd = {r["id"]: r["p"] for r in map(json.loads, gzip.open(WD_PATH, 'rt'))}
lb = lb[lb.id.isin(wd)].reset_index(drop=True)
cols = list(lb.columns[2:]); Y = lb[cols].values.astype(int); N = len(lb)
# 특징: 5장 이상에서 0.05 넘게 나온 태그
cnt = {}
for i in lb.id:
    for t, p in wd[i].items():
        if p >= 0.05: cnt[t] = cnt.get(t, 0) + 1
feats = sorted(t for t, c in cnt.items() if c >= 5); fi = {t: j for j, t in enumerate(feats)}
X = np.zeros((N, len(feats)), np.float32)
for r, i in enumerate(lb.id):
    for t, p in wd[i].items():
        j = fi.get(t)
        if j is not None: X[r, j] = p
# 규칙: WD 0.35 이상 태그 -> 기준표 매핑 (사이트의 tagmap 과 같은 방식)
R = np.zeros_like(Y)
for r, i in enumerate(lb.id):
    kws, _ = suggest([t for t, p in wd[i].items() if p >= THR], vocab)
    for k in kws:
        if k in cols: R[r, cols.index(k)] = 1
P = np.full(Y.shape, np.nan); best = {}
skf = StratifiedKFold(5, shuffle=True, random_state=0)
for j, c in enumerate(cols):
    y = Y[:, j]
    if y.sum() < 15 or y.sum() > N - 15: continue
    oof = {}
    for C in (0.1, 0.3, 1.0):
        o = np.zeros(N)
        for tr, te in skf.split(X, y):
            m = LogisticRegression(C=C, class_weight='balanced', max_iter=3000).fit(X[tr], y[tr]); o[te] = m.predict_proba(X[te])[:, 1]
        oof[C] = o
    C = max(oof, key=lambda c: roc_auc_score(y, oof[c])); o = oof[C]
    ths = np.linspace(0.2, 0.95, 31)
    def sc(t):
        p_, r_, f_, _ = prf(y, (o >= t) | (R[:, j] == 1), average='binary', zero_division=0)
        return f_ if p_ >= PMIN else 0.0
    f = [sc(t) for t in ths]   # 규칙과 합쳤을 때 F1 (맞힌 것 중 진짜 비율이 PMIN 이상일 때만)
    t = float(ths[int(np.argmax(f))]); P[:, j] = o
    best[c] = dict(C=C, thr=t, f1_mix=max(f), auc=roc_auc_score(y, o), n=int(y.sum()),
                   f1_rule=prf(y, R[:, j], average='binary', zero_division=0)[2],
                   f1_learn=prf(y, o >= t, average='binary', zero_division=0)[2])
keep = {c: b for c, b in best.items() if b['f1_mix'] > b['f1_rule'] + 0.02}
M = R.copy()
for c, b in keep.items():
    j = cols.index(c); M[:, j] = ((P[:, j] >= b['thr']) | (R[:, j] == 1)).astype(int)
def micro(A): p, r, f, _ = prf(Y.ravel(), A.ravel(), average='binary', zero_division=0); return round(p, 3), round(r, 3), round(f, 3)
summary = {"images": N, "keywords": len(cols), "trained": len(best), "kept": len(keep), "rule": micro(R), "mix": micro(M)}
print(json.dumps(summary, ensure_ascii=False))
# 최종 학습 (전체 데이터) -> 가벼운 형식 (sklearn 버전과 무관)
models = {}
for c, b in keep.items():
    j = cols.index(c); m = LogisticRegression(C=b['C'], class_weight='balanced', max_iter=3000).fit(X, Y[:, j])
    models[c] = {"w": m.coef_[0].astype(np.float32), "b": float(m.intercept_[0]), "thr": b['thr'], "auc": round(b['auc'], 3), "n": b['n'], "f1": round(b['f1_mix'], 3), "f1_rule": round(b['f1_rule'], 3)}
import joblib
joblib.dump({"format": 2, "models": models, "index": fi, "info": {"trained_at": time.strftime('%Y-%m-%d'), "images": N, "source": "WD14(wd-vit-tagger-v3) + 팀 라벨 1,619장", "rule": summary["rule"], "mix": summary["mix"]}}, OUT, compress=3)
pd.DataFrame([dict(키워드=c, 라벨수=b['n'], 규칙_F1=round(b['f1_rule'], 2), 학습_F1=round(b['f1_learn'], 2), 합친_F1=round(b['f1_mix'], 2), 적용=c in keep) for c, b in best.items()]).sort_values('라벨수', ascending=False).to_csv(OUT.replace('.joblib', '_report.csv'), index=False, encoding='utf-8-sig')
