"""REFFY 실행기 — start.bat / share.bat 이 부릅니다.

  python launcher.py         웹(8100)·모바일(8200) 서버를 켜고 브라우저 열기
  python launcher.py share   + 인터넷 어디서나 열리는 공유 링크(Cloudflare) 만들기

처음 실행 때 .venv 와 패키지를 알아서 설치합니다.
"""
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WIN = os.name == "nt"
VENV_PY = ROOT / ".venv" / ("Scripts/python.exe" if WIN else "bin/python")
TOOLS = ROOT / ".tools"
SHARE = len(sys.argv) > 1 and sys.argv[1] == "share"
SERVERS = [("웹", "reffy-web", 8100), ("모바일", "reffy-mobile", 8200)]


def say(msg=""):
    print(msg, flush=True)


def fail(msg):
    say(); say(f"  [실패] {msg}"); say("  이 창을 캡처해서 보내 주세요.")
    input("\n  Enter 를 누르면 닫혀요...")
    sys.exit(1)


# ------------------------------------------------------------------ 1. 파이썬 환경
def ensure_venv():
    if not VENV_PY.exists():
        say("  [1/3] 파이썬 환경 만드는 중...")
        if subprocess.call([sys.executable, "-m", "venv", str(ROOT / ".venv")]) != 0:
            fail("파이썬 환경(.venv)을 만들지 못했어요.")
    mark = ROOT / ".venv" / ".reffy_ok"
    req = ROOT / "reffy-web" / "requirements.txt"
    if not mark.exists() or mark.stat().st_mtime < req.stat().st_mtime:
        say("  [2/3] 필요한 프로그램 설치 중... (처음 한 번, 몇 분 걸려요)")
        if subprocess.call([str(VENV_PY), "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(req)]) != 0:
            fail("패키지 설치에 실패했어요. 인터넷 연결을 확인해 주세요.")
        mark.write_text("ok")
    for _, folder, _ in SERVERS:
        env, ex = ROOT / folder / ".env", ROOT / folder / ".env.example"
        if not env.exists() and ex.exists():
            shutil.copy(ex, env)


# ------------------------------------------------------------------ 2. 서버
def is_up(port):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2).close()
        return True
    except Exception:  # noqa: BLE001
        return False


def stop_port(port):
    """그 포트를 쓰고 있는 예전 서버를 끈다 (코드를 새로 받은 뒤에도 옛 서버가 남아 있는 문제 방지)."""
    if not WIN:
        return
    out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True, errors="replace").stdout
    pids = {ln.split()[-1] for ln in out.splitlines()
            if "LISTENING" in ln and len(ln.split()) >= 5 and ln.split()[1].endswith(f":{port}")}
    for pid in pids - {"0"}:
        subprocess.run(["taskkill", "/PID", pid, "/T", "/F"], capture_output=True)
    for _ in range(10):
        if not is_up(port):
            return
        time.sleep(0.5)


def start_servers():
    say("  [3/3] 서버 켜는 중...")
    for name, folder, port in SERVERS:
        if is_up(port):
            say(f"        예전 {name} 서버를 끄고 새로 켜요 ({port})")
            stop_port(port)
        kw = {"cwd": str(ROOT / folder)}
        if WIN:  # 서버마다 작은 창을 따로 띄움 (그 창을 닫으면 그 서버가 꺼짐)
            kw["creationflags"] = subprocess.CREATE_NEW_CONSOLE
            si = subprocess.STARTUPINFO(); si.dwFlags |= subprocess.STARTF_USESHOWWINDOW; si.wShowWindow = 7  # 최소화
            kw["startupinfo"] = si
        subprocess.Popen([str(VENV_PY), "run.py"], **kw)
        for _ in range(120):
            if is_up(port):
                break
            time.sleep(1)
        else:
            fail(f"{name} 서버가 켜지지 않았어요. 작업 표시줄의 서버 창 오류를 확인해 주세요.")
        say(f"        {name} 서버 켜짐 → http://localhost:{port}")


# ------------------------------------------------------------------ 3. 공유 링크 (Cloudflare 무료 임시 링크)
def find_cloudflared():
    exe = shutil.which("cloudflared")
    if exe:
        return exe
    for p in [TOOLS / "cloudflared.exe",
              Path(os.environ.get("ProgramFiles(x86)", "")) / "cloudflared" / "cloudflared.exe",
              Path(os.environ.get("ProgramFiles", "")) / "cloudflared" / "cloudflared.exe"]:
        if p.is_file():
            return str(p)
    links = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "cloudflared.exe"
    return str(links) if links.is_file() else None


