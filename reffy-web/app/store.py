"""업로드 파일 보관소.

평소(내 컴퓨터)에는 data/uploads 폴더만 씁니다.
SUPABASE_URL · SUPABASE_KEY 가 설정되면(클라우드 서버) 파일을 Supabase Storage 에도 올려 두고,
서버가 다시 켜져 로컬 파일이 사라졌을 때 필요한 파일을 Supabase 에서 다시 받아 옵니다.
"""
from __future__ import annotations

import mimetypes
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from . import config

ON = bool(config.SUPABASE_URL and config.SUPABASE_KEY)
_lock = threading.Lock()


def _url(name: str) -> str:
    return f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}/{urllib.parse.quote(name)}"


def _get_url(name: str) -> str:
    return f"{config.SUPABASE_URL}/storage/v1/object/authenticated/{config.SUPABASE_BUCKET}/{urllib.parse.quote(name)}"


def _req(method: str, url: str, data: bytes | None = None, ctype: str | None = None):
    h = {"Authorization": f"Bearer {config.SUPABASE_KEY}", "apikey": config.SUPABASE_KEY}
    if ctype:
        h["Content-Type"] = ctype
    if method in ("POST", "PUT"):
        h["x-upsert"] = "true"
    return urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=60)


def ensure_bucket() -> None:
    """버킷이 없으면 비공개 버킷으로 만든다 (이미 있으면 그대로)."""
    if not ON:
        return
    import json
    try:
        body = json.dumps({"id": config.SUPABASE_BUCKET, "name": config.SUPABASE_BUCKET, "public": False}).encode()
        _req("POST", f"{config.SUPABASE_URL}/storage/v1/bucket", body, "application/json").close()
        print(f"[REFFY] Supabase 버킷을 만들었어요: {config.SUPABASE_BUCKET}", flush=True)
    except urllib.error.HTTPError as e:
        if e.code not in (400, 409):   # 이미 있음
            print(f"[REFFY] Supabase 버킷 확인 실패: {e.code} {e.read()[:200]!r}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[REFFY] Supabase 연결 실패: {e}", flush=True)


def push(path: Path) -> None:
    """방금 저장한 파일을 Supabase 에도 올린다."""
    if not ON or not path.exists():
        return
    try:
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        _req("POST", _url(path.name), path.read_bytes(), ctype).close()
    except Exception as e:  # noqa: BLE001
        print(f"[REFFY] Supabase 업로드 실패 {path.name}: {e}", flush=True)


def pull(path: Path) -> bool:
    """로컬에 없으면 Supabase 에서 받아 온다. 있으면(또는 받아 왔으면) True."""
    if path.exists():
        return True
    if not ON:
        return False
    with _lock:
        if path.exists():
            return True
        try:
            with _req("GET", _get_url(path.name)) as r:
                data = r.read()
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".part")
            tmp.write_bytes(data)
            tmp.replace(path)
            return True
        except Exception:  # noqa: BLE001
            return False


def delete(path: Path) -> None:
    path.unlink(missing_ok=True)
    if not ON:
        return
    try:
        _req("DELETE", _url(path.name)).close()
    except Exception:  # noqa: BLE001
        pass
