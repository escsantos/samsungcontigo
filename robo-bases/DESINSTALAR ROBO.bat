@echo off
chcp 65001 >nul
schtasks /Delete /F /TN "SSG - Robo de Bases (Pecas + GSPN)"
echo Robo de Bases removido do Agendador de Tarefas.
pause
