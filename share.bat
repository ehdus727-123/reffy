@echo off
chcp 65001 >nul
rem 서버를 켜고, 인터넷 어디서나 열리는 공유 링크를 만들어요.
call "%~dp0start.bat" share
