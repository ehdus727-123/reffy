"""모바일 와이어프레임에서 추가된 기능: 차단, 신고, 문의, 알림 설정, 비밀번호 변경, 탈퇴, 반응한 게시물, 연관 이미지."""
from __future__ import annotations
from typing import List, Optional, Set

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import text

from . import config, db
from . import social as S

router = APIRouter(prefix="/api")
KINDS = ("follow", "comment", "reply", "like")


def _likes(items: list) -> list:
    """카드 목록에 하트 수를 붙인다."""
    ids = [c["id"] for c in items]
    if ids:
        ph = ",".join(f":i{n}" for n in range(len(ids)))
        lk = {r["image_id"]: r["n"] for r in db.rows(f"SELECT image_id, COUNT(*) AS n FROM likes WHERE image_id IN ({ph}) GROUP BY image_id", **{f"i{n}": i for n, i in enumerate(ids)})}
        for c in items:
            c["likes"] = lk.get(c["id"], 0)
    return items


# ------------------------------------------------------------------ 차단
def hidden_ids(request: Request) -> Set[int]:
    """내가 차단했거나 나를 차단한 사용자의 게시물 번호. 피드에서 빼는 데 쓴다."""
    u = S.me(request)
    if not u:
        return set()
    r = db.rows("SELECT i.id FROM images i WHERE i.user_id IN (SELECT blocked_id FROM blocks WHERE user_id = :u) "
                "OR i.user_id IN (SELECT user_id FROM blocks WHERE blocked_id = :u)", u=u["id"])
    return {x["id"] for x in r}


def is_blocked(viewer: Optional[dict], target_id: int) -> bool:
    return bool(viewer) and bool(db.rows("SELECT 1 AS x FROM blocks WHERE user_id = :a AND blocked_id = :b", a=viewer["id"], b=target_id))


@router.post("/users/{uid}/block")
def block(uid: str, request: Request):
    u = S.need(request)
    t = S._user_row(uid)
    if t["id"] == u["id"]:
        raise HTTPException(400, "나를 차단할 수는 없어요.")
    with db.engine.begin() as c:
        c.execute(text("DELETE FROM blocks WHERE user_id = :a AND blocked_id = :b"), {"a": u["id"], "b": t["id"]})
        c.execute(db.blocks.insert().values(user_id=u["id"], blocked_id=t["id"]))
        # 차단하면 서로의 팔로우도 끊는다
        c.execute(text("DELETE FROM follows WHERE (follower_id = :a AND followee_id = :b) OR (follower_id = :b AND followee_id = :a)"), {"a": u["id"], "b": t["id"]})
    return {"ok": True}


@router.delete("/users/{uid}/block")
def unblock(uid: str, request: Request):
    u = S.need(request)
    t = S._user_row(uid)
    with db.engine.begin() as c:
        c.execute(text("DELETE FROM blocks WHERE user_id = :a AND blocked_id = :b"), {"a": u["id"], "b": t["id"]})
    return {"ok": True}


@router.get("/me/blocks")
def my_blocks(request: Request):
    u = S.need(request)
    r = db.rows("SELECT x.uid, x.nick, x.avatar, b.created_at AS at FROM blocks b JOIN users x ON x.id = b.blocked_id WHERE b.user_id = :u ORDER BY b.created_at DESC", u=u["id"])
    return {"items": [{"uid": x["uid"], "nick": x["nick"], "avatar": S._avatar_url(x["uid"], x["avatar"]),
                       "at": x["at"].isoformat() if hasattr(x["at"], "isoformat") else str(x["at"] or "")} for x in r]}


@router.get("/me/account")
def my_account(request: Request):
    """계정 관리: 아이디 · 가입일 (이메일 · 소셜 계정 연결은 아직 없음)"""
    u = S.need(request)
    r = db.rows("SELECT uid, nick, created_at FROM users WHERE id = :i", i=u["id"])[0]
    c = r["created_at"]
    return {"uid": r["uid"], "nick": r["nick"], "email": "", "created": c.isoformat() if hasattr(c, "isoformat") else str(c or ""),
            "guest": config.NO_LOGIN}


# ------------------------------------------------------------------ 신고 · 문의
class ReportIn(BaseModel):
    target_type: str          # post / comment / user
    target_id: str
    reason: str
    detail: str = ""


@router.post("/reports")
def report(body: ReportIn, request: Request):
    u = S.need(request)
    if body.target_type not in ("post", "comment", "user"):
        raise HTTPException(400, "신고 대상을 확인해 주세요.")
    if not body.reason.strip():
        raise HTTPException(400, "신고 사유를 선택해 주세요.")
    with db.engine.begin() as c:
        c.execute(db.reports.insert().values(user_id=u["id"], target_type=body.target_type, target_id=body.target_id[:40],
                                             reason=body.reason.strip()[:40], detail=body.detail.strip()[:200]))
    return {"ok": True}


