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
    echo [1/6] Inicializando repositorio git...
    git init
) else (
    echo [1/6] Repositorio git ja existe, pulando init...
)

echo [2/6] Configurando branch principal como "main"...
git branch -M main >nul 2>nul

echo [3/6] Adicionando arquivos...
git add .

echo [4/6] Criando commit...
git commit -m "Sistema Consulta de Pecas - envio inicial"
if errorlevel 1 (
    echo (nada novo para commitar, ou commit ja existente - seguindo em frente)
)

echo [5/6] Configurando o repositorio remoto (origin)...
git remote remove origin >nul 2>nul
git remote add origin https://github.com/escsantos/samsungcontigo.git

echo [6/6] Enviando para o GitHub (vai pedir login/senha ou abrir o navegador)...
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
