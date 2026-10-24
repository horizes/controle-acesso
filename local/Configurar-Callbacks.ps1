#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'private\gateway.private.json') -Raw | ConvertFrom-Json
if (-not $taskConfig.callbackListen) { throw 'Nenhum receptor de callbacks foi configurado.' }
function Test-ImperiumPrivateIPv4([string]$Value) {
    $taskParsed = $null
    if (-not [Net.IPAddress]::TryParse($Value, [ref]$taskParsed)) { return $false }
    if ($taskParsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $taskBytes = $taskParsed.GetAddressBytes()
    return $taskBytes[0] -eq 10 -or ($taskBytes[0] -eq 192 -and $taskBytes[1] -eq 168) -or ($taskBytes[0] -eq 172 -and $taskBytes[1] -ge 16 -and $taskBytes[1] -le 31)
}
$taskAddress = [string]$taskConfig.callbackListen.host
$taskPort = [int]$taskConfig.callbackListen.port
if (-not (Test-ImperiumPrivateIPv4 $taskAddress) -or $taskPort -lt 1024 -or $taskPort -gt 65535) { throw 'Endereço/porta de callbacks inválidos.' }
$taskPeers = @($taskConfig.devices | Where-Object { $_.protocol -eq 'controlid-online' -or $_.protocol -eq 'signed-events' -or $_.eventTransport -eq 'push' } | ForEach-Object { [string]$_.sourceIp } | Sort-Object -Unique)
if ($taskPeers.Count -eq 0 -or @($taskPeers | Where-Object { -not (Test-ImperiumPrivateIPv4 $_) }).Count -gt 0) { throw 'Informe somente IPv4 privados individuais dos equipamentos.' }
$taskRule = 'Imperium-Callbacks-Local'
Get-NetFirewallRule -Name $taskRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name $taskRule -DisplayName 'Imperium - callbacks dos equipamentos' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $taskAddress -LocalPort $taskPort -RemoteAddress $taskPeers -Profile Private | Out-Null
Write-Host 'Regra criada somente para os IPs dos equipamentos configurados, no perfil Privado. Reinicie a central e valide a comunicação.'
