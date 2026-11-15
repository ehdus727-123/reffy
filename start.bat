@echo off
chcp 65001 >nul
cd /d "%~dp0"
title REFFY
set "PY="
set "PYA="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY py -3 -c "import sys" >nul 2>nul && set "PY=py" && set "PYA=-3"
if not defined PY python -c "import sys" >nul 2>nul && set "PY=python"
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY (
  echo.
  echo  파이썬이 없어서 설치할게요. 처음 한 번, 몇 분 걸려요...
  winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
  if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
)
if not defined PY (
  echo.
  echo  파이썬을 설치하지 못했어요. https://www.python.org/downloads/ 에서 설치한 뒤
  echo  ["Add python.exe to PATH" 체크] 이 파일을 다시 실행하세요.
  pause
  exit /b 1
)
"%PY%" %PYA% launcher.py
