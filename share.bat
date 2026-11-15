@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title REFFY 공유
rem 서버를 켜고, 인터넷 어디서나 열리는 공유 링크를 만들어요. (Cloudflare 공식 프로그램 cloudflared 사용)
where cloudflared >nul 2>nul || goto :nocf
call "%~dp0start.bat" share || exit /b 1

start "REFFY 공유 - 웹 링크 (이 창을 닫으면 링크가 끊겨요)" cmd /k cloudflared tunnel --no-autoupdate --url http://localhost:8100
start "REFFY 공유 - 모바일 링크 (이 창을 닫으면 링크가 끊겨요)" cmd /k cloudflared tunnel --no-autoupdate --url http://localhost:8200
echo.
echo  ================================================
echo    새로 뜬 창 2개 ["REFFY 공유 - 웹 링크", "REFFY 공유 - 모바일 링크"] 에서
echo    네모 상자 안의  https://....trycloudflare.com  주소를 찾으세요. (10~30초)
echo.
echo    그 주소를 마우스로 드래그 - 오른쪽 클릭하면 복사돼요.
echo    교수님 · 학생들에게 그 주소를 보내 주면 끝!
echo  ================================================
echo.
echo   이 컴퓨터가 꺼지거나 잠자기에 들어가면 링크가 끊겨요.
echo   다시 실행하면 링크 주소가 새로 바뀌어요.
echo.
pause
exit /b 0

:nocf
echo.
echo  공유 프로그램(cloudflared)이 아직 없어요. 처음 한 번만 설치하면 돼요.
echo.
echo    1) 이 창을 닫고, 시작 메뉴에서 "cmd" 를 검색해 열기
echo    2) 아래 한 줄 입력 후 Enter
echo.
echo         winget install --id Cloudflare.cloudflared
echo.
echo    3) 설치가 끝나면 cmd 창을 닫고 share.bat 을 다시 더블클릭
echo.
pause
exit /b 1
