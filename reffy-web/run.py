import os
import uvicorn

from app import config  # noqa: F401  (.env 를 먼저 읽어 HOST · PORT 가 적용되게 한다)

def seed_demo_data():
    """SEED_DIR(예: demo-data)에 시연용 DB · 이미지가 있고, 이 서버의 data 에 아직 DB 가 없으면 복사해 온다.
    (클라우드 서버는 다시 켜질 때마다 파일이 지워지므로, 켤 때마다 시연용 데이터로 시작하게 하는 용도)"""
    import shutil
    from pathlib import Path
    seed = os.getenv("SEED_DIR", "").strip()
    if not seed:
        return
    src = (Path(__file__).resolve().parent / seed).resolve()
    dst = config.DATA
    if not (src / "reffy.db").exists() or (dst / "reffy.db").exists():
        return
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src / "reffy.db", dst / "reffy.db")
    if (src / "uploads").is_dir():
        shutil.copytree(src / "uploads", dst / "uploads", dirs_exist_ok=True)
    print(f"[REFFY] 시연용 데이터를 불러왔어요: {src}", flush=True)


if __name__ == "__main__":
    seed_demo_data()
    uvicorn.run("app.main:app", host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8100")))
