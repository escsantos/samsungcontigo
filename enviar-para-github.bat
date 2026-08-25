@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==========================================================
echo   Enviando o projeto para o GitHub
echo   Repositorio: https://github.com/escsantos/samsungcontigo
echo ==========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERRO] O Git nao esta instalado neste computador.
    echo Baixe e instale em: https://git-scm.com/download/win
    echo Depois rode este arquivo de novo.
    pause
    exit /b 1
)

if not exist ".git" (
    echo [1/7] Inicializando repositorio git...
    git init
) else (
    echo [1/7] Repositorio git ja existe, pulando init...
)

echo [2/7] Configurando branch principal como "main"...
git branch -M main >nul 2>nul

echo [3/7] Adicionando arquivos...
git add .

echo [4/7] Criando commit...
git commit -m "Sistema Consulta de Pecas - atualizacao"
if errorlevel 1 (
    echo (nada novo para commitar, ou commit ja existente - seguindo em frente)
)

echo [5/7] Configurando o repositorio remoto (origin)...
git remote remove origin >nul 2>nul
git remote add origin https://github.com/escsantos/samsungcontigo.git

echo [6/7] Sincronizando com o que ja existe no GitHub...
git fetch origin main >nul 2>nul
git pull origin main --allow-unrelated-histories --no-edit
if errorlevel 1 (
    echo.
    echo ==========================================================
    echo   Houve um CONFLITO ao juntar suas mudancas com o que ja
    echo   estava no GitHub (o mesmo arquivo foi alterado dos dois
    echo   lados).
    echo.
    echo   Abra os arquivos que o Git apontou acima, procure por
    echo   linhas com ^<^<^<^<^<^<^<, ======= e ^>^>^>^>^>^>^>, decida o
    echo   que manter, apague essas marcacoes e salve o arquivo.
    echo   Depois rode este arquivo de novo para terminar o envio.
    echo ==========================================================
    echo.
    pause
    exit /b 1
)

echo [7/7] Enviando para o GitHub (vai pedir login/senha ou abrir o navegador)...
git push -u origin main

echo.
if errorlevel 1 (
    echo ==========================================================
    echo   Algo deu errado no envio. Copie a mensagem de erro acima
    echo   e me mande para eu te ajudar a corrigir.
    echo ==========================================================
) else (
    echo ==========================================================
    echo   PRONTO! Projeto enviado com sucesso para:
    echo   https://github.com/escsantos/samsungcontigo
    echo ==========================================================
)
echo.
pause
