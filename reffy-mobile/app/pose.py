"""3D 포즈 검색 (pose-search, MIT · github.com/x6ud/pose-search)

포즈 검색은 실사 사진용이라 '사진' 게시물만 다룹니다 (일러스트는 저장도 노출도 하지 않음).
관절 추출(MediaPipe Pose)과 자세 비교는 브라우저에서 합니다. 서버는 게시물마다 뽑은 관절 값을 저장하고 돌려주기만 합니다.
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
    for r in db.rows("SELECT p.image_id AS id, p.lm, COALESCE(i.kind,'illust') AS kind FROM poses p JOIN images i ON i.id = p.image_id WHERE p.lm != '' AND COALESCE(i.kind,'illust') = 'photo'"):
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
    r = db.rows("SELECT i.id FROM images i LEFT JOIN poses p ON p.image_id = i.id WHERE p.image_id IS NULL AND COALESCE(i.private,0) = 0 AND COALESCE(i.kind,'illust') = 'photo' ORDER BY i.id DESC LIMIT :l",
                l=max(1, min(limit, 30)))
    return {"items": [{"id": x["id"], "src": f"/img/{x['id']}?s=thumb"} for x in r]}


class PoseIn(BaseModel):
    lm: Optional[List[float]] = None


@router.post("/images/{image_id}/pose")
def pose_save(image_id: int, body: PoseIn, request: Request):
    u = S.need(request)
    im = db.rows("SELECT user_id, COALESCE(kind,'illust') AS kind FROM images WHERE id = :i", i=image_id)
    if not im:
        raise HTTPException(404, "게시물을 찾을 수 없어요.")
    if im[0]["kind"] != "photo":
        return {"ok": True, "skipped": "illust"}   # 일러스트는 포즈 검색 대상이 아님
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
