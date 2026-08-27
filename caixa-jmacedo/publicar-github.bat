@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   CAIXA - Grupo J.Macedo - Publicar no GitHub
echo ============================================
echo.

cd /d "%~dp0"
echo Pasta atual: %cd%
echo.

git config --global user.name >nul 2>&1
if not errorlevel 1 goto GIT_CONFIGURADO

set /p GITNOME="Seu nome completo (para o Git): "
set /p GITEMAIL="Seu e-mail do GitHub: "
git config --global user.name "%GITNOME%"
git config --global user.email "%GITEMAIL%"
echo.
echo Nome e e-mail configurados.
echo.
goto DEPOIS_CONFIG

:GIT_CONFIGURADO
echo Git ja configurado neste computador, pulando essa etapa.
echo.

:DEPOIS_CONFIG
if exist ".git" goto GIT_JA_INICIADO

echo Iniciando o repositorio Git...
git init
goto DEPOIS_INIT

:GIT_JA_INICIADO
echo Repositorio Git ja iniciado, pulando essa etapa.

:DEPOIS_INIT
rem Garante que a branch local se chama "main", exista o repositorio ja ou nao
git branch -M main
echo.

git remote get-url origin >nul 2>&1
if not errorlevel 1 goto REMOTE_JA_CONECTADO

echo Conectando ao GitHub (GRUPOJMACEDO/CAIXA)...
git remote add origin https://github.com/GRUPOJMACEDO/CAIXA.git
goto DEPOIS_REMOTE

:REMOTE_JA_CONECTADO
echo Ja conectado ao GitHub, pulando essa etapa.

:DEPOIS_REMOTE
echo.

echo Buscando o que ja existe no GitHub, para nao sobrescrever nada por engano...
git fetch origin
echo.
echo Trazendo eventuais mudancas feitas direto pelo site do GitHub...
git pull origin main --no-rebase --allow-unrelated-histories
if errorlevel 1 (
    echo.
    echo ============================================
    echo   ATENCAO: houve um CONFLITO ao trazer as
    echo   mudancas do GitHub. O envio foi interrompido
    echo   de proposito, para nao perder nada.
    echo   Tire um print desta tela inteira e mande
    echo   para o Claude resolver antes de continuar.
    echo ============================================
    echo.
    pause
    exit /b 1
)
echo.

echo Preparando os arquivos...
git add .
echo.

git diff --cached --quiet
if not errorlevel 1 (
    echo Nao ha nenhuma mudanca nova para enviar.
    echo Se voce esperava ver algo aqui, confira se salvou
    echo os arquivos certos na pasta certa antes de rodar isso.
    echo.
    pause
    exit /b 0
)

set /p MENSAGEM="Descreva rapidamente o que mudou (ex: ajustes de tela): "
if "%MENSAGEM%"=="" set MENSAGEM=Atualizacao do sistema CAIXA

git commit -m "%MENSAGEM%"
echo.

echo Enviando para o GitHub...
echo (pode abrir uma janela do navegador pedindo login no GitHub - faca login normalmente)
echo.
git push -u origin main
if errorlevel 1 (
    echo.
    echo ============================================
    echo   ERRO ao enviar para o GitHub! O commit foi
    echo   feito no seu computador, mas NAO chegou ao
    echo   GitHub nem ao site publicado.
    echo   Tire um print desta tela inteira e mande
    echo   para o Claude.
    echo ============================================
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Concluido! O envio para o GitHub foi feito
echo   com sucesso. O Vercel deve publicar a nova
echo   versao em 1 a 2 minutos.
echo ============================================
echo.
pause
