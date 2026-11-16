import os
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


def _load_env():
    p = BASE / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
# DATA_DIR: 다른 폴더의 data 를 같이 쓸 때 (예: 모바일 폴더에서 ../reffy/data). 비우면 이 폴더의 data.
DATA = Path(os.getenv("DATA_DIR") or (BASE / "data"))
if not DATA.is_absolute():
    DATA = (BASE / DATA).resolve()
# LAYOUT: auto(화면 폭에 따라 자동) / pc(항상 PC 화면) / mobile(항상 모바일 화면)
LAYOUT = (os.getenv("LAYOUT") or "auto").strip().lower()
if LAYOUT not in ("auto", "pc", "mobile"):
    LAYOUT = "auto"
# NO_LOGIN: 1 이면 로그인·회원가입 화면 없이 방문자마다 게스트 계정으로 바로 들어옴 (시연용). 0 이면 원래대로.
NO_LOGIN = (os.getenv("NO_LOGIN") or "1").strip().lower() not in ("0", "false", "off", "no")
# LOCAL_ADMIN: 1 이면 서버 컴퓨터에서 localhost 로 들어온 사람은 모든 게시물을 수정 · 삭제할 수 있음 (공유 링크 방문자는 해당 없음)
LOCAL_ADMIN = (os.getenv("LOCAL_ADMIN") or "1").strip().lower() not in ("0", "false", "off", "no")
UPLOADS = DATA / "uploads"
TMP = DATA / "tmp"
for d in (UPLOADS, TMP, BASE / "models"):
    d.mkdir(parents=True, exist_ok=True)
DB_URL = os.getenv("DB_URL") or f"sqlite:///{(DATA / 'reffy.db').as_posix()}"
# Supabase 등에서 복사한 postgres:// · postgresql:// 주소를 그대로 넣어도 되게 (psycopg 드라이버 사용)
if DB_URL.startswith("postgres://"):
    DB_URL = "postgresql://" + DB_URL[len("postgres://"):]
if DB_URL.startswith("postgresql://"):
    DB_URL = "postgresql+psycopg://" + DB_URL[len("postgresql://"):]
# Supabase Storage: 둘 다 있으면 업로드 이미지를 클라우드에도 저장 (서버가 다시 켜져도 남음)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()          # service_role 키 (서버에만 둠, 화면에 내보내지 않음)
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "reffy").strip()
TAGGER = os.getenv("TAGGER", "auto").strip().lower()          # auto / off / mock(시험용 가짜 태그)
TAGGER_REPO = os.getenv("TAGGER_REPO", "SmilingWolf/wd-vit-tagger-v3").strip()
MODEL_DIR = Path(os.getenv("MODEL_DIR") or (BASE / "models"))
if not MODEL_DIR.is_absolute():
    MODEL_DIR = (BASE / MODEL_DIR).resolve()
CLASSIFIER = Path(os.getenv("CLASSIFIER") or (BASE / "models" / "team_classifier.joblib"))
if not CLASSIFIER.is_absolute():
    CLASSIFIER = BASE / CLASSIFIER
WD_THRESHOLD = float(os.getenv("WD_THRESHOLD", "0.35"))        # WD 태그를 키워드 추천에 쓰는 최소 확률
TEAM_PROB = float(os.getenv("TEAM_PROB", "0.60"))               # 팀 분류기 최소 확률
TAG_THRESHOLD = float(os.getenv("TAG_THRESHOLD", "0.35"))       # 최종 태그 인정 확률 (PRD 8.2)
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
PAGE = 40
