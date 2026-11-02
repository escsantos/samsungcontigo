@echo off
rem Sistema Consulta de Pecas (SSG) - agendamento do backup automatico (02/11/2026)
cd /d "%~dp0scripts"
echo ==========================================================
echo   Backup automatico do Sistema SSG (todo dia as 22:00)
echo ==========================================================
echo.
echo   1 - Agendar / atualizar o backup automatico
echo   2 - Rodar o backup agendado AGORA (teste)
echo   3 - Remover o agendamento
echo.
choice /c 123 /n /m "Escolha 1, 2 ou 3: "
if errorlevel 3 goto remover
if errorlevel 2 goto testar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agendar-backup.ps1" agendar
goto fim
:testar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agendar-backup.ps1" testar
goto fim
:remover
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agendar-backup.ps1" remover
:fim
echo.
echo O resultado de cada backup fica em OneDrive\Backups-Sistema-SSG:
echo   STATUS-ULTIMO-BACKUP.txt  e  ultimo-backup.log
echo.
pause