def ensure_cloudflared():
    exe = find_cloudflared()
    if exe:
        return exe
    # 관리자 권한이 필요 없도록 Cloudflare 공식 GitHub 릴리스의 실행 파일을 이 폴더(.tools)에 바로 받는다
    # (winget 설치는 '사용자 계정 컨트롤' 창이 뒤에 숨어 멈춘 것처럼 보이는 경우가 있어 쓰지 않음)
    say("  공유 프로그램(Cloudflare 공식 cloudflared) 받는 중... (처음 한 번, 약 20MB)")
    TOOLS.mkdir(exist_ok=True)
    dst = TOOLS / "cloudflared.exe"
    tmp = TOOLS / "cloudflared.part"
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try:
        urllib.request.urlretrieve(url, tmp)
        tmp.replace(dst)
    except Exception as e:  # noqa: BLE001
        fail(f"공유 프로그램을 받지 못했어요: {e}")
    return str(dst)


URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def open_tunnel(exe, port, found):
    p = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                         creationflags=subprocess.CREATE_NO_WINDOW if WIN else 0)

    def read():
        for line in p.stdout:
            m = URL_RE.search(line)
            if m and port not in found:
                found[port] = m.group(0)
    threading.Thread(target=read, daemon=True).start()
    return p


def share():
    exe = ensure_cloudflared()
    say(); say("  공유 링크 만드는 중... (10~30초)")
    found = {}
    procs = [open_tunnel(exe, port, found) for _, _, port in SERVERS]
    for _ in range(90):
        if len(found) == len(SERVERS):
            break
        time.sleep(1)
    if 8100 not in found:
        fail("공유 링크를 만들지 못했어요. 인터넷 연결이나 회사·학교 방화벽을 확인해 주세요.")
    web, mob = found.get(8100), found.get(8200, "(만들지 못함)")
    say("  링크가 밖에서 열리는지 확인 중... (최대 1분)")
    ok = False
    for _ in range(30):   # 새 주소는 인터넷에 퍼지는 데 몇 초 걸린다
        try:
            req = urllib.request.Request(web + "/config.js", headers={"User-Agent": "reffy-launcher"})
            urllib.request.urlopen(req, timeout=5).close()
            ok = True
            break
        except urllib.error.HTTPError as e:   # 서버까지 닿았으면(404 등) 연결은 된 것
            if e.code < 500:
                ok = True
                break
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
    (ROOT / "공유주소.txt").write_text(
        f"REFFY 공유 링크 (이 컴퓨터와 창이 켜져 있는 동안만 열려요)\n웹     : {web}\n모바일 : {mob}\n", encoding="utf-8")
    if WIN:
        subprocess.run("clip", input=web, text=True, shell=True)
    webbrowser.open(web)
    say()
    say("  ================================================")
    say(f"    웹      : {web}")
    say(f"    모바일  : {mob}")
    say("  ================================================")
    say()
    say("  → 밖에서 열리는 것 확인됨" if ok else "  → 아직 밖에서 확인이 안 됐어요. 1~2분 뒤 휴대폰(LTE)으로 열어 보세요.")
    say()
    say("  ※ 이 창을 닫으면 공유 링크가 끊겨요. 시연 중에는 켜 두세요.")
    say("  ※ 컴퓨터가 잠자기에 들어가도 끊겨요. 다시 실행하면 주소가 새로 바뀌어요.")
    try:
        while any(p.poll() is None for p in procs):
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    for p in procs:
        p.terminate()


def main():
    say(); say("  ================================================")
    say("    REFFY 실행" + (" + 인터넷 공유" if SHARE else ""))
    say("  ================================================"); say()
    ensure_venv()
    start_servers()
    if SHARE:
        share()
        return
    webbrowser.open("http://localhost:8100")
    say(); say("  웹      : http://localhost:8100"); say("  모바일  : http://localhost:8200"); say()
    say("  끄려면 작업 표시줄의 서버 창(python)들을 닫으세요.")
    input("\n  Enter 를 누르면 이 안내 창만 닫혀요 (서버는 계속 켜져 있어요)...")


if __name__ == "__main__":
    main()
