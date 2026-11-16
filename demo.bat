@echo off
chcp 65001 >nul
title REFFY 시연 데이터 내보내기
cd /d "%~dp0"
set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (py -3 -c "import sys" >nul 2>&1 && set "PY=py -3")
if not defined PY (python -c "import sys" >nul 2>&1 && set "PY=python")
if not defined PY (echo 파이썬을 찾지 못했어요. 먼저 start.bat 을 한 번 실행해 주세요. & pause & exit /b 1)
%PY% launcher.py demo
