# Cria (ou atualiza) a tarefa do Windows que grava a copia de seguranca.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\agendar-copia.ps1
#
# Semanal, a segunda-feira as 10h. Com o computador desligado a essa hora,
# corre assim que ele for ligado (StartWhenAvailable) - senao, num portatil,
# a copia quase nunca acontecia.
#
# Corre so com a sessao do utilizador aberta, e por isso nao pede a
# palavra-passe do Windows. Para apagar a tarefa:
#
#   Unregister-ScheduledTask -TaskName 'Precificacao - copia de seguranca'

param(
  [string]$Pasta = (Join-Path $env:USERPROFILE 'OneDrive\Copias\precificacao'),
  [int]$Guardar = 12
)

$nome = 'Precificacao - copia de seguranca'
$script = Join-Path $PSScriptRoot 'copia-semanal.ps1'

$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Pasta `"$Pasta`" -Guardar $Guardar"
$quando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 10:00
$regras = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $quando -Settings $regras `
  -Description 'Grava a copia completa do precificaragao (so leitura da base).' -Force | Out-Null

Write-Output "Tarefa '$nome' agendada: segundas as 10h, para $Pasta (guarda $Guardar)."
