from __future__ import annotations
from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Integer, MetaData, String, Table, Text, UniqueConstraint, create_engine, event, inspect, text)
from datetime import datetime

from . import config

if config.DB_URL.startswith("sqlite"):
    engine = create_engine(config.DB_URL, pool_pre_ping=True, future=True)
else:
    # 클라우드 DB: 매 요청마다 연결 확인(왕복 1번)을 하지 않고 연결을 재사용 → 서버와 DB 가 멀어도 덜 느리게
    engine = create_engine(config.DB_URL, pool_pre_ping=False, pool_recycle=240, pool_size=5, max_overflow=5, future=True)
if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _pragma(dbapi, _):  # noqa: ANN001
        dbapi.execute("PRAGMA journal_mode=WAL")
        dbapi.execute("PRAGMA foreign_keys=ON")

md = MetaData()
images = Table("images", md,
               Column("id", Integer, primary_key=True, autoincrement=True),
               Column("title", String(120), nullable=False, default=""),
               Column("author", String(40), nullable=False, default="익명"),
               Column("file", String(80), nullable=False),
               Column("w", Integer, default=0), Column("h", Integer, default=0),
               Column("views", Integer, default=0),
               Column("user_id", Integer),                  # 올린 사람 (로그인 도입 전 이미지는 NULL)
               Column("kind", String(8), default="illust"),  # illust(일러스트) / photo(사진)
               Column("colors", Text),                      # 대표색 [[hex, 비율], ...] (컬러 팔레트 검색)
               Column("wd_json", Text),                     # 검색용 WD 원본 태그 {태그: 확률}
               Column("private", Integer, default=0),       # 1 이면 비공개 (올린 사람만 봄)
               Column("materials", Text),                   # 사용 소재 링크 ["https://...", ...]
               Column("tools", Text),                       # 사용한 툴 ["Procreate", ...] (main.TOOLS 중에서)
               Column("ext", Text),                         # 외부 사진(3D 포즈 실사 · Unsplash) {"src","pid","name","user","full","regular"} — 파일은 원본 주소로 바로 보여 줌
               Column("created_at", DateTime, default=datetime.now))
# 태그: AI 예측(ai_prob)과 사용자 수정(user_state)을 따로 보관. 최종 = AI(확률>=임계값) + 사용자 추가 - 사용자 삭제 (PRD 8.2)
image_tags = Table("image_tags", md,
                   Column("image_id", Integer, ForeignKey("images.id", ondelete="CASCADE"), primary_key=True),
                   Column("ikey", String(60), primary_key=True),
                   Column("ai_prob", Float), Column("ai_src", String(8)),
                   Column("user_state", String(4)))          # NULL / 'add' / 'del'

# ---- 계정·소셜 (로그인, 하트, 댓글, 팔로우, 킵 스페이스, 서랍(레퍼런스 북), 알림)
users = Table("users", md,
              Column("id", Integer, primary_key=True, autoincrement=True),
              Column("uid", String(20), nullable=False, unique=True),
              Column("nick", String(20), nullable=False, unique=True),
              Column("pw_hash", String(200), nullable=False),
              Column("marketing", Boolean, default=False),
              Column("bio", String(200), default=""),          # 한 줄 소개
              Column("links", Text),                           # 외부 링크 JSON (최대 5개)
              Column("avatar", String(40)),                    # 프로필 사진 파일명 (없으면 NULL)
              Column("cover", String(40)),                     # 마이페이지 헤더(커버) 이미지 파일명 (없으면 NULL)
              Column("notif_off", String(40), default=""),     # 끈 알림 종류 (follow,comment,reply,like)
              Column("dnd", String(20), default=""),           # 방해 금지 시간 "23:00-08:00" (비우면 사용 안 함)
              Column("created_at", DateTime, default=datetime.now))
sessions = Table("sessions", md,
                 Column("token", String(64), primary_key=True),
                 Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                 Column("created_at", DateTime, default=datetime.now))
likes = Table("likes", md, Column("user_id", Integer, primary_key=True), Column("image_id", Integer, primary_key=True),
              Column("created_at", DateTime, default=datetime.now))
comments = Table("comments", md,
                 Column("id", Integer, primary_key=True, autoincrement=True),
                 Column("image_id", Integer, nullable=False, index=True), Column("user_id", Integer, nullable=False),
                 Column("body", String(500), nullable=False), Column("created_at", DateTime, default=datetime.now))
follows = Table("follows", md, Column("follower_id", Integer, primary_key=True), Column("followee_id", Integer, primary_key=True),
                Column("created_at", DateTime, default=datetime.now))
keeps = Table("keeps", md, Column("user_id", Integer, primary_key=True), Column("image_id", Integer, primary_key=True),
              Column("created_at", DateTime, default=datetime.now), Column("pos", Integer))   # pos: 사용자가 정한 순서 (없으면 최근 순)