IQ_KINDS = ("계정", "게시물", "신고", "서비스 오류", "기타")


@router.post("/inquiries")
async def inquiry(request: Request):
    """문의하기 — JSON {kind, body} 또는 폼(kind · email · title · body · photos 최대 3장)."""
    import io
    import json as _json
    from PIL import Image
    u = S.need(request)
    files = []
    if request.headers.get("content-type", "").startswith("multipart/"):
        form = await request.form()
        d = {k: str(form.get(k) or "") for k in ("kind", "email", "title", "body")}
        files = [f for f in form.getlist("photos") if hasattr(f, "read")]
    else:
        raw = await request.json()
        d = {k: str(raw.get(k) or "") for k in ("kind", "email", "title", "body")}
    kind, body = d["kind"].strip(), d["body"].strip()
    email, title = d["email"].strip()[:120], d["title"].strip()[:100]
    if not kind:
        raise HTTPException(400, "문의 유형을 선택해 주세요.")
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        raise HTTPException(400, "답변 받을 이메일을 확인해 주세요.")
    if len(body) < 5:
        raise HTTPException(400, "문의 내용을 5자 이상 적어 주세요.")
    if len(files) > 3:
        raise HTTPException(400, "사진은 최대 3장까지 첨부할 수 있어요.")
    imgs = []
    for f in files:
        data = await f.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(400, "사진은 한 장에 10MB 이하로 올려 주세요.")
        try:
            im = Image.open(io.BytesIO(data)); im.load()
        except Exception:  # noqa: BLE001
            raise HTTPException(400, "사진 파일만 첨부할 수 있어요.")
        imgs.append(im.convert("RGB"))
    with db.engine.begin() as c:
        iid = c.execute(db.inquiries.insert().values(user_id=u["id"], kind=kind[:40], body=body[:1000], email=email, title=title)).inserted_primary_key[0]
        names = []
        for n, im in enumerate(imgs):
            im.thumbnail((1600, 1600))
            name = f"iq_{iid}_{n}.jpg"
            im.save(config.UPLOADS / name, "JPEG", quality=88)
            names.append(name)
        if names:
            c.execute(text("UPDATE inquiries SET photos = :p WHERE id = :i"), {"p": _json.dumps(names), "i": iid})
    return {"ok": True}


# ------------------------------------------------------------------ 설정: 알림 · 비밀번호 · 탈퇴
def notif_off(user_id: int) -> Set[str]:
    r = db.rows("SELECT notif_off FROM users WHERE id = :i", i=user_id)
    return {k for k in ((r[0]["notif_off"] or "") if r else "").split(",") if k}


@router.get("/me/settings")
def get_settings(request: Request):
    u = S.need(request)
    off = notif_off(u["id"])
    dnd = (db.rows("SELECT dnd FROM users WHERE id = :i", i=u["id"])[0]["dnd"] or "")
    return {"uid": u["uid"], "notif": {k: k not in off for k in KINDS}, "dnd": dnd}


class SettingsIn(BaseModel):
    notif: dict
    dnd: Optional[str] = None     # "23:00-08:00" / "" (끄기) / None (그대로)


@router.put("/me/settings")
def put_settings(body: SettingsIn, request: Request):
    u = S.need(request)
    off = ",".join(k for k in KINDS if body.notif.get(k) is False)
    import re as _re
    with db.engine.begin() as c:
        c.execute(text("UPDATE users SET notif_off = :o WHERE id = :i"), {"o": off, "i": u["id"]})
        if body.dnd is not None:
            if body.dnd and not _re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d", body.dnd):
                raise HTTPException(400, "방해 금지 시간을 확인해 주세요.")
            c.execute(text("UPDATE users SET dnd = :d WHERE id = :i"), {"d": body.dnd, "i": u["id"]})
    return {"notif": {k: k not in off.split(",") for k in KINDS}}


class PasswordIn(BaseModel):
    cur: str
    pw: str
    pw2: str


@router.put("/me/password")
def change_password(body: PasswordIn, request: Request):
    u = S.need(request)
    row = db.rows("SELECT pw_hash FROM users WHERE id = :i", i=u["id"])[0]
    if not S._verify(body.cur, row["pw_hash"]):
        raise HTTPException(400, "지금 쓰는 비밀번호가 맞지 않아요.")
    if len(body.pw) < 8 or not any(ch.isalpha() for ch in body.pw) or not any(ch.isdigit() for ch in body.pw):
        raise HTTPException(400, "새 비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.")
    if body.pw != body.pw2:
        raise HTTPException(400, "새 비밀번호가 서로 달라요.")
    with db.engine.begin() as c:
        c.execute(text("UPDATE users SET pw_hash = :h WHERE id = :i"), {"h": S._hash(body.pw), "i": u["id"]})
    return {"ok": True}


class LeaveIn(BaseModel):
    pw: str = ""
    reason: str = ""


