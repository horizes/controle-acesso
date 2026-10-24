# Execute como administrador depois de testar HTTPS e conferir a pasta de instalacao.
$ErrorActionPreference='Stop'
$installationRoot=Split-Path -Parent $PSScriptRoot
$nodePath=Join-Path $installationRoot 'runtime\node.exe'
$configPath=Join-Path $installationRoot 'private\config.private.json'
if(-not(Test-Path -LiteralPath $nodePath)){throw 'Use o pacote Windows com Node incluido.'}
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if(-not $config.tls){throw 'Configure e teste HTTPS antes da inicializacao automatica.'}
if(Get-ScheduledTask -TaskName 'Imperium-Local' -ErrorAction SilentlyContinue){throw 'A tarefa ja existe. Revisar a instalacao em vez de sobrescrever.'}
# Local Service recebe somente leitura do codigo e alteracao dos dados privados.
& icacls.exe $installationRoot /grant '*S-1-5-19:(OI)(CI)RX'
if($LASTEXITCODE -ne 0){throw 'Falha na permissao de leitura do servico.'}
& icacls.exe (Join-Path $installationRoot 'private') /grant '*S-1-5-19:(OI)(CI)M'
if($LASTEXITCODE -ne 0){throw 'Falha na permissao dos dados locais.'}
$action=New-ScheduledTaskAction -Execute $nodePath -Argument ('"'+(Join-Path $PSScriptRoot 'server.mjs')+'" "'+$configPath+'"') -WorkingDirectory $installationRoot
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Imperium-Local' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Central local Imperium, independente de internet.' | Out-Null
New-NetFirewallRule -DisplayName 'Imperium HTTPS local' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $config.port -RemoteAddress LocalSubnet -Profile Private -Program $nodePath | Out-Null
Write-Output 'Tarefa instalada para iniciar com o Windows, sem precisar manter um usuario conectado. Pare a execucao manual antes de iniciar a tarefa.'
Write-Output 'Inicie com Start-ScheduledTask -TaskName Imperium-Local e confira a operacao na rede. A rede do condominio deve estar no perfil Privado.'
