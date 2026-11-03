@echo off
chcp 65001 >nul
echo Atualizando agora a Base Peças e a Base GSPN no sistema (pode levar alguns minutos)...
echo.
node --max-old-space-size=4096 "%~dp0robo.mjs" --forcar
echo.
pause
