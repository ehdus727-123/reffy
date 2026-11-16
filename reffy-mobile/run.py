import os
import uvicorn

from app import config  # noqa: F401  (.env 를 먼저 읽어 HOST · PORT 가 적용되게 한다)

def seed_demo_data():
    """SEED_DIR(예: demo-data)에 시연용 DB · 이미지가 있으면, 처음 켤 때 한 번 불러온다.
    - SQLite(기본): 이 서버의 data 에 DB 가 없을 때 복사
    - Postgres(Supabase 등): DB 가 비어 있을 때 표 내용을 옮기고 이미지도 저장소에 올림"""
    import shutil
    from pathlib import Path
    seed = os.getenv("SEED_DIR", "").strip()
    if not seed:
        return
    src = (Path(__file__).resolve().parent / seed).resolve()
    if not (src / "reffy.db").exists():
        return
    if config.DB_URL.startswith("sqlite"):
        dst = config.DATA
        if (dst / "reffy.db").exists():
            return
        dst.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src / "reffy.db", dst / "reffy.db")
        if (src / "uploads").is_dir():
            shutil.copytree(src / "uploads", dst / "uploads", dirs_exist_ok=True)
        print(f"[REFFY] 시연용 데이터를 불러왔어요: {src}", flush=True)
        return
    from sqlalchemy import create_engine, inspect, text
    from app import db, store
    db.init()
    if db.rows("SELECT COUNT(*) AS n FROM users")[0]["n"]:
        return   # 이미 데이터가 있음 (다시 켜져도 덮어쓰지 않음)
    se = create_engine(f"sqlite:///{(src / 'reffy.db').as_posix()}")
    have = set(inspect(se).get_table_names())
    with se.connect() as sc, db.engine.begin() as dc:
        for t in db.md.sorted_tables:
            if t.name not in have:
                continue
            cols = [t.c[c["name"]] for c in inspect(se).get_columns(t.name) if c["name"] in t.c]
            rows = [dict(r._mapping) for r in sc.execute(t.select().with_only_columns(*cols))]
            for i in range(0, len(rows), 500):
                dc.execute(t.insert(), rows[i:i + 500])
            if "id" in t.c:
                dc.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', 'id'), COALESCE((SELECT MAX(id) FROM {t.name}), 1), (SELECT MAX(id) FROM {t.name}) IS NOT NULL)"))
    n = 0
    if (src / "uploads").is_dir():
        config.UPLOADS.mkdir(parents=True, exist_ok=True)
        for f in (src / "uploads").iterdir():
            if f.is_file():
                shutil.copy2(f, config.UPLOADS / f.name); store.push(config.UPLOADS / f.name); n += 1
    print(f"[REFFY] 시연용 데이터를 DB 로 옮겼어요 (이미지 {n}개)", flush=True)


if __name__ == "__main__":
    seed_demo_data()
    uvicorn.run("app.main:app", host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8100")))
