"""태그 사전과 이미지 태깅 파이프라인.

- ia.json      : 라벨링 기준표 전체(SPECTRUM 라벨링 IA v2). AI 가 태그를 고를 때만 씁니다.
- exposed.json : 사이트에 보이는 태그(사용자 노출 시트 + Figma FilterPanel). 필터·업로드·상세·검색은 이것만 씁니다.
                 한 항목이 기준표의 여러 항목을 묶기도 합니다 (예: 바지 = 긴바지 + 반바지, 앞머리 = 앞머리 5종).

이미지 -> WD tagger 태그 확률 -> (1) 기준표 Safebooru 태그 매핑 (2) 팀 분류기 -> 기준표 항목 후보
-> 사이트 태그로 묶기 -> 같은 단일 축은 가장 확률 높은 하나만 -> AI 태그.
"""
from __future__ import annotations
import json

from . import config
from .classifier import C
from .suggest import suggest
from .tagger import T

IA = json.loads((config.DATA / "ia.json").read_text(encoding="utf-8"))
EXPOSED = json.loads((config.DATA / "exposed.json").read_text(encoding="utf-8"))


def _row(it):
    return {"keyword": it["keyword"], "category": it["group"], "path": "|".join(it["path"]), "mode": it["mode"],
            "aliases": it["tags"] or "", "ikey": it["key"], "ord": it["ord"], "label": it["label"], "note": it.get("note", ""),
            "parts": it["path"]}


FULL = [_row(it) for it in IA["items"]]                 # 기준표 전체 (AI 전용)
FULL_BY_KEYWORD = {v["keyword"]: v for v in FULL}
VOCAB = [_row(it) for it in EXPOSED["items"]]           # 사이트에 보이는 태그
BY_IKEY = {v["ikey"]: v for v in VOCAB}
BY_KEYWORD = {v["keyword"]: v for v in VOCAB}
# 기준표 항목 -> 사이트 태그 (같으면 그대로, 묶인 것은 대표 태그로)
FROM = {old: it["key"] for it in EXPOSED["items"] for old in it.get("from", [])}
# 키워드 -> (WD 태그, 기준값): 기본 0.35 보다 낮춰야 잡히는 것들 (tools/tune_pose.py 결과)
TUNED = {"더치 앵글": ("dutch_angle", 0.15), "하이앵글": ("from_above", 0.10), "로우앵글": ("from_below", 0.05),
         "측면": ("profile", 0.20), "달리기": ("running", 0.25)}
PERSON = {"count_1", "count_2", "count_3", "count_4", "count_5over"}


def axis(v) -> tuple:
    return (v["category"], v["path"])


def tag_image(im) -> dict:
    """반환: {"tags": [{ikey, prob, src}], "wd": {태그: 확률}(화면 비노출, 검색용)}"""
    wd = T.predict(im) if T.ready else {}
    raw = {}   # 기준표 key -> (prob, src)
    if wd:
        hit = [t for t, p in wd.items() if p >= config.WD_THRESHOLD]
        kws, why = suggest(hit, FULL)
        for k in kws:
            v = FULL_BY_KEYWORD[k]
            raw[v["ikey"]] = (wd.get(why[k], 0.9), "wd")
        # 앵글·방향은 WD 가 확률을 낮게 내는 편이라, 팀 라벨 1,618장으로 고른 태그별 기준값을 따로 씀 (교차검증 정밀도 0.55 이상만)
        for k, (t, th) in TUNED.items():
            p = wd.get(t, 0)
            v = FULL_BY_KEYWORD.get(k)
            if v is not None and p >= th and p > raw.get(v["ikey"], (0, ""))[0]:
                raw[v["ikey"]] = (max(p, config.WD_THRESHOLD), "wd")
        for k, p in C.predict(wd).items():
            v = FULL_BY_KEYWORD.get(k)
            if v is not None:
                old = raw.get(v["ikey"], (0, ""))[0]
                raw[v["ikey"]] = (max(p, old), "team")
    # 기준표 후보 -> 사이트 태그 (묶인 항목은 가장 높은 확률)
    cands = {}
    for k, (p, s) in raw.items():
        ik = FROM.get(k)
        if ik and p > cands.get(ik, (0, ""))[0]:
            cands[ik] = (p, s)
    # 사이트에만 있는 태그: 퍼리(WD furry 계열), 인간(사람이 있고 퍼리·인외가 아닐 때)
    for ik in ("char_furry", "char_nonhuman"):
        for t in BY_IKEY[ik]["aliases"].split():
            p = wd.get(t, 0)
            if p >= config.WD_THRESHOLD and p > cands.get(ik, (0, ""))[0]:
                cands[ik] = (p, "wd")
    people = [cands[k][0] for k in PERSON if k in cands]
    if people and "char_furry" not in cands and "char_nonhuman" not in cands:
        cands["char_human"] = (max(people), "wd")
    # 단일 축: 가장 확률 높은 하나만
    best = {}
    for ik, (p, s) in cands.items():
        v = BY_IKEY[ik]
        if v["mode"] == "단일":
            a = axis(v)
            if a not in best or p > cands[best[a]][0]:
                best[a] = ik
    out = []
    for ik, (p, s) in cands.items():
        v = BY_IKEY[ik]
        if v["mode"] == "단일" and best[axis(v)] != ik:
            continue
        out.append({"ikey": ik, "prob": round(float(p), 3), "src": s})
    out.sort(key=lambda r: BY_IKEY[r["ikey"]]["ord"])
    top = sorted(((t, p) for t, p in wd.items() if p >= config.WD_THRESHOLD), key=lambda kv: -kv[1])[:40]
    return {"tags": out, "wd": dict(top)}