books = Table("books", md,
              Column("id", Integer, primary_key=True, autoincrement=True),
              Column("user_id", Integer, nullable=False, index=True), Column("name", String(40), nullable=False),
              Column("description", String(200), default=""), Column("cover", String(40)),
              Column("updated_at", DateTime, default=datetime.now))
book_items = Table("book_items", md, Column("book_id", Integer, primary_key=True), Column("image_id", Integer, primary_key=True),
                   Column("added_at", DateTime, default=datetime.now))
views = Table("views", md, Column("user_id", Integer, primary_key=True), Column("image_id", Integer, primary_key=True),
              Column("viewed_at", DateTime, default=datetime.now))
notifications = Table("notifications", md,
                      Column("id", Integer, primary_key=True, autoincrement=True),
                      Column("user_id", Integer, nullable=False, index=True),          # 받는 사람
                      Column("actor_id", Integer, nullable=False), Column("kind", String(8), nullable=False),   # like / comment / follow
                      Column("image_id", Integer), Column("body", String(200), default=""),
                      Column("is_read", Boolean, default=False), Column("created_at", DateTime, default=datetime.now))

blocks = Table("blocks", md, Column("user_id", Integer, primary_key=True), Column("blocked_id", Integer, primary_key=True),
               Column("created_at", DateTime, default=datetime.now))
reports = Table("reports", md,
                Column("id", Integer, primary_key=True, autoincrement=True), Column("user_id", Integer, nullable=False),
                Column("target_type", String(8), nullable=False), Column("target_id", String(40), nullable=False),   # post / comment / user
                Column("reason", String(40), nullable=False), Column("detail", String(200), default=""),
                Column("created_at", DateTime, default=datetime.now))
inquiries = Table("inquiries", md,
                  Column("id", Integer, primary_key=True, autoincrement=True), Column("user_id", Integer, nullable=False),
                  Column("kind", String(40), nullable=False), Column("body", Text, nullable=False),
                  Column("email", String(120), default=""), Column("title", String(100), default=""), Column("photos", Text),
                  Column("created_at", DateTime, default=datetime.now))

poses = Table("poses", md,   # 3D 포즈 검색용 관절 (MediaPipe Pose 33점 × [정규화 x,y,z · 월드 x,y,z · visibility]). lm = "" 이면 사람 없음
              Column("image_id", Integer, primary_key=True), Column("lm", Text, default=""),
              Column("created_at", DateTime, default=datetime.now))

ACTIVE = "((t.user_state = 'add') OR (t.user_state IS NULL AND t.ai_prob >= :thr))"


def init():
    # 웹 · 모바일 서버가 같은 새 DB 를 동시에 만들면 한쪽이 "already exists" 로 실패할 수 있어 몇 번 다시 시도한다
    import time
    for n in range(5):
        try:
            md.create_all(engine)
            break
        except Exception as e:
            if "already exists" not in str(e) or n == 4:
                raise
            time.sleep(0.3)
    # 예전에 만든 DB 에는 없는 열을 채워 넣는다 (데이터는 그대로 유지)
    cols = {c["name"] for c in inspect(engine).get_columns("images")}
    with engine.begin() as c:
        if "user_id" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN user_id INTEGER"))
        if "kind" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN kind VARCHAR(8) DEFAULT 'illust'"))
        if "colors" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN colors TEXT"))
        if "private" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN private INTEGER DEFAULT 0"))
        if "materials" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN materials TEXT"))
        if "tools" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN tools TEXT"))
        if "ext" not in cols:
            c.execute(text("ALTER TABLE images ADD COLUMN ext TEXT"))
        kcols = {x["name"] for x in inspect(engine).get_columns("keeps")}
        if "pos" not in kcols:
            c.execute(text("ALTER TABLE keeps ADD COLUMN pos INTEGER"))
        ucols = {x["name"] for x in inspect(engine).get_columns("users")}
        for name, ddl in (("bio", "VARCHAR(200) DEFAULT ''"), ("links", "TEXT"), ("avatar", "VARCHAR(40)"), ("cover", "VARCHAR(40)"), ("notif_off", "VARCHAR(40) DEFAULT ''"), ("dnd", "VARCHAR(20) DEFAULT ''")):
            if name not in ucols:
                c.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
        qcols = {x["name"] for x in inspect(engine).get_columns("inquiries")}
        for name, ddl in (("email", "VARCHAR(120) DEFAULT ''"), ("title", "VARCHAR(100) DEFAULT ''"), ("photos", "TEXT")):
            if name not in qcols:
                c.execute(text(f"ALTER TABLE inquiries ADD COLUMN {name} {ddl}"))
        bcols = {x["name"] for x in inspect(engine).get_columns("books")}
        if "cover" not in bcols:
            c.execute(text("ALTER TABLE books ADD COLUMN cover VARCHAR(40)"))


def rows(sql: str, **p):
    with engine.connect() as c:
        return [dict(r._mapping) for r in c.execute(text(sql), p)]