@router.post("/me/leave")
def leave(body: LeaveIn, request: Request, resp: Response):
    """탈퇴: 내 게시물·댓글·하트·북·킵을 모두 지우고 계정을 삭제한다. 되돌릴 수 없다."""
    u = S.need(request)
    row = db.rows("SELECT pw_hash, avatar FROM users WHERE id = :i", i=u["id"])[0]
    if not config.NO_LOGIN and not S._verify(body.pw, row["pw_hash"]):   # 게스트 모드는 비밀번호가 없음
        raise HTTPException(400, "비밀번호가 맞지 않아요.")
    imgs = db.rows("SELECT id, file FROM images WHERE user_id = :u", u=u["id"])
    books = [b["id"] for b in db.rows("SELECT id FROM books WHERE user_id = :u", u=u["id"])]
    with db.engine.begin() as c:
        for im in imgs:
            for t in ("image_tags", "likes", "comments", "keeps", "book_items", "views", "notifications"):
                c.execute(text(f"DELETE FROM {t} WHERE image_id = :i"), {"i": im["id"]})
            c.execute(text("DELETE FROM images WHERE id = :i"), {"i": im["id"]})
        for b in books:
            c.execute(text("DELETE FROM book_items WHERE book_id = :b"), {"b": b})
        p = {"u": u["id"]}
        for sql in ("DELETE FROM books WHERE user_id = :u", "DELETE FROM likes WHERE user_id = :u", "DELETE FROM comments WHERE user_id = :u",
                    "DELETE FROM keeps WHERE user_id = :u", "DELETE FROM views WHERE user_id = :u",
                    "DELETE FROM follows WHERE follower_id = :u OR followee_id = :u", "DELETE FROM blocks WHERE user_id = :u OR blocked_id = :u",
                    "DELETE FROM notifications WHERE user_id = :u OR actor_id = :u", "DELETE FROM sessions WHERE user_id = :u",
                    "DELETE FROM users WHERE id = :u"):
            c.execute(text(sql), p)
    for im in imgs:
        for f in (config.UPLOADS / im["file"], config.UPLOADS / f"t_{im['id']}.jpg"):
            f.unlink(missing_ok=True)
    resp.delete_cookie(S.COOKIE)
    return {"ok": True}


# ------------------------------------------------------------------ 서랍: 반응한 게시물(하트 · 댓글)
@router.get("/me/reacted")
def my_reacted(request: Request, kind: str = ""):
    u = S.need(request)
    like = [r["image_id"] for r in db.rows("SELECT image_id FROM likes WHERE user_id = :u ORDER BY created_at DESC", u=u["id"])]
    com = [r["image_id"] for r in db.rows("SELECT image_id, MAX(created_at) AS t FROM comments WHERE user_id = :u GROUP BY image_id ORDER BY t DESC", u=u["id"])]
    ids = like if kind == "like" else com if kind == "comment" else like + [i for i in com if i not in set(like)]
    items = S.with_likes(S.cards(S.visible(ids, u)), u)
    ls = set(like)
    for it in items:
        it["re"] = "like" if it["id"] in ls and kind != "comment" else "comment"
    return {"items": items, "total": len(items), "counts": {"all": len(set(like) | set(com)), "like": len(like), "comment": len(com)}}


# ------------------------------------------------------------------ 게시물 상세: 연관 이미지 (같은 태그가 많은 순)
@router.get("/images/{image_id}/related")
def related(image_id: int, request: Request, limit: int = 10, offset: int = 0):
    """연관 이미지: 태그가 많이 겹치는 순 → 그다음은 최신 이미지로 이어서 (더보기 · 계속 스크롤)."""
    tags = [r["ikey"] for r in db.rows(f"SELECT t.ikey FROM image_tags t WHERE t.image_id = :i AND {db.ACTIVE}", i=image_id, thr=config.TAG_THRESHOLD)]
    ids: List[int] = []
    if tags:
        ph = ",".join(f":k{n}" for n in range(len(tags)))
        ids = [r["image_id"] for r in db.rows(
            f"SELECT t.image_id, COUNT(*) AS n FROM image_tags t WHERE t.image_id != :i AND t.ikey IN ({ph}) AND {db.ACTIVE} "
            f"GROUP BY t.image_id ORDER BY n DESC, t.image_id DESC LIMIT 1000",
            i=image_id, thr=config.TAG_THRESHOLD, **{f"k{n}": k for n, k in enumerate(tags)})]
    seen = set(ids) | {image_id}
    ids += [r["id"] for r in db.rows("SELECT id FROM images ORDER BY id DESC LIMIT 2000") if r["id"] not in seen]
    hide = hidden_ids(request)
    v = S.me(request)
    limit = max(1, min(limit, 40)); offset = max(0, offset)
    total = len(ids)
    ids = S.visible([i for i in ids[:offset + limit + 300] if i not in hide], v)
    page = ids[offset:offset + limit]
    return {"items": S.with_likes(S.cards(page), v), "more": len(page) == limit and offset + limit < total}
