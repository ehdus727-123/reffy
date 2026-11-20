"""REFFY 유사도 엔진 (WD14 없이 Safebooru 태그 + pHash 만 사용)

1. 수집        : 크롤러 → CSV → MariaDB safebooru.posts  (이 프로그램은 읽기만 함)
2. pHash       : PerceptualHash(64비트) 해밍 거리 → 중복·변형 판별
3. 이미지 유사도 : 이미지마다 General 태그 벡터 → 코사인 / 자카드 / TF-IDF 코사인
4. 합치기      : 가중합(전략 A) 또는 pHash 후보 → 태그 재정렬(전략 B)
5. 태그 유사도  : 태그끼리 같이 나온 횟수 → 비슷한 태그 추천, 검색 넓히기
"""
from __future__ import annotations

import csv
import json
import math
import os
import time
from pathlib import Path

import numpy as np
from scipy import sparse

BASE = Path(__file__).resolve().parent


# ------------------------------------------------------------------ 설정
def load_env(path: Path = BASE / ".env") -> None:
    """.env 의 KEY=VALUE 를 환경변수로 (이미 있는 값은 그대로 둠)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
OUT_DIR = Path(os.getenv("OUT_DIR", BASE / "data"))
if not OUT_DIR.is_absolute():
    OUT_DIR = BASE / OUT_DIR

COLS = ["ID", "Ext", "Year", "Month", "Copyrights", "Characters", "General",
        "Width", "Height", "ImageURL", "PerceptualHash"]


# ------------------------------------------------------------------ 1. 읽기
def read_mariadb(limit: int | None = None):
    """MariaDB posts 에서 정상 이미지만 읽어 dict 목록으로."""
    import pymysql
    # 접속 정보: daily_load.bat 이 쓰는 sb.cnf 를 그대로 (비밀번호를 .env 에 또 적지 않아도 됨)
    cnf = os.getenv("DB_CNF", r"C:\safebooru_load\sb.cnf")
    kw = dict(database=os.getenv("DB_NAME", "safebooru"), charset="utf8mb4", cursorclass=pymysql.cursors.SSDictCursor)
    if cnf and Path(cnf).exists() and not os.getenv("DB_PASSWORD"):
        con = pymysql.connect(read_default_file=cnf, read_default_group="client", **kw)
    else:
        con = pymysql.connect(host=os.getenv("DB_HOST", "127.0.0.1"), port=int(os.getenv("DB_PORT", "3306")),
                              user=os.getenv("DB_USER", "root"), password=os.getenv("DB_PASSWORD", ""), **kw)
    sql = (f"SELECT {', '.join('`%s`' % c for c in COLS)} FROM posts "
           "WHERE ErrMessage IS NULL AND (MediaType IS NULL OR MediaType='image') ORDER BY ID")
    if limit:
        sql += f" LIMIT {int(limit)}"
    with con.cursor() as cur:
        cur.execute(sql)
        for r in cur:
            yield r
    con.close()


def read_csv(paths):
    """크롤러 CSV(열 이름이 DB 와 같다고 가정, 대소문자 무시)도 읽을 수 있게."""
    for p in paths:
        with open(p, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                low = {k.lower(): v for k, v in r.items() if k}
                if (low.get("errmessage") or "").strip():
                    continue
                yield {c: low.get(c.lower()) for c in COLS}


def _u64(v):
    if v in (None, "", "NULL"):
        return None
    try:
        return int(v) & 0xFFFFFFFFFFFFFFFF
    except (TypeError, ValueError):
        try:
            return int(str(v), 16)  # 16진수 문자열로 저장된 경우
        except ValueError:
            return None


# ------------------------------------------------------------------ 인덱스 만들기
def build(rows, min_df: int = 3, min_co: int = 3, top_tags: int = 30, log=print) -> dict:
    t0 = time.time()
    ids, meta, tag_lists, ph = [], [], [], []
    for r in rows:
        tags = sorted(set((r.get("General") or "").split()))
        ids.append(int(r["ID"]))
        tag_lists.append(tags)
        h = _u64(r.get("PerceptualHash"))
        ph.append(h if h is not None else 0)
        meta.append([r.get("Ext") or "", int(r.get("Year") or 0), int(r.get("Month") or 0),
                     r.get("ImageURL") or "", r.get("Copyrights") or "", r.get("Characters") or "",
                     int(r.get("Width") or 0), int(r.get("Height") or 0), h is not None])
    n = len(ids)
    log(f"이미지 {n:,}장 읽음 ({time.time()-t0:.1f}초)")

    # 태그 사전: min_df 장 이상에 나온 general 태그만 (너무 드문 태그는 잡음)
    df = {}
    for tags in tag_lists:
        for t in tags:
            df[t] = df.get(t, 0) + 1
    vocab = sorted(t for t, c in df.items() if c >= min_df)
    col = {t: i for i, t in enumerate(vocab)}
    rr, cc = [], []
    for i, tags in enumerate(tag_lists):
        for t in tags:
            j = col.get(t)
            if j is not None:
                rr.append(i); cc.append(j)
    X = sparse.csr_matrix((np.ones(len(rr), np.float32), (rr, cc)), shape=(n, len(vocab)))
    log(f"태그 {len(df):,}종 중 {len(vocab):,}종 사용 (최소 {min_df}장 이상)")

    # 5. 태그끼리: 같이 나온 횟수 → 코사인 = 같이 나온 수 / sqrt(각각 나온 수 곱)
    Xc = X.tocsc()
    C = (Xc.T @ Xc).tocsr()
    dfv = np.asarray(X.sum(0)).ravel()
    nb_idx = np.full((len(vocab), top_tags), -1, np.int32)
    nb_sim = np.zeros((len(vocab), top_tags), np.float32)
    nb_co = np.zeros((len(vocab), top_tags), np.int32)
    for i in range(len(vocab)):
        s, e = C.indptr[i], C.indptr[i + 1]
        js, co = C.indices[s:e], C.data[s:e]
        keep = (js != i) & (co >= min_co)
        js, co = js[keep], co[keep]
        if not len(js):
            continue
        sim = co / np.sqrt(dfv[i] * dfv[js])
        o = np.argsort(-sim)[:top_tags]
        nb_idx[i, :len(o)] = js[o]; nb_sim[i, :len(o)] = sim[o]; nb_co[i, :len(o)] = co[o]
    log(f"태그 동시출현 계산 완료 ({time.time()-t0:.1f}초)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT_DIR / "index.npz", ids=np.array(ids, np.int64),
                        phash=np.array(ph, np.uint64), has_ph=np.array([m[8] for m in meta]),
                        nb_idx=nb_idx, nb_sim=nb_sim, nb_co=nb_co, df=dfv.astype(np.int32))
    sparse.save_npz(OUT_DIR / "tags.npz", X)
    (OUT_DIR / "vocab.json").write_text(json.dumps(vocab, ensure_ascii=False), encoding="utf-8")
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d %H:%M:%S"), "min_df": min_df, "min_co": min_co,
        "rows": [[m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]] for m in meta],
        "raw_tags": [" ".join(t) for t in tag_lists]}, ensure_ascii=False), encoding="utf-8")
    info = {"images": n, "tags_all": len(df), "tags_used": len(vocab),
            "with_phash": int(sum(m[8] for m in meta)), "seconds": round(time.time() - t0, 1)}
    log(f"저장 완료 → {OUT_DIR}  {info}")
    return info


# ------------------------------------------------------------------ 검색
def _popcount64(a: np.ndarray) -> np.ndarray:
    if hasattr(np, "bitwise_count"):
        return np.bitwise_count(a).astype(np.int32)
    b = np.unpackbits(a.view(np.uint8).reshape(-1, 8), axis=1)
    return b.sum(1).astype(np.int32)


class Engine:
    def __init__(self, out_dir: Path = OUT_DIR):
        z = np.load(out_dir / "index.npz")
        self.ids, self.ph, self.has_ph = z["ids"], z["phash"], z["has_ph"]
        self.nb_idx, self.nb_sim, self.nb_co, self.df = z["nb_idx"], z["nb_sim"], z["nb_co"], z["df"]
        self.X = sparse.load_npz(out_dir / "tags.npz").tocsr()
        self.vocab = json.loads((out_dir / "vocab.json").read_text(encoding="utf-8"))
        m = json.loads((out_dir / "meta.json").read_text(encoding="utf-8"))
        self.built, self.rows, self.raw = m["built"], m["rows"], m["raw_tags"]
        self.col = {t: i for i, t in enumerate(self.vocab)}
        self.pos = {int(v): i for i, v in enumerate(self.ids)}
        n = len(self.ids)
        self.nt = np.asarray(self.X.sum(1)).ravel()                      # 이미지별 태그 수
        self.idf = np.log((n + 1) / (self.df + 1)).astype(np.float32) + 1  # 흔한 태그일수록 가중치 ↓
        Xt = self.X.multiply(self.idf).tocsr()
        norm = np.sqrt(np.asarray(Xt.multiply(Xt).sum(1)).ravel()); norm[norm == 0] = 1
        self.Xtf = sparse.diags(1 / norm) @ Xt
        self._faiss = None

    # ---- 공통
    def info(self, i: int) -> dict:
        ext, y, mo, url, cp, ch, w, h = self.rows[i]
        return {"id": int(self.ids[i]), "ext": ext, "year": y, "month": mo, "url": url,
                "copyrights": cp, "characters": ch, "w": w, "h": h, "tags": self.raw[i],
                "phash": f"{int(self.ph[i]):016x}" if self.has_ph[i] else None}

    def _idx(self, post_id: int) -> int:
        if int(post_id) not in self.pos:
            raise KeyError(f"ID {post_id} 가 인덱스에 없어요 (build_index.py 를 다시 돌려 보세요)")
        return self.pos[int(post_id)]

    def _qvec(self, tags):
        q = np.zeros(len(self.vocab), np.float32)
        for t in tags:
            j = self.col.get(t)
            if j is not None:
                q[j] = 1
        return q

    # ---- 2. pHash 해밍 거리
    def hamming_all(self, h: int) -> np.ndarray:
        d = _popcount64(np.bitwise_xor(self.ph, np.uint64(h)))
        d[~self.has_ph] = 64
        return d

    def phash_neighbors(self, post_id=None, phash=None, max_dist=10, k=20):
        if post_id is not None:
            i = self._idx(post_id)
            if not self.has_ph[i]:
                return []
            phash = int(self.ph[i])
        d = self.hamming_all(int(phash))
        if post_id is not None:
            d[i] = 99
        o = np.argsort(d, kind="stable")[:k]
        return [(int(self.ids[j]), int(d[j])) for j in o if d[j] <= max_dist]

    def duplicates(self, max_dist=4, limit=200):
        """DB 전체에서 거의 같은 이미지 쌍 찾기 (해밍 ≤ max_dist)."""
        out, seen = [], set()
        idx = np.where(self.has_ph)[0]
        for i in idx:
            d = self.hamming_all(int(self.ph[i]))
            for j in np.where(d <= max_dist)[0]:
                if j <= i or (i, j) in seen:
                    continue
                seen.add((i, j))
                out.append((int(self.ids[i]), int(self.ids[j]), int(d[j])))
                if len(out) >= limit:
                    return out
        return out

    # ---- 3. 태그로 이미지 유사도
    def tag_scores(self, q: np.ndarray, method="cosine") -> np.ndarray:
        nq = q.sum()
        if nq == 0:
            return np.zeros(len(self.ids), np.float32)
        if method == "tfidf":
            qt = q * self.idf
            qt /= np.linalg.norm(qt) or 1
            return np.asarray(self.Xtf @ qt).ravel()
        inter = np.asarray(self.X @ q).ravel()
        if method == "jaccard":
            union = self.nt + nq - inter
            union[union == 0] = 1
            return inter / union
        den = np.sqrt(self.nt * nq); den[den == 0] = 1
        return inter / den  # cosine (0/1 벡터)

    def similar_images(self, post_id=None, tags=None, method="cosine", k=20, min_shared=1):
        if post_id is not None:
            i = self._idx(post_id)
            q = np.asarray(self.X[i].todense()).ravel()
        else:
            i, q = None, self._qvec(tags or [])
        s = self.tag_scores(q, method)
        shared = np.asarray(self.X @ q).ravel()
        s[shared < min_shared] = 0
        if i is not None:
            s[i] = -1
        o = np.argpartition(-s, min(k, len(s) - 1))[:k]
        o = o[np.argsort(-s[o])]
        return [(int(self.ids[j]), round(float(s[j]), 4), int(shared[j])) for j in o if s[j] > 0]

    # ---- 4. 합치기
    def combined(self, post_id, method="cosine", w_tag=0.7, w_ph=0.3, k=20, mode="weighted", cand=300):
        i = self._idx(post_id)
        q = np.asarray(self.X[i].todense()).ravel()
        ts = self.tag_scores(q, method)
        if self.has_ph[i]:
            d = self.hamming_all(int(self.ph[i]))
            ps = np.clip(1 - d / 32.0, 0, 1)  # 무관한 이미지는 보통 해밍 ~32 → 0점
        else:
            d = np.full(len(self.ids), 64); ps = np.zeros(len(self.ids))
        if mode == "two-step":  # 전략 B: pHash 로 후보를 먼저 추리고 태그로 재정렬
            cands = np.argsort(d, kind="stable")[:cand]
            sc = np.full(len(self.ids), -1.0); sc[cands] = w_tag * ts[cands] + w_ph * ps[cands]
        else:                   # 전략 A: 가중합
            sc = w_tag * ts + w_ph * ps
        sc[i] = -1
        o = np.argsort(-sc)[:k]
        return [(int(self.ids[j]), round(float(sc[j]), 4), round(float(ts[j]), 4), int(d[j])) for j in o if sc[j] > 0]

    def faiss_phash(self, post_id, k=20):
        """Faiss 가 설치돼 있으면 pHash 를 IndexBinaryFlat 으로 검색 (데이터가 많아질 때)."""
        import faiss
        if self._faiss is None:
            b = self.ph.astype(">u8").view(np.uint8).reshape(-1, 8)
            self._faiss = faiss.IndexBinaryFlat(64); self._faiss.add(b)
        i = self._idx(post_id)
        D, I = self._faiss.search(self.ph[i:i + 1].astype(">u8").view(np.uint8).reshape(1, 8), k + 1)
        return [(int(self.ids[j]), int(dd)) for dd, j in zip(D[0], I[0]) if j != i][:k]

    # ---- 5. 태그끼리 유사도
    def similar_tags(self, tag, k=15):
        j = self.col.get(tag)
        if j is None:
            return []
        out = []
        for a, s, c in zip(self.nb_idx[j], self.nb_sim[j], self.nb_co[j]):
            if a < 0:
                break
            out.append((self.vocab[a], round(float(s), 4), int(c)))
        return out[:k]

    def expand(self, tags, per_tag=5, min_sim=0.2):
        """검색 넓히기: 입력 태그마다 비슷한 태그를 붙여 줌."""
        add = {}
        for t in tags:
            for u, s, _ in self.similar_tags(t, per_tag):
                if u not in tags and s >= min_sim:
                    add[u] = max(add.get(u, 0), s)
        return sorted(add.items(), key=lambda x: -x[1])

    def recommend(self, tags, k=10):
        """지금 붙인 태그들과 함께 자주 나오는 태그 추천 (점수 합산)."""
        sc = {}
        for t in tags:
            for u, s, _ in self.similar_tags(t, 30):
                if u not in tags:
                    sc[u] = sc.get(u, 0) + s
        return [(u, round(s, 4)) for u, s in sorted(sc.items(), key=lambda x: -x[1])[:k]]

    def search(self, tags, k=40):
        """태그를 모두 가진 이미지 (일반 검색)."""
        js = [self.col.get(t) for t in tags]
        if not tags or any(j is None for j in js):
            return []
        m = np.asarray(self.X[:, js].sum(1)).ravel() == len(js)
        return [int(v) for v in self.ids[m][:k]]

    def top_tags(self, k=50):
        o = np.argsort(-self.df)[:k]
        return [(self.vocab[j], int(self.df[j])) for j in o]
