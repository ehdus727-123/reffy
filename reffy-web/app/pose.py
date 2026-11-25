"""3D 포즈 검색 (pose-search, MIT · github.com/x6ud/pose-search)

일러스트 · 사진 게시물을 모두 다룹니다.
관절 추출(일러스트: YOLOX + RTMPose, 사진: MediaPipe Pose)과 자세 비교는 브라우저에서 합니다. 서버는 게시물마다 뽑은 관절 값을 저장하고 돌려주기만 합니다.
- GET  /api/pose/index        : 볼 수 있는 게시물의 관절 값 목록 (검색용)
- GET  /api/pose/missing      : 아직 관절을 뽑지 않은 게시물 (로그인한 브라우저가 조금씩 채워 넣음)
- POST /api/images/{id}/pose  : 관절 값 저장 (lm 이 비어 있으면 '사람 없음'으로 기록해 다시 묻지 않음)
"""
from __future__ import annotations
import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from . import db, extras
from . import social as S

router = APIRouter(prefix="/api")
N = 33 * 7


def _hidden(request: Request) -> set:
    viewer = S.me(request)
    hide = extras.hidden_ids(request)
    hide |= {r["id"] for r in db.rows("SELECT id FROM images WHERE COALESCE(private,0) = 1 AND (user_id IS NULL OR user_id != :u)", u=viewer["id"] if viewer else -1)}
    return hide


@router.get("/pose/index")
def pose_index(request: Request):
    hide = _hidden(request)
    out = []
    for r in db.rows("SELECT p.image_id AS id, p.lm, COALESCE(i.kind,'illust') AS kind FROM poses p JOIN images i ON i.id = p.image_id WHERE p.lm != ''"):
        if r["id"] in hide:
            continue
        try:
            lm = json.loads(r["lm"])
        except Exception:
            continue
        if isinstance(lm, list) and len(lm) == N:
            out.append({"id": r["id"], "kind": r["kind"], "lm": lm})
    return {"items": out}


@router.get("/pose/missing")
def pose_missing(request: Request, limit: int = 8):
    S.need(request)
    r = db.rows("SELECT i.id, COALESCE(i.kind,'illust') AS kind FROM images i LEFT JOIN poses p ON p.image_id = i.id WHERE p.image_id IS NULL AND COALESCE(i.private,0) = 0 ORDER BY i.id DESC LIMIT :l",
                l=max(1, min(limit, 30)))
    return {"items": [{"id": x["id"], "kind": x["kind"], "src": f"/img/{x['id']}?s=thumb"} for x in r]}


class PoseIn(BaseModel):
    lm: Optional[List[float]] = None


@router.post("/images/{image_id}/pose")
def pose_save(image_id: int, body: PoseIn, request: Request):
    u = S.need(request)
    im = db.rows("SELECT user_id FROM images WHERE id = :i", i=image_id)
    if not im:
        raise HTTPException(404, "게시물을 찾을 수 없어요.")
    lm = body.lm or []
    if lm and (len(lm) != N or any(not (-1e3 < v < 1e3) for v in lm)):
        raise HTTPException(400, "관절 값 형식이 맞지 않아요.")
    have = db.rows("SELECT lm FROM poses WHERE image_id = :i", i=image_id)
    if have and im[0]["user_id"] != u["id"]:
        return {"ok": True, "kept": True}   # 이미 있으면 올린 사람만 다시 쓸 수 있음
    val = json.dumps([round(v, 4) for v in lm]) if lm else ""
    with db.engine.begin() as c:
        from sqlalchemy import text
        if have:
            c.execute(text("UPDATE poses SET lm = :l WHERE image_id = :i"), {"l": val, "i": image_id})
        else:
            c.execute(text("INSERT INTO poses (image_id, lm) VALUES (:i, :l)"), {"i": image_id, "l": val})
    return {"ok": True}