def migrate_tags():
    """예전 기준표 key 로 저장된 이미지 태그를 사이트 태그로 옮긴다 (여러 번 실행해도 같음).
    묶인 항목은 하나로 합치고(확률은 가장 높은 값, 직접 추가가 하나라도 있으면 추가), 기존에 사람이 있는 이미지는 '인간'을 채운다."""
    from sqlalchemy import text
    from . import db
    moves = {old: new for old, new in FROM.items() if old != new}
    with db.engine.begin() as c:
        if moves:
            ph = ",".join(f":o{i}" for i in range(len(moves)))
            olds = list(moves)
            rows = [dict(r._mapping) for r in c.execute(text(f"SELECT image_id, ikey, ai_prob, ai_src, user_state FROM image_tags WHERE ikey IN ({ph})"), {f"o{i}": k for i, k in enumerate(olds)})]
            merged = {}
            for r in rows:
                key = (r["image_id"], moves[r["ikey"]])
                m = merged.setdefault(key, {"p": None, "src": None, "states": []})
                if r["ai_prob"] is not None and (m["p"] is None or r["ai_prob"] > m["p"]):
                    m["p"], m["src"] = r["ai_prob"], r["ai_src"]
                m["states"].append(r["user_state"])
            for (iid, new), m in merged.items():
                st = "add" if "add" in m["states"] else ("del" if all(s == "del" for s in m["states"]) else None)
                cur = c.execute(text("SELECT ai_prob, user_state FROM image_tags WHERE image_id=:i AND ikey=:k"), {"i": iid, "k": new}).first()
                if cur is None:
                    c.execute(text("INSERT INTO image_tags (image_id, ikey, ai_prob, ai_src, user_state) VALUES (:i,:k,:p,:s,:u)"), {"i": iid, "k": new, "p": m["p"], "s": m["src"], "u": st})
                else:
                    p = max(x for x in (cur[0], m["p"]) if x is not None) if (cur[0] is not None or m["p"] is not None) else None
                    u = "add" if "add" in (cur[1], st) else cur[1]
                    c.execute(text("UPDATE image_tags SET ai_prob=:p, user_state=:u WHERE image_id=:i AND ikey=:k"), {"i": iid, "k": new, "p": p, "u": u})
            c.execute(text(f"DELETE FROM image_tags WHERE ikey IN ({ph})"), {f"o{i}": k for i, k in enumerate(olds)})
        # '인간' 채우기: 인원 태그가 있고 유형 태그가 하나도 없는 이미지
        c.execute(text("""INSERT INTO image_tags (image_id, ikey, ai_prob, ai_src, user_state)
            SELECT t.image_id, 'char_human', COALESCE(MAX(t.ai_prob), 1.0), 'wd', NULL FROM image_tags t
            WHERE t.ikey IN ('count_1','count_2','count_3','count_4','count_5over') AND (t.user_state IS NULL OR t.user_state='add')
              AND t.image_id NOT IN (SELECT image_id FROM image_tags WHERE ikey IN ('char_human','char_furry','char_nonhuman'))
            GROUP BY t.image_id"""))
