@echo off
rem Sistema Consulta de Pecas (SSG) - roda o backup AGORA, fora do horario (02/11/2026)
rem Mesmo backup do agendamento das 22h: banco + storage no OneDrive,
rem log e status em OneDrive\Backups-Sistema-SSG, guarda 30 dias.
cd /d "%~dp0scripts"
echo ==========================================================
echo   Backup do Sistema SSG - rodando AGORA
echo   (pode levar alguns minutos, nao feche esta janela)
echo ==========================================================
echo.
call "%~dp0scripts\backup.bat" auto
set "RESULTADO=%errorlevel%"

set "PASTA_BK=%OneDrive%"
if "%PASTA_BK%"=="" set "PASTA_BK=%OneDriveCommercial%"
if "%PASTA_BK%"=="" set "PASTA_BK=%USERPROFILE%\Documents"
set "PASTA_BK=%PASTA_BK%\Backups-Sistema-SSG"

echo.
if "%RESULTADO%"=="0" (
    echo ==========================================================
    echo   BACKUP CONCLUIDO COM SUCESSO
    echo   Pasta: %PASTA_BK%
    echo ==========================================================
) else (
    echo ==========================================================
    echo   O BACKUP FALHOU. Abrindo o log com o detalhe do erro...
    echo   ^(mande o conteudo do log pro Claude analisar^)
    echo ==========================================================
    start "" notepad "%PASTA_BK%\ultimo-backup.log"
)
echo.
pause