# ------------------------------------------------------------------ 실사(Unsplash) 사진을 REFFY 게시물처럼 (하트 · 킵 · 북에 저장 · 상세)
from . import config as _cfg
_DS = None


def _dataset() -> dict:
    """pose-search 실사 데이터(static/pose/photos.json): pid -> [pid, w, h, full, regular, name, user, gender]"""
    global _DS
    if _DS is None:
        try:
            _DS = {r[0]: r for r in json.loads((_cfg.BASE / "static" / "pose" / "photos.json").read_text(encoding="utf-8"))}
        except Exception:
            _DS = {}
    return _DS


def ext_of(image_id: int) -> Optional[dict]:
    r = db.rows("SELECT ext FROM images WHERE id = :i", i=image_id)
    if not r or not r[0]["ext"]:
        return None
    try:
        return json.loads(r[0]["ext"])
    except Exception:
        return None


COCO_TERMS = "https://cocodataset.org/#termsofuse"


def _photo_info(pid: str) -> Optional[dict]:
    """실사 데이터 한 장의 출처 정보. COCO: [id, w, h, url, url, 라이선스, flickr 주소, 0, 라이선스 번호]"""
    ph = _dataset().get(pid)
    if not ph:
        return None
    if pid.startswith("coco"):
        return {"src": "coco", "pid": pid, "w": ph[1], "h": ph[2], "url": ph[3], "lic": ph[5], "flickr": ph[6],
                "full": f"/api/pose/photo/{pid}", "regular": f"/api/pose/photo/{pid}", "name": "COCO 2017"}
    return {"src": "unsplash", "pid": pid, "w": ph[1], "h": ph[2], "url": ph[4], "name": ph[5], "user": ph[6], "full": ph[3], "regular": ph[4]}


@router.get("/pose/photo/{pid}")
def pose_photo(pid: str):
    """COCO 사진은 http 로만 제공돼서(https 사이트에서 막힘) 서버가 대신 받아 전해 줌. 데이터에 있는 사진만."""
    from fastapi import Response
    import urllib.request
    info = _photo_info(pid)
    if not info or info["src"] != "coco":
        raise HTTPException(404)
    try:
        with urllib.request.urlopen(urllib.request.Request(info["url"], headers={"User-Agent": "REFFY"}), timeout=20) as r:
            data = r.read()
    except Exception:
        raise HTTPException(502, "사진을 불러오지 못했어요.")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})


@router.post("/pose/ext/{pid}")
def pose_ext(pid: str, request: Request):
    """실사 사진 한 장을 REFFY 이미지로 등록(이미 있으면 그 번호). 사진 주소 · 출처는 서버의 데이터 파일에서만 가져옴."""
    S.need(request)
    info = _photo_info(pid)
    if not info:
        raise HTTPException(404, "사진을 찾을 수 없어요.")
    key = "ext:" + pid
    have = db.rows("SELECT id FROM images WHERE file = :f", f=key)
    if have:
        return {"id": have[0]["id"]}
    from sqlalchemy import text
    ext = json.dumps({k: v for k, v in info.items() if k not in ("w", "h", "url")}, ensure_ascii=False)
    with db.engine.begin() as c:
        r = c.execute(db.images.insert().values(title="", author=(info.get("name") or "")[:40], file=key, w=int(info["w"] or 0), h=int(info["h"] or 0),
                                                 kind="photo", private=0, ext=ext))
        iid = r.inserted_primary_key[0]
        c.execute(text("INSERT INTO poses (image_id, lm) VALUES (:i, '')"), {"i": iid})   # 관절은 실사 데이터에 이미 있으므로 다시 뽑지 않음
    return {"id": iid}


@router.get("/pose/ext-ids")
def pose_ext_ids():
    """이미 등록된 실사 사진: pid -> REFFY 번호 (하트 수 · 킵 표시용)"""
    out = {}
    for r in db.rows("SELECT id, file FROM images WHERE file LIKE 'ext:%'"):
        out[r["file"][4:]] = r["id"]
    return out
