@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ==========================================
echo   Sistema Consulta de Pecas (SSG) - Backup (banco + storage)
echo ==========================================
echo.

rem --- 1) Verifica Docker Desktop -----------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
    echo O Docker nao foi encontrado neste computador.
    echo O backup do banco de dados precisa dele ^(usado por baixo dos panos
    echo pela Supabase CLI^). Instale o Docker Desktop em:
    echo   https://www.docker.com/products/docker-desktop/
    echo Depois abra o Docker Desktop uma vez e rode este arquivo de novo.
    echo.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo O Docker Desktop nao esta aberto/rodando agora.
    echo Abra o Docker Desktop, espere ele terminar de iniciar e rode este
    echo arquivo de novo.
    echo.
    pause
    exit /b 1
)

rem --- 2) Verifica Supabase CLI --------------------------------------------
where supabase >nul 2>&1
if errorlevel 1 (
    echo A Supabase CLI nao foi encontrada neste computador.
    echo Forma recomendada de instalar no Windows ^(via Scoop^):
    echo.
    echo   1^) Instale o Scoop ^(se ainda nao tiver^): https://scoop.sh
    echo   2^) Depois rode, um de cada vez, no PowerShell:
    echo        scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
    echo        scoop install supabase
    echo.
    echo Depois de instalar, rode este arquivo de novo.
    echo.
    pause
    exit /b 1
)

rem --- 3) Verifica Node ^(usado so pro backup do Storage^) ------------------
where node >nul 2>&1
if errorlevel 1 (
    echo O Node nao foi encontrado neste computador ^(precisa dele so pra
    echo baixar os arquivos do Storage^). Instale em https://nodejs.org e
    echo rode este arquivo de novo.
    echo.
    pause
    exit /b 1
)

rem --- 4) Confere/gera o arquivo local com a connection string do banco ----
set CONFIG=".env.backup.local"
if not exist %CONFIG% (
    echo Nao encontrei o arquivo de configuracao do backup ^(%CONFIG%^).
    echo Vou criar um modelo agora. Abra ele, cole a Connection String do
    echo seu banco Supabase no lugar indicado e rode este arquivo de novo.
    echo.
    (
        echo # Backup do Sistema Consulta de Pecas ^(SSG^) - NAO COMPARTILHE ESTE ARQUIVO, NAO ENVIE PRO GITHUB
        echo # ^(ele ja fica fora do Git - ver .gitignore^)
        echo #
        echo # Onde encontrar a sua Connection String:
        echo #   painel do Supabase -^> seu projeto -^> Settings -^> Database -^>
        echo #   Connection string -^> escolha "Session pooler" -^> copie e cole
        echo #   abaixo no lugar de toda a linha, com a sua senha do banco.
        echo #
        echo DB_URL=postgresql://postgres.SEU-PROJETO:SUA-SENHA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
    ) > %CONFIG%
    notepad %CONFIG%
    echo.
    pause
    exit /b 1
)

set "DB_URL="
for /f "usebackq tokens=1,* delims==" %%A in (%CONFIG%) do (
    if "%%A"=="DB_URL" set "DB_URL=%%B"
)

if "!DB_URL!"=="" (
    echo O arquivo %CONFIG% existe mas a linha DB_URL esta vazia.
    echo Abra o arquivo, cole a Connection String do banco e rode de novo.
    echo.
    pause
    exit /b 1
)

echo !DB_URL! | findstr /C:"SUA-SENHA" >nul
if not errorlevel 1 (
    echo O arquivo %CONFIG% ainda esta com o modelo ^(SUA-SENHA^).
    echo Abra o arquivo e cole a Connection String real do banco antes de continuar.
    echo.
    pause
    exit /b 1
)

rem --- 5) Define a pasta de destino ^(dentro do OneDrive^) -------------------
set "PASTA_ONEDRIVE=%OneDrive%"
if "%PASTA_ONEDRIVE%"=="" set "PASTA_ONEDRIVE=%OneDriveCommercial%"
if "%PASTA_ONEDRIVE%"=="" (
    echo Nao encontrei uma pasta do OneDrive sincronizada neste computador.
    echo Vou salvar em Documentos mesmo assim, mas o backup NAO vai estar
    echo automaticamente numa nuvem - copie a pasta pra algum lugar seguro
    echo manualmente depois.
    echo.
    set "PASTA_ONEDRIVE=%USERPROFILE%\Documents"
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "CARIMBO=%%I"

set "DESTINO=%PASTA_ONEDRIVE%\Backups-Sistema-SSG\%CARIMBO%"
mkdir "%DESTINO%\banco" 2>nul
mkdir "%DESTINO%\storage" 2>nul

echo Salvando em:
echo   %DESTINO%
echo.

rem --- 6) Dump do banco ^(roles, schema, dados^) -----------------------------
echo [1/4] Baixando papeis do banco ^(roles^)...
supabase db dump --db-url "!DB_URL!" -f "%DESTINO%\banco\roles.sql" --role-only
if errorlevel 1 goto :erro_dump

echo [2/4] Baixando estrutura do banco ^(schema^)...
supabase db dump --db-url "!DB_URL!" -f "%DESTINO%\banco\schema.sql"
if errorlevel 1 goto :erro_dump

echo [3/4] Baixando os dados do banco ^(pode demorar um pouco^)...
supabase db dump --db-url "!DB_URL!" -f "%DESTINO%\banco\data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
if errorlevel 1 goto :erro_dump

rem --- 7) Arquivos do Storage -----------------------------------------------
echo [4/4] Baixando os arquivos do Storage...
node "%~dp0backup-storage.mjs" "%DESTINO%\storage"
if errorlevel 1 (
    echo.
    echo O banco foi salvo com sucesso, mas baixar os arquivos do Storage
    echo falhou ^(veja a mensagem acima^). O backup do banco em
    echo   %DESTINO%\banco
    echo esta ok mesmo assim.
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   Backup concluido com sucesso!
echo   %DESTINO%
echo.
echo   Essa pasta esta dentro do OneDrive, entao ja fica salva na nuvem
echo   sozinha quando o OneDrive sincronizar.
echo   Recomendado: de tempos em tempos, copie a pasta
echo   "Backups-Sistema-SSG" tambem pra um HD externo.
echo ==========================================
echo.
pause
exit /b 0

:erro_dump
echo.
echo Algo deu errado ao baixar o banco ^(veja a mensagem da Supabase CLI
echo acima - geralmente e senha/connection string errada no %CONFIG%,
echo ou o Docker Desktop fechou no meio do processo^).
echo.
pause
exit /b 1
