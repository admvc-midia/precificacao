# Corre a copia de seguranca e deixa um registo ao lado das copias.
#
# E o que a tarefa agendada chama (ver agendar-copia.ps1). Pode correr-se a
# mao para testar:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\copia-semanal.ps1 -Pasta "C:\...\copias"
#
# O registo (ultima-copia.log) diz se a ultima correu bem. Uma copia que falha
# em silencio e pior que nenhuma: da a ideia de que ha rede.

param(
  [Parameter(Mandatory = $true)][string]$Pasta,
  [int]$Guardar = 12
)

$repo = Split-Path -Parent $PSScriptRoot
$node = 'C:\Program Files\nodejs'
$env:Path = "$node;" + $env:Path

New-Item -ItemType Directory -Force $Pasta | Out-Null
$log = Join-Path $Pasta 'ultima-copia.log'

Set-Location $repo
"== $(Get-Date -Format 'yyyy-MM-dd HH:mm') ==" | Out-File -Encoding utf8 $log
# cmd /c junta o stderr ao stdout sem o PowerShell 5.1 o transformar em erro.
cmd /c "npx tsx prisma\copia-seguranca.mts `"$Pasta`" $Guardar 2>&1" | Out-File -Encoding utf8 -Append $log
$codigo = $LASTEXITCODE
"codigo de saida: $codigo" | Out-File -Encoding utf8 -Append $log
exit $codigo
