@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title REFFY 실행
echo.
echo  ================================================
echo    REFFY 실행  (처음 한 번은 설치 때문에 몇 분 걸려요)
echo  ================================================
echo.

rem ---- 1) 설치 도구 uv (파이썬이 없어도 알아서 받아 줌)
if not exist ".tools\uv.exe" (
  echo  [1/4] 설치 도구 내려받는 중...
  if not exist ".tools" mkdir ".tools"
  curl -L --fail -s -o ".tools\uv.zip" https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip || goto :fail
  tar -xf ".tools\uv.zip" -C ".tools" || goto :fail
  del ".tools\uv.zip"
)

rem ---- 2) 파이썬 환경
if not exist ".venv\Scripts\python.exe" (
  echo  [2/4] 파이썬 환경 만드는 중...
  ".tools\uv.exe" venv --python 3.12 .venv || goto :fail
)
if not exist ".venv\.reffy_ok" (
  echo  [3/4] 필요한 프로그램 설치 중...
  ".tools\uv.exe" pip install --python ".venv\Scripts\python.exe" -r reffy-web\requirements.txt || goto :fail
  echo ok> ".venv\.reffy_ok"
)

rem ---- 3) 설정 파일 (없을 때만 복사)
if not exist "reffy-web\.env" copy "reffy-web\.env.example" "reffy-web\.env" >nul
if not exist "reffy-mobile\.env" copy "reffy-mobile\.env.example" "reffy-mobile\.env" >nul

rem ---- 4) 서버 켜기 (이미 켜져 있으면 건너뜀)
echo  [4/4] 서버 켜는 중...
curl -s -o nul http://127.0.0.1:8100/ || start "REFFY 웹 서버 - 이 창을 닫으면 꺼져요" /min /d "%~dp0reffy-web" "%~dp0.venv\Scripts\python.exe" run.py
call :wait 8100 || goto :fail
curl -s -o nul http://127.0.0.1:8200/ || start "REFFY 모바일 서버 - 이 창을 닫으면 꺼져요" /min /d "%~dp0reffy-mobile" "%~dp0.venv\Scripts\python.exe" run.py
call :wait 8200 || goto :fail

if /i "%~1"=="share" goto :share

start "" http://localhost:8100
echo.
echo   웹      : http://localhost:8100
echo   모바일  : http://localhost:8200
echo.
echo   끄려면 작업 표시줄의 "REFFY 웹 서버", "REFFY 모바일 서버" 창을 닫으세요.
echo.
pause
exit /b 0

rem ================================================ 인터넷 공유 (share.bat)
:share
if not exist ".tools\cloudflared.exe" (
  echo  공유 도구 내려받는 중...
  curl -L --fail -s -o ".tools\cloudflared.exe" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe || goto :fail
)
del ".tools\tunnel-web.log" ".tools\tunnel-mobile.log" 2>nul
start "REFFY 공유(웹) - 이 창을 닫으면 링크가 끊겨요" /min ".tools\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:8100 --logfile ".tools\tunnel-web.log"
start "REFFY 공유(모바일) - 이 창을 닫으면 링크가 끊겨요" /min ".tools\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:8200 --logfile ".tools\tunnel-mobile.log"
echo  공유 링크 만드는 중... (10~30초)
set WEB=
set MOB=
for /l %%i in (1,1,60) do (
  if not defined WEB for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "$m=Select-String -Path '.tools\tunnel-web.log' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue; if($m){$m[0].Matches[0].Value}"`) do set "WEB=%%u"
  if not defined MOB for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "$m=Select-String -Path '.tools\tunnel-mobile.log' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue; if($m){$m[0].Matches[0].Value}"`) do set "MOB=%%u"
  if defined WEB if defined MOB goto :shown
  timeout /t 1 >nul
)
:shown
if not defined WEB goto :fail
(
  echo REFFY 공유 링크  ^(이 컴퓨터와 창들이 켜져 있는 동안만 열려요^)
  echo 웹     : %WEB%
  echo 모바일 : %MOB%
) > "공유주소.txt"
echo %WEB%| clip
start "" %WEB%
echo.
echo  ================================================
echo    아래 링크를 교수님 · 학생들에게 보내 주세요
echo.
echo    웹      : %WEB%
echo    모바일  : %MOB%
echo.
echo    (웹 링크는 복사돼 있어요. Ctrl+V 로 붙여 넣기)
echo    (공유주소.txt 에도 저장했어요)
echo  ================================================
echo.
echo   이 컴퓨터가 꺼지거나 잠자기에 들어가면 링크가 끊겨요.
echo   다시 실행하면 링크 주소가 새로 바뀌어요.
echo.
pause
exit /b 0

rem ================================================ 도우미
:wait
for /l %%i in (1,1,120) do (
  curl -s -o nul http://127.0.0.1:%1/ && exit /b 0
  timeout /t 1 >nul
)
exit /b 1

:fail
echo.
echo  [실패] 위의 메시지를 캡처해서 보내 주세요.
echo   - 인터넷 연결을 확인해 주세요.
echo   - 서버 창이 바로 꺼졌다면 그 창의 오류도 같이 보내 주세요.
pause
exit /b 1
