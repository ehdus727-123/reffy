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

rem ---- 1) 파이썬 환경 (컴퓨터에 설치된 파이썬 사용)
if not exist ".venv\Scripts\python.exe" (
  where python >nul 2>nul || goto :nopython
  echo  [1/3] 파이썬 환경 만드는 중...
  python -m venv .venv || goto :fail
)
if not exist ".venv\.reffy_ok" (
  echo  [2/3] 필요한 프로그램 설치 중...
  ".venv\Scripts\python.exe" -m pip install -q -r reffy-web\requirements.txt || goto :fail
  echo ok> ".venv\.reffy_ok"
)
if not exist "reffy-web\.env" copy "reffy-web\.env.example" "reffy-web\.env" >nul
if not exist "reffy-mobile\.env" copy "reffy-mobile\.env.example" "reffy-mobile\.env" >nul

rem ---- 2) 서버 켜기 (이미 켜져 있으면 건너뜀)
echo  [3/3] 서버 켜는 중...
curl -s -o nul http://127.0.0.1:8100/ || start "REFFY 웹 서버 - 이 창을 닫으면 꺼져요" /min /d "%~dp0reffy-web" "%~dp0.venv\Scripts\python.exe" run.py
call :wait 8100 || goto :fail
curl -s -o nul http://127.0.0.1:8200/ || start "REFFY 모바일 서버 - 이 창을 닫으면 꺼져요" /min /d "%~dp0reffy-mobile" "%~dp0.venv\Scripts\python.exe" run.py
call :wait 8200 || goto :fail
if /i "%~1"=="share" exit /b 0

start "" http://localhost:8100
echo.
echo   웹      : http://localhost:8100
echo   모바일  : http://localhost:8200
echo.
echo   끄려면 작업 표시줄의 "REFFY 웹 서버", "REFFY 모바일 서버" 창을 닫으세요.
echo.
pause
exit /b 0

:wait
for /l %%i in (1,1,120) do (
  curl -s -o nul http://127.0.0.1:%1/ && exit /b 0
  timeout /t 1 >nul
)
exit /b 1

:nopython
echo  파이썬이 없어요. https://www.python.org/downloads/ 에서 설치하세요.
echo  설치 첫 화면에서 "Add python.exe to PATH" 에 꼭 체크한 뒤, 이 파일을 다시 실행하세요.
pause
exit /b 1

:fail
echo.
echo  [실패] 위의 메시지를 캡처해서 보내 주세요.
pause
exit /b 1
