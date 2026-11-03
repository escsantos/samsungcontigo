# Instala o Robô de Bases do SSG no Agendador de Tarefas (a cada 2 minutos + ao entrar no Windows).
$ErrorActionPreference = 'Stop'
$nome = 'SSG - Robo de Bases (Pecas + GSPN)'
$vbs = Join-Path $PSScriptRoot 'executar-oculto.vbs'
Write-Host '============================================================'
Write-Host '  Robô de Bases do SSG - INSTALAR'
Write-Host '============================================================'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'ERRO: o Node.js não está instalado neste PC.'; exit 1 }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'config.ini'))) { Write-Host 'ERRO: falta o config.ini nesta pasta.'; exit 1 }
$acao = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"') -WorkingDirectory $PSScriptRoot
$t1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$t1.Repetition.Duration = ''   # repete sem fim
$t2 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 40)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger @($t1, $t2) -Settings $cfg -Force | Out-Null
Write-Host ''
Write-Host "Tarefa '$nome' criada: confere as pastas a cada 2 minutos."
Write-Host 'Fazendo a primeira atualização agora (pode levar alguns minutos)...'
Write-Host ''
& node --max-old-space-size=4096 (Join-Path $PSScriptRoot 'robo.mjs') --forcar
