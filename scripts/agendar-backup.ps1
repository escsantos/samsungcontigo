# Sistema Consulta de Pecas (SSG) - agenda o backup automatico no Windows
# (02/11/2026). Chamado pelo "AGENDAR BACKUP AUTOMATICO.bat".
# Cria a tarefa "SSG - Backup automatico": todo dia as 22:00, roda
# scripts\backup.bat no modo automatico. Se o computador estiver desligado
# nesse horario, roda assim que o usuario entrar no Windows de novo.
param([string]$Acao = "agendar")
$ErrorActionPreference = "Stop"
$nome = "SSG - Backup automatico"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat = Join-Path $pasta "backup.bat"

if ($Acao -eq "remover") {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Agendamento removido."
  exit 0
}
if ($Acao -eq "testar") {
  Start-ScheduledTask -TaskName $nome
  Write-Host "Backup iniciado agora pela tarefa agendada (vai abrir uma janela preta)."
  exit 0
}

$acaoTarefa = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$bat`" auto`"" -WorkingDirectory $pasta
$gatilho = New-ScheduledTaskTrigger -Daily -At "22:00"
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName $nome -Action $acaoTarefa -Trigger $gatilho -Settings $config `
  -Description "Backup diario (banco + storage) do Sistema SSG para o OneDrive\Backups-Sistema-SSG. Guarda 30 dias." -Force | Out-Null
$t = Get-ScheduledTask -TaskName $nome
Write-Host "Agendado: '$nome' - todo dia as 22:00 (estado: $($t.State))."
